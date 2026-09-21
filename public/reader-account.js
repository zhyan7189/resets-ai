const form = document.getElementById("account-form");
const status = document.getElementById("status");
const submit = document.getElementById("submit");
const email = form.elements.namedItem("email");
const password = form.elements.namedItem("password");
const params = new URLSearchParams(location.search);
let mode = params.get("mode") === "login" ? "login" : document.body.dataset.initialMode || "register";

const labels = {
  invalid_email:"请输入有效的邮箱地址。", invalid_password:"密码长度必须大于 6 位。", email_taken:"该邮箱已经注册，请直接登录。",
  invalid_credentials:"邮箱或密码错误。", too_many_attempts:"尝试次数过多，请稍后再试。", database_unconfigured:"数据库尚未配置。",
  registration_unavailable:"暂时无法注册，请稍后重试。", login_unavailable:"暂时无法登录，请稍后重试。",
};

function safeNext() {
  const next = params.get("next");
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function setMode(nextMode) {
  mode = nextMode;
  for (const tab of document.querySelectorAll(".mode-tab")) {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  document.getElementById("account-title").textContent = mode === "register" ? "加入情报站" : "欢迎回来";
  document.getElementById("account-lead").textContent = mode === "register" ? "用邮箱创建账号，无需验证码。注册成功后立即进入首页。" : "使用注册邮箱和密码登录。";
  document.getElementById("email-hint").textContent = mode === "register" ? "只用于登录，不需要接收验证码。" : "请输入注册时使用的邮箱。";
  password.autocomplete = mode === "register" ? "new-password" : "current-password";
  submit.textContent = mode === "register" ? "注册并进入首页 ↗" : "登录并进入首页 ↗";
  status.textContent = "";
  const url = new URL(location.href);
  if (mode === "login") url.searchParams.set("mode", "login"); else url.searchParams.delete("mode");
  history.replaceState(null, "", url);
}

for (const tab of document.querySelectorAll(".mode-tab")) tab.addEventListener("click", () => setMode(tab.dataset.mode));
setMode(mode);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!email.validity.valid) { status.textContent = labels.invalid_email; email.focus(); return; }
  if (password.value.length <= 6) { status.textContent = labels.invalid_password; password.focus(); return; }
  submit.disabled = true;
  status.textContent = mode === "register" ? "正在创建账号…" : "正在登录…";
  try {
    const response = await fetch(`/api/reader/${mode}`, {
      method:"POST", headers:{ "content-type":"application/json", accept:"application/json" },
      body:JSON.stringify({ email:email.value.trim(), password:password.value }), cache:"no-store", credentials:"same-origin",
    });
    const result = await response.json();
    if (!response.ok) { status.textContent = labels[result.error] || "操作失败，请稍后重试。"; return; }
    password.value = "";
    location.assign(safeNext());
  } catch { status.textContent = "连接失败，请检查网络。"; }
  finally { submit.disabled = false; }
});

async function loadArchives() {
  const mosaic = document.getElementById("archive-mosaic");
  try {
    const response = await fetch("/api/articles/teasers", { headers:{ accept:"application/json" } });
    if (!response.ok) throw new Error();
    const { articles = [] } = await response.json();
    if (!articles.length) return;
    const nextArticles = articles.slice(0, 6);
    const currentIds = [...mosaic.querySelectorAll("[data-article-id]")].map((card) => card.dataset.articleId);
    if (currentIds.join(",") === nextArticles.map((article) => article.id).join(",")) return;
    mosaic.replaceChildren();
    for (const [index, article] of nextArticles.entries()) {
      const card = document.createElement("a");
      card.className = "archive-piece";
      card.dataset.articleId = article.id;
      card.href = `/register.html?mode=login&next=${encodeURIComponent(`/article.html?id=${article.id}`)}`;
      if (article.cover_url) { const image = document.createElement("img"); image.src = article.cover_url; image.alt = ""; image.loading = index < 2 ? "eager" : "lazy"; if (index === 0) image.fetchPriority = "high"; card.append(image); }
      const meta = document.createElement("small"); meta.textContent = article.category === "review" ? "AI 测评" : article.category === "opportunity" ? "机会资讯" : "实操教程";
      const title = document.createElement("strong"); title.textContent = article.card_title || article.title;
      card.append(meta, title); mosaic.append(card);
    }
  } catch {}
}

function scheduleArchiveRefresh() {
  if ("requestIdleCallback" in window) requestIdleCallback(() => loadArchives(), { timeout:1500 });
  else setTimeout(() => loadArchives(), 0);
}
if (document.readyState === "complete") scheduleArchiveRefresh();
else addEventListener("load", scheduleArchiveRefresh, { once:true });
