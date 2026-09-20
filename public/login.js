const sessionKey = "resets-ai-admin-token";
const form = document.getElementById("login-form");
const password = document.getElementById("password");
const submit = document.getElementById("submit");
const status = document.getElementById("status");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = password.value;
  if (!token.trim()) {
    status.textContent = "请输入管理密码。";
    return;
  }
  submit.disabled = true;
  status.textContent = "正在验证…";
  try {
    const response = await fetch("/api/admin/auth", {
      headers:{ authorization:`Bearer ${token}` },
      cache:"no-store",
    });
    if (!response.ok) {
      status.textContent = response.status === 401 ? "密码不正确，请重试。" : "暂时无法验证，请稍后重试。";
      password.select();
      return;
    }
    sessionStorage.setItem(sessionKey, token);
    password.value = "";
    window.location.assign("/admin");
  } catch {
    status.textContent = "连接失败，请检查网络后重试。";
  } finally {
    submit.disabled = false;
  }
});
