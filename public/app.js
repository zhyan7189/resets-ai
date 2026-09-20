import { historyCalendar, normalizeEvents, readableEventText, relativeLabel, tooltipDetails } from "./model.js";

const articles = [];
const categoryNames = { opportunity:"机会资讯", tutorial:"实操教程", tools:"工具观察", case:"创业案例", pitfall:"避坑经验" };
let activeArticleFilter = "all";
let articleSearch = "";
let publishedLoaded = false;
let readerLimited = true;
let freeArticleId = null;

const $ = (id) => document.getElementById(id);
async function loadAds() {
  try {
    const response = await fetch("/api/ads", { headers:{ accept:"application/json" }, cache:"no-store" });
    if (!response.ok) return;
    const { ads, hidden_slots: hiddenSlots = [] } = await response.json();
    for (const slot of hiddenSlots) document.querySelector(`[data-ad-slot="${slot}"]`)?.remove();
    for (const ad of ads || []) {
      const placeholder = document.querySelector(`[data-ad-slot="${ad.slot}"]`);
      if (!placeholder || !/^https:\/\//i.test(ad.target_url || "")) continue;
      const link = document.createElement("a");
      link.className = placeholder.className;
      link.dataset.adSlot = String(ad.slot);
      link.href = ad.target_url;
      link.target = "_blank";
      link.rel = "sponsored noopener noreferrer";
      for (const [className, value] of [["ad-label",ad.label || "广告 · 品牌合作"],["ad-icon",ad.icon || "✦"],["ad-title",ad.title],["ad-description",ad.description]]) {
        const node = document.createElement(className === "ad-title" ? "strong" : className === "ad-description" ? "small" : "span");
        if (className.startsWith("ad-") && !["ad-title","ad-description"].includes(className)) node.className = className;
        node.textContent = value || "";
        link.append(node);
      }
      placeholder.replaceWith(link);
    }
    for (const rail of document.querySelectorAll(".rail")) rail.hidden = !rail.querySelector(".ad");
  } catch { /* 无法确认展示配置时不显示广告位。 */ }
}
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
let impressionObserver;
const seenImpressions = new Set();

fetch("/api/analytics/visit", { method:"POST", keepalive:true }).catch(() => {});

function recordArticleClick(article) {
  if (!article?.id) return;
  fetch("/api/articles/click", {
    method:"POST",
    headers:{ "content-type":"application/json", accept:"application/json" },
    body:JSON.stringify({ article_id:article.id }),
    keepalive:true,
  }).then((response) => { if (response.ok) loadPopularArticle(); }).catch(() => {});
}

function renderPopularArticle(article, clicks = 0) {
  const card = $("popular-article");
  if (!card) return;
  card.hidden = !article;
  popularArticle = article;
  if (!article) return;
  card.href = article.url;
  card.target = "_self";
  card.rel = "noopener noreferrer";
  card.setAttribute("aria-label", `热度榜首：${article.title}`);
  $("popular-label").textContent = `热度榜首 · ${article.label}`;
  $("popular-title").textContent = article.cardTitle || article.title;
  $("popular-summary").textContent = article.summary;
  $("popular-source").textContent = `${article.source} · ${new Intl.NumberFormat("zh-CN").format(clicks)} 次点击`;
  const art = $("popular-art");
  art.replaceChildren();
  if (article.coverUrl) {
    const cover = document.createElement("img");
    cover.src = article.coverUrl;
    cover.alt = "";
    cover.loading = "lazy";
    art.append(cover);
  } else {
    art.textContent = "热度 #1";
  }
}

async function loadPopularArticle() {
  try {
    const response = await fetch("/api/articles/popular", { headers:{ accept:"application/json" }, cache:"no-store" });
    if (!response.ok) throw new Error("热度接口暂不可用");
    const data = await response.json();
    const row = data.article;
    renderPopularArticle(row ? {
      id:row.id, category:row.category, label:`${categoryNames[row.category] || "机会资讯"} · ${row.source_name}${row.format === "video" ? " · 视频" : ""}`,
      title:row.title, cardTitle:row.card_title, summary:row.summary,
      source:`${row.author} · ${row.published_at ? row.published_at.slice(0, 10) : "日期未注明"}`,
      url:`/article.html?id=${encodeURIComponent(row.id)}`, coverUrl:row.cover_url,
      articleType:"database", format:row.format,
    } : null, Number(data.clicks || 0));
  } catch {
    renderPopularArticle(articles[0] || null);
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
  if (navigator.vibrate) navigator.vibrate(14);
  button.classList.remove("is-pleading");
  void button.offsetHeight;
  button.classList.add("is-pleading");
  window.setTimeout(() => button.classList.remove("is-pleading"), 280);
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
  requestAnimationFrame(() => {
    const scroll = document.querySelector(".heat-scroll");
    months.style.width = `${cells.scrollWidth}px`;
    scroll.scrollLeft = scroll.scrollWidth - scroll.clientWidth;
    $("history-slider").value = "1000";
  });
}

const historyScroll = document.querySelector(".heat-scroll");
const historySlider = $("history-slider");
historySlider.addEventListener("input", () => {
  const max = Math.max(0, historyScroll.scrollWidth - historyScroll.clientWidth);
  historyScroll.scrollLeft = max * Number(historySlider.value) / 1000;
  hideCellTooltip();
});
historyScroll.addEventListener("scroll", () => {
  const max = Math.max(0, historyScroll.scrollWidth - historyScroll.clientWidth);
  historySlider.value = max ? String(Math.round(historyScroll.scrollLeft / max * 1000)) : "1000";
  hideCellTooltip();
}, { passive:true });

function renderArticles(filter = "all") {
  activeArticleFilter = filter;
  const grid = $("article-grid");
  impressionObserver?.disconnect();
  if ("IntersectionObserver" in window) impressionObserver = new IntersectionObserver((items) => {
    const ids = [];
    for (const item of items) {
      if (!item.isIntersecting || seenImpressions.has(item.target.dataset.articleId)) continue;
      const id = item.target.dataset.articleId;
      if (!id) continue;
      seenImpressions.add(id); ids.push(id); impressionObserver.unobserve(item.target);
    }
    if (ids.length) fetch("/api/analytics/impression", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ article_ids:ids }), keepalive:true }).catch(() => {});
  }, { threshold:.35 });
  grid.replaceChildren();
  const shown = articles.filter((item) => (filter === "all" || item.category === filter) &&
    (!articleSearch || [item.title, item.summary, item.source].join(" ").toLocaleLowerCase().includes(articleSearch)));
  for (const article of shown) {
    const card = document.createElement("button");
    const registrationRequired = article.articleType === "database" && readerLimited && article.id !== freeArticleId;
    card.className = "article" + (article.style ? " " + article.style : "");
    card.type = "button";
    card.setAttribute("aria-label", `${registrationRequired ? "注册后阅读" : "打开文章"}：${article.title}`);
    card.addEventListener("click", () => openArticleReader(article));
    if (article.articleType === "database" && impressionObserver) { card.dataset.articleId = article.id; impressionObserver.observe(card); }
    const kicker = document.createElement("span");
    kicker.className = "article-kicker";
    kicker.textContent = article.label;
    if (article.coverUrl) {
      const media = document.createElement("span");
      media.className = "article-media";
      const image = document.createElement("img");
      image.src = article.coverUrl;
      image.alt = "";
      image.loading = "lazy";
      media.append(image);
      if (article.format === "video") {
        const play = document.createElement("span");
        play.className = "article-play";
        play.textContent = "▶";
        media.append(play);
      }
      card.append(media);
    }
    const title = document.createElement("h3");
    title.textContent = article.cardTitle || article.title;
    const summary = document.createElement("p");
    summary.textContent = article.summary;
    const foot = document.createElement("div");
    foot.className = "article-foot";
    const source = document.createElement("span");
    source.textContent = article.source;
    const action = document.createElement("span");
    action.textContent = registrationRequired ? "注册解锁 ↗" : "站内阅读 ↗";
    foot.append(source, action);
    card.append(kicker, title, summary, foot);
    grid.append(card);
  }
  if (!shown.length) {
    const empty = document.createElement("p");
    empty.className = "article-empty";
    empty.textContent = !publishedLoaded && !articles.length ? "正在读取档案…" : filter === "all" && !articleSearch && !articles.length ? "当前页面没有任何档案。" : "没有找到符合条件的档案。";
    grid.append(empty);
  }
}

async function loadPublishedArticles() {
  try {
    const response = await fetch("/api/articles", { headers:{ accept:"application/json" }, cache:"no-store" });
    if (!response.ok) throw new Error("档案接口暂不可用");
    const data = await response.json();
    publishedLoaded = true;
    readerLimited = Boolean(data.limited);
    freeArticleId = data.free_article_id || null;
    articles.length = 0;
    for (const row of data.articles || []) {
      if (articles.some((item) => item.id === row.id || item.url === row.source_url)) continue;
      articles.push({
        id:row.id, category:row.category, label:`${categoryNames[row.category] || "机会资讯"} · ${row.source_name}${row.format === "video" ? " · 视频" : ""}`,
        title:row.title, cardTitle:row.card_title, summary:row.summary,
        source:`${row.author} · ${row.published_at ? row.published_at.slice(0, 10) : "日期未注明"}`,
        url:`/article.html?id=${encodeURIComponent(row.id)}`, coverUrl:row.cover_url,
        articleType:"database", format:row.format, style:row.format === "video" ? "rose" : "",
      });
    }
    renderArticles(activeArticleFilter);
    loadPopularArticle();
    $("reader-access").innerHTML = data.limited
      ? '全部档案均可浏览；最新 1 篇可完整阅读。<a href="/register.html">注册后解锁全站 ↗</a>'
      : '已登录读者账号，可阅读全部已发布档案。';
  } catch {
    renderPopularArticle(null);
    const grid = $("article-grid");
    grid.replaceChildren();
    const notice = document.createElement("p");
    notice.className = "article-empty";
    notice.textContent = "档案暂时无法加载，请稍后刷新。";
    grid.append(notice);
  }
}

function handlePopularArticleClick(event) {
  if (!popularArticle) return;
  event.preventDefault();
  openArticleReader(popularArticle);
}

function readerMediaUrl(value) {
  if (/^\/api\/media\/[a-f0-9-]{36}\.(?:jpg|png|webp|gif)$/.test(value || "")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch { return ""; }
}

function appendStoredBody(text, container) {
  appendArchiveBody(text, container, { figureClass:"reader-figure" });
}

function youtubeEmbedUrl(value) {
  const url = readerMediaUrl(value);
  if (!url) return "";
  const parsed = new URL(url);
  let id = "";
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(parsed.hostname)) id = parsed.searchParams.get("v") || "";
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(parsed.hostname) && !id) id = parsed.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})\/?$/)?.[1] || "";
  if (parsed.hostname === "youtu.be") id = parsed.pathname.slice(1);
  if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
  const xPost = ["x.com","www.x.com","twitter.com","www.twitter.com"].includes(parsed.hostname) ? parsed.pathname.match(/^\/[A-Za-z0-9_]{1,15}\/status\/(\d{1,20})\/?$/) : null;
  if (xPost) return `https://platform.twitter.com/embed/Tweet.html?id=${xPost[1]}`;
  if (parsed.hostname === "open.douyin.com" && parsed.pathname === "/player/video" && /^\d{10,20}$/.test(parsed.searchParams.get("vid") || "")) return `https://open.douyin.com/player/video?vid=${parsed.searchParams.get("vid")}&autoplay=0`;
  const bili = ["bilibili.com","www.bilibili.com","m.bilibili.com"].includes(parsed.hostname) ? parsed.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10})\/?$/i) : null;
  if (bili) {
    const page = Number.parseInt(parsed.searchParams.get("p") || "1", 10);
    return `https://player.bilibili.com/player.html?bvid=${bili[1]}${page > 1 && page <= 1000 ? `&p=${page}` : ""}`;
  }
  return "";
}

let readerRequest = 0;
function showRegistrationGate(article) {
  const gate = $("reader-gate");
  $("gate-archive").textContent = article.cardTitle || article.title;
  $("gate-register").href = `/register.html?next=${encodeURIComponent(article.url || "/#news")}`;
  if (!gate.open) gate.showModal();
}

async function openArticleReader(article) {
  if (publishedLoaded && article.articleType === "database" && readerLimited && article.id !== freeArticleId) {
    showRegistrationGate(article);
    return;
  }
  const reader = $("article-reader");
  if (!reader) return;
  const requestId = ++readerRequest;
  const body = $("reader-body");
  body.replaceChildren();
  $("reader-kicker").textContent = article.label;
  $("reader-title").textContent = article.title;
  $("reader-meta").textContent = article.source;
  $("reader-summary").textContent = article.summary;
  $("reader-note").textContent = "来源信息请以原文为准。";
  const cover = $("reader-cover");
  cover.hidden = !readerMediaUrl(article.coverUrl || "");
  if (!cover.hidden) cover.src = article.coverUrl;
  cover.alt = `${article.title}封面`;
  cover.onerror = () => { cover.hidden = true; };
  const source = $("reader-source");
  source.href = "#";
  source.textContent = "查看原始来源 ↗";
  source.hidden = true;
  if (!reader.open) reader.showModal();
  reader.querySelector(".article-reader-panel").scrollTop = 0;

  if (article.articleType === "database") {
    try {
      const response = await fetch(`/api/articles/item?id=${encodeURIComponent(article.id)}`, { cache:"no-store" });
      if (response.status === 403) {
        if (requestId === readerRequest) { closeArticleReader(); showRegistrationGate(article); }
        return;
      }
      if (!response.ok) throw new Error("文章暂时无法读取");
      const { article:record } = await response.json();
      if (requestId !== readerRequest) return;
      recordArticleClick(article);
      $("reader-title").textContent = record.title;
      $("reader-meta").textContent = [record.author, record.published_at?.slice(0, 10)].filter(Boolean).join(" · ");
      $("reader-summary").textContent = record.summary;
      const image = readerMediaUrl(record.cover_url);
      cover.hidden = !image;
      if (image) cover.src = image;
      source.href = record.source_url;
      source.textContent = `信息来源：${record.author}（${record.source_name}） ↗`;
      source.hidden = false;
      if (record.format === "video" && (record.rights === "embed" || youtubeEmbedUrl(record.video_url || record.source_url))) {
        const embed = youtubeEmbedUrl(record.video_url || record.source_url);
        if (embed) {
          const iframe = document.createElement("iframe");
          iframe.className = "reader-video"; iframe.src = embed; iframe.title = record.title;
          if (embed.startsWith("https://platform.twitter.com/")) iframe.classList.add("x-embed");
          iframe.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share";
          iframe.allowFullscreen = true; body.append(iframe);
        } else if (/^https:\/\/[^\s]+\.mp4(?:\?[^\s]*)?$/i.test(record.video_url || "")) {
          const video = document.createElement("video"); video.className = "reader-video";
          video.src = record.video_url; video.controls = true; video.preload = "metadata"; body.append(video);
        } else appendStoredBody("该视频暂无法在本站播放，请通过下方来源链接观看。", body);
        if (record.rights === "licensed" && record.body) appendStoredBody(record.body, body);
        $("reader-note").textContent = "视频来源已标注于下方。";
      } else if (record.rights === "licensed" && record.body) {
        appendStoredBody(record.body, body);
        $("reader-note").textContent = "已获授权转载 · 正文和配图来自原作者。";
      } else {
        appendStoredBody("本站目前仅收录这篇内容的导读，全文请查看原始来源。", body);
        $("reader-note").textContent = "本站导读 · 原始内容由作者发布。";
      }
    } catch (error) {
      if (requestId === readerRequest) {
        appendStoredBody(error.message, body);
      }
    }
    return;
  }

}

function closeArticleReader() {
  readerRequest++;
  const reader = $("article-reader");
  if (!reader) return;
  if (typeof reader.close === "function") reader.close();
  else reader.removeAttribute("open");
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
$("article-search")?.addEventListener("input", (event) => {
  articleSearch = event.target.value.trim().toLocaleLowerCase();
  renderArticles(activeArticleFilter);
});
$("reader-close")?.addEventListener("click", closeArticleReader);
$("article-reader")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeArticleReader();
});
$("gate-close")?.addEventListener("click", () => $("reader-gate").close());
$("gate-later")?.addEventListener("click", () => $("reader-gate").close());
$("reader-gate")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
$("popular-article")?.addEventListener("click", handlePopularArticleClick);
async function refreshReaderSession() {
  try {
    const response = await fetch("/api/reader/session", { cache:"no-store" });
    const session = await response.json();
    if (!response.ok) return;
    $("reader-register").hidden = session.logged_in;
    $("reader-logout").hidden = !session.logged_in;
    if (session.logged_in) $("reader-logout").title = `当前读者：${session.username}`;
  } catch { /* 会话状态暂不可用时仍显示登录入口。 */ }
}
$("reader-logout").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/reader/logout", { method:"POST", cache:"no-store" });
    if (!response.ok) throw new Error("退出失败");
    location.reload();
  } catch { $("reader-access").textContent = "退出失败，请稍后重试。"; }
});
refreshReaderSession();
syncReminderButton();
$("notify-button").addEventListener("click", toggleReminder);
$("reset-plea-button").addEventListener("click", pleadForReset);
renderArticles();
loadAds();
loadPublishedArticles();
renderPopularArticle(null);
loadPopularArticle();
loadData();
window.setInterval(loadData, 15 * 60 * 1000);
window.setInterval(loadPopularArticle, 60 * 60 * 1000);
window.setInterval(loadPleaCount, 15 * 1000);
window.addEventListener("scroll", hideCellTooltip, { passive: true });
window.addEventListener("resize", hideCellTooltip);
