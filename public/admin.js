const $ = (id) => document.getElementById(id);
const form = $("article-form");
const categoryNames = { opportunity:"机会资讯", tutorial:"实操教程", tools:"工具观察", case:"创业案例", pitfall:"避坑经验" };
const statusNames = { draft:"草稿", needs_help:"需协助", review:"待审核", rejected:"未通过", published:"已发布", archived:"已下架", discarded:"已废弃" };
const sessionKey = "resets-ai-admin-token";
let token = "";
let editingId = "";
let revision = null;
let entries = [];
let contentPage = 1;
let contentTotal = 0;
let reviewFilter = "review";
let reviewPage = 1;
let reviewTotal = 0;
let reviewing = null;
let originalBody = "";
let extractionState = "manual";
let extractionNote = "";
let adRows = [];
let mediaEntries = [];
let operationsPage = 1;
let operationsTotal = 0;
let deleting = null;

document.body.append($("editor"));

function canCloseDialog(dialog) {
  if (dialog.id === "approve-dialog") return !$("approve-confirm").disabled;
  if (dialog.id === "delete-dialog") return !$("delete-confirm").disabled;
  return true;
}

for (const dialog of document.querySelectorAll("dialog")) {
  const content = dialog.querySelector(".dialog-content");
  if (!content) continue;
  const toolbar = document.createElement("div");
  toolbar.className = "dialog-toolbar";
  const close = document.createElement("button");
  close.className = "dialog-pin-close";
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "关闭弹窗");
  close.addEventListener("click", () => { if (canCloseDialog(dialog)) dialog.close(); });
  toolbar.append(close);
  content.prepend(toolbar);
  dialog.addEventListener("click", (event) => { if (event.target === dialog && canCloseDialog(dialog)) dialog.close(); });
  dialog.addEventListener("cancel", (event) => { if (!canCloseDialog(dialog)) event.preventDefault(); });
}

function status(id, message, error = false) {
  const node = $(id);
  node.textContent = message;
  node.classList.toggle("error", error);
}

function confirmAction({ badge, title, summary, detail, confirmText, tone = "publish" }) {
  const dialog = $("action-dialog");
  $("action-badge").textContent = badge;
  $("action-title").textContent = title;
  $("action-summary").textContent = summary;
  $("action-detail").textContent = detail;
  const confirm = $("action-confirm");
  confirm.textContent = confirmText;
  confirm.className = `button ${tone}`;
  return new Promise((resolve) => {
    let accepted = false;
    const close = () => dialog.close();
    const onConfirm = () => { accepted = true; close(); };
    const onClose = () => {
      confirm.removeEventListener("click", onConfirm);
      $("action-cancel").removeEventListener("click", close);
      resolve(accepted);
    };
    confirm.addEventListener("click", onConfirm);
    $("action-cancel").addEventListener("click", close);
    dialog.addEventListener("close", onClose, { once:true });
    dialog.showModal();
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers:{ authorization:`Bearer ${token}`, accept:"application/json", ...(options.body && !(options.body instanceof FormData) ? { "content-type":"application/json" } : {}) },
    cache:"no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      sessionStorage.removeItem(sessionKey);
      window.location.replace("/controller");
    }
    const labels = {
      unauthorized:"管理密钥无效或未配置", database_unconfigured:"尚未绑定 D1 数据库",
      duplicate_url:"这条链接已经收录，请从档案管理打开编辑", save_failed_or_duplicate_url:"保存失败：链接重复或数据库尚未升级",
      import_save_failed:"导入结果无法入库，请检查 v2 数据库迁移", articles_unavailable:"档案列表不可用，请检查 v2 数据库迁移",
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

function previewVideo(value, container) {
  container.replaceChildren();
  let url;
  try { url = new URL(value); } catch { return previewBody("视频地址待补全。", container); }
  let id = "";
  if (["youtube.com","www.youtube.com","m.youtube.com"].includes(url.hostname)) id = url.searchParams.get("v") || "";
  if (url.hostname === "youtu.be") id = url.pathname.slice(1);
  if (/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    const iframe = document.createElement("iframe"); iframe.src = `https://www.youtube-nocookie.com/embed/${id}`;
    iframe.title = "视频播放检查"; iframe.allowFullscreen = true; container.append(iframe);
  } else if (url.protocol === "https:" && /\.mp4$/i.test(url.pathname)) {
    const video = document.createElement("video"); video.src = url.href; video.controls = true; video.preload = "metadata"; container.append(video);
  } else previewBody("目前无法在本站播放该链接，请补充 YouTube 或 HTTPS MP4 地址。", container);
}

function previewBody(body, container) {
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
  let media = [];
  try { media = JSON.parse(article.media_manifest || "[]"); } catch { /* 旧草稿可能没有媒体清单。 */ }
  if (!Array.isArray(media)) media = [];
  const imageUrls = [...new Set(media.filter((item) => item.type === "cover" || item.type === "image").map((item) => item.url))];
  const savedImages = imageUrls.filter((url) => url.startsWith("/api/media/")).length;
  $("media-import-summary").textContent = !article.id ? "解析链接后，可获取的图片会自动保存到 R2。" :
    imageUrls.length ? `图片已存入 R2：${savedImages}/${imageUrls.length} 张。${savedImages < imageUrls.length ? "未入库的图片已保留原地址，请在发布前核对。" : ""}` :
    "来源页面未提取到可保存的图片。";
  $("editor-title").textContent = editingId ? `编辑档案 ${article.archive_code || ""}` : "新增档案";
  $("editor-mode").textContent = editingId ? "编辑档案" : "新增档案";
  $("current-status").textContent = `当前：${statusNames[article.status] || "未保存"}${revision ? ` · 第 ${revision} 版` : ""}`;
  $("article-form").hidden = false;
  $("editor-empty").hidden = true;
  window.location.hash = "content";
  preview();
  loadVersions();
  if (!$("editor").open) $("editor").showModal();
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
  $("check-content").textContent = data.rights === "licensed" ? (data.body ? "请与左侧原文核对" : "正文缺失") : data.rights === "embed" ? "视频内容" : "仅导读";
  $("check-credit").textContent = data.author && data.source_name ? "已填写，待确认" : "缺少作者或平台";
  $("check-playback").textContent = data.rights === "embed" ? (playable(data.video_url) ? "可站内播放，待检查" : "视频地址不可播放") : "不适用";
}

function renderList() {
  const list = $("article-list");
  list.replaceChildren();
  if (!entries.length) {
    const row = document.createElement("tr"); const cell = document.createElement("td");
    cell.colSpan = 8; cell.className = "empty"; cell.textContent = "当前筛选下没有档案。";
    row.append(cell); list.append(row);
  }
  for (const article of entries) {
    const row = document.createElement("tr");
    const cell = (value, className = "") => { const node = document.createElement("td"); node.textContent = value; node.className = className; row.append(node); return node; };
    cell(article.archive_code || "—", "id-cell");
    cell(article.card_title || article.title || article.source_url, "title-cell");
    cell(article.author || "待补");
    cell(article.format === "video" ? "视频" : "文章");
    const statusCell = cell("");
    const badge = document.createElement("span"); badge.className = `status ${article.status}`; badge.textContent = statusNames[article.status] || article.status;
    statusCell.append(badge);
    cell(article.created_at?.slice(0, 16) || "—");
    cell(String(article.clicks || 0));
    const actionCell = cell("");
    const actions = document.createElement("div"); actions.className = "list-actions";
    const view = document.createElement("button"); view.className = "button secondary"; view.type = "button"; view.textContent = "预览";
    view.addEventListener("click", () => openReviewPreview(article.id, false));
    const edit = document.createElement("button"); edit.className = "button secondary"; edit.type = "button"; edit.textContent = "编辑";
    edit.addEventListener("click", async () => { edit.disabled = true; try { await openArticle(article.id); } catch (error) { status("import-status", error.message, true); } finally { edit.disabled = false; } });
    const remove = document.createElement("button"); remove.className = "button danger"; remove.type = "button"; remove.textContent = "删除";
    remove.disabled = article.status === "discarded";
    remove.addEventListener("click", () => { deleting = article; $("delete-summary").textContent = `${article.archive_code || "档案"} · ${article.card_title || article.title}`; status("delete-status", ""); $("delete-dialog").showModal(); });
    if (article.status === "published") {
      const archive = document.createElement("button"); archive.className = "button secondary"; archive.type = "button"; archive.textContent = "下架";
      archive.addEventListener("click", async () => {
        if (!await confirmAction({ badge:"档案下架", title:"确认下架档案？", summary:`即将下架「${article.card_title || article.title}」。`, detail:"下架后读者无法继续访问；档案及历史版本仍会保留。", confirmText:"确认下架", tone:"danger" })) return;
        try { await api("/api/admin/review", { method:"POST", body:JSON.stringify({ id:article.id, revision:article.revision, action:"archive" }) }); await Promise.all([refreshList(), refreshReview(), refreshOverview()]); }
        catch (error) { status("import-status", error.message, true); }
      });
      actions.append(archive);
    }
    actions.append(view, edit, remove); actionCell.append(actions); list.append(row);
  }
  const size = Number($("page-size").value);
  $("page-info").textContent = `共 ${contentTotal} 条 · 第 ${contentPage}/${Math.max(1, Math.ceil(contentTotal / size))} 页`;
  $("page-prev").disabled = contentPage <= 1;
  $("page-next").disabled = contentPage * size >= contentTotal;
}

async function openArticle(id) {
  const data = await api(`/api/admin/item?id=${encodeURIComponent(id)}`);
  fill(data.article);
}

async function refreshList() {
  const params = new URLSearchParams({ page:String(contentPage), page_size:$("page-size").value, q:$("filter-query").value.trim(), format:$("filter-format").value, status:$("filter-status").value });
  const data = await api(`/api/admin/articles?${params}`);
  entries = data.articles || [];
  contentTotal = Number(data.total || 0);
  renderList();
}

async function refreshOverview() {
  const overview = await api("/api/admin/overview");
  $("metric-published").textContent = overview.counts.published || 0;
  $("metric-review").textContent = overview.counts.review || 0;
  $("metric-help").textContent = overview.counts.needs_help || 0;
  $("metric-reads").textContent = Number(overview.total_reads || 0).toLocaleString("zh-CN");
  $("metric-visits").textContent = overview.analytics?.ready ? Number(overview.analytics.total_visits).toLocaleString("zh-CN") : "待接入";
  drawChart("visits-chart", overview.analytics?.visits || [], "pageviews", overview.analytics?.ready);
  drawChart("reads-chart", overview.analytics?.reads || [], "clicks", overview.analytics?.ready);
  drawRanks("heat-list", overview.analytics?.heat || [], (item) => `${item.clicks} 次点击`);
  drawRanks("ctr-list", overview.analytics?.ctr || [], (item) => `${(100 * item.clicks / item.impressions).toFixed(1)}% · ${item.impressions} 次曝光`);
  setHealth("d1", true, "正常");
  setHealth("r2", overview.integrations.r2, overview.integrations.r2 ? "已绑定" : "未绑定");
  setHealth("ai", overview.integrations.ai, overview.integrations.ai ? "已配置" : "未配置（可选）");
}

function setHealth(name, ok, label) {
  $("setting-" + name).textContent = label;
  const item = $("health-" + name);
  item.classList.toggle("ok", ok);
  item.classList.toggle("bad", !ok);
}

function drawChart(id, points, key, ready) {
  const container = $(id); container.replaceChildren();
  if (!ready) { container.textContent = "统计表尚未启用，请先运行数据库迁移。"; return; }
  const values = new Map(points.map((item) => [item.day, Number(item[key] || 0)]));
  const today = new Date();
  const days = Array.from({ length:30 }, (_, offset) => {
    const day = new Date(today.getTime() - (29 - offset) * 86400000).toISOString().slice(0, 10);
    return { day, value:values.get(day) || 0 };
  });
  const max = Math.max(1, ...days.map((item) => item.value));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (const item of days) {
    const bar = document.createElement("button"); bar.type = "button"; bar.className = `chart-bar${key === "clicks" ? " read" : ""}`;
    bar.style.height = `${Math.max(2, item.value / max * 100)}%`;
    bar.dataset.label = `${item.day} · ${item.value} 次`;
    bar.setAttribute("aria-label", bar.dataset.label);
    if (!reduceMotion) {
      bar.addEventListener("pointermove", (event) => {
        const rect = bar.getBoundingClientRect();
        const offset = (event.clientX - rect.left) / rect.width - .5;
        bar.style.setProperty("--tilt", `${(offset * 15).toFixed(1)}deg`);
        bar.style.setProperty("--shift", `${(offset * 5).toFixed(1)}px`);
      });
      bar.addEventListener("pointerleave", () => { bar.style.removeProperty("--tilt"); bar.style.removeProperty("--shift"); });
    }
    container.append(bar);
  }
}

function drawRanks(id, items, valueText) {
  const container = $(id); container.replaceChildren();
  if (!items.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "暂无足够数据。"; container.append(empty); return; }
  const max = Math.max(1, ...items.map((item) => Number(item.clicks || 0)));
  for (const [index, item] of items.entries()) {
    const row = document.createElement("div"); row.className = "rank-row";
    const label = document.createElement("div"); label.textContent = `${index + 1}. ${item.card_title || item.title}`;
    const small = document.createElement("small"); small.textContent = ` · 热力 ${Math.round(Number(item.clicks || 0) / max * 100)}`;
    if (id === "heat-list") label.append(small);
    const value = document.createElement("b"); value.textContent = valueText(item);
    row.append(label, value); container.append(row);
  }
}

async function refreshMedia() {
  const data = await api("/api/admin/media");
  mediaEntries = data.media || [];
  renderMedia();
}

function renderMedia() {
  const list = $("media-list"); list.replaceChildren();
  const type = $("media-type").value;
  const storage = $("media-storage").value;
  const query = $("media-query").value.trim().toLocaleLowerCase();
  const rows = mediaEntries.filter((item) => (!type || item.type === type) && (!storage || item.storage === storage) &&
    (!query || [item.archive_code, item.article_title, item.url].join(" ").toLocaleLowerCase().includes(query)));
  for (const item of rows) {
    const row = document.createElement("tr");
    const add = (value, className = "") => { const cell = document.createElement("td"); cell.textContent = value; cell.className = className; row.append(cell); return cell; };
    const preview = add("");
    if (item.type === "video") preview.textContent = "▶";
    else { const img = document.createElement("img"); img.src = item.url; img.alt = ""; img.loading = "lazy"; img.className = "media-thumb"; preview.append(img); }
    add(item.type === "cover" ? "封面" : item.type === "video" ? "视频" : "正文图片");
    add(item.archive_code || "—", "id-cell");
    add(item.article_title || "未命名档案", "title-cell");
    add(item.storage);
    const address = add("");
    const link = document.createElement("a"); link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.className = "media-link"; link.textContent = item.url;
    address.append(link); list.append(row);
  }
  if (!rows.length) { const row = document.createElement("tr"); const cell = document.createElement("td"); cell.colSpan = 6; cell.textContent = "没有匹配的素材。"; cell.className = "empty"; row.append(cell); list.append(row); }
  $("media-count").textContent = `共 ${rows.length} 个素材 · R2 ${rows.filter((item) => item.storage === "R2").length} 个`;
}

async function refreshOperations() {
  const params = new URLSearchParams({ q:$("operations-query").value.trim(), page:String(operationsPage) });
  const data = await api(`/api/admin/operations?${params}`);
  operationsTotal = Number(data.total || 0);
  const list = $("operations-list"); list.replaceChildren();
  for (const item of data.rows || []) {
    const row = document.createElement("tr");
    const add = (value, className = "") => { const cell = document.createElement("td"); cell.textContent = value; cell.className = className; row.append(cell); return cell; };
    add(item.archive_code || "—", "id-cell"); add(item.card_title || item.title || "未命名档案", "title-cell");
    add(statusNames[item.status] || item.status); add(item.created_at || "—");
    add(`${Math.max(0, Number(item.retained_days) || 0)} 天`); add(String(item.clicks || 0));
    const action = add(""); const button = document.createElement("button"); button.className = "button secondary"; button.type = "button"; button.textContent = "查看详情";
    button.addEventListener("click", () => openOperationsDetail(item.id)); action.append(button); list.append(row);
  }
  if (!data.rows?.length) { const row = document.createElement("tr"); const cell = document.createElement("td"); cell.colSpan = 7; cell.className = "empty"; cell.textContent = "没有匹配的档案。"; row.append(cell); list.append(row); }
  $("operations-page-info").textContent = `共 ${operationsTotal} 条 · 第 ${operationsPage}/${Math.max(1, Math.ceil(operationsTotal / 20))} 页`;
  $("operations-prev").disabled = operationsPage <= 1;
  $("operations-next").disabled = operationsPage * 20 >= operationsTotal;
}

async function openOperationsDetail(id) {
  try {
    const data = await api(`/api/admin/operations?id=${encodeURIComponent(id)}`);
    const list = $("operations-detail"); list.replaceChildren();
    const line = (label, value) => { const item = document.createElement("div"); item.className = "media-file"; const title = document.createElement("strong"); title.textContent = `${label}：`; const text = document.createElement("span"); text.textContent = value || "—"; item.append(title, text); list.append(item); };
    const item = data.article;
    for (const [label, value] of [["档案 ID",item.archive_code],["档案名称",item.card_title || item.title],["状态",statusNames[item.status]],["生成时间",item.created_at],["留存时间",`${Math.max(0, Number(item.retained_days) || 0)} 天`],["累计阅读",String(item.clicks || 0)],["来源链接",item.source_url]]) line(label, value);
    for (const event of data.reviews) line("审核记录",`${event.created_at} · ${event.action} · ${event.note || "无备注"}`);
    for (const event of data.imports) line("导入记录",`${event.created_at} · ${event.adapter} · ${event.note || "无备注"}`);
    $("operations-dialog").showModal();
  } catch (error) { status("operations-status", error.message, true); }
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
  if (!$("ad-editor").open) $("ad-editor").showModal();
  $("ad-editor-title").textContent = `${ad.slot ? "查看 / 编辑" : "创建"}广告位 ${slot}`;
  for (const button of document.querySelectorAll(".ad-spot")) button.classList.toggle("selected", Number(button.dataset.slot) === slot);
  status("ad-status", ad.slot ? `已载入广告位 ${slot}。` : `广告位 ${slot} 尚未配置。`);
}

async function refreshAds() {
  adRows = (await api("/api/admin/ads")).ads || [];
  const now = new Date().toISOString().slice(0, 16);
  for (const button of document.querySelectorAll(".ad-spot")) {
    const ad = adRows.find((item) => item.slot === Number(button.dataset.slot));
    const live = ad?.active && (!ad.starts_at || ad.starts_at <= now) && (!ad.ends_at || ad.ends_at > now);
    button.querySelector("small").textContent = ad ? `${ad.title || "未命名"} · ${live ? "展示中" : ad.active ? "待展示或已到期" : "未启用"}` : "未配置 · 点击创建";
  }
  if ($("ad-editor").open) fillAdSlot();
}

async function refreshResetHealth() {
  try {
    const response = await fetch("/api/resets", { cache:"no-store" });
    const data = await response.json();
    const ok = response.ok && Array.isArray(data.events);
    setHealth("resets", ok, ok ? `可用 · ${data.events.length} 条公告` : "暂不可用");
  } catch { setHealth("resets", false, "暂不可用"); }
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
      button.addEventListener("click", async () => {
        if (!await confirmAction({ badge:"历史版本", title:`载入第 ${version.revision} 版？`, summary:"将该版本的内容载入当前编辑器。", detail:"尚未保存的表单改动会被覆盖；只有再次点击保存才会写入新版本。", confirmText:"确认载入" })) return;
        fill({ ...version.article, id:editingId, revision });
        status("save-status", `已载入第 ${version.revision} 版。保存后才会写入新版本。`);
      });
      row.append(label, button); list.append(row);
    }
  } catch (error) { status("save-status", error.message, true); }
}

async function refreshReview() {
  const params = new URLSearchParams({ status:reviewFilter, page:String(reviewPage), page_size:"20" });
  const data = await api(`/api/admin/articles?${params}`);
  reviewTotal = Number(data.total || 0);
  const list = $("review-list"); list.replaceChildren();
  if (!data.articles.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "当前没有需要处理的档案。"; list.append(empty); }
  for (const article of data.articles) {
    const row = document.createElement("div"); row.className = "list-item review-card";
    const info = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = `${article.archive_code || "档案"} · ${article.card_title || article.title || article.source_url}`;
    const details = document.createElement("small"); details.textContent = `${article.source_name || "来源待补"} · ${article.author || "作者待补"} · ${statusNames[article.status]} · ${article.updated_at || ""}`;
    info.append(title, details);
    const actions = document.createElement("div"); actions.className = "list-actions";
    const view = document.createElement("button"); view.className = "button secondary"; view.type = "button"; view.textContent = "预览阅读效果";
    view.addEventListener("click", () => openReviewPreview(article.id, article.status === "review"));
    const edit = document.createElement("button"); edit.className = "button secondary"; edit.type = "button"; edit.textContent = "编辑档案";
    edit.addEventListener("click", () => openArticle(article.id).catch((error) => status("review-status", error.message, true)));
    actions.append(view, edit); row.append(info, actions); list.append(row);
  }
  $("review-page-info").textContent = `共 ${reviewTotal} 条 · 第 ${reviewPage}/${Math.max(1, Math.ceil(reviewTotal / 20))} 页`;
  $("review-prev").disabled = reviewPage <= 1;
  $("review-next").disabled = reviewPage * 20 >= reviewTotal;
}

async function openReviewPreview(id, canReview) {
  try {
    const { article } = await api(`/api/admin/item?id=${encodeURIComponent(id)}`);
    reviewing = canReview ? article : null;
    $("review-kicker").textContent = `${categoryNames[article.category] || "AI 资讯"} · ${article.source_name || "来源待补"}`;
    $("review-card-title").textContent = article.card_title || article.title;
    $("review-summary").textContent = article.summary;
    $("review-card-meta").textContent = [article.author, article.published_at].filter(Boolean).join(" · ");
    $("review-title").textContent = article.title;
    $("review-detail-summary").textContent = article.summary;
    $("review-credit").textContent = `信息来源：${article.author}（${article.source_name}） · ${article.source_url}`;
    const cover = $("review-cover"); cover.hidden = !mediaUrl(article.cover_url);
    if (!cover.hidden) cover.src = article.cover_url;
    const cardCover = $("review-card-cover"); cardCover.hidden = cover.hidden;
    if (!cardCover.hidden) cardCover.src = article.cover_url;
    $("review-source").href = article.source_url;
    if (article.rights === "licensed") previewBody(article.body, $("review-body"));
    else if (article.rights === "embed") previewVideo(article.video_url, $("review-body"));
    else previewBody("本站目前仅收录这篇内容的导读，全文请查看原始来源。", $("review-body"));
    $("review-actions").hidden = !canReview;
    $("reject-box").hidden = true;
    status("review-dialog-status", "");
    $("review-dialog").showModal();
  } catch (error) { status("review-status", error.message, true); }
}

async function submitReview(action, note = "") {
  if (!reviewing) return;
  const article = reviewing;
  const button = action === "approve" ? $("approve-confirm") : $("reject-confirm");
  button.disabled = true;
  try {
    await api("/api/admin/review", { method:"POST", body:JSON.stringify({ id:article.id, revision:article.revision, action, note }) });
    if ($("approve-dialog").open) $("approve-dialog").close();
    $("review-dialog").close(); reviewing = null;
    status("review-status", action === "approve" ? "审核通过，档案已发布。" : "已拒绝，档案进入未通过列表。");
    await Promise.all([refreshReview(), refreshList(), refreshOverview(), refreshOperations()]);
  } catch (error) { status(action === "approve" ? "approve-status" : "review-dialog-status", error.message, true); }
  finally { button.disabled = false; }
}

async function openWorkspace() {
  if (window.location.protocol === "file:") { document.body.textContent = "请通过本地服务打开 /controller 页面。"; return; }
  token = sessionStorage.getItem(sessionKey) || "";
  if (!token) { window.location.replace("/controller"); return; }
  try {
    await api("/api/admin/auth");
    const results = await Promise.allSettled([refreshList(), refreshReview(), refreshOverview(), refreshMedia(), refreshOperations(), refreshAds()]);
    $("workspace").hidden = false;
    const failures = results.filter((result) => result.status === "rejected");
    $("preview-banner").hidden = failures.length === 0;
    if (failures.length) $("preview-banner").textContent = `部分数据暂不可用：${[...new Set(failures.map((result) => result.reason?.message || "加载失败"))].join("；")}。`;
    $("import").disabled = results[0].status !== "fulfilled";
    $("ad-form").querySelector("button[type=submit]").disabled = results[5].status !== "fulfilled";
    if (results[2].status !== "fulfilled") setHealth("d1", false, "未连接或未升级");
    refreshResetHealth();
    syncNavigation();
  } catch { sessionStorage.removeItem(sessionKey); window.location.replace("/controller"); }
}

$("logout").addEventListener("click", () => { sessionStorage.removeItem(sessionKey); token = ""; window.location.replace("/controller"); });
$("new-content").addEventListener("click", () => { $("new-choices").hidden = false; $("import-panel").hidden = true; $("new-dialog").showModal(); });
$("new-close").addEventListener("click", () => $("new-dialog").close());
$("choose-link").addEventListener("click", () => { $("import-panel").hidden = false; $("new-choices").hidden = true; $("import-url").focus(); });
$("manual").addEventListener("click", () => { $("new-dialog").close(); fill({ format:"article", category:"opportunity", rights:"licensed", status:"draft" }); status("save-status", "已打开空白录入表单。填写后保存并提交审核。"); });
$("close-editor").addEventListener("click", () => $("editor").close());

$("import").addEventListener("click", async () => {
  const url = $("import-url").value.trim();
  if (!url) return status("new-status", "请先粘贴链接。", true);
  $("import").disabled = true; status("new-status", "正在提取原文并将可获取的图片保存到 R2…");
  try {
    const result = await api("/api/admin/import", { method:"POST", body:JSON.stringify({ url }) });
    $("new-dialog").close();
    fill(result.draft);
    const mediaStatus = result.media?.total ? `图片已自动存入 R2：${result.media.saved}/${result.media.total} 张。` : "来源页面未提取到图片。";
    status("save-status", result.issues.length ? `${mediaStatus}已保存到“需协助”：${result.issues.join("；")}` : `${mediaStatus}已保存到“待审核”。请核对原文与素材。`);
    await Promise.all([refreshList(), refreshReview(), refreshOverview(), refreshMedia(), refreshOperations()]);
  } catch (error) {
    status("new-status", error.message, true);
    if (error.code === "duplicate_url" && error.articleId) { $("new-dialog").close(); await openArticle(error.articleId); }
  } finally { $("import").disabled = false; }
});

let searchTimer;
for (const id of ["filter-query","filter-format","filter-status","page-size"]) $(id).addEventListener(id === "filter-query" ? "input" : "change", () => {
  contentPage = 1;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => refreshList().catch((error) => status("import-status", error.message, true)), id === "filter-query" ? 250 : 0);
});
$("page-prev").addEventListener("click", () => { if (contentPage > 1) { contentPage--; refreshList(); } });
$("page-next").addEventListener("click", () => { if (contentPage * Number($("page-size").value) < contentTotal) { contentPage++; refreshList(); } });
$("delete-cancel").addEventListener("click", () => $("delete-dialog").close());
$("delete-confirm").addEventListener("click", async () => {
  if (!deleting) return;
  const button = $("delete-confirm"); button.disabled = true;
  try {
    await api("/api/admin/articles", { method:"DELETE", body:JSON.stringify({ id:deleting.id, revision:deleting.revision }) });
    $("delete-dialog").close(); deleting = null;
    await Promise.all([refreshList(), refreshReview(), refreshOverview(), refreshOperations()]);
  } catch (error) { status("delete-status", error.message, true); }
  finally { button.disabled = false; }
});
for (const id of ["media-query","media-type","media-storage"]) $(id).addEventListener(id === "media-query" ? "input" : "change", renderMedia);
let operationsTimer;
$("operations-query").addEventListener("input", () => { operationsPage = 1; clearTimeout(operationsTimer); operationsTimer = setTimeout(() => refreshOperations().catch((error) => status("operations-status", error.message, true)), 250); });
$("operations-prev").addEventListener("click", () => { if (operationsPage > 1) { operationsPage--; refreshOperations(); } });
$("operations-next").addEventListener("click", () => { if (operationsPage * 20 < operationsTotal) { operationsPage++; refreshOperations(); } });
$("operations-close").addEventListener("click", () => $("operations-dialog").close());
for (const tab of document.querySelectorAll("[data-review-filter]")) tab.addEventListener("click", () => {
  reviewFilter = tab.dataset.reviewFilter; reviewPage = 1;
  for (const other of document.querySelectorAll("[data-review-filter]")) other.classList.toggle("active", other === tab);
  refreshReview();
});
$("review-prev").addEventListener("click", () => { if (reviewPage > 1) { reviewPage--; refreshReview(); } });
$("review-next").addEventListener("click", () => { if (reviewPage * 20 < reviewTotal) { reviewPage++; refreshReview(); } });
$("review-close").addEventListener("click", () => $("review-dialog").close());
$("review-approve").addEventListener("click", () => {
  if (!reviewing) return;
  $("approve-summary").textContent = `即将发布「${reviewing.card_title || reviewing.title}」。`;
  status("approve-status", "");
  $("approve-dialog").showModal();
});
$("approve-cancel").addEventListener("click", () => { if (!$("approve-confirm").disabled) $("approve-dialog").close(); });
$("approve-confirm").addEventListener("click", () => submitReview("approve"));
$("review-reject").addEventListener("click", () => { $("reject-box").hidden = false; $("reject-reason").focus(); });
$("reject-confirm").addEventListener("click", () => { const note = $("reject-reason").value.trim(); if (!note) return status("review-dialog-status", "请填写拒绝原因。", true); submitReview("reject", note); });

for (const button of document.querySelectorAll(".ad-spot")) button.addEventListener("click", () => {
  $("ad-form").elements.namedItem("slot").value = button.dataset.slot;
  fillAdSlot();
});
$("ad-close").addEventListener("click", () => $("ad-editor").close());
$("ad-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const adForm = event.currentTarget;
  const ad = Object.fromEntries(new FormData(adForm));
  ad.slot = Number(ad.slot); ad.active = adForm.elements.namedItem("active").checked;
  for (const name of ["starts_at","ends_at"]) ad[name] = ad[name] ? new Date(ad[name]).toISOString().slice(0,16) : "";
  if (ad.active && !await confirmAction({ badge:"广告启用", title:`确认启用广告位 ${ad.slot}？`, summary:`将向访客展示「${ad.title}」。`, detail:`推广链接：${ad.target_url}`, confirmText:"确认启用" })) return;
  const button = adForm.querySelector("button[type=submit]"); button.disabled = true;
  try { await api("/api/admin/ads", { method:"PUT", body:JSON.stringify(ad) }); await refreshAds(); status("ad-status", `广告位 ${ad.slot} 已保存；首页刷新后生效。`); }
  catch (error) { status("ad-status", error.message, true); }
  finally { button.disabled = false; }
});

form.addEventListener("input", preview);
form.addEventListener("change", preview);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const requestedStatus = event.submitter?.dataset.save || "review";
  const article = Object.fromEntries(new FormData(form));
  article.status = requestedStatus;
  article.rights_confirmed = field("rights_confirmed").checked;
  article.original_body = originalBody;
  article.extraction_state = extractionState;
  article.extraction_note = extractionNote;
  const button = event.submitter; button.disabled = true; status("save-status", "正在保存…");
  try {
    const result = await api("/api/admin/articles", { method:editingId ? "PUT" : "POST", body:JSON.stringify({ ...article, ...(editingId ? { id:editingId, revision } : {}) }) });
    editingId = result.id; revision = result.revision;
    status("save-status", `${statusNames[requestedStatus]}已保存。${requestedStatus === "review" ? "请到审核管理预览并审核。" : ""}`);
    $("current-status").textContent = `当前：${statusNames[requestedStatus]} · 第 ${revision} 版`;
    await Promise.all([refreshList(), refreshReview(), refreshOverview(), refreshMedia(), refreshOperations()]);
    await loadVersions();
  } catch (error) { status("save-status", error.message, true); }
  finally { button.disabled = false; }
});

const sectionLinks = [...document.querySelectorAll('.nav-link[href^="#"]')];
const views = [...document.querySelectorAll('.view')];
const pageDescriptions = { dashboard:"档案与访问数据概览", content:"搜索、创建和编辑全部档案", review:"预览后人工审核档案", "media-panel":"搜索各档案引用的媒体", operations:"档案留存与处理记录", "ads-panel":"四个固定广告位" };
function syncNavigation() {
  let name = (window.location.hash || "#dashboard").slice(1);
  if (name === "editor") name = "content";
  if (!pageDescriptions[name]) name = "dashboard";
  for (const view of views) view.hidden = view.id !== name;
  for (const link of sectionLinks) {
    const selected = link.getAttribute("href") === `#${name}`;
    link.classList.toggle("active", selected);
    if (selected) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  }
  $("page-title").textContent = sectionLinks.find((link) => link.getAttribute("href") === `#${name}`)?.textContent.trim() || "驾驶舱";
  $("page-description").textContent = pageDescriptions[name];
  $("dashboard-actions").hidden = name !== "dashboard";
}
window.addEventListener("hashchange", syncNavigation);
syncNavigation();
openWorkspace();
