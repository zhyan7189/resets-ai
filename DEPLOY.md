# 部署到 Cloudflare Pages（免费方案）

本仓库使用静态文件 + Pages Function；重置公告本身不需要数据库。文章管理与跨访客点击统计使用 Cloudflare D1。

1. 在 Cloudflare 仪表盘中创建 **Workers & Pages → Pages → Connect to Git** 项目，连接本仓库。
2. 生产分支选择 `main`。无框架预设时，构建命令填写 `exit 0`，构建输出目录填写 `public`。这是 Cloudflare 对无构建步骤且使用 Pages Functions 的静态站点的[官方建议](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)。
3. 部署后检查首页及 `/api/resets`。Pages Function 会代理公开的 `https://codex-resets.com/api/resets`，并缓存 15 分钟。
4. 正式接广告前，替换页面两侧的四张示意卡。广告文案与链接需由站长核准。

## 文章后台与热度统计

长卡片每小时读取 `/api/articles/popular`，文章卡片点击通过 `/api/articles/click` 计数。内容后台依赖同一个 D1 数据库：

1. 创建 D1 数据库：`npx wrangler d1 create resets-ai`
2. 在 Cloudflare Pages 项目的 Settings → Bindings 中添加 D1 database binding，变量名填写 `DB`，然后重新部署以使绑定生效。
3. **全新空库**使用完整表结构初始化：`npx wrangler d1 execute resets-ai --remote --file=db/schema.sql`。**已有旧文章的数据库**先导出备份，再只执行一次 `db/migrations/001-content-console-v2.sql`；不要对已有库重复运行迁移。迁移添加审核、版本和广告表，不删除旧文章。
4. 在 Pages 项目的 Settings → Variables and Secrets 中添加加密变量 `ADMIN_TOKEN`，使用足够长的随机密钥，并在部署后通过 `/controller` 登录。不要将密钥提交到 Git 或放在浏览器代码中。
5. 可选：添加 `AI_API_URL`、`AI_API_KEY`、`AI_MODEL`，让链接导入额外生成中文卡片文案。模型接口须兼容 Chat Completions JSON 输出；未配置时仍可提取元数据并手动编辑。模型调用可能产生费用。
6. 可选：创建 R2 bucket，在 Pages 项目的 Settings → Bindings 中添加 R2 绑定，变量名填写 `MEDIA`，然后重新部署。解析链接时，可读取的封面和文章图片会自动存入 R2（JPG、PNG、WebP 或 GIF；每张不超过 8 MB，单次最多 24 张），由本站的 `/api/media/...` 读取。未绑定 R2 或来源图片无法读取时保留外部 HTTPS 图片地址，并在后台提示核对。R2 免费额度和账户开通要求以 [官方定价](https://developers.cloudflare.com/r2/pricing/) 为准。

### 已有 D1 的驾驶舱升级

新版驾驶舱、人工审核记录及访问统计需要额外三张表。已有生产库先在 Cloudflare D1 页面导出备份，再执行 [002-dashboard-analytics.sql](db/migrations/002-dashboard-analytics.sql)。全新空库直接使用 `db/schema.sql`，无需再执行 002。迁移只新增表和索引，不改动既有文章及点击记录。统计从迁移完成并部署新版代码后开始累计；“累计阅读”继续使用原有点击记录，“累计访问”不会补算历史流量。

如使用 Wrangler：

```sh
npx wrangler d1 export resets-ai --remote --output /private/tmp/resets-ai-before-002.sql
npx wrangler d1 execute resets-ai --remote --file=db/migrations/002-dashboard-analytics.sql
```

执行后，在 D1 控制台确认 `site_visits_daily`、`article_metrics_daily`、`review_events` 已出现，再部署新版代码。生产环境的 Pages 项目仍需保持 `DB`、`MEDIA` 和加密的 `ADMIN_TOKEN` 绑定。

### 读者账号与档案编号升级

现有生产库完成 001、002 后，先建立 D1 恢复点或导出备份，再执行 [003-reader-archives.sql](db/migrations/003-reader-archives.sql)。这会为旧档案按创建时间补永久 `DA` 编号，并创建读者账号、会话和登录尝试表；不删除现有档案。全新空库直接使用 `db/schema.sql`，无需再执行 003。

```sh
npx wrangler d1 export resets-ai --remote --output /private/tmp/resets-ai-before-003.sql
npx wrangler d1 execute resets-ai --remote --file=db/migrations/003-reader-archives.sql
```

执行后检查 `archive_ids`、`reader_users`、`reader_sessions`、`reader_attempts` 四张表，再部署新版代码。访客只可读取最近发布的 1 篇档案，已注册读者不限篇数；管理员仍使用 `ADMIN_TOKEN` 登录，不与读者账号混用。注册与登录有基于访客 IP 的尝试次数限制，正式开放注册时仍建议在 Cloudflare 配置额外的机器人防护。

### 游客模式开关升级

已有生产库先导出 D1 备份，再执行 [004-guest-mode.sql](db/migrations/004-guest-mode.sql)，最后部署对应代码。该迁移只新增 `site_settings` 表，并将游客限制默认为开启；再次运行不会覆盖控制台中保存的选择。关闭后游客可完整阅读全部已发布档案，重新开启后只可阅读最新一篇。

```sh
npx wrangler d1 export resets-ai --remote --output /private/tmp/resets-ai-before-004.sql
npx wrangler d1 execute resets-ai --remote --file=db/migrations/004-guest-mode.sql
```

部署后检查驾驶舱开关和 `/api/articles` 的 `limited` 字段。回收站“粉碎”会永久删除档案、版本、统计与导入审核记录，并尝试清理仅被该档案引用的 R2 图片；执行前须在界面输入档案编号。R2 清理失败时页面会提示管理员跟进。

### 档案类型与热度排序升级

已有生产库先导出 D1 备份，再执行 [005-archive-categories-and-heat.sql](db/migrations/005-archive-categories-and-heat.sql)，最后部署对应代码。迁移会把执行当时的全部档案类型统一为“实操教程”，并创建按小时累计点击量的 `article_clicks_hourly` 表。迁移带一次性标记，重复执行不会覆盖后来设置的“AI测评”或“机会资讯”。

```sh
npx wrangler d1 export resets-ai --remote --output /private/tmp/resets-ai-before-005.sql
npx wrangler d1 execute resets-ai --remote --file=db/migrations/005-archive-categories-and-heat.sql
```

部署后检查公开档案只包含 `tutorial`、`review`、`opportunity` 三种类型，并验证“24小时热度”“一周热度”“历史热度”“最新档案”的排序。24 小时统计从迁移及新版代码上线后开始按小时累计，无法从旧的按日统计中还原上线前的小时分布。

后台 API 会校验 `ADMIN_TOKEN`；建议再用 Cloudflare Access 对 `/admin` 和 `/api/admin/*` 设置仅管理员可访问。公开页面只读取状态为 `published` 的记录。授权全文转载由管理员确认；导入链接会尝试提取可访问的正文和图片，无法完整取得时进入“需协助”，不会擅自补写或发布。R2 不可用时外部图片需要人工核对。

未绑定 D1 时，本地预览会使用浏览器本地点击记录，不影响页面查看；后台会明确提示数据库未配置。

该方案可从 Cloudflare Pages 与 D1 免费额度起步；实际请求量仍需留意 Pages Functions/Workers 和 D1 免费配额。具体上限以 Cloudflare 官方文档为准：https://developers.cloudflare.com/pages/functions/pricing/ 。

重置数据依赖第三方公开接口。上游不可用或改变格式时，页面会提示暂不可用并提供原站链接，不会显示过期数据冒充最新公告。

AI 商业化卡片由人工筛选，标题和摘要为本站撰写，原文链接来自 Stripe、Cloudflare、Shopify 与 Zapier；后续内容需继续核对原始出处、发布日期和可执行性。
