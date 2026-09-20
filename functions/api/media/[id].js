export async function onRequestGet({ params, env }) {
  const id = String(params?.id || "");
  if (!/^[a-f0-9-]{36}\.(?:jpg|png|webp|gif)$/.test(id)) return new Response("无效图片地址", { status:400 });
  if (!env.MEDIA) return new Response("图片存储未配置", { status:503 });
  try {
    const object = await env.MEDIA.get(id);
    if (!object) return new Response("图片不存在", { status:404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("cache-control", "public, max-age=31536000, immutable");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch { return new Response("图片暂不可用", { status:503 }); }
}
