const $ = (id) => document.getElementById(id);
const form = $("article-form");
const categoryNames = { opportunity:"机会资讯", tutorial:"实操教程", tools:"工具观察", case:"创业案例", pitfall:"避坑经验" };
const statusNames = { draft:"草稿", needs_help:"需协助", review:"待审核", published:"已发布", archived:"已下架" };
let token = "";
let editingId = "";
let revision = null;
let entries = [];
let activeFilter = "all";
let originalBody = "";
let extractionState = "manual";
let extractionNote = "";
let adRows = [];
let previewVideoValue = "";

function status(id, message, error = false) {
  const node = $(id);
  node.textContent = message;
  node.classList.toggle("error", error);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers:{ authorization:`Bearer ${token}`, accept:"application/json", ...(options.body && !(options.body instanceof FormData) ? { "content-type":"application/json" } : {}) },
    cache:"no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const labels = {
      unauthorized:"管理密钥无效或未配置", database_unconfigured:"尚未绑定 D1 数据库",
      duplicate_url:"这条链接已经收录，请从内容库打开编辑", save_failed_or_duplicate_url:"保存失败：链接重复或数据库尚未升级",
      import_save_failed:"导入结果无法入库，请检查 v2 数据库迁移", articles_unavailable:"内容列表不可用，请检查 v2 数据库迁移",
      publication_fields_required:"发布前须填写标题、摘要、来源和作者", licensed_body_required:"授权转载须填写全文",
      rights_confirmation_required:"发布授权全文前请勾选授权与素材核对", embed_requires_video:"视频播放只适用于视频内容",
      embed_video_required:"请填写视频地址", video_not_playable:"当前仅支持 YouTube 或 HTTPS MP4 站内播放",
      revision_conflict:"文章已在其他页面修改，请重新打开后再保存", invalid_source_url:"原始链接须为有效 HTTPS 地址",
      media_unconfigured:"尚未绑定 R2 图片存储", invalid_image_size:"图片须为 12 字节至 8 MB",
      unsupported_image:"仅支持 JPG、PNG、WebP 和 GIF",
      invalid_target_url:"推广链接须为有效 HTTPS 地址", ad_fields_required:"启用广告时须填写标题和推广链接",
      invalid_ad_dates:"广告展示时间无效，结束时间须晚于开始时间",
    };
    const error = new Error(labels[data.error] || data.error || `请求失败（${response.status}）`);
    error.code = data.error;
    error.articleId = data.id;
    throw error;
  }
  return data;
}

function field(name) { return form.elements.namedItem(name); }
function mediaUrl(value) { return /^https:\/\//i.test(value || "") || /^\/api\/media\/[a-f0-9-]{36}\.(?:jpg|png|webp|gif)$/.test(value || ""); }
function playable(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (/\.mp4$/i.test(url.pathname)) return true;
    const id = ["youtube.com","www.youtube.com","m.youtube.com"].includes(url.hostname) ? url.searchParams.get("v") : url.hostname === "youtu.be" ? url.pathname.slice(1) : "";
    return /^[a-zA-Z0-9_-]{11}$/.test(id || "");
  } catch { return false; }
}

function previewVideo(value) {
  if (value && value === previewVideoValue) return;
  previewVideoValue = value || "";
  const container = $("detail-body"); container.replaceChildren();
  let url;
  try { url = new URL(value); } catch { return previewBody("视频地址待补全。"); }
  let id = "";
  if (["youtube.com","www.youtube.com","m.youtube.com"].includes(url.hostname)) id = url.searchParams.get("v") || "";
  if (url.hostname === "youtu.be") id = url.pathname.slice(1);
  if (/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    const iframe = document.createElement("iframe"); iframe.src = `https://www.youtube-nocookie.com/embed/${id}`;
    iframe.title = "视频播放检查"; iframe.allowFullscreen = true; container.append(iframe);
  } else if (url.protocol === "https:" && /\.mp4$/i.test(url.pathname)) {
    const video = document.createElement("video"); video.src = url.href; video.controls = true; video.preload = "metadata"; container.append(video);
  } else previewBody("目前无法在本站播放该链接，请补充 YouTube 或 HTTPS MP4 地址。");
}

function previewBody(body) {
  const container = $("detail-body");
  container.replaceChildren();
  for (const raw of String(body || "全文待补全").split(/\n\s*\n/)) {
    const block = raw.trim();
    if (!block) continue;
    const image = block.match(/^!\[([^\]]*)\]\((https:\/\/[^\s)]+|\/api\/media\/[a-f0-9-]{36}\.(?:jpg|png|webp|gif))\)$/);
    if (image) {
      const figure = document.createElement("figure");
      const img = document.createElement("img");
      img.src = image[2]; img.alt = image[1]; img.loading = "lazy";
      figure.append(img);
      if (image[1]) { const caption = document.createElement("figcaption"); caption.textContent = image[1]; figure.append(caption); }
      container.append(figure);
      continue;
    }
    const heading = block.match(/^(#{1,3})\s+([\s\S]+)$/);
    const node = document.createElement(heading ? "h3" : block.startsWith("> ") ? "blockquote" : "p");
    node.textContent = heading ? heading[2] : block.startsWith("> ") ? block.slice(2) : block;
    container.append(node);
  }
}

function fill(article = {}) {
  editingId = article.id || "";
  revision = article.revision ?? null;
  originalBody = article.original_body || "";
  extractionState = article.extraction_state || "manual";
  extractionNote = article.extraction_note || "";
  for (const name of ["source_url","source_name","author","published_at","format","category","rights","title","card_title","summary","cover_url","body","video_url"]) {
    const input = field(name);
    input.value = name === "published_at" ? String(article[name] || "").slice(0, 10) : article[name] || "";
  }
  field("rights_confirmed").checked = Boolean(article.rights_confirmed);
  $("original-body").value = originalBody;
  $("extraction-note").textContent = extractionNote ? `待处理：${extractionNote}` : "原文、媒体顺序与授权仍需人工逐项核对。";
  $("editor-title").textContent = editingId ? "审核与编辑内容" : "编辑新草稿";
  $("current-status").textContent = `当前：${statusNames[article.status] || "未保存"}${revision ? ` · 第 ${revision} 版` : ""}`;
  $("archive-button").hidden = article.status !== "published";
  $("article-form").hidden = false;
  $("editor-empty").hidden = true;
  preview();
  loadVersions();
  $("editor").scrollIntoView({ behavior:"smooth", block:"start" });
}

function preview() {
  const data = Object.fromEntries(new FormData(form));
  const cover = $("preview-cover");
  cover.hidden = !mediaUrl(data.cover_url);
  if (!cover.hidden) cover.src = data.cover_url;
  $("preview-kicker").textContent = `${categoryNames[data.category] || "机会资讯"} · ${data.source_name || "来源待填"}`;
  $("preview-title").textContent = data.card_title || data.title || "卡片标题待填";
  $("preview-summary").textContent = data.summary || "摘要待填";
  $("preview-source").textContent = [data.author, data.published_at].filter(Boolean).join(" · ");
  $("detail-title").textContent = data.title || "文章标题待填";
  $("detail-summary").textContent = data.summary || "";
  if (data.rights === "embed") previewVideo(data.video_url);
  else { previewVideoValue = ""; previewBody(data.rights === "licensed" ? data.body : "仅展示导读，阅读原文请使用来源链接。"); }
  $("detail-credit").textContent = `信息来源：${data.author || "作者待填"}（${data.source_name || "平台待填"}） · ${data.source_url || "原文链接待填"}`;
  $("check-content").textContent = data.rights === "licensed" ? (data.body ? "请与左侧原文核对" : "正文缺失") : data.rights === "embed" ? "视频内容" : "仅导读";
  $("check-credit").textContent = data.author && data.source_name ? "已填写，待确认" : "缺少作者或平台";
  $("check-playback").textContent = data.rights === "embed" ? (playable(data.video_url) ? "可站内播放，待检查" : "视频地址不可播放") : "不适用";
}

function renderList() {
  const list = $("article-list");
  list.replaceChildren();
  const query = $("filter-query").value.trim().toLowerCase();
  const source = $("filter-source").value;
  const format = $("filter-format").value;
  const filtered = entries.filter((item) => (activeFilter === "all" || item.status === activeFilter) &&
    (!source || item.source_name === source) && (!format || item.format === format) &&
    (!query || [item.title,item.card_title,item.author,item.source_url].some((text) => String(text || "").toLowerCase().includes(query))));
  if (!filtered.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "当前筛选下没有内容。"; list.append(empty); return; }
  for (const article of filtered) {
    const row = document.createElement("div"); row.className = "list-item";
    const info = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = article.card_title || article.title || article.source_url;
    const meta = document.createElement("small");
    const badge = document.createElement("span"); badge.className = `status ${article.status}`; badge.textContent = statusNames[article.status] || article.status;
    meta.append(badge, document.createTextNode([article.source_name, article.author, `${article.clicks || 0} 次阅读`, article.updated_at].filter(Boolean).join(" · ")));
    info.append(title, meta);
    const edit = document.createElement("button"); edit.className = "button secondary"; edit.type = "button"; edit.textContent = "审核 / 编辑";
    edit.addEventListener("click", async () => { edit.disabled = true; try { await openArticle(article.id); } catch (error) { status("import-status", error.message, true); } finally { edit.disabled = false; } });
    row.append(info, edit); list.append(row);
  }
}

async function openArticle(id) {
  const data = await api(`/api/admin/item?id=${encodeURIComponent(id)}`);
  fill(data.article);
}

async function refreshList() {
  const data = await api("/api/admin/articles");
  entries = data.articles || [];
  const source = $("filter-source");
  const selected = source.value;
  source.replaceChildren(new Option("全部平台", ""));
  for (const name of [...new Set(entries.map((entry) => entry.source_name).filter(Boolean))].sort()) source.add(new Option(name, name));
  source.value = selected;
  renderList();
}

async function refreshOverview() {
  const overview = await api("/api/admin/overview");
  $("metric-help").textContent = overview.counts.needs_help || 0;
  $("metric-review").textContent = overview.counts.review || 0;
  $("metric-published").textContent = overview.counts.published || 0;
  $("metric-reads").textContent = Number(overview.total_reads || 0).toLocaleString("zh-CN");
  $("popular-summary").textContent = overview.popular ? `${overview.popular.card_title || overview.popular.title} · ${overview.popular.clicks} 次阅读` : "暂无已发布文章点击数据";
  $("setting-d1").textContent = overview.integrations.d1 ? "已连接" : "未连接";
  $("setting-r2").textContent = overview.integrations.r2 ? "已连接" : "未连接";
  $("setting-ai").textContent = overview.integrations.ai ? "已配置" : "未配置";
  const jobs = $("job-list"); jobs.replaceChildren();
  if (!overview.jobs.length) { const li = document.createElement("li"); li.textContent = "暂无导入任务"; jobs.append(li); }
  for (const job of overview.jobs) {
    const li = document.createElement("li");
    const link = document.createElement("a"); link.href = "#editor"; link.textContent = `${job.adapter.toUpperCase()} · ${statusNames[job.current_status] || job.current_status}`;
    link.addEventListener("click", async (event) => { event.preventDefault(); try { await openArticle(job.article_id); } catch (error) { status("import-status", error.message, true); } });
    const detail = document.createElement("div"); detail.className = "help"; detail.textContent = job.note || job.source_url;
    li.append(link, detail); jobs.append(li);
  }
}

async function refreshMedia() {
  const data = await api("/api/admin/media");
  const list = $("media-list"); list.replaceChildren();
  if (!data.media.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "还没有入库的素材。"; list.append(empty); return; }
  for (const item of data.media) {
    const row = document.createElement("div"); row.className = "list-item";
    const info = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = `${item.type === "cover" ? "封面" : item.type === "video" ? "视频" : "正文图片"} · ${item.article_title || item.article_id}`;
    const detail = document.createElement("small"); detail.textContent = `${item.storage} · ${item.url}`;
    info.append(title, detail);
    const link = document.createElement("a"); link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "检查素材 ↗";
    row.append(info, link); list.append(row);
  }
}

function localDateValue(utc) {
  if (!utc) return "";
  const date = new Date(`${utc}Z`);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
}

function fillAdSlot() {
  const form = $("ad-form");
  const slot = Number(form.elements.namedItem("slot").value);
  const ad = adRows.find((item) => item.slot === slot) || {};
  for (const name of ["label","title","description","icon","target_url"]) form.elements.namedItem(name).value = ad[name] || "";
  for (const name of ["starts_at","ends_at"]) form.elements.namedItem(name).value = localDateValue(ad[name]);
  form.elements.namedItem("active").checked = Boolean(ad.active);
  status("ad-status", ad.slot ? `已载入广告位 ${slot}。` : `广告位 ${slot} 尚未配置。`);
}

async function refreshAds() {
  adRows = (await api("/api/admin/ads")).ads || [];
  fillAdSlot();
}

async function refreshResetHealth() {
  try {
    const response = await fetch("/api/resets", { cache:"no-store" });
    const data = await response.json();
    $("setting-resets").textContent = response.ok && Array.isArray(data.events) ? `可用 · ${data.events.length} 条公告` : "暂不可用";
  } catch { $("setting-resets").textContent = "暂不可用"; }
}

async function loadVersions() {
  const panel = $("versions-panel"); panel.hidden = !editingId;
  if (!editingId) return;
  try {
    const data = await api(`/api/admin/versions?id=${encodeURIComponent(editingId)}`);
    const list = $("versions-list"); list.replaceChildren();
    for (const version of data.versions) {
      const row = document.createElement("div"); row.className = "list-item";
      const label = document.createElement("span"); label.textContent = `第 ${version.revision} 版 · ${version.saved_at} · ${statusNames[version.article.status] || version.article.status}`;
      const button = document.createElement("button"); button.type = "button"; button.className = "button secondary"; button.textContent = "载入对照";
      button.addEventListener("click", () => {
        if (!window.confirm(`载入第 ${version.revision} 版到编辑器？尚未保存的表单改动会被覆盖。`)) return;
        fill({ ...version.article, id:editingId, revision });
        status("save-status", `已载入第 ${version.revision} 版。保存后才会写入新版本。`);
      });
      row.append(label, button); list.append(row);
    }
  } catch (error) { status("save-status", error.message, true); }
}

$("login").addEventListener("click", async () => {
  token = $("token").value.trim();
  if (!token) return status("login-status", "请输入管理密钥。", true);
  $("login").disabled = true; status("login-status", "正在验证…");
  try {
    await api("/api/admin/auth");
    const results = await Promise.allSettled([refreshList(), refreshOverview(), refreshMedia(), refreshAds()]);
    $("token").value = "";
    $("login-panel").hidden = true;
    const failures = results.filter((result) => result.status === "rejected");
    $("preview-banner").hidden = failures.length === 0;
    if (failures.length) $("preview-banner").textContent = `已登录，但部分数据尚不可用：${failures.map((result) => result.reason?.message || "加载失败").join("；")}。请检查本地数据库配置。`;
    $("import").disabled = results[0].status !== "fulfilled";
    $("manual").disabled = results[0].status !== "fulfilled";
    $("ad-form").querySelector("button[type=submit]").disabled = results[3].status !== "fulfilled";
    if (results[1].status !== "fulfilled") $("setting-d1").textContent = "未连接或未升级";
    refreshResetHealth();
  }
  catch (error) { token = ""; status("login-status", error.message, true); }
  finally { $("login").disabled = false; }
});

$("manual").addEventListener("click", () => { fill({ source_url:$("import-url").value.trim(), format:"article", category:"opportunity", rights:"licensed", status:"draft" }); status("import-status", "已打开空白草稿；补全后请先保存。 "); });

$("import").addEventListener("click", async () => {
  const url = $("import-url").value.trim();
  if (!url) return status("import-status", "请先粘贴链接。", true);
  $("import").disabled = true; status("import-status", "正在提取并保存导入任务…");
  try {
    const result = await api("/api/admin/import", { method:"POST", body:JSON.stringify({ url }) });
    fill(result.draft);
    status("import-status", result.issues.length ? `已保存到“需协助”：${result.issues.join("；")}` : "已保存到“待审核”。请核对原文与素材后再确认发布。");
    await Promise.all([refreshList(), refreshOverview(), refreshMedia()]);
  } catch (error) {
    status("import-status", error.message, true);
    if (error.code === "duplicate_url" && error.articleId) await openArticle(error.articleId);
  } finally { $("import").disabled = false; }
});

for (const tab of $("status-tabs").querySelectorAll("button")) tab.addEventListener("click", () => {
  activeFilter = tab.dataset.filter;
  for (const other of $("status-tabs").querySelectorAll("button")) other.classList.toggle("active", other === tab);
  renderList();
});
for (const id of ["filter-query","filter-source","filter-format"]) $(id).addEventListener(id === "filter-query" ? "input" : "change", renderList);

async function uploadImage(asCover) {
  const file = $("upload-image").files?.[0];
  if (!file) return status("upload-status", "请先选择图片。", true);
  const payload = new FormData(); payload.append("image", file);
  $("upload-cover").disabled = $("upload-body").disabled = true;
  status("upload-status", "正在上传图片…");
  try {
    const result = await api("/api/admin/upload", { method:"POST", body:payload });
    if (asCover) field("cover_url").value = result.url;
    else { const body = field("body"); body.setRangeText(`\n\n![图片说明](${result.url})\n\n`, body.selectionStart, body.selectionEnd, "end"); }
    preview(); status("upload-status", "图片已上传；保存文章后生效。");
  } catch (error) { status("upload-status", error.message, true); }
  finally { $("upload-cover").disabled = $("upload-body").disabled = false; }
}
$("upload-cover").addEventListener("click", () => uploadImage(true));
$("upload-body").addEventListener("click", () => uploadImage(false));

$("ad-form").elements.namedItem("slot").addEventListener("change", fillAdSlot);
$("ad-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const ad = Object.fromEntries(new FormData(form));
  ad.slot = Number(ad.slot);
  ad.active = form.elements.namedItem("active").checked;
  for (const name of ["starts_at","ends_at"]) ad[name] = ad[name] ? new Date(ad[name]).toISOString().slice(0,16) : "";
  if (ad.active && !window.confirm(`确认启用广告位 ${ad.slot}，向访客展示“${ad.title}”并链接到 ${ad.target_url}？`)) return;
  const button = form.querySelector("button[type=submit]"); button.disabled = true;
  try { await api("/api/admin/ads", { method:"PUT", body:JSON.stringify(ad) }); await refreshAds(); status("ad-status", `广告位 ${ad.slot} 已保存；首页刷新后生效。`); }
  catch (error) { status("ad-status", error.message, true); }
  finally { button.disabled = false; }
});

form.addEventListener("input", preview);
form.addEventListener("change", preview);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const requestedStatus = event.submitter?.dataset.save || "draft";
  const article = Object.fromEntries(new FormData(form));
  article.status = requestedStatus;
  article.rights_confirmed = field("rights_confirmed").checked;
  article.original_body = originalBody;
  article.extraction_state = extractionState;
  article.extraction_note = extractionNote;
  if (requestedStatus === "published" && !window.confirm(`确认文章、全部素材及来源署名已核对，立即发布“${article.title || "未命名内容"}”？`)) return;
  if (requestedStatus === "archived" && !window.confirm("确认将此内容从公开页面下架？文章和历史版本仍保留，可再次审核发布。")) return;
  const button = event.submitter; button.disabled = true; status("save-status", "正在保存…");
  try {
    const result = await api("/api/admin/articles", { method:editingId ? "PUT" : "POST", body:JSON.stringify({ ...article, ...(editingId ? { id:editingId, revision } : {}) }) });
    editingId = result.id; revision = result.revision;
    status("save-status", `${statusNames[requestedStatus]}已保存。${requestedStatus === "published" ? "首页刷新后显示。" : ""}`);
    $("current-status").textContent = `当前：${statusNames[requestedStatus]} · 第 ${revision} 版`;
    $("archive-button").hidden = requestedStatus !== "published";
    await Promise.all([refreshList(), refreshOverview(), refreshMedia()]);
    await loadVersions();
  } catch (error) { status("save-status", error.message, true); }
  finally { button.disabled = false; }
});

const sectionLinks = [...document.querySelectorAll('.nav-link[href^="#"]')];
function syncNavigation() {
  const hash = window.location.hash || "#overview";
  for (const link of sectionLinks) {
    const selected = link.getAttribute("href") === hash;
    link.classList.toggle("active", selected);
    if (selected) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
}
window.addEventListener("hashchange", syncNavigation);
syncNavigation();

if (window.location.protocol === "file:") {
  for (const link of document.querySelectorAll('a[href="/"]')) link.href = "http://127.0.0.1:8788/";
  $("token").disabled = true;
  $("login").disabled = true;
  const link = document.createElement("a");
  link.href = "http://127.0.0.1:8788/admin";
  link.textContent = "打开本地后台登录 ↗";
  $("login-status").append("当前是文件预览，登录和真实数据请使用本地服务：", link);
}
