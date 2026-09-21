const $ = (id) => document.getElementById(id);
const categories = { tutorial:"实操教程", review:"AI测评", opportunity:"机会资讯" };
fetch("/api/analytics/visit", { method:"POST", keepalive:true }).catch(() => {});

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch { return null; }
}

function safeMediaUrl(value) {
  return typeof value === "string" && /^\/api\/media\/[a-f0-9-]{36}\.(?:jpg|png|webp|gif)$/.test(value) ? value : safeUrl(value);
}

function appendBody(text, container) {
  appendArchiveBody(text, container, { heading:"h2" });
}

function youtubeEmbed(value) {
  const url = safeUrl(value);
  if (!url) return null;
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
  return null;
}

async function main() {
  const id = new URLSearchParams(location.search).get("id") || "";
  if (!/^[a-z0-9-]{1,120}$/.test(id)) throw new Error("文章链接无效");
  const response = await fetch(`/api/articles/item?id=${encodeURIComponent(id)}`, { cache:"no-store" });
  if (!response.ok) throw new Error(response.status === 403 ? "请先注册或登录读者账号，再阅读这篇档案" : response.status === 404 ? "这篇文章已下架或尚未发布" : "暂时无法读取文章");
  const { article } = await response.json();
  document.title = `${article.title} · Resets AI`;
  $("category").textContent = `${categories[article.category] || "实操教程"} · ${article.format === "video" ? "视频" : "文章"}`;
  $("title").textContent = article.title;
  $("meta").textContent = [article.source_name, article.author, article.published_at?.slice(0, 10)].filter(Boolean).join(" · ");
  $("summary").textContent = article.summary;
  $("summary").hidden = false;
  const cover = safeMediaUrl(article.cover_url);
  if (cover) { $("cover").src = cover; $("cover").style.display = "block"; }
  if (article.format === "video" && (article.rights === "embed" || youtubeEmbed(article.video_url || article.source_url))) {
    const src = youtubeEmbed(article.video_url || article.source_url);
    if (src) {
      const iframe = document.createElement("iframe"); iframe.className = "video"; iframe.src = src;
      if (src.startsWith("https://platform.twitter.com/")) iframe.classList.add("x-embed");
      iframe.title = article.title; iframe.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true; iframe.referrerPolicy = "strict-origin-when-cross-origin"; $("body").append(iframe);
    } else if (/^https:\/\/[^\s]+\.mp4(?:\?[^\s]*)?$/i.test(article.video_url || "")) {
      const video = document.createElement("video"); video.className = "video"; video.src = article.video_url;
      video.controls = true; video.preload = "metadata"; $("body").append(video);
    } else appendBody("该视频暂无法在本站播放，请通过下方原始链接观看。", $("body"));
    if (article.rights === "licensed" && article.body) appendBody(article.body, $("body"));
    $("credit").textContent = `视频来源：${article.author}（${article.source_name}）。`;
  } else if (article.rights === "licensed") {
    appendBody(article.body, $("body"));
    $("credit").textContent = `本文经授权转载，来源：${article.author}（${article.source_name}）。`;
  } else {
    $("credit").textContent = `本站导读。原内容由 ${article.author} 发布于 ${article.source_name}。`;
  }
  const source = safeUrl(article.source_url);
  if (source) { $("source").href = source; $("source").hidden = false; }
}

main().catch((error) => {
  $("category").textContent = "读取失败";
  $("title").textContent = error.message;
  $("title").classList.add("error");
  if (error.message.includes("读者账号")) {
    const link = document.createElement("a");
    link.href = `/register.html?next=${encodeURIComponent(location.pathname + location.search)}`;
    link.textContent = "注册并阅读 ↗";
    $("body").append(link);
  }
});
