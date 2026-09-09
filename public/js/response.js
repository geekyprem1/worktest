function $(id) {
  return document.getElementById(id);
}

function show(el, yes = true) {
  if (!el) return;
  el.classList.toggle("hidden", !yes);
}

let selectedChoice = "yes";

function setChoice(choice) {
  selectedChoice = choice;
  const yesBtn = $("choiceYesBtn");
  const noBtn = $("choiceNoBtn");
  const textEl = $("responseText");

  if (choice === "yes") {
    yesBtn.style.borderColor = "var(--ok)";
    yesBtn.style.backgroundColor = "var(--ok-soft)";
    yesBtn.style.color = "var(--ok)";
    noBtn.style.borderColor = "var(--line)";
    noBtn.style.backgroundColor = "";
    noBtn.style.color = "";
    if (!textEl.value.trim() || textEl.value.trim() === "ना" || textEl.value.trim() === "ना, मैं यह काम नहीं करना चाहता।") {
      textEl.value = "हाँ";
    }
  } else if (choice === "no") {
    noBtn.style.borderColor = "var(--danger)";
    noBtn.style.backgroundColor = "var(--danger-soft)";
    noBtn.style.color = "var(--danger)";
    yesBtn.style.borderColor = "var(--line)";
    yesBtn.style.backgroundColor = "";
    yesBtn.style.color = "";
    if (!textEl.value.trim() || textEl.value.trim() === "हाँ" || textEl.value.trim() === "हाँ, मैं यह काम करना चाहता हूँ।") {
      textEl.value = "ना";
    }
  }
}

async function checkAuth() {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) {
      window.location.href = "/";
      return null;
    }
    const data = await res.json();
    return data.user;
  } catch {
    window.location.href = "/";
    return null;
  }
}

async function loadExistingResponse() {
  try {
    const res = await fetch("/api/worker/response");
    const data = await res.json().catch(() => ({}));
    if (data.ok && data.response) {
      const r = data.response;
      $("responseText").value = r.responseText || "";
      setChoice(r.choice === "no" ? "no" : "yes");

      const prevBox = $("prevStatusBox");
      const answerText = $("prevAnswerText");
      const answerTime = $("prevAnswerTime");

      answerText.textContent = `"${r.responseText}"`;
      if (r.updatedAt || r.submittedAt) {
        const d = new Date(r.updatedAt || r.submittedAt);
        answerTime.textContent = `सबमिट किया गया: ${d.toLocaleString("hi-IN")}`;
      }
      show(prevBox, true);
    } else {
      setChoice("yes");
    }
  } catch (e) {
    setChoice("yes");
  }
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const msgEl = $("submitMessage");
  const errEl = $("submitError");
  const btn = $("submitResponseBtn");

  show(msgEl, false);
  show(errEl, false);

  const text = $("responseText").value.trim();
  if (!text) {
    errEl.textContent = "कृपया अपना जवाब अवश्य लिखें (हाँ या ना)।";
    show(errEl, true);
    return;
  }

  btn.disabled = true;
  btn.textContent = "सबमिट हो रहा है…";

  try {
    const res = await fetch("/api/worker/response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        responseText: text,
        choice: selectedChoice,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "सबमिट करने में त्रुटि हुई।");
    }

    msgEl.textContent = "आपका जवाब सफलतापूर्वक दर्ज कर लिया गया है!";
    show(msgEl, true);

    // Update status box
    const prevBox = $("prevStatusBox");
    const answerText = $("prevAnswerText");
    const answerTime = $("prevAnswerTime");
    answerText.textContent = `"${text}"`;
    answerTime.textContent = `अभी अपडेट किया गया (${new Date().toLocaleTimeString("hi-IN")})`;
    show(prevBox, true);
  } catch (err) {
    errEl.textContent = err.message;
    show(errEl, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "जवाब सबमिट करें (Save Response)";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = await checkAuth();
  if (!user) return;

  $("choiceYesBtn").addEventListener("click", () => setChoice("yes"));
  $("choiceNoBtn").addEventListener("click", () => setChoice("no"));
  $("responseForm").addEventListener("submit", handleFormSubmit);

  await loadExistingResponse();
});
