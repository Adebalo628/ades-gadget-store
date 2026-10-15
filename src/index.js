const COOKIE_NAME = "ag_session";
const SESSION_SECONDS = 60 * 60 * 12;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}
function b64url(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = ""; for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function unb64url(input) {
  const s = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(s + "=".repeat((4 - s.length % 4) % 4));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}
async function makeSession(email, env) {
  const payload = b64url(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }));
  return `${payload}.${await sign(payload, env.SESSION_SECRET)}`;
}
async function sessionEmail(request, env) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const token = cookieHeader.split(";").map(v => v.trim()).find(v => v.startsWith(COOKIE_NAME + "="))?.slice(COOKIE_NAME.length + 1);
  if (!token || !env.SESSION_SECRET) return null;
  const parts = token.split("."); if (parts.length !== 2) return null;
  const expected = await sign(parts[0], env.SESSION_SECRET);
  if (expected !== parts[1]) return null;
  try {
    const payload = JSON.parse(unb64url(parts[0]));
    if (!payload.email || payload.email.toLowerCase() !== String(env.ADMIN_EMAIL || "").toLowerCase() || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.email;
  } catch { return null; }
}
function cookie(value, maxAge) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
function safeEqual(a, b) {
  a = String(a || ""); b = String(b || ""); let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i % (a.length || 1)) || 0) ^ (b.charCodeAt(i % (b.length || 1)) || 0);
  return diff === 0;
}
function cleanProduct(p) {
  const product = {
    name: String(p.name || "").trim().slice(0, 120),
    brand: String(p.brand || "").trim().slice(0, 80),
    category: String(p.category || "Other").trim().slice(0, 50),
    price: Number(p.price), stock: Number(p.stock),
    spec: String(p.spec || "").trim().slice(0, 300), tag: String(p.tag || "New").trim().slice(0, 40),
    image: String(p.image || ""), backImage: String(p.backImage || "")
  };
  if (!product.name || !product.brand || !Number.isFinite(product.price) || product.price < 0 || !Number.isInteger(product.stock) || product.stock < 0) throw new Error("Enter a product name, brand, valid price and whole-number stock quantity.");
  for (const key of ["image", "backImage"]) {
    const value = product[key];
    if (value.startsWith("data:") && (!/^data:image\/(jpeg|png|webp);base64,/.test(value) || value.length > 450000)) throw new Error("Please upload a JPG, PNG or WebP image within the upload limit.");
    if (value.length > 450000) throw new Error("Image URL or image data is too large.");
  }
  return product;
}
async function bodyJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 1000000) throw new Error("Request is too large. Use smaller product photos.");
  return await request.json();
}
async function productsApi(request, env, url) {
  if (!env.DB) return json({ error: "Product database is not connected yet." }, 503);
  const admin = await sessionEmail(request, env);
  if (request.method === "GET" && url.pathname === "/api/products") {
    const result = admin
      ? await env.DB.prepare("SELECT id,name,brand,category,price,stock,spec,tag,image,backImage,is_active FROM products ORDER BY created_at DESC").all()
      : await env.DB.prepare("SELECT id,name,brand,category,price,stock,spec,tag,image,backImage,is_active FROM products WHERE is_active = 1 ORDER BY created_at DESC").all();
    return json({ products: result.results || [] });
  }
  if (!admin) return json({ error: "Please sign in with the admin account." }, 401);
  if (request.method === "POST" && url.pathname === "/api/products") {
    let p; try { p = cleanProduct(await bodyJson(request)); } catch (e) { return json({ error: e.message || "Invalid product details." }, 400); }
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO products (id,name,brand,category,price,stock,spec,tag,image,backImage,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,datetime('now'),datetime('now'))")
      .bind(id,p.name,p.brand,p.category,p.price,p.stock,p.spec,p.tag,p.image,p.backImage).run();
    return json({ product: { id, ...p, is_active: 1 } }, 201);
  }
  const match = url.pathname.match(/^\/api\/products\/([A-Za-z0-9-]+)$/i);
  if (match && request.method === "PUT") {
    let p; try { p = cleanProduct(await bodyJson(request)); } catch (e) { return json({ error: e.message || "Invalid product details." }, 400); }
    const result = await env.DB.prepare("UPDATE products SET name=?,brand=?,category=?,price=?,stock=?,spec=?,tag=?,image=?,backImage=?,updated_at=datetime('now') WHERE id=?")
      .bind(p.name,p.brand,p.category,p.price,p.stock,p.spec,p.tag,p.image,p.backImage,match[1]).run();
    if (!result.meta?.changes) return json({ error: "Product not found." }, 404);
    return json({ product: { id: match[1], ...p, is_active: 1 } });
  }
  if (match && request.method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM products WHERE id=?").bind(match[1]).run();
    if (!result.meta?.changes) return json({ error: "Product not found." }, 404);
    return json({ success: true });
  }
  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Allow": "GET,POST,PUT,DELETE,OPTIONS" } });
      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) return json({ error: "Admin login is not configured yet. Finish the Cloudflare setup first." }, 503);
        let data; try { data = await bodyJson(request); } catch { return json({ error: "Enter your email and password." }, 400); }
        if (!safeEqual(String(data.email || "").trim().toLowerCase(), String(env.ADMIN_EMAIL).trim().toLowerCase()) || !safeEqual(data.password || "", env.ADMIN_PASSWORD)) return json({ error: "Email or password is incorrect." }, 401);
        const token = await makeSession(String(env.ADMIN_EMAIL).trim().toLowerCase(), env);
        return json({ success: true }, 200, { "set-cookie": cookie(token, SESSION_SECONDS) });
      }
      if (url.pathname === "/api/auth/logout" && request.method === "POST") return json({ success: true }, 200, { "set-cookie": cookie("", 0) });
      if (url.pathname === "/api/auth/me" && request.method === "GET") return json({ authenticated: !!(await sessionEmail(request, env)) });
      if (url.pathname === "/api/products") return productsApi(request, env, url);
      if (url.pathname.startsWith("/api/products/")) return productsApi(request, env, url);
      return json({ error: "Not found." }, 404);
    }
    if (!env.ASSETS) return new Response("Static assets are not configured.", { status: 500 });
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
