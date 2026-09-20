const mode = document.body.dataset.mode;
const form = document.getElementById("account-form");
const status = document.getElementById("status");
const submit = document.getElementById("submit");
const labels = { invalid_username:"用户名须为 3–24 位英文、数字或下划线，不能使用 admin。", invalid_password:"密码长度必须大于 6 位。", username_taken:"用户名已被使用。", invalid_credentials:"用户名或密码错误。", too_many_attempts:"尝试次数过多，请稍后再试。", database_unconfigured:"数据库尚未配置。" };
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submit.disabled = true;
  status.textContent = mode === "register" ? "正在创建读者账号…" : "正在登录…";
  try {
    const response = await fetch(`/api/reader/${mode}`, {
      method:"POST", headers:{ "content-type":"application/json", accept:"application/json" },
      body:JSON.stringify({ username:form.elements.namedItem("username").value.trim(), password:form.elements.namedItem("password").value }),
      cache:"no-store", credentials:"same-origin",
    });
    const result = await response.json();
    if (!response.ok) { status.textContent = labels[result.error] || "操作失败，请稍后重试。"; return; }
    form.elements.namedItem("password").value = "";
    const next = new URLSearchParams(location.search).get("next");
    location.assign(next?.startsWith("/") && !next.startsWith("//") ? next : "/#news");
  } catch { status.textContent = "连接失败，请检查网络。"; }
  finally { submit.disabled = false; }
});
