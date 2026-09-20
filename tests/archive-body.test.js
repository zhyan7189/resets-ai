import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("混排图片、标题和正文各自显示，恶意 HTML 只作为文本", () => {
  const container = { children:[], append(node) { this.children.push(node); } };
  const document = { createElement(tag) { return { tag, children:[], append(child) { this.children.push(child); } }; } };
  const script = readFileSync(new URL("../public/archive-body.js", import.meta.url), "utf8");
  const render = runInNewContext(`${script}\nappendArchiveBody`, { document, location:{ origin:"https://example.com" }, URL });
  const media = "/api/media/12345678-1234-1234-1234-123456789abc.jpg";
  render(`![封面](${media})\n# 标题\n第一段文字。\n![](${media}) 后续文字 <script>alert(1)</script>`, container);
  assert.deepEqual(container.children.map((node) => node.tag), ["figure","h3","p","figure","p"]);
  assert.equal(container.children[0].children[0].src, media);
  assert.equal(container.children[2].textContent, "第一段文字。");
  assert.equal(container.children[4].textContent, "后续文字 <script>alert(1)</script>");
});
