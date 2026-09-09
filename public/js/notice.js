function $(id) {
  return document.getElementById(id);
}

function show(el, yes = true) {
  if (!el) return;
  el.classList.toggle("hidden", !yes);
}

function formatNoticeText(text) {
  if (!text) return "";
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Convert URLs to clickable links
  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" style="text-decoration: underline; color: #0f6b5c; font-weight: 600;">$1</a>'
  );
}

function getEmbedVideoHtml(url) {
  if (!url) return "";
  const trimmed = url.trim();
  // YouTube match (watch?v=, youtu.be/, embed/)
  const ytMatch = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i
  );
  if (ytMatch && ytMatch[1]) {
    return `<iframe src="https://www.youtube-nocookie.com/embed/${ytMatch[1]}" title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }
  // Direct video file
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(trimmed)) {
    return `<video src="${trimmed}" controls style="width: 100%; height: 100%; object-fit: contain;"></video>`;
  }
  // Generic embed URL
  if (/^https?:\/\//i.test(trimmed)) {
    return `<iframe src="${trimmed}" title="Media" allowfullscreen></iframe>`;
  }
  return "";
}

async function loadNotice() {
  try {
    const res = await fetch("/api/notice");
    const data = await res.json().catch(() => ({}));
    const notice = data.notice || {};

    // Hero image
    const heroWrap = $("noticeHeroWrap");
    const heroImg = $("noticeHeroImg");
    if (notice.bannerImageUrl) {
      heroImg.src = notice.bannerImageUrl;
      show(heroWrap, true);
    } else {
      show(heroWrap, false);
    }

    // Title
    const titleEl = $("noticeTitle");
    if (titleEl) {
      titleEl.textContent = notice.title || "विशेष सूचना";
      document.title = `${notice.title || "Special Notice"} — BS Tech Limited`;
    }

    // Body text
    const bodyEl = $("noticeBody");
    if (bodyEl) {
      bodyEl.innerHTML = formatNoticeText(notice.content || "");
    }

    // Call To Action Button / Hyperlink
    const ctaWrap = $("noticeCtaWrap");
    const ctaBtn = $("noticeCtaBtn");
    const ctaText = $("noticeCtaText");
    if (notice.actionUrl && notice.actionUrl.trim()) {
      ctaBtn.href = notice.actionUrl.trim();
      ctaText.textContent = notice.actionText && notice.actionText.trim()
        ? notice.actionText.trim()
        : "यहां क्लिक करें";
      show(ctaWrap, true);
    } else {
      show(ctaWrap, false);
    }

    // Video
    const videoWrap = $("noticeVideoWrap");
    if (videoWrap) {
      const videoHtml = getEmbedVideoHtml(notice.videoUrl);
      if (videoHtml) {
        videoWrap.innerHTML = videoHtml;
        show(videoWrap, true);
      } else {
        videoWrap.innerHTML = "";
        show(videoWrap, false);
      }
    }

    // Extra Images Gallery
    const galleryTitle = $("noticeGalleryTitle");
    const galleryWrap = $("noticeGalleryWrap");
    const images = Array.isArray(notice.extraImages)
      ? notice.extraImages.filter((img) => typeof img === "string" && img.trim().length > 0)
      : [];

    if (images.length > 0) {
      galleryWrap.innerHTML = images
        .map(
          (src) =>
            `<a href="${src}" target="_blank" rel="noopener noreferrer"><img src="${src}" alt="Notice Image" loading="lazy" /></a>`
        )
        .join("");
      show(galleryTitle, true);
      show(galleryWrap, true);
    } else {
      galleryWrap.innerHTML = "";
      show(galleryTitle, false);
      show(galleryWrap, false);
    }
  } catch (err) {
    const bodyEl = $("noticeBody");
    if (bodyEl) {
      bodyEl.textContent = "सूचना लोड करने में समस्या आई। कृपया पृष्ठ को रीफ्रेश करें।";
    }
  }
}

document.addEventListener("DOMContentLoaded", loadNotice);
