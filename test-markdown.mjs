import { markdownToTelegramHtml, markdownToPlainText } from "/Users/kevinzhang/.dsh/profiles/web/node_modules/@kazecreator/dsh-settings-pro/lib/markdown.js";

const samples = [
  ["heading h1-h6", "# Title\n## Section\n### Sub\n#### H4\n##### H5\n###### H6"],
  ["bold/italic/strike/code inline", "This is **bold**, *italic*, _under_, ~~strike~~, and `inline code`."],
  ["link", "See [the docs](https://example.com/path?q=1&x=2) for more."],
  ["link w/ parens in url", "[wiki](https://en.wikipedia.org/wiki/Foo_(bar))"],
  ["bold inside link label", "[**bold label** and more](https://example.com)"],
  ["unordered list", "- one\n- two\n- three"],
  ["ordered list dot", "1. first\n2. second\n3. third"],
  ["ordered list paren", "1) first\n2) second"],
  ["nested-ish list", "- parent\n  - child\n  - child2\n- parent2"],
  ["fenced code (js)", "```js\nconst x = 1;\nconsole.log(x);\n```"],
  ["fenced code with html/specials", "```html\n<div class=\"a\">x & y < z > w</div>\n```"],
  ["fenced code with backticks inside", "````\ncode with ` backtick and ``` fence inside\n````"],
  ["indented code (no fence)", "    plain indented code\n    second line"],
  ["table ascii", "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |"],
  ["table with alignment colons", "| Left | Right |\n| :--- | ---: |\n| a | 1 |\n| bb | 22 |"],
  ["table chinese (double-width)", "| 姓名 | 年龄 |\n| --- | --- |\n| 张三 | 三十 |\n| 李四 | 二十五 |"],
  ["table with inline markdown", "| Item | Price |\n| --- | --- |\n| **Milk** | $2 |\n| `code` | $3 |"],
  ["blockquote", "> This is a quote\n> with **bold** and `code`"],
  ["horizontal rule", "before\n\n---\n\nafter"],
  ["hr with asterisks", "a\n\n***\n\nb"],
  ["emoji", "Done ✅ and 🚀 and 🎉 and 😄"],
  ["chinese mixed", "你好，这是**加粗**、`代码`和[链接](https://x.com)。\n\n- 第一项\n- 第二项\n\n1. 甲\n2. 乙"],
  ["asterisks as math", "3 * 4 = 12, and a*b*c is multiplication, 5 ** 2 = 25"],
  ["nested bold italic", "***both*** and **bold with *italic* inside**"],
  ["inline code w/ asterisks", "use `*args` and `**kwargs`"],
  ["underscore in words", "snake_case_var and _single_ emphasis"],
  ["very long single line (>4096)", "W".repeat(5000)],
  ["multiline paragraphs", "First paragraph.\n\nSecond paragraph with **bold**.\n\nThird."],
  ["heading then list then code", "# Steps\n\n1. install\n2. run\n\n```sh\nnpm install\n```"],
];

function balanced(tag, s) {
  const open = (s.match(new RegExp("<" + tag + "(?:\\s[^>]*)?>", "g")) || []).length;
  const close = (s.match(new RegExp("</" + tag + ">", "g")) || []).length;
  return open === close;
}

const leftover = /(\*\*|\*\S|\S\*|\s\*\s|~~|`{1,3}|^#{1,6}\s|\|\s*---)/;

let fails = 0;
for (const [name, md] of samples) {
  const tg = markdownToTelegramHtml(md);
  const wx = markdownToPlainText(md);

  const tags = ["b", "i", "s", "u", "code", "pre", "a", "tg-spoiler", "blockquote"];
  const unbalanced = tags.filter((t) => !balanced(t, tg));
  const tgLen = tg.length;
  const wxLen = wx.length;
  const tgLeftover = leftover.test(tg);
  const wxLeftover = leftover.test(wx);
  const tgTooLong = tgLen > 4096;

  const problems = [];
  if (unbalanced.length) problems.push(`unbalanced tags: ${unbalanced.join(",")}`);
  if (tgTooLong) problems.push(`telegram length ${tgLen} > 4096`);
  if (tgLeftover) problems.push("telegram has leftover md tokens");
  if (wxLeftover) problems.push("wechat has leftover md tokens");
  if (problems.length) fails += 1;

  console.log("=".repeat(70));
  console.log(`### ${name}${problems.length ? "  ⚠️ " + problems.join("; ") : ""}`);
  console.log(`-- telegram (len=${tgLen}) --`);
  console.log(tg);
  console.log(`-- wechat   (len=${wxLen}) --`);
  console.log(wx);
}

console.log("\n" + "=".repeat(70));
console.log(`SUMMARY: ${samples.length} samples, ${fails} with flagged issues`);
