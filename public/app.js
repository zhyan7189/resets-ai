import { historyCalendar, normalizeEvents, readableEventText, relativeLabel, tooltipDetails } from "./model.js";

const articles = [
  { id:"stripe-ai-pricing", category:"tutorial", label:"实操教程 · Stripe", title:"AI 产品怎样定价，才不会越用越亏？", summary:"比较订阅、按量和混合收费，先对齐用户价值与模型成本。", source:"Stripe · 2026-04-19", url:"https://stripe.com/resources/more/ai-pricing-models", style:"" },
  { id:"xilo-codex-editing", category:"tutorial", label:"实操教程 · X / xilo", title:"Codex剪辑第三弹：2条视频接下近四位数商单，知识类视频剪辑方法全公开【万字长文】", cardTitle:"Codex 剪辑第三弹：2 条视频接下近四位数商单", summary:"从 A-roll、B-roll、配音对齐到视觉编排，拆解如何用 Codex 做知识类视频并获得商单机会。", source:"xilo · 2026-08-22", url:"https://x.com/xilo2991/status/2091071218963411453", style:"rose", articleType:"source", authorId:"@xilo2991", contentUrl:"/data/xilo-article.json", featured:true },
  { id:"cloudflare-workers-ai", category:"tools", label:"工具观察 · Cloudflare", title:"用 Workers AI 做出第一个可运行应用", summary:"官方入门文档覆盖模型调用与部署，适合验证小型产品。", source:"Cloudflare · 2026-04-21", url:"https://developers.cloudflare.com/workers-ai/get-started/", style:"mint" },
  { id:"zapier-ai-automation", category:"tutorial", label:"实操教程 · Zapier", title:"用 AI 自动化交付重复的业务流程", summary:"从流程拆分与工具连接入手，观察服务型产品的交付方式。", source:"Zapier · 2026-04-01", url:"https://zapier.com/blog/ai-for-business-automation/", style:"" },
];

const $ = (id) => document.getElementById(id);
function readReminderPreference() {
  try {
    return localStorage.getItem("resets-ai-reminders") === "enabled";
  } catch {
    return false;
  }
}

let reminderEnabled = readReminderPreference();
let activeTooltip = null;
let pleaState = { cycleId:"", count:null, localCount:0 };
let popularArticle = null;
let localArticleClicks = readLocalArticleClicks();

function readLocalArticleClicks() {
  try {
    const value = JSON.parse(localStorage.getItem("resets-ai-article-clicks") || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function saveLocalArticleClicks() {
  try {
    localStorage.setItem("resets-ai-article-clicks", JSON.stringify(localArticleClicks));
  } catch {
    // 本地统计不可用时，仍会尝试写入服务端。
  }
}

function recordArticleClick(article) {
  if (!article?.id) return;
  localArticleClicks[article.id] = Number(localArticleClicks[article.id] || 0) + 1;
  saveLocalArticleClicks();
  fetch("/api/articles/click", {
    method:"POST",
    headers:{ "content-type":"application/json", accept:"application/json" },
    body:JSON.stringify({ article_id:article.id }),
    keepalive:true,
  }).catch(() => {});
}

function localPopularArticle() {
  return articles
    .map((article) => ({ article, clicks:Number(localArticleClicks[article.id] || 0) }))
    .sort((a, b) => b.clicks - a.clicks || Number(Boolean(b.article.featured)) - Number(Boolean(a.article.featured)))[0];
}

function renderPopularArticle(article, clicks = 0) {
  const card = $("popular-article");
  if (!card || !article) return;
  popularArticle = article;
  card.href = article.url;
  card.target = article.articleType === "source" ? "_self" : "_blank";
  card.rel = "noopener noreferrer";
  card.setAttribute("aria-label", `热度榜首：${article.title}`);
  $("popular-label").textContent = `热度榜首 · ${article.label}`;
  $("popular-title").textContent = article.cardTitle || article.title;
  $("popular-summary").textContent = article.summary;
  $("popular-source").textContent = `${article.source} · ${new Intl.NumberFormat("zh-CN").format(clicks)} 次点击`;
  $("popular-art").textContent = "热度 #1";
}

async function loadPopularArticle() {
  const local = localPopularArticle();
  try {
    const response = await fetch("/api/articles/popular", { headers:{ accept:"application/json" }, cache:"no-store" });
    if (!response.ok) throw new Error("热度接口暂不可用");
    const data = await response.json();
    const serverArticle = articles.find((article) => article.id === data.article_id);
    const article = serverArticle || local.article;
    const clicks = Math.max(Number(data.clicks || 0), Number(localArticleClicks[article.id] || 0));
    renderPopularArticle(article, clicks);
  } catch {
    renderPopularArticle(local.article, local.clicks);
  }
}

function writeReminderPreference(enabled) {
  try {
    localStorage.setItem("resets-ai-reminders", enabled ? "enabled" : "disabled");
  } catch {
    // The in-memory toggle still works when storage is unavailable.
  }
}

function syncReminderButton() {
  const button = $("notify-button");
  button.textContent = reminderEnabled ? "✓ 浏览器提醒已开启" : "♧ 开启浏览器提醒";
  button.setAttribute("aria-pressed", String(reminderEnabled));
}

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function formatUtc(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone:"UTC", year:"numeric", month:"long", day:"numeric",
    hour:"2-digit", minute:"2-digit", hourCycle:"h23",
  }).format(new Date(value)) + " UTC";
}

function renderLatest(event) {
  $("reset-relative").textContent = relativeLabel(event.announced_at);
  $("reset-date").textContent = formatUtc(event.announced_at);
  $("reset-quote").textContent = "“" + readableEventText(event) + "”";
  $("source-link").href = httpsUrl(event.tweet_url) || "https://codex-resets.com/";
  updatePleaMode(event.announced_at);
}

function updatePleaMode(resetAt) {
  const plea = $("reset-plea");
  const button = $("reset-plea-button");
  const label = $("reset-plea-label");
  const timestamp = Date.parse(resetAt || "");
  const thanks = Number.isFinite(timestamp) && timestamp <= Date.now() && timestamp + 86_400_000 > Date.now();
  plea.dataset.mode = thanks ? "thanks" : "beg";
  label.textContent = "快重置";
  const accessibleLabel = thanks ? "感谢这次重置" : "快重置";
  button.setAttribute("aria-label", accessibleLabel);
  button.title = accessibleLabel;
}

function formatPleaCount(value) {
  return value === null ? "—" : new Intl.NumberFormat("zh-CN").format(value);
}

function renderPleaCount(animate = true) {
  const count = pleaState.count === null ? null : pleaState.count + pleaState.localCount;
  const node = $("reset-plea-count");
  const sizer = $("reset-plea-count-sizer");
  const formatted = formatPleaCount(count);
  if (animate && node.textContent !== formatted) {
    node.replaceChildren(...Array.from(formatted).map((character) => {
      const digit = document.createElement("span");
      digit.className = "t-digit is-changing";
      digit.textContent = character;
      return digit;
    }));
  } else {
    node.textContent = formatted;
  }
  sizer.textContent = formatted === "—" ? "1,201,923" : formatted;
  node.setAttribute("aria-label", count === null ? "互动次数暂不可用" : `${formatted} 次互动`);
}

function readLocalPleaCount(cycleId) {
  try {
    const saved = JSON.parse(localStorage.getItem("resets-ai-plea") || "null");
    return saved?.cycle_id === cycleId && Number.isSafeInteger(saved.local_count) ? saved.local_count : 0;
  } catch {
    return 0;
  }
}

function saveLocalPleaCount() {
  try {
    localStorage.setItem("resets-ai-plea", JSON.stringify({ cycle_id:pleaState.cycleId, local_count:pleaState.localCount }));
  } catch {
    // 隐私模式下 localStorage 可能不可用，视觉反馈仍然保留。
  }
}

async function loadPleaCount() {
  try {
    const response = await fetch("/api/reset-requests", { headers:{ accept:"application/json" }, cache:"no-store" });
    if (!response.ok) throw new Error("求重置互动数据暂不可用");
    const data = await response.json();
    if (!data || typeof data.cycle_id !== "string" || !Number.isSafeInteger(data.count) || data.count < 0) throw new Error("求重置互动数据格式异常");
    if (pleaState.cycleId !== data.cycle_id) {
      pleaState = { cycleId:data.cycle_id, count:data.count, localCount:readLocalPleaCount(data.cycle_id) };
    } else {
      pleaState.count = data.count;
    }
    renderPleaCount(false);
  } catch {
    renderPleaCount(false);
  }
}

function addPleaBurst() {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
  const bursts = $("reset-plea-bursts");
  const choices = ["+1", "🙏", "快重置", "🔄", "avatar", "avatar"];
  const choice = choices[Math.floor(Math.random() * choices.length)];
  const burst = document.createElement("span");
  burst.className = "reset-plea-burst";
  const isAvatar = choice === "avatar";
  if (isAvatar) {
    burst.classList.add("reset-plea-burst--avatar");
    const avatar = document.createElement("img");
    avatar.className = "reset-plea-burst-avatar";
    avatar.src = "/thsottiaux-avatar.jpg";
    avatar.alt = "";
    avatar.decoding = "async";
    burst.append(avatar);
  } else {
    burst.textContent = choice;
  }
  burst.style.setProperty("--burst-x", `${Math.round(Math.random() * 64 - 48)}px`);
  burst.style.setProperty("--burst-y", `${-58 - Math.round(Math.random() * 42)}px`);
  burst.style.setProperty("--burst-rotate", `${Math.round(Math.random() * 28 - 14)}deg`);
  burst.style.setProperty("--burst-size", `${isAvatar ? 38 + Math.round(Math.random() * 4) : 18 + Math.round(Math.random() * 6)}px`);
  bursts.append(burst);
  while (bursts.childElementCount > 12) bursts.firstElementChild?.remove();
  burst.addEventListener("animationend", () => burst.remove(), { once:true });
}

function pleadForReset() {
  const button = $("reset-plea-button");
  const scene = $("workbench-scene");
  if (navigator.vibrate) navigator.vibrate(14);
  button.classList.remove("is-pleading");
  void button.offsetHeight;
  button.classList.add("is-pleading");
  window.setTimeout(() => button.classList.remove("is-pleading"), 280);
  scene.classList.remove("is-pinched");
  void scene.offsetHeight;
  scene.classList.add("is-pinched");
  window.setTimeout(() => scene.classList.remove("is-pinched"), 650);
  addPleaBurst();
  if (pleaState.count !== null) {
    pleaState.localCount += 1;
    renderPleaCount(true);
    saveLocalPleaCount();
  }
}

function hideCellTooltip() {
  activeTooltip?.remove();
  activeTooltip = null;
}

function positionCellTooltip(cell, tooltip) {
  const rect = cell.getBoundingClientRect();
  const margin = 14;
  const gap = 13;
  tooltip.style.left = `${rect.left + rect.width / 2}px`;
  tooltip.style.top = "0px";
  const box = tooltip.getBoundingClientRect();
  const center = Math.min(
    Math.max(rect.left + rect.width / 2, box.width / 2 + margin),
    window.innerWidth - box.width / 2 - margin,
  );
  let top = rect.top - box.height - gap;
  const below = top < margin;
  if (below) top = rect.bottom + gap;
  if (top + box.height > window.innerHeight - margin) {
    top = Math.max(margin, window.innerHeight - box.height - margin);
  }
  tooltip.classList.toggle("below", below);
  tooltip.style.left = `${center}px`;
  tooltip.style.top = `${top}px`;
}

function showCellTooltip(cell, day, eventsByDay) {
  hideCellTooltip();
  const details = tooltipDetails(day.date, eventsByDay.get(day.date) || []);
  const tooltip = document.createElement("div");
  tooltip.className = "cell-tooltip";
  tooltip.setAttribute("role", "tooltip");
  const date = document.createElement("div");
  date.className = "cell-tooltip-date";
  const utc = document.createElement("span");
  utc.textContent = "（UTC）";
  date.append(document.createTextNode(details.dateLabel + " "), utc);
  tooltip.append(date);
  for (const item of details.items) {
    const block = document.createElement("div");
    block.className = "cell-tooltip-item";
    if (item.label) {
      const label = document.createElement("div");
      label.className = "cell-tooltip-kind";
      label.textContent = item.label;
      block.append(label);
    }
    const copy = document.createElement("div");
    copy.className = "cell-tooltip-copy";
    copy.textContent = item.text;
    block.append(copy);
    tooltip.append(block);
  }
  document.body.append(tooltip);
  activeTooltip = tooltip;
  positionCellTooltip(cell, tooltip);
}

function renderHistory(events) {
  const weeks = historyCalendar(events);
  const eventsByDay = new Map();
  for (const event of events) {
    const dayEvents = eventsByDay.get(event.day) || [];
    dayEvents.push(event);
    eventsByDay.set(event.day, dayEvents);
  }
  const months = $("months");
  const cells = $("heat-cells");
  months.replaceChildren();
  cells.replaceChildren();
  cells.style.setProperty("--history-weeks", weeks.length);
  let previousMonth = -1;
  for (let week = 0; week < weeks.length; week++) {
    const sunday = new Date(weeks[week][0].date + "T00:00:00Z");
    if (sunday.getUTCMonth() !== previousMonth) {
      const label = document.createElement("span");
      label.textContent = (sunday.getUTCMonth() + 1) + "月";
      label.style.left = ((week / weeks.length) * 100) + "%";
      months.append(label);
      previousMonth = sunday.getUTCMonth();
    }
    for (const day of weeks[week]) {
      const cell = document.createElement("span");
      cell.className = "heat-cell" + (day.future ? " future" : day.type === "empty" ? "" : " " + day.type + " event");
      const kind = day.type === "banked" ? "备用重置" : day.type === "regular" ? "常规重置" : day.type === "mixed" ? "常规及备用重置" : "未重置";
      cell.title = day.date + " · " + kind;
      if (!day.future) {
        cell.tabIndex = 0;
        cell.setAttribute("role", "img");
        cell.setAttribute("aria-label", cell.title);
      } else {
        cell.setAttribute("aria-label", cell.title);
      }
      cell.addEventListener("pointerenter", () => showCellTooltip(cell, day, eventsByDay));
      cell.addEventListener("pointerleave", hideCellTooltip);
      cell.addEventListener("focus", () => showCellTooltip(cell, day, eventsByDay));
      cell.addEventListener("blur", hideCellTooltip);
      cells.append(cell);
    }
  }
  $("history-note").textContent = `${weeks[0][0].date} — ${weeks.at(-1)[6].date} · 已收录 ${events.length} 条公开公告 · 日期按 UTC 展示`;
}

function renderArticles(filter = "all") {
  const grid = $("article-grid");
  grid.replaceChildren();
  for (const article of articles.filter((item) => filter === "all" || item.category === filter)) {
    const card = document.createElement(article.articleType === "source" ? "button" : "a");
    card.className = "article" + (article.style ? " " + article.style : "");
    card.addEventListener("click", () => recordArticleClick(article), { capture:true });
    if (article.articleType === "source") {
      card.type = "button";
      card.setAttribute("aria-label", `打开文章：${article.title}`);
      card.addEventListener("click", () => openArticleReader(article));
    } else {
      card.href = article.url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
    }
    const kicker = document.createElement("span");
    kicker.className = "article-kicker";
    kicker.textContent = article.label;
    const title = document.createElement("h3");
    title.textContent = article.cardTitle || article.title;
    const summary = document.createElement("p");
    summary.textContent = article.summary;
    const foot = document.createElement("div");
    foot.className = "article-foot";
    const source = document.createElement("span");
    source.textContent = article.source;
    const action = document.createElement("span");
    action.textContent = article.articleType === "source" ? "站内阅读 ↗" : "阅读原文 ↗";
    foot.append(source, action);
    card.append(kicker, title, summary, foot);
    grid.append(card);
  }
}

function handlePopularArticleClick(event) {
  if (!popularArticle) return;
  recordArticleClick(popularArticle);
  if (popularArticle.articleType === "source") {
    event.preventDefault();
    openArticleReader(popularArticle);
  }
}

function renderArticleBlock(block, body, imageNumber) {
  if (block.type === "atomic") {
    if (block.image) {
      const figure = document.createElement("figure");
      figure.className = "reader-figure";
      const image = document.createElement("img");
      image.src = block.image;
      image.alt = `原文配图 ${imageNumber}`;
      image.loading = "lazy";
      image.onerror = () => figure.remove();
      const caption = document.createElement("figcaption");
      caption.textContent = `原文配图 ${imageNumber}`;
      figure.append(image, caption);
      body.append(figure);
      return imageNumber + 1;
    }
    if (block.markdown) {
      const pre = document.createElement("pre");
      pre.className = "reader-code";
      const code = document.createElement("code");
      code.textContent = block.markdown.replace(/^```\n?/, "").replace(/\n```$/, "");
      pre.append(code);
      body.append(pre);
      return imageNumber;
    }
    if (block.emojiUrl) {
      const emoji = document.createElement("img");
      emoji.className = "reader-emoji";
      emoji.src = block.emojiUrl;
      emoji.alt = "🍀";
      body.append(emoji);
    }
    return imageNumber;
  }
  if (!block.text) return imageNumber;
  const tag = block.type === "header-one" ? "h3" : block.type === "header-two" ? "h4" : "p";
  const node = document.createElement(tag);
  node.className = block.type === "unordered-list-item" ? "reader-list-item" : "";
  if (block.type === "unordered-list-item") node.append(document.createTextNode("• "));
  const ranges = (block.inlineStyleRanges || []).map((range) => ({
    start: range.offset,
    end: range.offset + range.length,
    style: range.style,
  }));
  if (!ranges.length) {
    node.append(document.createTextNode(block.text));
  } else {
    const boundaries = new Set([0, block.text.length]);
    for (const range of ranges) boundaries.add(range.start), boundaries.add(range.end);
    const points = [...boundaries].sort((a, b) => a - b);
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      const copy = document.createTextNode(block.text.slice(start, end));
      const styles = ranges.filter((range) => range.start <= start && range.end >= end).map((range) => range.style);
      let wrapped = copy;
      for (const style of styles) {
        const tagName = style === "Bold" ? "strong" : style === "Italic" ? "em" : "span";
        const element = document.createElement(tagName);
        element.append(wrapped);
        wrapped = element;
      }
      node.append(wrapped);
    }
  }
  body.append(node);
  return imageNumber;
}

function openArticleReader(article) {
  const reader = $("article-reader");
  if (!reader) return;
  const content = article.content;
  const authorId = content?.author?.id || article.authorId;
  const createdAt = content?.createdAt ? new Intl.DateTimeFormat("zh-CN", { timeZone:"UTC", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(content.createdAt)) : article.source.replace("xilo · ", "");
  $("reader-kicker").textContent = article.label;
  $("reader-title").textContent = content?.title || article.title;
  $("reader-meta").textContent = `${authorId} · ${createdAt}`;
  $("reader-summary").textContent = content?.previewText || article.summary;
  const image = $("reader-cover");
  image.src = content?.cover || article.image || "";
  image.alt = `${authorId} 原帖封面`;
  image.hidden = false;
  image.onerror = () => { image.hidden = true; };
  const body = $("reader-body");
  body.replaceChildren();
  let imageNumber = 1;
  for (const block of content?.blocks || []) {
    imageNumber = renderArticleBlock(block, body, imageNumber);
  }
  const source = $("reader-source");
  source.href = content?.sourceUrl || article.url;
  source.textContent = `文章来源：${authorId}（X） ↗`;
  if (typeof reader.showModal === "function") reader.showModal();
  else reader.setAttribute("open", "");
}

function closeArticleReader() {
  const reader = $("article-reader");
  if (!reader) return;
  if (typeof reader.close === "function") reader.close();
  else reader.removeAttribute("open");
}

async function loadArticleContent() {
  const article = articles.find((item) => item.articleType === "source");
  if (!article?.contentUrl) return;
  try {
    const response = await fetch(article.contentUrl, { headers:{ accept:"application/json" }, cache:"no-store" });
    if (!response.ok) throw new Error(`文章内容读取失败：HTTP ${response.status}`);
    article.content = await response.json();
    article.title = article.content.title || article.title;
    article.authorId = article.content.author?.id || article.authorId;
    renderArticles(document.querySelector(".tab[aria-pressed=\"true\"]")?.dataset.filter || "all");
  } catch (error) {
    console.error("X 文章内容读取失败", error);
  }
}

async function loadData() {
  try {
    const response = await fetch("/api/resets", { headers:{ accept:"application/json" } });
    if (!response.ok) throw new Error("原站暂不可用");
    const events = normalizeEvents(await response.json());
    if (!events.length) throw new Error("原站暂无重置记录");
    const previousId = localStorage.getItem("last-reset-id");
    const latestEvent = events[0];
    renderLatest(latestEvent);
    renderHistory(events);
    loadPleaCount();
    if (reminderEnabled && typeof Notification !== "undefined" && Notification.permission === "granted" && previousId && previousId !== String(latestEvent.tweet_id)) {
      new Notification("Codex 有新的重置公告", { body:readableEventText(latestEvent) });
    }
    localStorage.setItem("last-reset-id", String(latestEvent.tweet_id));
    $("status-message").textContent = "";
  } catch (error) {
    $("status-message").textContent = "暂时无法读取原站数据，请稍后刷新。";
    $("reset-relative").textContent = "暂不可用";
    $("reset-date").textContent = "原站数据连接失败";
    $("reset-quote").textContent = "可点击右侧按钮前往原站查看。";
    $("history-note").textContent = "历史记录暂不可用";
    console.error("重置公告读取失败", error);
  }
}

async function toggleReminder() {
  if (reminderEnabled) {
    reminderEnabled = false;
    writeReminderPreference(false);
    syncReminderButton();
    $("status-message").textContent = "浏览器提醒已关闭。";
    return;
  }
  if (!("Notification" in window)) {
    $("status-message").textContent = "当前浏览器不支持通知。";
    return;
  }
  if (Notification.permission === "denied") {
    $("status-message").textContent = "浏览器已拒绝通知，请在站点设置中重新允许。";
    return;
  }
  const button = $("notify-button");
  button.disabled = true;
  try {
    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
    if (permission !== "granted") {
      $("status-message").textContent = "未获得通知权限。";
      return;
    }
    reminderEnabled = true;
    writeReminderPreference(true);
    syncReminderButton();
    $("status-message").textContent = "浏览器提醒已开启。";
  } finally {
    button.disabled = false;
  }
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.setAttribute("aria-pressed", String(tab === button)));
    renderArticles(button.dataset.filter);
  });
});
$("reader-close")?.addEventListener("click", closeArticleReader);
$("article-reader")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeArticleReader();
});
$("popular-article")?.addEventListener("click", handlePopularArticleClick);
syncReminderButton();
$("notify-button").addEventListener("click", toggleReminder);
$("reset-plea-button").addEventListener("click", pleadForReset);
renderArticles();
loadArticleContent();
renderPopularArticle(articles.find((article) => article.featured) || articles[0]);
loadPopularArticle();
loadData();
window.setInterval(loadData, 15 * 60 * 1000);
window.setInterval(loadPopularArticle, 60 * 60 * 1000);
window.setInterval(loadPleaCount, 15 * 1000);
window.addEventListener("scroll", hideCellTooltip, { passive: true });
window.addEventListener("resize", hideCellTooltip);
