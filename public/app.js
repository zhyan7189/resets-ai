import { historyCalendar, normalizeEvents, relativeLabel } from "./model.js";

const articles = [
  { category:"tutorial", label:"实操教程 · Stripe", title:"AI 产品怎样定价，才不会越用越亏？", summary:"比较订阅、按量和混合收费，先对齐用户价值与模型成本。", source:"Stripe · 2026-04-19", url:"https://stripe.com/resources/more/ai-pricing-models", style:"" },
  { category:"opportunity", label:"机会资讯 · Shopify", title:"从服务到数字产品，AI 生意有哪些方向？", summary:"先看可交付的细分需求，再验证客户是否愿意付费。", source:"Shopify · 2026-08-28", url:"https://www.shopify.com/blog/ai-business-ideas", style:"rose" },
  { category:"tools", label:"工具观察 · Cloudflare", title:"用 Workers AI 做出第一个可运行应用", summary:"官方入门文档覆盖模型调用与部署，适合验证小型产品。", source:"Cloudflare · 2026-04-21", url:"https://developers.cloudflare.com/workers-ai/get-started/", style:"mint" },
  { category:"tutorial", label:"实操教程 · Zapier", title:"用 AI 自动化交付重复的业务流程", summary:"从流程拆分与工具连接入手，观察服务型产品的交付方式。", source:"Zapier · 2026-04-01", url:"https://zapier.com/blog/ai-for-business-automation/", style:"" },
];

const $ = (id) => document.getElementById(id);
let reminderEnabled = false;

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
  $("reset-quote").textContent = "“" + (event.display_text || event.text || "请查看原始公告。") + "”";
  $("source-link").href = httpsUrl(event.tweet_url) || "https://codex-resets.com/";
}

function renderHistory(events) {
  const weeks = historyCalendar(events);
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
      if (day.type !== "empty" && !day.future) {
        cell.tabIndex = 0;
        cell.setAttribute("role", "img");
        cell.setAttribute("aria-label", cell.title);
      } else {
        cell.setAttribute("aria-hidden", "true");
      }
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
    if (reminderEnabled && previousId && previousId !== String(latestEvent.tweet_id)) {
      new Notification("Codex 有新的重置公告", { body:latestEvent.display_text || "点击页面查看公告。" });
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
renderArticles();
loadData();
window.setInterval(loadData, 15 * 60 * 1000);
