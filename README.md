# Resets AI

首页按已确认的 [第二版设计预览](design-preview/homepage-v2.html) 实现：最新 Codex 重置公告、周格历史热图、AI 商业化资料，以及桌面端两侧固定广告位。

## 本地运行

```sh
npx wrangler pages dev public --ip 127.0.0.1 --port 8788
```

访问 http://127.0.0.1:8788/ 。`/api/resets` 是 Cloudflare Pages Function，向 [codex-resets.com](https://codex-resets.com/) 读取公开重置数据；原站不可用时页面会显示错误状态。AI 资料并非收益承诺。

## AI 赚钱情报内容管理

后台入口为 `/admin.html`（访问 `/admin` 也可）。粘贴 HTTPS 链接后会建立导入记录和待审核内容：通用文章页尝试读取正文段落及图片顺序，JSON-LD 可提供额外正文，YouTube 链接可作为站内视频；配置 R2 后尝试将可读取的图片存入本站。若设置 `AI_API_URL`、`AI_API_KEY`、`AI_MODEL`，还会生成中文卡片草稿，但不会改写原文。读取失败或素材不全时进入“需协助”，留下缺项说明，不会自动发布。

控制台有总览、审核队列、原文与展示稿对照、首页卡片与详情预览、图片/视频检查、版本记录、媒体库、点击热度及四个固定广告位。管理员核对后可保存草稿、提交待审核、发布或下架；授权全文发布必须明确勾选授权与素材核对。全文格式支持段落、`# 标题` 和单独一段的 `![图片说明](https://图片地址)`。当前站内视频支持 YouTube 和 HTTPS MP4；X、B 站等受平台读取或播放限制的链接可能需要作者原文及媒体文件协助补全。

已发布内容自动加入首页卡片。点击任意卡片会打开站内阅读弹窗，也可通过 `/article.html?id=文章ID` 直接访问内容页；草稿和下架内容不会进入公开列表。现有四张人工整理的静态卡片暂时保留。长卡片仍每小时读取站内点击量榜首；新增内容发布后可以参与热度排名。

后台需要 D1 绑定 `DB` 和加密环境变量 `ADMIN_TOKEN`。旧数据库需先运行一次 [v2 数据迁移](db/migrations/001-content-console-v2.sql)，新数据库使用 [完整表结构](db/schema.sql)。未配置时首页保留既有静态卡片，但后台不能保存内容。完整配置见 [DEPLOY.md](DEPLOY.md)。管理密钥不要写入仓库或公开给访客。模型接口为可选项，其调用费用不包含在 Cloudflare 免费托管额度内。

`npm run check` 检查 JavaScript 语法，`npm test` 验证数据转换与接口错误处理。Cloudflare Pages 免费方案的配置步骤见 [DEPLOY.md](DEPLOY.md)。

字体资源包含 Baloo 2 和 GenSen Rounded 的页面用字子集，授权分别见 `public/fonts/OFL-Baloo2.txt` 与 `public/fonts/OFL-GenSen.txt`。
