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

function modeLabel(settings) {
  if (!settings) return '<span class="muted">default (Surveys)</span>';
  const names = {
    survey: "Surveys",
    form: "Form Fill",
    mix: "Mix",
  };
  const modes =
    Array.isArray(settings.taskModes) && settings.taskModes.length
      ? settings.taskModes
      : [settings.taskMode || "survey"];
  return modes.map((m) => names[m] || m).join(", ");
}

function applyStats(data) {
  const surveys = data.templateCount ?? 0;
  const forms = data.formTemplateCount ?? 0;
  $("statTemplates").textContent = `${surveys} + ${forms}`;
  $("statWorkers").textContent = data.workerCount ?? 0;
  $("statPending").textContent = data.pending ?? 0;
  $("statCompleted").textContent = data.completed ?? 0;
  const typeLabel =
    data.workType === "form"
      ? "Form Fill"
      : data.workType === "mix"
        ? `Mix (${data.surveyCount ?? 0}+${data.formCount ?? 0})`
        : data.workDate
          ? "Surveys"
          : "";
  $("workDateLine").textContent = `Work date: ${
    data.workDate
      ? `${formatDay(data.workDate)}${typeLabel ? ` · ${typeLabel}` : ""}`
      : "— (not generated yet)"
  }`;
  $("generatedAt").textContent = `Last generated: ${formatDate(data.generatedAt)}`;
  renderUsersTable(data.perUser || []);
}

function renderUsersTable(perUser) {
  const body = $("usersTableBody");
  if (!perUser.length) {
    body.innerHTML =
      '<tr><td colspan="7" class="muted">No workers yet. Add one above.</td></tr>';
    return;
  }

  body.innerHTML = "";
  perUser.forEach((u) => {
    const tr = document.createElement("tr");
    tr.dataset.userId = u.userId;
    if (u.banned) tr.classList.add("is-banned");
    const todayLabel =
      u.total > 0 ? `${u.completed}/${u.total}` : "No batch";
    const statusBadge = u.banned
      ? '<span class="badge badge-warn">Banned</span>'
      : '<span class="badge badge-ok">Active</span>';
    const banLabel = u.banned ? "Unban" : "Ban";
    tr.innerHTML = `
      <td><code>${escapeHtml(u.userId)}</code></td>
      <td>${escapeHtml(u.name)}</td>
      <td>${modeLabel(u.settings)}</td>
      <td>${escapeHtml(todayLabel)}</td>
      <td>${u.completedDays ?? 0}</td>
      <td>${statusBadge}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-secondary btn-small btn-edit" type="button">Edit</button>
          <button class="btn btn-secondary btn-small btn-reset" type="button">Reset work</button>
          <button class="btn btn-warn btn-small btn-ban" type="button">${banLabel}</button>
          <button class="btn btn-danger btn-small btn-delete" type="button">Delete</button>
        </div>
      </td>
    `;
    tr.querySelector(".btn-edit").addEventListener("click", () =>
      openEditModal(u.userId)
    );
    tr.querySelector(".btn-reset").addEventListener("click", () =>
      resetUserWork(u.userId)
    );
    tr.querySelector(".btn-ban").addEventListener("click", () =>
      toggleBan(u.userId, !u.banned)
    );
    tr.querySelector(".btn-delete").addEventListener("click", () =>
      deleteUser(u.userId, u.name)
    );
    body.appendChild(tr);
  });
}

async function resetUserWork(userId) {
  if (
    !window.confirm(
      `Reset today's work for "${userId}"? Their count goes back to zero.`
    )
  ) {
    return;
  }
  setError("");
  setMessage("");
  try {
    const data = await api(`/api/admin/users/${userId}/reset`, {
      method: "POST",
      body: "{}",
    });
    setMessage(data.message || "Work reset.");
    await refreshStats();
  } catch (err) {
    setError(err.message);
  }
}

async function toggleBan(userId, banned) {
  const verb = banned ? "ban" : "unban";
  if (!window.confirm(`Are you sure you want to ${verb} "${userId}"?`)) {
    return;
  }
  setError("");
  setMessage("");
  try {
    const data = await api(`/api/admin/users/${userId}/ban`, {
      method: "POST",
      body: JSON.stringify({ banned }),
    });
    setMessage(data.message || "Updated.");
    await refreshStats();
  } catch (err) {
    setError(err.message);
  }
}

async function deleteUser(userId, name) {
  if (
    !window.confirm(
      `Delete worker "${name || userId}" permanently? This removes their account and all work. This cannot be undone.`
    )
  ) {
    return;
  }
  setError("");
  setMessage("");
  try {
    const data = await api(`/api/admin/users/${userId}`, {
      method: "DELETE",
    });
    setMessage(data.message || "User deleted.");
    await refreshStats();
  } catch (err) {
    setError(err.message);
  }
}

async function masterReset() {
  if (
    !window.confirm(
      "Reset TODAY'S work for every worker? All queues go back to zero. This cannot be undone."
    )
  ) {
    return;
  }
  setError("");
  setMessage("");
  $("masterResetBtn").disabled = true;
  try {
    const data = await api("/api/admin/reset", {
      method: "POST",
      body: "{}",
    });
    setMessage(data.message || "All work reset for today.");
    await refreshStats();
  } catch (err) {
    setError(err.message);
  } finally {
    $("masterResetBtn").disabled = false;
  }
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

function getNewUserModes() {
  const modes = Array.from(
    document.querySelectorAll("#newUserTaskTypes .chip.active")
  ).map((c) => c.dataset.mode);
  return modes.length ? modes : ["survey"];
}

function setNewUserModes(modes) {
  const set = new Set(modes && modes.length ? modes : ["survey"]);
  document
    .querySelectorAll("#newUserTaskTypes .chip")
    .forEach((c) => c.classList.toggle("active", set.has(c.dataset.mode)));
}

// Toggle a single chip in a container without turning it into radio behaviour.
function toggleChip(chip) {
  chip.classList.toggle("active");
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

  const taskModes = getNewUserModes();
  $("addUserBtn").disabled = true;
  try {
    const data = await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ userId, name, password, taskModes }),
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

let currentTaskType = "survey";

function setTaskType(type) {
  document
    .querySelectorAll("#taskTypes .chip")
    .forEach((c) => c.classList.toggle("active", c.dataset.type === type));
  currentTaskType = type;

  if (type === "mix") {
    show($("singleInputs"), false);
    show($("mixInputs"), true);
    updateMixTotal();
  } else {
    show($("singleInputs"), true);
    show($("mixInputs"), false);
    $("countLabel").textContent =
      type === "form" ? "Forms per worker today" : "Surveys per worker today";
  }
}

function readMixInt(id) {
  const v = Number($(id).value);
  return Number.isInteger(v) && v >= 0 ? v : 0;
}

function updateMixTotal() {
  const s = readMixInt("surveyCountInput");
  const f = readMixInt("formCountInput");
  $("mixTotal").textContent = `Total: ${s + f} / matching worker`;
}

async function generate() {
  setError("");
  setMessage("");
  $("generateBtn").disabled = true;
  try {
    if (currentTaskType === "mix") {
      const surveyCount = readMixInt("surveyCountInput");
      const formCount = readMixInt("formCountInput");
      if (surveyCount + formCount === 0) {
        setError("Add at least 1 survey or 1 form.");
        return;
      }
      if (surveyCount + formCount > 500) {
        setError("Total per worker must be at most 500.");
        return;
      }
      const data = await api("/api/admin/generate", {
        method: "POST",
        body: JSON.stringify({ taskType: "mix", surveyCount, formCount }),
      });
      setMessage(
        data.message || `Generated ${surveyCount}+${formCount} mix.`
      );
    } else {
      const count = Number($("countInput").value);
      if (!Number.isInteger(count) || count < 1 || count > 500) {
        setError("Enter a whole number between 1 and 500.");
        return;
      }
      const label = currentTaskType === "form" ? "forms" : "surveys";
      const data = await api("/api/admin/generate", {
        method: "POST",
        body: JSON.stringify({ count, taskType: currentTaskType }),
      });
      setMessage(data.message || `Generated ${count} ${label}.`);
    }
    await refreshStats();
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

let editingUserId = null;
let formTemplatesCache = null;

async function loadFormTemplates() {
  if (formTemplatesCache) return formTemplatesCache;
  const { templates } = await api("/api/admin/form-templates");
  formTemplatesCache = templates || [];
  return formTemplatesCache;
}

function renderFormPicker(templates, selectedIds) {
  const listEl = $("editFormsList");
  const selected = new Set((selectedIds || []).map(String));
  if (!templates.length) {
    listEl.innerHTML = '<div class="muted">No form templates found.</div>';
    return;
  }
  listEl.innerHTML = "";
  templates.forEach((t) => {
    const id = String(t.id);
    const label = document.createElement("label");
    label.className = "form-pick";
    label.innerHTML = `
      <input type="checkbox" value="${escapeHtml(id)}" ${
        selected.has(id) ? "checked" : ""
      } />
      <span>${escapeHtml(t.title || id)}</span>
      <code>${escapeHtml(id)}</code>
    `;
    listEl.appendChild(label);
  });
}

function getSelectedFormIds() {
  return Array.from(
    document.querySelectorAll('#editFormsList input[type="checkbox"]:checked')
  ).map((el) => el.value);
}

function toggleFormsFieldset(modes) {
  // Forms picker only matters when the worker gets form or mix tasks.
  const list = Array.isArray(modes) ? modes : [modes];
  const relevant = list.includes("form") || list.includes("mix");
  const fs = $("editFormsFieldset");
  fs.style.display = relevant ? "" : "none";
}

async function openEditModal(userId) {
  editingUserId = userId;
  setEditMessage("");
  setEditError("");
  $("editModalUser").textContent = `User: ${userId}`;
  $("editFormsList").innerHTML = '<div class="muted">Loading forms…</div>';
  show($("editModal"), true);
  try {
    const [{ settings }, templates] = await Promise.all([
      api(`/api/admin/users/${userId}/settings`),
      loadFormTemplates(),
    ]);
    if (!settings) {
      setEditError("No settings row for this user.");
      return;
    }
    const modes =
      Array.isArray(settings.taskModes) && settings.taskModes.length
        ? settings.taskModes
        : [settings.taskMode || "survey"];
    setEditModes(modes);
    toggleFormsFieldset(modes);
    renderFormPicker(templates, settings.formTemplateIds || []);
  } catch (err) {
    setEditError(err.message);
  }
}

function closeEditModal() {
  editingUserId = null;
  show($("editModal"), false);
}

function getEditModes() {
  const modes = Array.from(
    document.querySelectorAll("#editUserTaskTypes .chip.active")
  ).map((c) => c.dataset.mode);
  return modes.length ? modes : ["survey"];
}

function setEditModes(modes) {
  const set = new Set(modes && modes.length ? modes : ["survey"]);
  document
    .querySelectorAll("#editUserTaskTypes .chip")
    .forEach((c) => c.classList.toggle("active", set.has(c.dataset.mode)));
}

function setEditMessage(text) {
  const el = $("editModalMessage");
  if (!text) {
    show(el, false);
    return;
  }
  el.className = "alert alert-ok";
  el.textContent = text;
  show(el, true);
}

function setEditError(text) {
  const el = $("editModalError");
  if (!text) {
    show(el, false);
    return;
  }
  el.className = "alert alert-error";
  el.textContent = text;
  show(el, true);
}

async function saveEdit() {
  if (!editingUserId) return;
  setEditError("");
  setEditMessage("");

  const taskModes = getEditModes();
  // Form selection only matters if worker gets form/mix; else clear it.
  const needsForms =
    taskModes.includes("form") || taskModes.includes("mix");
  const formTemplateIds = needsForms ? getSelectedFormIds() : [];
  $("editModalSave").disabled = true;
  try {
    const data = await api(`/api/admin/users/${editingUserId}/settings`, {
      method: "PUT",
      body: JSON.stringify({ taskModes, formTemplateIds }),
    });
    setEditMessage("Saved.");
    await refreshStats();
    setTimeout(() => closeEditModal(), 600);
  } catch (err) {
    setEditError(err.message);
  } finally {
    $("editModalSave").disabled = false;
  }
}

document.querySelectorAll("#newUserTaskTypes .chip").forEach((chip) => {
  chip.addEventListener("click", () => toggleChip(chip));
});
document.querySelectorAll("#editUserTaskTypes .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    toggleChip(chip);
    toggleFormsFieldset(getEditModes());
  });
});
$("editFormsSelectAll").addEventListener("click", () => {
  document
    .querySelectorAll('#editFormsList input[type="checkbox"]')
    .forEach((el) => {
      el.checked = true;
    });
});
$("editFormsClear").addEventListener("click", () => {
  document
    .querySelectorAll('#editFormsList input[type="checkbox"]')
    .forEach((el) => {
      el.checked = false;
    });
});
document.querySelectorAll("#taskTypes .chip").forEach((chip) => {
  chip.addEventListener("click", () => setTaskType(chip.dataset.type));
});
["surveyCountInput", "formCountInput"].forEach((id) => {
  $(id).addEventListener("input", updateMixTotal);
});
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
$("masterResetBtn").addEventListener("click", masterReset);
$("logoutBtn").addEventListener("click", logout);
$("editModalClose").addEventListener("click", closeEditModal);
$("editModalCancel").addEventListener("click", closeEditModal);
$("editModalSave").addEventListener("click", saveEdit);

(async function init() {
  const user = await ensureAdmin();
  if (!user) return;
  setNewUserModes(["survey"]);
  setTaskType("survey");
  await refreshStats();
})();
