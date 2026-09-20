# Resets AI

首页按已确认的 [第二版设计预览](design-preview/homepage-v2.html) 实现：最新 Codex 重置公告、周格历史热图、AI 商业化资料，以及桌面端两侧固定广告位。

## 本地运行

```sh
npx wrangler pages dev public --ip 127.0.0.1 --port 8788
```

访问 http://127.0.0.1:8788/ 。`/api/resets` 是 Cloudflare Pages Function，向 [codex-resets.com](https://codex-resets.com/) 读取公开重置数据；原站不可用时页面会显示错误状态。AI 资料并非收益承诺。

## AI 赚钱情报内容管理

管理员通过 `/controller`，验证管理密钥后进入 `/admin`。粘贴 HTTPS 链接后会建立导入记录和待审核内容：通用文章页尝试读取正文段落及图片顺序，JSON-LD 可提供额外正文，YouTube 链接可作为站内视频；配置 R2 后自动将可读取的封面和文章图片存入本站，无需手动上传。若设置 `AI_API_URL`、`AI_API_KEY`、`AI_MODEL`，还会生成中文卡片草稿，但不会改写原文。读取失败或素材不全时进入“需协助”，留下缺项说明，不会自动发布。

控制台包含驾驶舱、档案管理、审核管理、媒体库、运营中心和广告位。驾驶舱显示已发布、待审核、需协助、累计阅读、累计访问及近 30 天趋势，并显示 D1、R2 等连接状态。档案管理按永久编号 `DA1`、`DA2` 等展示档案，支持搜索、按状态筛选、每页 10 或 20 条，以及弹窗新增、编辑、预览、下架和移入已废弃；新增档案可通过链接导入或手工录入。保存并提交审核后，管理员可在审核管理预览卡片和站内详情，填写拒绝原因或审核通过并发布。媒体库按档案展示已引用的 R2 文件及外部媒体；运营中心记录档案留存时间和处理历史；广告位用首页平面图管理四个位置。

编辑器保留原文与展示稿对照、图片/视频检查和版本记录；授权全文发布必须明确勾选授权与素材核对。全文格式支持段落、`# 标题` 和单独一段的 `![图片说明](https://图片地址)`。当前站内视频支持 YouTube 和 HTTPS MP4；X、B 站等受平台读取或播放限制的链接可能需要作者原文及媒体文件协助补全。

已发布档案自动加入首页卡片。访客可阅读最近发布的 1 篇档案，注册读者账号后可阅读全部已发布档案；列表和 `/api/articles/item` 都由服务端检查会话。读者使用 `/register.html` 创建用户名和密码账号，可从注册页进入 `/reader-login.html` 登录；后台仍只有 `ADMIN_TOKEN` 一个管理员凭证，没有管理员注册。读者密码以加盐散列存入 D1，浏览器通过 HttpOnly 会话 Cookie 保持登录。草稿和下架档案不公开。当前无已发布档案或 D1 暂不可用时，首页保留四张人工整理的静态精选卡片；有档案发布后由 D1 档案列表接管。热度榜首仍每小时读取点击量，新增档案发布后可以参与排名。

后台和读者账号需要 D1 绑定 `DB`，后台另需加密环境变量 `ADMIN_TOKEN`。旧数据库需先运行一次 [v2 数据迁移](db/migrations/001-content-console-v2.sql)；已有 v2 数据库升级驾驶舱时需在备份后执行 [002 迁移](db/migrations/002-dashboard-analytics.sql)，读者账号与档案编号需要执行 [003 迁移](db/migrations/003-reader-archives.sql)。新数据库使用 [完整表结构](db/schema.sql)。完整配置见 [DEPLOY.md](DEPLOY.md)。管理密钥不要写入仓库或公开给访客。模型接口为可选项，其调用费用不包含在 Cloudflare 免费托管额度内。

`npm run check` 检查 JavaScript 语法，`npm test` 验证数据转换与接口错误处理。Cloudflare Pages 免费方案的配置步骤见 [DEPLOY.md](DEPLOY.md)。

字体资源包含 Baloo 2 和 GenSen Rounded 的页面用字子集，授权分别见 `public/fonts/OFL-Baloo2.txt` 与 `public/fonts/OFL-GenSen.txt`。
