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
      window.location.href = "/?msg=session_expired";
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

  const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
  const errEl = $("uploadAlertError");
  show(errEl, false);

  if (file.size > MAX_SIZE) {
    errEl.textContent = `फाइल का साइज बहुत बड़ा है (${formatBytes(file.size)})। कृपया 50 MB से कम साइज की ऑडियो फाइल चुनें।`;
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
  const progressWrap = $("uploadProgressWrap");
  const progressBar = $("progressBarFill");
  const progressPercent = $("progressPercent");
  const progressStatus = $("progressStatusText");

  show(okEl, false);
  show(errEl, false);

  if (!selectedFile) {
    errEl.textContent = "कृपया पहले एक ऑडियो फाइल चुनें।";
    show(errEl, true);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "अपलोड की तैयारी हो रही है…";
  show(progressWrap, true);
  if (progressBar) progressBar.style.width = "0%";
  if (progressPercent) progressPercent.textContent = "0%";
  if (progressStatus) progressStatus.textContent = "कनेक्ट हो रहा है...";

  try {
    const title = $("storyTitle").value.trim();

    // 1. Request secure signed upload URL from backend
    const urlRes = await fetch("/api/worker/audio-upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: selectedFile.name,
        mimeType: selectedFile.type || "audio/mpeg",
        fileSize: selectedFile.size,
      }),
    });

    const urlData = await urlRes.json().catch(() => ({}));
    if (!urlRes.ok) {
      throw new Error(urlData.error || "अपलोड टोकन प्राप्त करने में त्रुटि हुई।");
    }

    let finalFileData = "";

    if (urlData.useSignedUrl && urlData.signedUrl) {
      // 2. Direct upload to Supabase Storage (bypasses Vercel 4.5MB limit, allows up to 50MB)
      if (progressStatus) progressStatus.textContent = `ऑडियो अपलोड हो रहा है (${formatBytes(selectedFile.size)})...`;

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", urlData.signedUrl, true);
        xhr.setRequestHeader("Content-Type", selectedFile.type || "audio/mpeg");

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const pct = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
            if (progressBar) progressBar.style.width = pct + "%";
            if (progressPercent) progressPercent.textContent = pct + "%";
            if (progressStatus) {
              progressStatus.textContent = `अपलोड हो रहा है: ${formatBytes(evt.loaded)} / ${formatBytes(evt.total)} (${pct}%)`;
            }
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(
              new Error(
                "स्टोरेज में अपलोड विफल रहा (Status: " + xhr.status + ")। कृपया दोबारा प्रयास करें।"
              )
            );
          }
        };

        xhr.onerror = () => {
          reject(new Error("इंटरनेट नेटवर्क त्रुटि: फाइल पूरी तरह अपलोड नहीं हो पाई।"));
        };

        xhr.send(selectedFile);
      });

      finalFileData = urlData.publicUrl;
      if (progressStatus) progressStatus.textContent = "रिकॉर्ड सुरक्षित किया जा रहा है...";
    } else {
      // Fallback if Supabase is not configured (e.g. offline dev)
      if (progressStatus) progressStatus.textContent = "फाइल प्रोसेस हो रही है...";
      finalFileData = await fileToBase64(selectedFile);
    }

    // 3. Save audio record in database
    const res = await fetch("/api/worker/upload-audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        fileName: selectedFile.name,
        mimeType: selectedFile.type || "audio/mpeg",
        fileSize: selectedFile.size,
        fileData: finalFileData,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "ऑडियो विवरण सेव करने में त्रुटि हुई।");
    }

    if (progressBar) progressBar.style.width = "100%";
    if (progressPercent) progressPercent.textContent = "100%";
    okEl.textContent = "आपकी ऑडियो फाइल (50 MB तक) सफलतापूर्वक अपलोड हो गई है!";
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
    setTimeout(() => {
      show(progressWrap, false);
    }, 2500);
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
        <div class="audio-item-card" style="padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; background: #fff; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 6px;">
            <strong style="font-size: 1.05rem; color: var(--ink);">
              ${a.title ? a.title : a.fileName}
            </strong>
            <span class="muted" style="font-size: 0.82rem;">${formatDate(a.createdAt)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
            <span class="muted" style="font-size: 0.84rem;">
              📁 ${a.fileName} · ${formatBytes(a.fileSize)}
            </span>
            <span style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.8rem; font-weight: 700; color: #16a34a; background: #dcfce7; padding: 4px 12px; border-radius: 20px;">
              ✓ सुरक्षित अपलोड (Submitted)
            </span>
          </div>
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

  // Heartbeat session monitor
  setInterval(async () => {
    try {
      const res = await fetch("/api/me");
      if (res.status === 401) {
        window.location.href = "/?msg=session_expired";
      }
    } catch {}
  }, 10000);
});
