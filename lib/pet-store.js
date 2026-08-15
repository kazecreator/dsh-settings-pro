import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUILTIN_PETS } from "./builtin-pets.js";
import { unzip } from "./zip.js";

const STATES = ["idle", "working", "goal", "paused"];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB per image
const MIME_EXT = {
  "image/gif": "gif",
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
};

function sanitizeId(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Owns the pet catalog: the three built-in SVG pets plus user-uploaded pets
 * (GIF/PNG/WebP image sets) stored under `<dir>/pets/user/<id>/`. The active
 * pet id lives in the runtime config next to the other settings-pro state.
 */
export class PetStore {
  constructor(dir) {
    this.userDir = join(dir, "pets", "user");
    this.configPath = join(dir, "config.json");
  }

  // --- runtime config ------------------------------------------------------

  #loadRuntime() {
    try {
      const parsed = JSON.parse(readFileSync(this.configPath, "utf8"));
      return parsed != null && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  #saveRuntime(config) {
    mkdirSync(join(this.configPath, ".."), { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(config, null, 2) + "\n");
  }

  // --- catalog -------------------------------------------------------------

  builtin() {
    return BUILTIN_PETS.map((pet) => this.#client(pet));
  }

  listUser() {
    const out = [];
    try {
      for (const entry of readdirSync(this.userDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const manifestPath = join(this.userDir, entry.name, "manifest.json");
        if (!existsSync(manifestPath)) continue;
        try {
          const m = JSON.parse(readFileSync(manifestPath, "utf8"));
          out.push(this.#client({ id: entry.name, name: m.name ?? entry.name, source: "user", states: m.states ?? {} }));
        } catch {
          // skip a corrupt manifest
        }
      }
    } catch {
      // no user pets yet
    }
    return out;
  }

  list() {
    return [...this.builtin(), ...this.listUser()];
  }

  get(id) {
    const clean = sanitizeId(id);
    return this.list().find((p) => p.id === clean) ?? null;
  }

  active() {
    const clean = sanitizeId(this.#loadRuntime().activePet);
    return this.get(clean) != null ? clean : BUILTIN_PETS[0].id;
  }

  setActive(id) {
    const clean = sanitizeId(id);
    if (this.get(clean) == null) throw new Error(`宠物不存在: ${id}`);
    const config = this.#loadRuntime();
    config.activePet = clean;
    this.#saveRuntime(config);
    return clean;
  }

  // --- add / remove --------------------------------------------------------

  /** Add from step upload: `states` maps state → { dataUrl, ext? }. */
  addFromSteps({ name, states }) {
    const id = this.#uniqueId(name);
    const files = {};
    for (const key of STATES) {
      const state = states?.[key];
      if (state == null || !state.dataUrl) continue;
      const decoded = this.#decodeDataUrl(state.dataUrl);
      if (decoded == null) continue;
      const ext = MIME_EXT[decoded.mime] ?? "png";
      files[key] = `${key}.${ext}`;
      this.#writeUserFile(id, files[key], decoded.buf);
    }
    if (!files.idle) throw new Error("缺少 idle 状态（必填）");
    this.#writeUserManifest(id, name || id, files);
    return this.get(id);
  }

  /** Add from a zip package: `manifest.json` + image files. */
  addFromZip(buffer) {
    const entries = unzip(buffer);
    const manifestBuf = entries.get("manifest.json");
    if (manifestBuf == null) throw new Error("压缩包缺少 manifest.json");
    let m;
    try {
      m = JSON.parse(manifestBuf.toString("utf8"));
    } catch {
      throw new Error("manifest.json 不是有效 JSON");
    }
    const name = m.name ?? m.id ?? "pet";
    const id = this.#uniqueId(m.id ?? name);
    const files = {};
    for (const key of STATES) {
      const ref = m.states?.[key];
      if (ref == null) continue;
      const fileName = typeof ref === "string" ? ref : ref.file;
      if (!fileName) continue;
      const data = entries.get(fileName);
      if (data == null) throw new Error(`压缩包缺少状态文件 ${fileName}`);
      files[key] = fileName;
      this.#writeUserFile(id, fileName, data);
    }
    if (!files.idle) throw new Error("缺少 idle 状态（必填）");
    this.#writeUserManifest(id, name, files);
    return this.get(id);
  }

  removeUser(id) {
    const clean = sanitizeId(id);
    if (BUILTIN_PETS.some((p) => p.id === clean)) throw new Error("内置宠物不可删除");
    rmSync(join(this.userDir, clean), { recursive: true, force: true });
    if (this.active() === clean) this.setActive(BUILTIN_PETS[0].id);
    return clean;
  }

  // --- helpers -------------------------------------------------------------

  /** Resolve one stored pet into the client-facing manifest (images → URLs). */
  #client(pet) {
    const states = {};
    for (const key of STATES) {
      const state = pet.states?.[key];
      if (state == null) continue;
      if (state.kind === "svg") {
        states[key] = { kind: "svg", value: state.value };
      } else {
        const file = typeof state === "string" ? state : state.file;
        states[key] = { kind: "image", url: `/pets/user/${pet.id}/${encodeURIComponent(file)}` };
      }
    }
    return { id: pet.id, name: pet.name, source: pet.source, states };
  }

  #uniqueId(name) {
    const base = sanitizeId(name) || "pet";
    const taken = new Set(this.list().map((p) => p.id));
    if (!taken.has(base)) return base;
    let id;
    do {
      id = `${base}-${randomBytes(2).toString("hex")}`;
    } while (taken.has(id));
    return id;
  }

  #userDirFor(id) {
    return join(this.userDir, id);
  }

  #writeUserFile(id, fileName, buf) {
    if (buf.length > MAX_IMAGE_BYTES) throw new Error(`${fileName} 超过 4MB 限制`);
    const dir = this.#userDirFor(id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, fileName), buf);
  }

  #writeUserManifest(id, name, states) {
    const dir = this.#userDirFor(id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({ id, name, source: "user", states }, null, 2) + "\n",
    );
  }

  #decodeDataUrl(dataUrl) {
    const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(String(dataUrl ?? ""));
    if (!m) return null;
    return { mime: m[1].toLowerCase(), buf: Buffer.from(m[2], "base64") };
  }
}
