import { historyCalendar, normalizeEvents, readableEventText, relativeLabel, tooltipDetails } from "./model.js";

const articles = [
  { category:"tutorial", label:"实操教程 · Stripe", title:"AI 产品怎样定价，才不会越用越亏？", summary:"比较订阅、按量和混合收费，先对齐用户价值与模型成本。", source:"Stripe · 2026-04-19", url:"https://stripe.com/resources/more/ai-pricing-models", style:"" },
  { category:"opportunity", label:"机会资讯 · Shopify", title:"从服务到数字产品，AI 生意有哪些方向？", summary:"先看可交付的细分需求，再验证客户是否愿意付费。", source:"Shopify · 2026-08-28", url:"https://www.shopify.com/blog/ai-business-ideas", style:"rose" },
  { category:"tools", label:"工具观察 · Cloudflare", title:"用 Workers AI 做出第一个可运行应用", summary:"官方入门文档覆盖模型调用与部署，适合验证小型产品。", source:"Cloudflare · 2026-04-21", url:"https://developers.cloudflare.com/workers-ai/get-started/", style:"mint" },
  { category:"tutorial", label:"实操教程 · Zapier", title:"用 AI 自动化交付重复的业务流程", summary:"从流程拆分与工具连接入手，观察服务型产品的交付方式。", source:"Zapier · 2026-04-01", url:"https://zapier.com/blog/ai-for-business-automation/", style:"" },
];

const $ = (id) => document.getElementById(id);
let reminderEnabled = false;
let activeTooltip = null;
let pleaState = { cycleId:"", count:null, localCount:0 };

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
  $("reset-type").textContent = event.kind === "banked" ? "● 备用重置" : "● 常规重置";
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
  label.textContent = thanks ? "感谢重置" : "求重置";
  const accessibleLabel = thanks ? "感谢这次重置" : "求一次重置";
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
  const choices = ["+1", "🙏", "求重置", "🔄", "avatar", "avatar"];
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
  let previousMonth = -1;
  for (let week = 0; week < weeks.length; week++) {
    const sunday = new Date(weeks[week][0].date + "T00:00:00Z");
    if (sunday.getUTCMonth() !== previousMonth) {
      const label = document.createElement("span");
      label.textContent = (sunday.getUTCMonth() + 1) + "月";
      label.style.left = (week * 22) + "px";
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
    const card = document.createElement("a");
    card.className = "article" + (article.style ? " " + article.style : "");
    card.href = article.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    const kicker = document.createElement("span");
    kicker.className = "article-kicker";
    kicker.textContent = article.label;
    const title = document.createElement("h3");
    title.textContent = article.title;
    const summary = document.createElement("p");
    summary.textContent = article.summary;
    const foot = document.createElement("div");
    foot.className = "article-foot";
    const source = document.createElement("span");
    source.textContent = article.source;
    const action = document.createElement("span");
    action.textContent = "阅读原文 ↗";
    foot.append(source, action);
    card.append(kicker, title, summary, foot);
    grid.append(card);
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
    if (reminderEnabled && previousId && previousId !== String(latestEvent.tweet_id)) {
      new Notification("Codex 有新的重置公告", { body:readableEventText(latestEvent) });
    }
    localStorage.setItem("last-reset-id", String(latestEvent.tweet_id));
    $("status-message").textContent = "公开公告已更新 · 数据来源：codex-resets.com";
  } catch (error) {
    $("status-message").textContent = "暂时无法读取原站数据，请稍后刷新。";
    $("reset-relative").textContent = "暂不可用";
    $("reset-date").textContent = "原站数据连接失败";
    $("reset-quote").textContent = "可点击右侧按钮前往原站查看。";
    $("history-note").textContent = "历史记录暂不可用";
    console.error("重置公告读取失败", error);
  }
}

function enableReminder() {
  if (!("Notification" in window)) {
    $("status-message").textContent = "当前浏览器不支持通知。";
    return;
  }
  Notification.requestPermission().then((permission) => {
    if (permission !== "granted") {
      $("status-message").textContent = "未获得通知权限。";
      return;
    }
    reminderEnabled = true;
    $("notify-button").textContent = "✓ 页面打开时提醒已开启";
    $("status-message").textContent = "页面保持打开时，每 15 分钟检查新公告。";
  });
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.setAttribute("aria-pressed", String(tab === button)));
    renderArticles(button.dataset.filter);
  });
});
$("notify-button").addEventListener("click", enableReminder);
$("reset-plea-button").addEventListener("click", pleadForReset);
renderArticles();
loadData();
window.setInterval(loadData, 15 * 60 * 1000);
window.setInterval(loadPleaCount, 15 * 1000);
window.addEventListener("scroll", hideCellTooltip, { passive: true });
window.addEventListener("resize", hideCellTooltip);
