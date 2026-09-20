import { authorized, json } from "../../../lib/articles.js";

function imageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ["jpg", "image/jpeg"];
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return ["png", "image/png"];
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return ["webp", "image/webp"];
  if (["GIF87a", "GIF89a"].includes(String.fromCharCode(...bytes.slice(0, 6)))) return ["gif", "image/gif"];
  return null;
}

export async function onRequestPost({ request, env }) {
  if (!await authorized(request, env)) return json({ error:"unauthorized" }, 401);
  if (!env.MEDIA) return json({ error:"media_unconfigured" }, 503);
  let file;
  try { file = (await request.formData()).get("image"); } catch { return json({ error:"invalid_upload" }, 400); }
  if (!(file instanceof Blob) || file.size < 12 || file.size > 8 * 1024 * 1024) return json({ error:"invalid_image_size" }, 400);
  const type = imageType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (!type) return json({ error:"unsupported_image" }, 400);
  const key = crypto.randomUUID() + "." + type[0];
  try {
    await env.MEDIA.put(key, file, { httpMetadata:{ contentType:type[1] } });
    return json({ url:`/api/media/${key}` }, 201);
  } catch { return json({ error:"upload_unavailable" }, 503); }
}
