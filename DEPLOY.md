# 部署到 Cloudflare Pages（免费方案）

本仓库使用静态文件 + Pages Function；重置公告本身不需要数据库。文章热度统计使用 Cloudflare D1 免费额度，可在需要统计真实点击量时绑定。

1. 在 Cloudflare 仪表盘中创建 **Workers & Pages → Pages → Connect to Git** 项目，连接本仓库。
2. 生产分支选择 `main`。构建命令留空，输出目录填写 `public`。
3. 部署后检查首页及 `/api/resets`。Pages Function 会代理公开的 `https://codex-resets.com/api/resets`，并缓存 15 分钟。
4. 正式接广告前，替换页面两侧的四张示意卡。广告文案与链接需由站长核准。

## 文章热度统计（可选 D1）

长卡片每小时读取 `/api/articles/popular`，文章卡片点击通过 `/api/articles/click` 计数。要启用跨访客的真实统计：

1. 创建 D1 数据库：`npx wrangler d1 create resets-ai`
2. 在 Cloudflare Pages 项目的 Settings → Functions → D1 database bindings 中添加绑定，变量名填写 `DB`。
3. 使用 Cloudflare 返回的数据库名称执行初始化：`npx wrangler d1 execute resets-ai --remote --file=db/schema.sql`

未绑定 D1 时，本地预览会使用浏览器本地点击记录，不影响页面查看；正式环境会保留默认热度文章并提示统计接口未配置。

目前为私有仓库，尚未关联 Cloudflare 账户或发布。该方案在 Cloudflare Pages 免费额度内可起步；实际请求量仍需留意 Pages Functions/Workers 免费配额。具体上限以 Cloudflare 官方文档为准：https://developers.cloudflare.com/pages/functions/pricing/ 。

重置数据依赖第三方公开接口。上游不可用或改变格式时，页面会提示暂不可用并提供原站链接，不会显示过期数据冒充最新公告。

AI 商业化卡片由人工筛选，标题和摘要为本站撰写，原文链接来自 Stripe、Cloudflare、Shopify 与 Zapier；后续内容需继续核对原始出处、发布日期和可执行性。
