# 部署到 Cloudflare Pages（免费方案）

本仓库使用静态文件 + Pages Function；重置公告本身不需要数据库。文章管理与跨访客点击统计使用 Cloudflare D1。

1. 在 Cloudflare 仪表盘中创建 **Workers & Pages → Pages → Connect to Git** 项目，连接本仓库。
2. 生产分支选择 `main`。构建命令留空，输出目录填写 `public`。
3. 部署后检查首页及 `/api/resets`。Pages Function 会代理公开的 `https://codex-resets.com/api/resets`，并缓存 15 分钟。
4. 正式接广告前，替换页面两侧的四张示意卡。广告文案与链接需由站长核准。

## 文章后台与热度统计

长卡片每小时读取 `/api/articles/popular`，文章卡片点击通过 `/api/articles/click` 计数。内容后台依赖同一个 D1 数据库：

1. 创建 D1 数据库：`npx wrangler d1 create resets-ai`
2. 在 Cloudflare Pages 项目的 Settings → Bindings 中添加 D1 database binding，变量名填写 `DB`，然后重新部署以使绑定生效。
3. **全新空库**使用完整表结构初始化：`npx wrangler d1 execute resets-ai --remote --file=db/schema.sql`。**已有旧文章的数据库**先导出备份，再只执行一次 `db/migrations/001-content-console-v2.sql`；不要对已有库重复运行迁移。迁移添加审核、版本和广告表，不删除旧文章。
4. 在 Pages 项目的 Settings → Variables and Secrets 中添加加密变量 `ADMIN_TOKEN`，使用足够长的随机密钥，并在部署后通过 `/admin.html` 登录。不要将密钥提交到 Git 或放在浏览器代码中。
5. 可选：添加 `AI_API_URL`、`AI_API_KEY`、`AI_MODEL`，让链接导入额外生成中文卡片文案。模型接口须兼容 Chat Completions JSON 输出；未配置时仍可提取元数据并手动编辑。模型调用可能产生费用。
6. 可选：创建 R2 bucket，在 Pages 项目的 Settings → Bindings 中添加 R2 绑定，变量名填写 `MEDIA`，然后重新部署。后台即可上传 JPG、PNG、WebP 或 GIF 图片（每张不超过 8 MB）；图片由本站的 `/api/media/...` 读取。未绑定 R2 时仍可使用外部 HTTPS 图片地址。R2 免费额度和账户开通要求以 [官方定价](https://developers.cloudflare.com/r2/pricing/) 为准。

后台 API 会校验 `ADMIN_TOKEN`；建议再用 Cloudflare Access 对 `/admin` 和 `/api/admin/*` 设置仅管理员可访问。公开页面只读取状态为 `published` 的记录。授权全文转载由管理员确认；导入链接会尝试提取可访问的正文和图片，无法完整取得时进入“需协助”，不会擅自补写或发布。R2 不可用时外部图片需要人工核对。

未绑定 D1 时，本地预览会使用浏览器本地点击记录，不影响页面查看；后台会明确提示数据库未配置。

该方案可从 Cloudflare Pages 与 D1 免费额度起步；实际请求量仍需留意 Pages Functions/Workers 和 D1 免费配额。具体上限以 Cloudflare 官方文档为准：https://developers.cloudflare.com/pages/functions/pricing/ 。

重置数据依赖第三方公开接口。上游不可用或改变格式时，页面会提示暂不可用并提供原站链接，不会显示过期数据冒充最新公告。

AI 商业化卡片由人工筛选，标题和摘要为本站撰写，原文链接来自 Stripe、Cloudflare、Shopify 与 Zapier；后续内容需继续核对原始出处、发布日期和可执行性。
