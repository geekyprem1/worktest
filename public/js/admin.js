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

function $(id) {
  return document.getElementById(id);
}

function show(el, yes = true) {
  el.classList.toggle("hidden", !yes);
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatDay(dateStr) {
  if (!dateStr) return "—";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

async function ensureAdmin() {
  try {
    const { user } = await api("/api/me");
    if (user.role !== "admin") {
      window.location.href = user.role === "worker" ? "/worker.html" : "/";
      return null;
    }
    $("adminName").textContent = user.name;
    return user;
  } catch {
    window.location.href = "/";
    return null;
  }
}

function setMessage(text) {
  const el = $("message");
  if (!text) {
    show(el, false);
    return;
  }
  el.textContent = text;
  show(el, true);
}

function setError(text) {
  const el = $("error");
  if (!text) {
    show(el, false);
    return;
  }
  el.textContent = text;
  show(el, true);
}

function applyStats(data) {
  $("statTemplates").textContent = data.templateCount ?? 0;
  $("statWorkers").textContent = data.workerCount ?? 0;
  $("statPending").textContent = data.pending ?? 0;
  $("statCompleted").textContent = data.completed ?? 0;
  $("workDateLine").textContent = `Work date: ${
    data.workDate ? formatDay(data.workDate) : "— (not generated yet)"
  }`;
  $("generatedAt").textContent = `Last generated: ${formatDate(data.generatedAt)}`;
  renderUsersTable(data.perUser || []);
}

function renderUsersTable(perUser) {
  const body = $("usersTableBody");
  if (!perUser.length) {
    body.innerHTML =
      '<tr><td colspan="5" class="muted">No workers yet. Add one above.</td></tr>';
    return;
  }

  body.innerHTML = "";
  perUser.forEach((u) => {
    const tr = document.createElement("tr");
    const todayLabel =
      u.total > 0 ? `${u.completed}/${u.total}` : "No batch";
    tr.innerHTML = `
      <td><code>${escapeHtml(u.userId)}</code></td>
      <td>${escapeHtml(u.name)}</td>
      <td>worker</td>
      <td>${escapeHtml(todayLabel)}</td>
      <td>${u.completedDays ?? 0}</td>
    `;
    body.appendChild(tr);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function refreshStats() {
  setError("");
  try {
    const data = await api("/api/admin/stats");
    applyStats(data);
  } catch (err) {
    setError(err.message);
  }
}

async function addUser() {
  setError("");
  setMessage("");

  const userId = $("newUserId").value.trim();
  const name = $("newName").value.trim();
  const password = $("newPassword").value;

  if (!userId || !name || !password) {
    setError("Please fill user ID, name, and password.");
    return;
  }

  $("addUserBtn").disabled = true;
  try {
    const data = await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ userId, name, password }),
    });
    setMessage(data.message || "User added.");
    $("newUserId").value = "";
    $("newName").value = "";
    $("newPassword").value = "";
    await refreshStats();
  } catch (err) {
    setError(err.message);
  } finally {
    $("addUserBtn").disabled = false;
  }
}

async function generate() {
  setError("");
  setMessage("");

  const count = Number($("countInput").value);
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    setError("Enter a whole number between 1 and 500.");
    return;
  }

  $("generateBtn").disabled = true;
  try {
    const data = await api("/api/admin/generate", {
      method: "POST",
      body: JSON.stringify({ count }),
    });
    setMessage(data.message || `Generated ${count} surveys.`);
    await refreshStats();
    setMessage(data.message || `Generated ${count} surveys.`);
  } catch (err) {
    setError(err.message);
  } finally {
    $("generateBtn").disabled = false;
  }
}

async function logout() {
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
  } catch {
    // ignore
  }
  window.location.href = "/";
}

document.querySelectorAll("#quickCounts .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document
      .querySelectorAll("#quickCounts .chip")
      .forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    $("countInput").value = chip.dataset.count;
  });
});

$("countInput").addEventListener("input", () => {
  const val = $("countInput").value;
  document.querySelectorAll("#quickCounts .chip").forEach((c) => {
    c.classList.toggle("active", c.dataset.count === val);
  });
});

$("addUserBtn").addEventListener("click", addUser);
$("generateBtn").addEventListener("click", generate);
$("refreshBtn").addEventListener("click", refreshStats);
$("logoutBtn").addEventListener("click", logout);

(async function init() {
  const user = await ensureAdmin();
  if (!user) return;
  await refreshStats();
})();
