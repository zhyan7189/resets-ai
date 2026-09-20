// Render the small Markdown subset stored in archive bodies without injecting HTML.
function appendArchiveBody(text, container, { heading = "h3", figureClass = "" } = {}) {
  const media = /!\[([^\]\n]*)\]\((https:\/\/[^\s)]+|\/api\/media\/[a-f0-9-]{36}\.(?:jpg|png|webp|gif))\)/gi;
  const body = String(text || "");
  let cursor = 0;
  function addText(value) {
    for (const raw of value.split(/\n\s*\n|\n(?=#{1,3}\s)/)) {
      const block = raw.trim();
      if (!block) continue;
      const headingMatch = block.match(/^(#{1,3})\s+([^\n]+)(?:\n([\s\S]+))?$/);
      if (headingMatch) {
        const title = document.createElement(headingMatch[1].length === 1 ? heading : heading === "h3" ? "h4" : "h3");
        title.textContent = headingMatch[2]; container.append(title);
        if (headingMatch[3]?.trim()) addText(headingMatch[3]);
        continue;
      }
      const quote = block.startsWith("> ");
      const node = document.createElement(quote ? "blockquote" : "p");
      node.textContent = quote ? block.slice(2) : block;
      container.append(node);
    }
  }
  for (const match of body.matchAll(media)) {
    addText(body.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    let safe = false;
    try { const url = new URL(match[2], location.origin); safe = url.protocol === "https:" || url.origin === location.origin && /^\/api\/media\/[a-f0-9-]{36}\.(?:jpg|png|webp|gif)$/.test(url.pathname); } catch { /* invalid URL is rendered as plain text */ }
    if (!safe) { addText(match[0]); continue; }
    const figure = document.createElement("figure");
    if (figureClass) figure.className = figureClass;
    const image = document.createElement("img"); image.src = match[2]; image.alt = match[1]; image.loading = "lazy";
    figure.append(image);
    if (match[1] && match[1] !== "Article cover image") {
      const caption = document.createElement("figcaption"); caption.textContent = match[1]; figure.append(caption);
    }
    container.append(figure);
  }
  addText(body.slice(cursor));
}
