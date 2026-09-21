import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/articles/click.js";
import { onRequestGet } from "../functions/api/articles/popular.js";

test("文章点击统计可写入并按点击量返回榜首", async () => {
  const counts = new Map();
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(articleId) {
            return {
              async run() {
                if (/INSERT INTO article_clicks\s*\(/.test(sql)) {
                  counts.set(articleId, (counts.get(articleId) || 0) + 1);
                }
              },
            };
          },
          async first() {
            const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
            return rows[0] ? { article_id:rows[0][0], clicks:rows[0][1], updated_at:"2026-09-19T00:00:00.000Z" } : null;
          },
        };
      },
    },
  };
  const request = () => new Request("https://example.com/api/articles/click", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify({ article_id:"xilo-codex-editing" }),
  });
  await onRequestPost({ request:request(), env });
  await onRequestPost({ request:request(), env });
  const response = await onRequestGet({ env });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).article_id, "xilo-codex-editing");
});

test("未绑定 D1 时文章统计接口明确返回未配置", async () => {
  const post = await onRequestPost({
    request:new Request("https://example.com", { method:"POST", body:JSON.stringify({ article_id:"xilo-codex-editing" }) }),
    env:{},
  });
  assert.equal(post.status, 503);
  const popular = await onRequestGet({ env:{} });
  assert.equal(popular.status, 503);
  assert.equal((await popular.json()).article_id, null);
});
