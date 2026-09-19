const DAY = 86_400_000;

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
