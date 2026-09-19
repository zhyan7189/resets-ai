const DAY = 86_400_000;

// 原站 API 继续作为唯一数据源，下面只负责把公告正文翻译成中文后再展示。
// tweet_id 以原站事件为键，避免对动态公告做不可靠的机器翻译。
const ANNOUNCEMENT_ZH = {
  "2098685367058612394": "重置已全部传播。好梦。",
  "observed-2097043464538264003": "所有人都已完成重置。享受和 Astra 一起的这一周。",
  "2096035437299237298": "为了庆祝 Astra 提前上线，今天为 Plus、Pro 和 Business 用户发放完整备用重置额度，预计当天结束前到账。",
  "2095651088502591861": "从今天起，付费 ChatGPT 套餐每天无法访问 Astra 的用户，都会获得一次备用重置额度；第一次预计约 3 小时后发放。",
  "2094251180121854309": "活跃用户达到 2500 万。为此，ChatGPT Work 和 Codex 的所有付费订阅额度已重置。",
  "2093801758665715784": "已重置 Codex 和 ChatGPT Work 的付费用户额度，并修复压缩、记忆、目标、自动化、子代理、计算机历史、滚动摘要和 MCP 等用量问题。",
  "2093014447833116908": "状态焕然一新，ChatGPT Work 和 Codex 用户的额度也已重置。周四愉快。",
  "observed-20260825T143200Z": "啊，对了，差点忘了说。",
  "2091688655828246890": "重置已传播到账号，也修复了前一天发现的一些额度问题。后续还会继续更新。",
  "2090766694897619318": "Codex 活跃用户达到 2000 万。为庆祝这一里程碑，今天会向 Codex 和 ChatGPT Work 用户发放一次备用重置额度。",
  "2087706104814023111": "活跃用户突破 1500 万，大家都可以享受一次重置，预计一小时左右到账。",
  "2086972802457063486": "已经完成。",
  "2086188036493344823": "为庆祝 GPT-5.6 Sol，ChatGPT Work 和 Codex 的所有付费用户额度已重置。",
  "2083395449814229287": "为庆祝效率提升的一周，并让大家周末运行 10 万个 Luna 线程，Codex 和 ChatGPT Work 的额度已重置。",
  "2082317452755751098": "ChatGPT Work 和 Codex 用户的额度已重置，同时更新了 GPT-5.6 Sol 的使用限制。",
  "2081940052154933696": "Codex 和 ChatGPT Work 的所有付费用户额度已重置。今天是个好日子。",
  "2081096447718723984": "Codex 和 ChatGPT Work 用户额度已重置。昨晚发生的近全球中断已经恢复，我们会继续改进。",
  "2079609157934886975": "用户达到 1000 万里程碑。Codex 和 ChatGPT Work 付费用户的新额度预计一小时内到账。",
  "2078320950488297917": "Codex 和 ChatGPT Work 付费用户额度再次重置。感谢团队在规模快速增长时持续高速迭代。",
  "2077607697487188198": "Codex 和 ChatGPT Work 用户再次完成重置，活跃用户已达到 900 万。",
  "2077114635308986427": "Codex 和 ChatGPT Work 活跃用户达到 800 万。所有用户的额度再次重置，并继续取消 5 小时速率限制。",
  "2076735790567338203": "感谢 700 万活跃用户。为庆祝这一里程碑，每个人的账号都加入了一次备用重置额度，可在桌面端或网页使用。",
  "2076418567143408112": "为 50 万 ChatGPT Work 和 Codex 用户加入一次备用重置，并支持从网页和移动端使用备用额度。",
  "2075820987833274448": "所有 ChatGPT Work 和 Codex 用户再次完成额度重置，预计 30 分钟内到账。",
  "2075641131002700120": "Codex 和 ChatGPT Work 的额度已重置，今天晚些时候还会再进行一次。",
  "2075330198887940337": "ChatGPT Work 和 Codex 付费用户获得完整额度重置，预计一小时内传播。",
  "2071740419030053227": "Codex 额度将在一小时内再次完整重置，并在未来 24 小时为每位用户的备用额度增加一次。",
  "2071381664853319742": "调查期间已重置所有人的 Codex 额度。这是一次硬重置，部分用户此前已经积累了最多三次备用重置。",
  "2070653282440405046": "所有 Codex 用户都获得一次免费额度重置，预计几小时内到账。",
  "2067399435009622521": "这次是双重重置：一次完整重置，另一次放入备用重置库，用户可以自行安排使用。",
  "2062329981548802523": "过去 24 小时发生了三起影响 Codex 稳定性的小事故，所有付费计划的额度已重置。",
  "2061106703446450392": "所有付费 ChatGPT 订阅的 Codex 额度已重置，恢复到每周和每小时 100%。",
  "2058280452851638313": "已修复长会话压缩时缓存命中率造成的额度消耗问题，并重置所有账号的额度。",
  "2055707616605835333": "所有付费计划的 Codex 额度已重置。",
  "2048997818673537399": "为庆祝顺利的一周，所有付费计划的 Codex 速率限制已重置。",
  "2046367145588916687": "Codex 事故已缓解并恢复，速率限制重置即将进行。",
  "2044943514832871564": "为庆祝 Codex 一周年，所有计划都开放了速率限制重置。",
  "2042299371602264319": "推出 100 美元套餐，同时再次重置 Codex 使用限制。",
  "2041655710346572085": "每周使用 Codex 的用户达到 300 万。为庆祝这一增长，速率限制已重置。",
  "2039248564967424483": "由于更多用户遇到速率限制，在调查原因期间，所有计划的使用限制都已谨慎重置。",
  "2037346989244096581": "为配合新插件发布，并因为距离上次重置已久，所有计划的 Codex 额度已重置。",
  "2031605592352313567": "Codex 已恢复稳定，重置按钮已经按下，额度稍后可见。",
  "2031216405266481489": "Codex 问题已经完全解决并稳定运行数小时，速率限制稍后会重置。",
  "2030474136024400173": "调查期间已为 Plus 和 Pro 订阅重置速率限制。",
  "2029308599835738218": "已修复 Plus 和 Pro 用户促销额度未生效的问题，并重置速率限制作为补偿。",
  "2028649088594436225": "Codex 已恢复在线，错误拦截请求的问题已修复，团队会重置速率限制。",
  "2004100061933064395": "节日赠礼：Codex 速率限制已重置，使用上限在 1 月 1 日前提升到平时的两倍。",
  "2002137269134819610": "重写 Codex 用量追踪和计费系统时，使用额度已一并重置。",
  "2001114683047317723": "所有人的使用额度已重置，以缓解中断影响。",
  "1995988609896513743": "所有人的 Codex 使用额度已重置，以最快速度缓解问题。",
  "1992370994028388670": "为补偿美国附近出现的异常高延迟，所有 Codex 用户的速率限制已重置。",
  "1986166501435711936": "Codex 中断已恢复，速率限制已经重置。",
  "1968163721034994139": "所有 gpt-5-codex 用户的额度已重置，以弥补扩容 GPU 期间的变慢。",
};

const UNKNOWN_ANNOUNCEMENT_ZH = "原站发布了新的重置公告，请点击“查看原始公告”了解详情。";

export function dayKey(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 10);
}

export function classifyReset(event) {
  const type = String(event.reset_type || "").toLowerCase();
  if (type.includes("bank")) return "banked";
  if (type.includes("regular") || type.includes("full") || type.includes("hard")) return "regular";
  const text = String(event.text || event.display_text || "").toLowerCase();
  return text.includes("banked reset") || text.includes("reset in your bank") ? "banked" : "regular";
}

export function normalizeEvents(raw) {
  if (!raw || !Array.isArray(raw.events)) throw new Error("原站数据格式发生变化");
  return raw.events
    .map((event) => ({ ...event, day: dayKey(event.announced_at), kind: classifyReset(event) }))
    .filter((event) => event.day)
    .sort((a, b) => new Date(b.announced_at) - new Date(a.announced_at));
}

export function readableEventText(event) {
  const translated = ANNOUNCEMENT_ZH[String(event.tweet_id || "")];
  if (translated) return translated;
  const cleaned = String(event.display_text || event.text || "")
    .replace(/https?:\/\/\S+/g, "")
    .trim();
  if (!cleaned) return "已发布重置公告。";
  // 未知的新公告不直接把英文原文暴露到中文页面，等下一次补充映射。
  return /[A-Za-z]{4,}/.test(cleaned) ? UNKNOWN_ANNOUNCEMENT_ZH : cleaned;
}

export function relativeLabel(value, now = new Date()) {
  const days = Math.max(0, Math.floor((Date.parse(dayKey(now)) - Date.parse(dayKey(value))) / DAY));
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 30) return `${days}天前`;
  if (days < 365) return `${Math.floor(days / 30)}个月前`;
  return `${Math.floor(days / 365)}年前`;
}

export function historyCalendar(events, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 6, 1));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const byDay = new Map();
  for (const event of events) {
    const kinds = byDay.get(event.day) || new Set();
    kinds.add(event.kind);
    byDay.set(event.day, kinds);
  }
  const weeks = [];
  for (let sunday = start.valueOf(); sunday <= today.valueOf(); sunday += 7 * DAY) {
    const days = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      const date = new Date(sunday + weekday * DAY);
      const key = date.toISOString().slice(0, 10);
      const kinds = byDay.get(key);
      days.push({
        date: key,
        future: date > today,
        type: kinds?.size === 2 ? "mixed" : kinds?.has("banked") ? "banked" : kinds?.has("regular") ? "regular" : "empty",
      });
    }
    weeks.push(days);
  }
  return weeks;
}

export function tooltipDetails(day, events = []) {
  const date = new Date(day + "T00:00:00Z");
  const dateLabel = `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
  if (!events.length) {
    return { dateLabel, items: [{ kind: "empty", label: "", text: "没有重置。推文也很安静。" }] };
  }
  return {
    dateLabel,
    items: events.map((event) => ({
      kind: event.kind,
      label: event.kind === "banked" ? "备用重置额度" : "常规重置",
      text: readableEventText(event),
    })),
  };
}
