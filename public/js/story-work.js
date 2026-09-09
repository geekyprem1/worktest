function $(id) {
  return document.getElementById(id);
}

function show(el, yes = true) {
  if (!el) return;
  el.classList.toggle("hidden", !yes);
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("hi-IN");
  } catch {
    return iso;
  }
}

let selectedFile = null;

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

function handleFilePicked(file) {
  if (!file) return;

  const MAX_SIZE = 4.5 * 1024 * 1024; // 4.5 MB (Vercel payload safe limit)
  const errEl = $("uploadAlertError");
  show(errEl, false);

  if (file.size > MAX_SIZE) {
    errEl.textContent = `फाइल का साइज बहुत बड़ा है (${formatBytes(file.size)})। कृपया 4.5 MB से कम साइज की ऑडियो फाइल चुनें।`;
    show(errEl, true);
    $("audioFileInput").value = "";
    return;
  }

  selectedFile = file;

  $("previewFileName").textContent = file.name;
  $("previewFileSize").textContent = `${formatBytes(file.size)} · ${file.type || "Audio"}`;

  const audioPlayer = $("previewAudioPlayer");
  try {
    audioPlayer.src = URL.createObjectURL(file);
  } catch (e) {
    // fallback
  }

  show($("filePreviewWrap"), true);
  show($("dropzoneEl"), false);
}

function clearFileSelection() {
  selectedFile = null;
  $("audioFileInput").value = "";
  const audioPlayer = $("previewAudioPlayer");
  audioPlayer.pause();
  audioPlayer.removeAttribute("src");
  audioPlayer.load();

  show($("filePreviewWrap"), false);
  show($("dropzoneEl"), true);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

async function handleUpload(e) {
  e.preventDefault();
  const okEl = $("uploadAlertOk");
  const errEl = $("uploadAlertError");
  const submitBtn = $("uploadSubmitBtn");

  show(okEl, false);
  show(errEl, false);

  if (!selectedFile) {
    errEl.textContent = "कृपया पहले एक ऑडियो फाइल चुनें।";
    show(errEl, true);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "अपलोड हो रहा है… कृपया प्रतीक्षा करें";

  try {
    const base64Data = await fileToBase64(selectedFile);
    const title = $("storyTitle").value.trim();

    const res = await fetch("/api/worker/upload-audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        fileName: selectedFile.name,
        mimeType: selectedFile.type || "audio/mpeg",
        fileSize: selectedFile.size,
        fileData: base64Data,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "अपलोड करने में त्रुटि हुई।");
    }

    okEl.textContent = "आपकी ऑडियो फाइल सफलतापूर्वक अपलोड हो गई है!";
    show(okEl, true);

    $("storyTitle").value = "";
    clearFileSelection();
    await loadMyAudios();
  } catch (err) {
    errEl.textContent = err.message;
    show(errEl, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "⬆️ ऑडियो अपलोड करें (Upload Recording)";
  }
}

async function loadMyAudios() {
  const container = $("myAudiosList");
  if (!container) return;

  try {
    const res = await fetch("/api/worker/my-audios");
    const data = await res.json().catch(() => ({}));
    const list = data.audios || [];

    if (!list.length) {
      container.innerHTML = `
        <div class="muted" style="text-align: center; padding: 24px;">
          आपने अभी तक कोई ऑडियो अपलोड नहीं किया है। ऊपर दिए गए बॉक्स से अपनी पहली रिकॉर्डिंग अपलोड करें।
        </div>
      `;
      return;
    }

    container.innerHTML = list
      .map(
        (a) => `
        <div class="audio-item-card">
          <div style="display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 6px;">
            <strong style="font-size: 1.05rem; color: var(--ink);">
              ${a.title ? a.title : a.fileName}
            </strong>
            <span class="muted" style="font-size: 0.82rem;">${formatDate(a.createdAt)}</span>
          </div>
          <div class="muted" style="font-size: 0.82rem; margin-top: -4px;">
            ${a.fileName} · ${formatBytes(a.fileSize)}
          </div>
          <audio src="${a.fileData}" controls style="width: 100%; margin-top: 6px;"></audio>
        </div>
      `
      )
      .join("");
  } catch (e) {
    container.innerHTML = `
      <div class="muted" style="text-align: center; color: var(--danger); padding: 16px;">
        ऑडियो सूची लोड करने में समस्या आई।
      </div>
    `;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = await checkAuth();
  if (!user) return;

  const fileInput = $("audioFileInput");
  const dropzone = $("dropzoneEl");

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFilePicked(e.target.files[0]);
    }
  });

  // Drag & drop
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFilePicked(e.dataTransfer.files[0]);
    }
  });

  $("clearFileBtn").addEventListener("click", clearFileSelection);
  $("audioUploadForm").addEventListener("submit", handleUpload);
  $("refreshMyAudiosBtn").addEventListener("click", loadMyAudios);

  await loadMyAudios();
});
