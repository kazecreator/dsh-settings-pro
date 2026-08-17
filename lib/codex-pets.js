import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Remote pet source: the Awesome Codex Pet community gallery
 * (https://codexpet.top / github.com/legeling/awesome-codex-pet).
 *
 * Each pet is a three-file package served from raw.githubusercontent.com:
 *   pets/<slug>/submission.json + pet.json + spritesheet.webp
 * The sprite sheet is a WebP atlas of 8 columns × 9 rows (v1, 1536×1872) or
 * 8 × 11 (v2, 1536×2288); each cell is 192×208. Rows are standard animations:
 *   0 idle, 1 running-right, 2 running-left, 3 waving, 4 jumping,
 *   5 failed, 6 waiting, 7 running, 8 review, (v2) 9-10 = 16 look directions.
 *
 * We map the pet's expressions onto the standard rows. The sheet has no
 * distinct "speaking"/"cognition" rows, so a few expressions share a row:
 *   thinking & goal → review (8), replying & idle → idle (0).
 */

const RAW_BASE = "https://raw.githubusercontent.com/legeling/awesome-codex-pet/main";
const CATALOG_URL = `${RAW_BASE}/pets.json`;
const COLS = 8;
const CELL_W = 192;
const CELL_H = 208;
/** Expression → sprite-sheet row index. */
const STATE_ROWS = {
  idle: 0,      // idle
  replying: 0,  // idle (calm blink while streaming text)
  success: 4,   // jumping
  failed: 5,    // failed
  paused: 6,    // waiting
  working: 7,   // running
  thinking: 8,  // review (analyzing)
  goal: 8,      // review (overseeing the goal)
};

function codexDir(dir) {
  return join(dir, "pets", "codex");
}

function catalogPath(dir) {
  return join(dir, "pets", "codex-catalog.json");
}

function sanitizeSlug(s) {
  return String(s ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Fetch the remote catalog (`pets.json`) and cache it, returning the array of
 * pet entries (slug, name, localized_names, author, category, license, …).
 * On network failure, falls back to the cached copy.
 */
export async function fetchCatalog(dir) {
  const res = await fetch(CATALOG_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`catalog HTTP ${res.status}`);
  const list = await res.json();
  if (!Array.isArray(list)) throw new Error("catalog 格式异常");
  mkdirSync(join(catalogPath(dir), ".."), { recursive: true });
  writeFileSync(catalogPath(dir), JSON.stringify(list));
  return list;
}

/** Read the cached catalog; null when never fetched. */
export function cachedCatalog(dir) {
  try {
    const parsed = JSON.parse(readFileSync(catalogPath(dir), "utf8"));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function petDir(dir, slug) {
  return join(codexDir(dir), slug);
}

/** Download one pet (pet.json + spritesheet.webp) into the local cache. */
export async function installPet(dir, slug, onProgress) {
  const clean = sanitizeSlug(slug);
  if (clean === "") throw new Error("缺少宠物 id");
  const base = `${RAW_BASE}/pets/${encodeURIComponent(clean)}`;

  onProgress?.({ phase: "fetching", loaded: 0, total: 0 });

  const petJsonRes = await fetch(`${base}/pet.json`, { signal: AbortSignal.timeout(20000) });
  if (petJsonRes.status === 404) throw new Error("宠物不存在");
  if (!petJsonRes.ok) throw new Error(`pet.json HTTP ${petJsonRes.status}`);
  const petJson = await petJsonRes.json();

  const sheetRes = await fetch(`${base}/spritesheet.webp`, { signal: AbortSignal.timeout(60000) });
  if (sheetRes.status === 404) throw new Error("宠物不存在");
  if (!sheetRes.ok) throw new Error(`spritesheet HTTP ${sheetRes.status}`);

  // Stream the sprite sheet so the UI can show real download progress. The
  // content-length may be absent on some CDN responses; then the UI falls back
  // to an indeterminate bar.
  const total = Number(sheetRes.headers.get("content-length")) || 0;
  const chunks = [];
  let loaded = 0;
  onProgress?.({ phase: "downloading", loaded: 0, total });
  const reader = sheetRes.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress?.({ phase: "downloading", loaded, total });
    }
  } else {
    chunks.push(Buffer.from(await sheetRes.arrayBuffer()));
    loaded = chunks[0].length;
    onProgress?.({ phase: "downloading", loaded, total: loaded });
  }
  const sheetBytes = Buffer.concat(chunks);
  if (sheetBytes.length === 0) throw new Error("spritesheet 为空");

  const out = petDir(dir, clean);
  mkdirSync(out, { recursive: true });
  // Persist the localized names (zh/en) alongside the downloaded pet.json, so
  // the pet can show a Chinese name even when the catalog isn't cached yet.
  const catalog = cachedCatalog(dir);
  const entry = Array.isArray(catalog) ? catalog.find((e) => e.slug === clean) : null;
  if (entry?.localized_names) {
    petJson.localized_names = entry.localized_names;
  }
  writeFileSync(join(out, "pet.json"), JSON.stringify(petJson));
  writeFileSync(join(out, "spritesheet.webp"), sheetBytes);
  onProgress?.({ phase: "saving", loaded: sheetBytes.length, total: sheetBytes.length });
  return manifestFor(dir, clean);
}

/**
 * Fallback Chinese names for catalog entries that ship no `localized_names.zh`.
 * Mostly transliterations (proper nouns) or literal translations; they are
 * curated by hand so the Chinese UI never shows a bare English name.
 */
const NAME_ZH_FALLBACK = {
  "aemeath-mini--cunuo": "阿米斯迷你",
  "apu--xchangee": "阿普",
  "azuma--tairazuma": "吾妻",
  "becky--natewanggg": "贝琪",
  "buba--yurcek": "布巴",
  "bubu--gbn666": "布布",
  "chispa--giiilberto-nm": "奇斯帕",
  "chotu--makriman": "小不点",
  "chud-codex--jorge-cuevas90003": "楚德科德克斯",
  "claude--xiangking": "克劳德",
  "codenono--dq02": "代码诺诺",
  "corgi-companion--cxian0928-afk": "柯基伴侣",
  "twinkle-twinkle--twinkletwinkle": "大顺的小星星",
  "desk-otter--zihualiu1997": "桌面水獭",
  "diana--am": "戴安娜",
  "diandian--lllucasxu": "点点",
  "diaoyi-baobao--d1a0y1bb": "雕一宝宝",
  "dimo-stand--god-wu": "迪莫",
  "dudu-bubu--clembuilds": "嘟嘟和布布",
  "ella-wave--sehjk": "艾拉·波浪",
  "fleta--natewanggg": "芙蕾塔",
  "frankie--aygunvarol": "弗兰基",
  "goblin--rkwap": "哥布林",
  "gpt-muse--opask": "GPT缪斯",
  "hajimi--zeyuwang1999": "哈吉米",
  "hamo--haipengzzz": "哈莫",
  "hana2--initiatione": "小花二号",
  "iris--yau-427": "伊丽丝",
  "isaac--foggy-whale": "艾萨克",
  "isekaijoucho--siiverash": "异世界情绪",
  "jiji--yena": "吉吉",
  "joker--oytyo": "小丑",
  "katana-cheems--thankyou-cheems": "武士刀奇姆斯",
  "kiko--untko": "纪子",
  "kimoju--andiac": "纪莫珠",
  "lil-swole--gg0805": "小壮",
  "linnea--nyakku-shigure": "琳内娅",
  "little-black-mage--libertis": "小黑魔法师",
  "little-sheep--mingdong": "小羊",
  "lulu--yogazz": "露露",
  "luna-angel-cat--neve": "露娜天使猫",
  "mai--dwdestiny": "舞",
  "mellow-duck--sally-entr": "温柔鸭",
  "mihari--hyoni1129": "美晴",
  "mika--rotl24": "米卡",
  "mimi--spacebody": "咪咪",
  "minty--somnusochi": "薄荷",
  "moomew-coder-cat--ping": "喵喵程序员",
  "night-neko--netizenxuan": "夜猫",
  "panda--jason-bai": "熊猫",
  "pixel-duck--flamurmaliqi": "像素鸭",
  "rinami--siiverash": "姬崎里奈美",
  "rook--klubbyte": "鲁克",
  "roxy-pixel--gravity": "萝茜像素",
  "ruruka--ltmcliao-cmyk": "露露卡",
  "saki--rookie-09": "咲",
  "shian-helper--mistyshen": "诗安助手",
  "spellbook--seymour": "魔法书",
  "starcorn--alterhq": "星角兽",
  "tangdouren--carl312": "糖豆人",
  "teddy--danieloleary": "泰迪",
  "tian-hua-hua--d1a0y1bb": "甜花花",
  "tiny-crt--chochou": "小CRT",
  "wally--wally025": "瓦力",
  "xian-xiao-lu--qingyunagi": "仙小鹿",
  "yier--gbn666": "一二",
  "yuanzai--gaming33": "圆仔",
  "yume-boundary--andy-meow": "梦之境界",
  "yuzubou--keseras34938976": "柚子坊",
};

/**
 * Best-effort Chinese display name for a pet: `localized_names.zh` → an
 * already-Chinese name → the hand-curated fallback map → null (caller falls
 * back to the English/romanized name).
 */
export function resolveZhName(slug, name, localizedNames) {
  const zh = localizedNames?.zh;
  if (typeof zh === "string" && zh.trim() !== "") return zh.trim();
  const nm = String(name ?? "");
  if (/[\u4e00-\u9fff]/.test(nm)) return nm;
  return NAME_ZH_FALLBACK[slug] ?? null;
}

/** List locally installed Codex pets (only complete packages). */
export function listInstalled(dir) {
  const out = [];
  const root = codexDir(dir);
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = manifestFor(dir, entry.name);
      if (manifest != null) out.push(manifest);
    }
  } catch {
    // no codex pets yet
  }
  return out;
}

/** Build the client-facing manifest for one cached Codex pet (or null). */
export function manifestFor(dir, slug) {
  const clean = sanitizeSlug(slug);
  const dirPath = petDir(dir, clean);
  const petJsonPath = join(dirPath, "pet.json");
  const sheetPath = join(dirPath, "spritesheet.webp");
  if (!existsSync(petJsonPath) || !existsSync(sheetPath)) return null;
  let petJson;
  try {
    petJson = JSON.parse(readFileSync(petJsonPath, "utf8"));
  } catch {
    return null;
  }
  const version = Number(petJson.spriteVersionNumber) === 2 ? 2 : 1;
  const rows = version === 2 ? 11 : 9;
  const catalog = cachedCatalog(dir);
  const entry = Array.isArray(catalog) ? catalog.find((e) => e.slug === clean) : null;
  const name = String(petJson.displayName ?? petJson.name ?? clean);
  return {
    id: clean,
    name,
    nameZh: resolveZhName(clean, name, petJson.localized_names ?? entry?.localized_names),
    source: "codex",
    sprite: {
      url: `/pets/codex/${encodeURIComponent(clean)}/spritesheet.webp`,
      cols: COLS,
      rows,
      cellW: CELL_W,
      cellH: CELL_H,
      states: STATE_ROWS,
    },
  };
}

export function removePet(dir, slug) {
  const clean = sanitizeSlug(slug);
  rmSync(petDir(dir, clean), { recursive: true, force: true });
  return clean;
}

/** Display name from a catalog entry, preferring the UI language. */
export function displayName(entry, lang) {
  if (!entry) return "";
  if (lang === "zh" && entry.localized_names?.zh) return entry.localized_names.zh;
  return entry.localized_names?.en ?? entry.name ?? entry.slug ?? "";
}
