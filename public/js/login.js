async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function redirectIfLoggedIn() {
  try {
    const { user } = await api("/api/me");
    if (user.role === "admin") {
      window.location.href = "/admin.html";
    } else {
      window.location.href = "/worker.html";
    }
  } catch {
    // stay on login
  }
}

const form = document.getElementById("loginForm");
const errorEl = document.getElementById("error");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.classList.add("hidden");

  const userId = document.getElementById("userId").value.trim();
  const password = document.getElementById("password").value;

  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ userId, password }),
    });
    if (data.user.role === "admin") {
      window.location.href = "/admin.html";
    } else {
      window.location.href = "/worker.html";
    }
  } catch (err) {
    errorEl.textContent = err.message || "Login failed";
    errorEl.classList.remove("hidden");
  }
});

redirectIfLoggedIn();
