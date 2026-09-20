const $ = (id) => document.getElementById(id);
const categories = { opportunity:"机会资讯", tutorial:"实操教程", tools:"工具观察", case:"创业案例", pitfall:"避坑经验" };
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
  const blocks = String(text || "").split(/\n\s*\n/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const image = trimmed.match(/^!\[([^\]]*)\]\((https:\/\/[^\s)]+|\/api\/media\/[a-f0-9-]{36}\.(?:jpg|png|webp|gif))\)$/);
    if (image && safeMediaUrl(image[2])) {
      const figure = document.createElement("figure");
      const img = document.createElement("img");
      img.src = image[2];
      img.alt = image[1];
      img.loading = "lazy";
      figure.append(img);
      if (image[1]) {
        const caption = document.createElement("figcaption");
        caption.textContent = image[1];
        figure.append(caption);
      }
      container.append(figure);
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+([\s\S]+)$/);
    const element = document.createElement(heading ? heading[1].length === 1 ? "h2" : "h3" : trimmed.startsWith("> ") ? "blockquote" : "p");
    element.textContent = heading ? heading[2] : trimmed.startsWith("> ") ? trimmed.slice(2) : trimmed;
    container.append(element);
  }
}

function youtubeEmbed(value) {
  const url = safeUrl(value);
  if (!url) return null;
  const parsed = new URL(url);
  let id = "";
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(parsed.hostname)) id = parsed.searchParams.get("v") || "";
  if (parsed.hostname === "youtu.be") id = parsed.pathname.slice(1);
  return /^[a-zA-Z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

async function main() {
  const id = new URLSearchParams(location.search).get("id") || "";
  if (!/^[a-z0-9-]{1,120}$/.test(id)) throw new Error("文章链接无效");
  const response = await fetch(`/api/articles/item?id=${encodeURIComponent(id)}`, { cache:"no-store" });
  if (!response.ok) throw new Error(response.status === 404 ? "这篇文章已下架或尚未发布" : "暂时无法读取文章");
  const { article } = await response.json();
  document.title = `${article.title} · Resets AI`;
  $("category").textContent = `${categories[article.category] || "AI 赚钱情报"} · ${article.format === "video" ? "视频" : "文章"}`;
  $("title").textContent = article.title;
  $("meta").textContent = [article.source_name, article.author, article.published_at?.slice(0, 10)].filter(Boolean).join(" · ");
  $("summary").textContent = article.summary;
  $("summary").hidden = false;
  const cover = safeMediaUrl(article.cover_url);
  if (cover) { $("cover").src = cover; $("cover").style.display = "block"; }
  if (article.rights === "licensed") {
    appendBody(article.body, $("body"));
    $("credit").textContent = `本文经授权转载，来源：${article.author}（${article.source_name}）。`;
  } else if (article.rights === "embed") {
    const src = youtubeEmbed(article.video_url);
    if (src) {
      const iframe = document.createElement("iframe");
      iframe.className = "video";
      iframe.src = src;
      iframe.title = article.title;
      iframe.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      $("body").append(iframe);
    } else if (/^https:\/\/[^\s]+\.mp4(?:\?[^\s]*)?$/i.test(article.video_url || "")) {
      const video = document.createElement("video");
      video.className = "video";
      video.src = article.video_url;
      video.controls = true;
      video.preload = "metadata";
      $("body").append(video);
    } else {
      appendBody("该平台暂不支持站内嵌入，请通过下方原始链接观看。", $("body"));
    }
    $("credit").textContent = `视频来源：${article.author}（${article.source_name}）。`;
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
});
