const letters = ["A", "B", "C", "D"];

let currentQueueId = null;
let selectedOption = null;
let cooldownInterval = null;
let pollInterval = null;

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

function formatMs(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusLabel(status) {
  switch (status) {
    case "complete":
      return "Complete";
    case "in_progress":
      return "In progress";
    case "partial":
      return "Partial";
    case "assigned":
      return "Assigned";
    default:
      return status || "—";
  }
}

function statusClass(status) {
  if (status === "complete") return "badge badge-ok";
  if (status === "in_progress" || status === "partial") return "badge badge-warn";
  return "badge";
}

function setStats(data) {
  $("statTotal").textContent = data.total ?? 0;
  $("statPending").textContent = data.pending ?? 0;
  $("statCompleted").textContent = data.completed ?? 0;
  $("statWorkDate").textContent = data.workDate
    ? formatDay(data.workDate)
    : "—";
  if ($("workDateLabel")) {
    $("workDateLabel").textContent = data.workDate
      ? formatDay(data.workDate)
      : "—";
  }

  const total = data.total || 0;
  const completed = data.completed || 0;
  $("progressText").textContent = `${completed} / ${total} completed`;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  $("progressFill").style.width = `${pct}%`;
}

function renderHistory(completedDays) {
  const body = $("historyBody");
  if (!completedDays || !completedDays.length) {
    body.innerHTML =
      '<tr><td colspan="4" class="muted">No completed dates yet. Finish a daily batch to see it here.</td></tr>';
    return;
  }

  body.innerHTML = "";
  completedDays.forEach((day) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${formatDay(day.date)}</strong><div class="muted mono">${day.date || ""}</div></td>
      <td>${day.completedCount ?? 0} / ${day.total ?? 0}</td>
      <td><span class="${statusClass(day.status)}">${statusLabel(day.status)}</span></td>
      <td>${formatDateTime(day.completedAt)}</td>
    `;
    body.appendChild(tr);
  });
}

function setDashMessage(text, type = "info") {
  const el = $("dashMessage");
  if (!text) {
    show(el, false);
    return;
  }
  el.className = `alert alert-${type}`;
  el.textContent = text;
  show(el, true);
}

function setWorkMessage(text, type = "info") {
  const el = $("workMessage");
  if (!text) {
    show(el, false);
    return;
  }
  el.className = `alert alert-${type}`;
  el.textContent = text;
  show(el, true);
}

function clearTimers() {
  if (cooldownInterval) {
    clearInterval(cooldownInterval);
    cooldownInterval = null;
  }
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function showDashboard() {
  clearTimers();
  show($("dashboardView"), true);
  show($("workView"), false);
  refreshStatus();
}

function showWork() {
  show($("dashboardView"), false);
  show($("workView"), true);
}

function renderOptions(options) {
  const list = $("optionsList");
  list.innerHTML = "";
  selectedOption = null;
  $("submitBtn").disabled = true;

  options.forEach((text, index) => {
    const label = document.createElement("label");
    label.className = "option";
    label.innerHTML = `
      <input type="radio" name="surveyOption" value="${index}" />
      <span class="option-letter">${letters[index] || index + 1}</span>
      <span class="option-text"></span>
    `;
    label.querySelector(".option-text").textContent = text;
    label.addEventListener("click", () => {
      selectedOption = index;
      list.querySelectorAll(".option").forEach((o) => o.classList.remove("selected"));
      label.classList.add("selected");
      label.querySelector("input").checked = true;
      $("submitBtn").disabled = false;
    });
    list.appendChild(label);
  });
}

function startCooldown(ms) {
  show($("surveyPanel"), false);
  show($("donePanel"), false);
  show($("cooldownPanel"), true);
  setWorkMessage(
    "Answer submitted. Waiting 1 minute for the next survey…",
    "warn"
  );

  let remaining = ms;
  $("cooldownTimer").textContent = formatMs(remaining);

  if (cooldownInterval) clearInterval(cooldownInterval);
  cooldownInterval = setInterval(() => {
    remaining -= 1000;
    if (remaining <= 0) {
      clearInterval(cooldownInterval);
      cooldownInterval = null;
      $("cooldownTimer").textContent = "0:00";
      loadCurrent();
      return;
    }
    $("cooldownTimer").textContent = formatMs(remaining);
  }, 1000);
}

async function ensureWorker() {
  try {
    const { user } = await api("/api/me");
    if (user.role !== "worker") {
      window.location.href = user.role === "admin" ? "/admin.html" : "/";
      return null;
    }
    $("workerName").textContent = user.name;
    return user;
  } catch {
    window.location.href = "/";
    return null;
  }
}

async function refreshStatus() {
  try {
    const data = await api("/api/worker/status");
    setStats(data);
    renderHistory(data.completedDays || []);

    if (data.total === 0) {
      setDashMessage(
        "No surveys for today yet. Ask the admin to generate today’s daily surveys.",
        "warn"
      );
      $("startWorkBtn").disabled = true;
    } else if (data.pending === 0) {
      setDashMessage(
        `All surveys complete for ${formatDay(data.workDate)}. Great job!`,
        "ok"
      );
      $("startWorkBtn").disabled = false;
    } else {
      setDashMessage(
        `${data.pending} survey(s) left for ${formatDay(data.workDate)}. Click Start Work.`,
        "info"
      );
      $("startWorkBtn").disabled = false;
    }
  } catch (err) {
    setDashMessage(err.message, "error");
  }
}

async function loadCurrent() {
  try {
    const data = await api("/api/worker/current");
    setStats(data);

    if (data.done) {
      show($("surveyPanel"), false);
      show($("cooldownPanel"), false);
      show($("donePanel"), true);
      setWorkMessage("Day finished.", "ok");
      return;
    }

    if (data.cooldown) {
      startCooldown(data.cooldownMs || 0);
      return;
    }

    show($("cooldownPanel"), false);
    show($("donePanel"), false);
    show($("surveyPanel"), true);
    setWorkMessage("", "info");

    currentQueueId = data.survey.queueId;
    $("surveyQuestion").textContent = data.survey.question;
    renderOptions(data.survey.options);
  } catch (err) {
    setWorkMessage(err.message, "error");
    show($("surveyPanel"), false);
    show($("cooldownPanel"), false);
  }
}

async function startWork() {
  try {
    const data = await api("/api/worker/start", { method: "POST", body: "{}" });
    setStats(data);
    showWork();

    if (data.done) {
      show($("surveyPanel"), false);
      show($("cooldownPanel"), false);
      show($("donePanel"), true);
      setWorkMessage(data.message || "All done.", "ok");
      return;
    }

    await loadCurrent();
  } catch (err) {
    setDashMessage(err.message, "error");
  }
}

async function submitAnswer() {
  if (currentQueueId == null || selectedOption == null) return;

  $("submitBtn").disabled = true;
  try {
    const data = await api("/api/worker/submit", {
      method: "POST",
      body: JSON.stringify({
        queueId: currentQueueId,
        selectedOption,
      }),
    });

    setStats(data);

    if (data.allDone) {
      show($("surveyPanel"), false);
      show($("cooldownPanel"), false);
      show($("donePanel"), true);
      setWorkMessage(
        `Last survey submitted. ${data.workDate || "Today"} is complete!`,
        "ok"
      );
      return;
    }

    startCooldown(data.cooldownMs || 60000);
  } catch (err) {
    if (err.status === 429 && err.data && err.data.cooldownMs) {
      startCooldown(err.data.cooldownMs);
      return;
    }
    setWorkMessage(err.message, "error");
    $("submitBtn").disabled = false;
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

$("logoutBtn").addEventListener("click", logout);
$("refreshBtn").addEventListener("click", refreshStatus);
$("startWorkBtn").addEventListener("click", startWork);
$("backDashBtn").addEventListener("click", showDashboard);
$("doneBackBtn").addEventListener("click", showDashboard);
$("submitBtn").addEventListener("click", submitAnswer);

(async function init() {
  const user = await ensureWorker();
  if (!user) return;
  await refreshStatus();
})();
