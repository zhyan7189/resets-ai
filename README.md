# Resets AI

首页按已确认的 [第二版设计预览](design-preview/homepage-v2.html) 实现：最新 Codex 重置公告、周格历史热图、AI 商业化资料，以及桌面端两侧固定广告位。

## 本地运行

```sh
npx wrangler pages dev public --ip 127.0.0.1 --port 8788
```

访问 http://127.0.0.1:8788/ 。`/api/resets` 是 Cloudflare Pages Function，向 [codex-resets.com](https://codex-resets.com/) 读取公开重置数据；原站不可用时页面会显示错误状态。AI 资料卡片支持站内阅读，文章点击通过可选的 D1 统计，长卡片每小时展示点击量最高的文章。AI 资料并非收益承诺。

`npm run check` 检查 JavaScript 语法，`npm test` 验证数据转换与接口错误处理。Cloudflare Pages 免费方案的配置步骤见 [DEPLOY.md](DEPLOY.md)。

字体资源包含 Baloo 2 和 GenSen Rounded 的页面用字子集，授权分别见 `public/fonts/OFL-Baloo2.txt` 与 `public/fonts/OFL-GenSen.txt`。
