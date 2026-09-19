# 部署到 Cloudflare Pages（免费方案）

本仓库使用静态文件 + Pages Function，不需要付费依赖、构建步骤或数据库。

1. 在 Cloudflare 仪表盘中创建 **Workers & Pages → Pages → Connect to Git** 项目，连接本仓库。
2. 生产分支选择 `main`。构建命令留空，输出目录填写 `public`。
3. 部署后检查首页及 `/api/resets`。Pages Function 会代理公开的 `https://codex-resets.com/api/resets`，并缓存 15 分钟。
4. 正式接广告前，替换页面两侧的四张示意卡。广告文案与链接需由站长核准。

目前为私有仓库，尚未关联 Cloudflare 账户或发布。该方案在 Cloudflare Pages 免费额度内可起步；实际请求量仍需留意 Pages Functions/Workers 免费配额。具体上限以 Cloudflare 官方文档为准：https://developers.cloudflare.com/pages/functions/pricing/ 。

重置数据依赖第三方公开接口。上游不可用或改变格式时，页面会提示暂不可用并提供原站链接，不会显示过期数据冒充最新公告。

AI 商业化卡片由人工筛选，标题和摘要为本站撰写，原文链接来自 Stripe、Cloudflare、Shopify 与 Zapier；后续内容需继续核对原始出处、发布日期和可执行性。
