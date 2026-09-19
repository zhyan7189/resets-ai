const UPSTREAM = "https://codex-resets.com/api/reset-requests";

export async function onRequestGet() {
  try {
    const response = await fetch(UPSTREAM, {
      headers: { accept: "application/json" },
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    if (!response.ok) throw new Error(`上游返回 ${response.status}`);
    const data = await response.json();
    if (
      !data ||
      typeof data.cycle_id !== "string" ||
      !Number.isSafeInteger(data.count) ||
      data.count < 0
    ) throw new Error("上游互动数据格式异常");

    return new Response(JSON.stringify({
      cycle_id: data.cycle_id,
      since: typeof data.since === "string" ? data.since : null,
      count: data.count,
    }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "upstream_unavailable", cycle_id: "", since: null, count: null }), {
      status: 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
}
