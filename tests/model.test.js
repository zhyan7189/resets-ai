import test from "node:test";
import assert from "node:assert/strict";
import { classifyReset, historyCalendar, normalizeEvents, relativeLabel, tooltipDetails } from "../public/model.js";

test("按原站字段排序、识别常规与备用重置", () => {
  const events = normalizeEvents({ events: [
    { tweet_id:"2", announced_at:"2026-09-05T00:39:00Z", reset_type:"banked" },
    { tweet_id:"1", announced_at:"2026-09-12T08:09:00Z", reset_type:"regular" },
  ] });
  assert.deepEqual(events.map((event) => [event.tweet_id, event.kind]), [["1", "regular"], ["2", "banked"]]);
  assert.equal(classifyReset({ text:"We added a banked reset." }), "banked");
  assert.equal(relativeLabel(events[0].announced_at, new Date("2026-09-19T12:00:00Z")), "7天前");
});

test("历史热图从六个月前按周日开始，并标记未来日期", () => {
  const events = normalizeEvents({ events:[{ announced_at:"2026-09-12T08:09:00Z", reset_type:"regular" }] });
  const weeks = historyCalendar(events, new Date("2026-09-18T12:00:00Z"));
  assert.equal(weeks[0][0].date, "2026-03-01");
  assert.equal(weeks.flat().find((day) => day.date === "2026-09-12").type, "regular");
  assert.equal(weeks.at(-1)[6].future, true);
});

test("每个日期都能生成悬浮信息，空白日也有说明", () => {
  assert.deepEqual(tooltipDetails("2026-07-07", []), {
    dateLabel: "2026年7月7日",
    items: [{ kind:"empty", label:"", text:"没有重置。推文也很安静。" }],
  });
  assert.deepEqual(tooltipDetails("2026-09-03", [{
    kind:"banked", display_text:"备用重置额将在约 3 小时后发放。",
  }]).items[0], {
    kind:"banked", label:"备用重置额度", text:"备用重置额将在约 3 小时后发放。",
  });
});
