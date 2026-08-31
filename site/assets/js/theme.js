import {
  copyCommand,
  engagementSummary,
  escapeHtml,
  formatDate,
  hidePendingEngagement,
  loadCatalog,
  safeUrl,
  setupThemeToggle,
  themeCommand,
  themeHeartButton,
  updateEngagementSummary,
  updateThemeHeart,
} from "./shared.js?v=20260831-03";
import {
  engagementApiBaseUrl,
  hasThemeHeart,
  loadEngagementStats,
  recordThemeCopy,
  recordThemeHeart,
  recordThemeView,
} from "./engagement.js?v=20260831-01";

const content = document.querySelector("#detail-content");
const errorState = document.querySelector("#detail-error");
const themeId = new URLSearchParams(window.location.search).get("id") || "";
const hexColorPattern = /^#[0-9a-f]{6}$/i;

function previewPath(theme, variant = "detail") {
  const path = String(theme?.preview?.[variant] || "");
  return /^assets\/img\/themes\/[A-Za-z0-9._-]+\.webp$/.test(path) ? path : "";
}

function wallpaperPath(wallpaper, variant = "detail") {
  const path = String(wallpaper?.[variant] || "");
  return /^assets\/img\/themes\/[A-Za-z0-9._-]+\.webp$/.test(path) ? path : "";
}

function wallpaperName(wallpaper, index) {
  const fileName = String(wallpaper?.sourcePath || "").split("/").at(-1) || `wallpaper-${index + 1}`;
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/^\d+\s+/, "").trim() || `Wallpaper ${index + 1}`;
}

function themeWallpapers(theme) {
  if (!Array.isArray(theme?.wallpapers)) return [];
  return theme.wallpapers
    .map((wallpaper, index) => ({
      detail: wallpaperPath(wallpaper),
      thumbnail: wallpaperPath(wallpaper, "thumbnail"),
      name: wallpaperName(wallpaper, index),
    }))
    .filter((wallpaper) => wallpaper.detail && wallpaper.thumbnail);
}

const paletteGroups = Object.freeze([
  ["Interface", [
    ["background", "Background"], ["foreground", "Foreground"], ["accent", "Accent"],
    ["selection", "Selection"], ["selection_foreground", "Selection text"], ["muted", "Muted"],
  ]],
  ["ANSI colors", [
    ["red", "Red"], ["yellow", "Yellow"], ["orange", "Orange"], ["green", "Green"],
    ["cyan", "Cyan"], ["blue", "Blue"], ["magenta", "Magenta"], ["brown", "Brown"],
  ]],
  ["Extended", [
    ["dark_background", "Dark background"], ["darker_background", "Darker background"],
    ["lighter_background", "Lighter background"], ["dark_foreground", "Dark foreground"],
    ["light_foreground", "Light foreground"], ["bright_foreground", "Bright foreground"],
    ["bright_red", "Bright red"], ["bright_yellow", "Bright yellow"],
    ["bright_green", "Bright green"], ["bright_cyan", "Bright cyan"],
    ["bright_blue", "Bright blue"], ["bright_magenta", "Bright magenta"],
  ]],
]);

function paletteRows(theme, definitions) {
  return definitions
    .filter(([key]) => hexColorPattern.test(theme?.palette?.[key] || ""))
    .map(([key, label]) => `<div class="theme-palette-row"><dt>${label}</dt><dd><span class="theme-color-swatch" style="--swatch: ${escapeHtml(theme.palette[key])}" aria-hidden="true"></span><code>${escapeHtml(theme.palette[key])}</code></dd></div>`)
    .join("");
}

function paletteMarkup(theme) {
  const bandKeys = ["background", "foreground", "accent", "red", "yellow", "green", "cyan", "blue", "magenta"];
  const band = bandKeys
    .filter((key) => hexColorPattern.test(theme?.palette?.[key] || ""))
    .map((key) => `<span style="--swatch: ${escapeHtml(theme.palette[key])}" title="${escapeHtml(key)} ${escapeHtml(theme.palette[key])}"></span>`)
    .join("");
  const groups = paletteGroups
    .map(([label, definitions]) => {
      const rows = paletteRows(theme, definitions);
      return rows ? `<section class="theme-palette-group"><h3>${label}</h3><dl class="theme-palette-table">${rows}</dl></section>` : "";
    })
    .join("");
  return `<div class="detail-palette-band" aria-label="${escapeHtml(theme.name)} palette">${band}</div><div class="theme-palette-groups">${groups}</div>`;
}

function wallpaperGallery(theme) {
  const wallpapers = themeWallpapers(theme);
  if (!wallpapers.length) return "";
  const first = wallpapers[0];
  const stepDisabled = wallpapers.length === 1 ? " disabled" : "";
  const truncation = theme.wallpaperGalleryTruncated
    ? `<p class="wallpaper-limit-note">Showing the first ${wallpapers.length} of ${escapeHtml(theme.backgroundCount)} wallpapers.</p>`
    : "";
  const thumbnails = wallpapers.map((wallpaper, index) => `<button class="wallpaper-thumbnail" type="button" role="listitem" data-wallpaper-index="${index}" aria-label="Show wallpaper ${index + 1}: ${escapeHtml(wallpaper.name)}" aria-pressed="${index === 0}" tabindex="${index === 0 ? "0" : "-1"}">
    <img src="${escapeHtml(wallpaper.thumbnail)}" alt="" width="320" height="180" loading="lazy"><span aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
  </button>`).join("");
  return `<section class="detail-section theme-wallpaper-section" id="wallpapers">
    <div class="wallpaper-section-head">
      <div><h2>Wallpapers</h2><p>Browse the background images included in the exact inspected theme snapshot.</p></div>
      <output class="wallpaper-position" data-wallpaper-position aria-live="polite" aria-atomic="true">1 / ${wallpapers.length}</output>
    </div>
    <div class="wallpaper-viewer" data-wallpaper-viewer data-wallpaper-count="${wallpapers.length}">
      <button class="wallpaper-stage" type="button" data-open-wallpaper aria-label="Open wallpaper 1 of ${wallpapers.length}: ${escapeHtml(first.name)}">
        <img src="${escapeHtml(first.detail)}" alt="${escapeHtml(theme.name)} wallpaper 1: ${escapeHtml(first.name)}" width="1920" height="1080" draggable="false">
      </button>
      <div class="wallpaper-controls">
        <button class="wallpaper-step" type="button" data-wallpaper-previous${stepDisabled}>Previous</button>
        <span class="wallpaper-name" data-wallpaper-name>${escapeHtml(first.name)}</span>
        <button class="wallpaper-step" type="button" data-wallpaper-next${stepDisabled}>Next</button>
      </div>
      <div class="wallpaper-thumbnails" role="list" aria-label="${escapeHtml(theme.name)} wallpapers">${thumbnails}</div>
    </div>
    ${truncation}
  </section>`;
}

function commandPanel(theme) {
  const command = themeCommand(theme);
  const label = theme.builtIn ? "Set built-in theme" : "Install community theme";
  return `<div class="command-panel">
    <div class="command-panel-head"><span>${label}</span><button class="copy-button" type="button" data-copy-command="${escapeHtml(command)}" data-source-type="${escapeHtml(theme.sourceType)}" data-copy-label-default="Copy"><span class="copy-icon" aria-hidden="true"></span><span data-copy-label>Copy</span></button></div>
    <pre><span class="prompt">$</span> <code>${escapeHtml(command)}</code></pre>
  </div>`;
}

function compatibilityList(theme) {
  const ignored = Array.isArray(theme.ignoredFiles) ? theme.ignoredFiles : [];
  const remoteIgnored = !theme.builtIn && ignored.length
    ? `<li><strong>${ignored.length} unsupported root ${ignored.length === 1 ? "file is" : "files are"} excluded.</strong> ${ignored.map((file) => `<code>${escapeHtml(file)}</code>`).join(", ")} ${ignored.length === 1 ? "is" : "are"} not copied by Omarchy's remote-theme installer.</li>`
    : "";
  return `<ul class="verification-status-list">
    <li><strong>Palette parsed.</strong> The root <code>colors.toml</code> resolves the required interface and ANSI colors.</li>
    <li><strong>${escapeHtml(theme.backgroundCount)} ${theme.backgroundCount === 1 ? "wallpaper" : "wallpapers"} found.</strong> Supported images under <code>backgrounds/</code> are included in the theme.</li>
    <li><strong>Installed slug resolved to <code>${escapeHtml(theme.slug)}</code>.</strong> The command and local directory match Omarchy's naming convention.</li>
    <li><strong>Static inspection passed.</strong> The catalog read repository files at one exact commit without executing them.</li>
    ${remoteIgnored}
  </ul>`;
}

function rgb(color) {
  if (!hexColorPattern.test(color || "")) return [0, 0, 0];
  return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
}

function paletteDistance(first, second) {
  const keys = ["background", "foreground", "accent", "red", "blue", "magenta"];
  return keys.reduce((total, key) => {
    const one = rgb(first?.palette?.[key]);
    const two = rgb(second?.palette?.[key]);
    return total + one.reduce((distance, channel, index) => distance + ((channel - two[index]) ** 2), 0);
  }, 0);
}

function relatedThemes(theme, themes) {
  return themes
    .filter((candidate) => candidate.id !== theme.id && candidate.mode === theme.mode)
    .sort((first, second) => paletteDistance(theme, first) - paletteDistance(theme, second))
    .slice(0, 3);
}

function relatedThemeCard(theme) {
  const colors = ["background", "accent", "foreground", "red", "blue", "magenta"]
    .filter((key) => hexColorPattern.test(theme?.palette?.[key] || ""))
    .map((key) => `<span style="--swatch: ${escapeHtml(theme.palette[key])}"></span>`)
    .join("");
  return `<a class="related-theme-card" href="theme.html?id=${encodeURIComponent(theme.id)}">
    <span class="related-theme-source">${theme.builtIn ? "Built in" : "Community"}</span>
    <strong>${escapeHtml(theme.name)}</strong>
    <span class="related-theme-author">by ${escapeHtml(theme.author)}</span>
    <span class="related-theme-palette" aria-label="${escapeHtml(theme.name)} palette">${colors}</span>
  </a>`;
}

function sourceTrace(theme) {
  const sourceUrl = safeUrl(theme.sourceUrl);
  const repoUrl = safeUrl(theme.repo);
  const commitUrl = repoUrl && /^[0-9a-f]{40}$/i.test(theme.checkedCommit || "")
    ? `${repoUrl.replace(/\/$/, "")}/commit/${encodeURIComponent(theme.checkedCommit)}`
    : "";
  return `<dl class="source-trace">
    <div><dt>Repository</dt><dd>${repoUrl ? `<a href="${escapeHtml(repoUrl)}" target="_blank" rel="noreferrer">${escapeHtml(theme.repo.replace("https://github.com/", ""))} ↗</a>` : "Unknown"}</dd></div>
    <div><dt>Catalog snapshot</dt><dd>${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">Exact theme source ↗</a>` : "Unknown"}</dd></div>
    <div><dt>Branch</dt><dd><code>${escapeHtml(theme.checkedBranch || "Unknown")}</code></dd></div>
    <div><dt>Commit</dt><dd>${commitUrl ? `<a href="${escapeHtml(commitUrl)}" target="_blank" rel="noreferrer"><code>${escapeHtml(theme.checkedCommit.slice(0, 12))}</code> ↗</a>` : `<code>${escapeHtml(theme.checkedCommit || "Unknown")}</code>`}</dd></div>
    <div><dt>Checked</dt><dd>${escapeHtml(formatDate(theme.checkedAt))}</dd></div>
    <div><dt>Upstream activity</dt><dd>${escapeHtml(formatDate(theme.repositoryUpdatedAt))}</dd></div>
    <div><dt>License</dt><dd>${escapeHtml(theme.license)}</dd></div>
  </dl>`;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 1_700);
}

function openPreviewDialog(src, alt) {
  const dialog = document.querySelector("#preview-lightbox");
  dialog.innerHTML = `<button class="lightbox-close" type="button" aria-label="Close preview">×</button><img class="lightbox-img" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`;
  dialog.showModal();
  dialog.querySelector(".lightbox-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  }, { once: true });
}

function setupWallpaperGallery(theme) {
  const wallpapers = themeWallpapers(theme);
  const viewer = content.querySelector("[data-wallpaper-viewer]");
  if (!viewer || !wallpapers.length) return;

  const stage = viewer.querySelector("[data-open-wallpaper]");
  const image = stage.querySelector("img");
  const position = content.querySelector("[data-wallpaper-position]");
  const name = viewer.querySelector("[data-wallpaper-name]");
  const previous = viewer.querySelector("[data-wallpaper-previous]");
  const next = viewer.querySelector("[data-wallpaper-next]");
  const thumbnails = [...viewer.querySelectorAll("[data-wallpaper-index]")];
  let activeIndex = 0;
  let pointerStart = null;
  let suppressOpen = false;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const showWallpaper = (requestedIndex, { focusThumbnail = false } = {}) => {
    activeIndex = (requestedIndex + wallpapers.length) % wallpapers.length;
    const wallpaper = wallpapers[activeIndex];
    image.src = wallpaper.detail;
    image.alt = `${theme.name} wallpaper ${activeIndex + 1}: ${wallpaper.name}`;
    stage.setAttribute("aria-label", `Open wallpaper ${activeIndex + 1} of ${wallpapers.length}: ${wallpaper.name}`);
    position.textContent = `${activeIndex + 1} / ${wallpapers.length}`;
    name.textContent = wallpaper.name;
    thumbnails.forEach((thumbnail, index) => {
      const selected = index === activeIndex;
      thumbnail.setAttribute("aria-pressed", String(selected));
      thumbnail.tabIndex = selected ? 0 : -1;
      if (selected) {
        thumbnail.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest", inline: "nearest" });
        if (focusThumbnail) thumbnail.focus();
      }
    });
  };

  previous.addEventListener("click", () => showWallpaper(activeIndex - 1));
  next.addEventListener("click", () => showWallpaper(activeIndex + 1));
  thumbnails.forEach((thumbnail) => {
    thumbnail.addEventListener("click", () => showWallpaper(Number(thumbnail.dataset.wallpaperIndex)));
  });
  viewer.addEventListener("keydown", (event) => {
    const keyActions = {
      ArrowLeft: () => showWallpaper(activeIndex - 1, { focusThumbnail: event.target.matches("[data-wallpaper-index]") }),
      ArrowRight: () => showWallpaper(activeIndex + 1, { focusThumbnail: event.target.matches("[data-wallpaper-index]") }),
      Home: () => showWallpaper(0, { focusThumbnail: event.target.matches("[data-wallpaper-index]") }),
      End: () => showWallpaper(wallpapers.length - 1, { focusThumbnail: event.target.matches("[data-wallpaper-index]") }),
    };
    if (!keyActions[event.key]) return;
    event.preventDefault();
    keyActions[event.key]();
  });
  stage.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse") pointerStart = event.clientX;
  });
  stage.addEventListener("pointerup", (event) => {
    if (pointerStart === null) return;
    const distance = event.clientX - pointerStart;
    pointerStart = null;
    if (Math.abs(distance) < 48) return;
    suppressOpen = true;
    showWallpaper(activeIndex + (distance < 0 ? 1 : -1));
    window.setTimeout(() => { suppressOpen = false; }, 0);
  });
  stage.addEventListener("pointercancel", () => { pointerStart = null; });
  stage.addEventListener("click", () => {
    if (suppressOpen) {
      suppressOpen = false;
      return;
    }
    const wallpaper = wallpapers[activeIndex];
    openPreviewDialog(wallpaper.detail, `${theme.name} wallpaper ${activeIndex + 1}: ${wallpaper.name}`);
  });
}

function render(theme, themes, {
  engagementEnabled = false,
  engagement = {},
  pendingEngagement = false,
  onCopy = async () => {},
  onHeart = async () => {},
} = {}) {
  const preview = previewPath(theme);
  const sourceLabel = theme.builtIn ? "Built in" : "Community";
  const installedPath = theme.builtIn
    ? `/usr/share/omarchy/themes/${theme.slug}`
    : `~/.config/omarchy/themes/${theme.slug}`;
  const installExplanation = theme.builtIn
    ? `This theme ships with Omarchy under ${installedPath}. The set command activates it directly; no repository is cloned.`
    : `The install command clones the current upstream repository into ${installedPath} and immediately applies it. Current upstream can be newer than the exact commit inspected for this catalog entry.`;
  const licenseWarning = theme.license === "Not declared"
    ? " The upstream repository does not currently declare a license, so review its terms before reusing or redistributing its assets."
    : "";
  const related = relatedThemes(theme, themes);

  document.title = `${theme.name} | Omarchy Themes`;
  document.querySelector("#crumb-name").textContent = theme.name;
  document.querySelector("#aside-source").textContent = sourceLabel;
  document.querySelector("#aside-mode").textContent = theme.mode;
  document.querySelector("#aside-slug").textContent = theme.slug;
  document.querySelector("#aside-branch").textContent = theme.checkedBranch || "Unknown";
  document.querySelector("#aside-commit").textContent = theme.checkedCommit?.slice(0, 8) || "Unknown";
  document.querySelector("#aside-license").textContent = theme.license;
  document.querySelector("#aside-owner").textContent = theme.author;
  document.querySelector("#aside-checked").textContent = formatDate(theme.checkedAt);

  content.innerHTML = `<article class="theme-detail-article" style="--card-accent: ${escapeHtml(theme.accent)}">
    <header class="page-header" id="overview">
      <div class="page-eyebrow">${sourceLabel} · ${escapeHtml(theme.kind)}</div>
      <div class="detail-title"><span class="detail-icon" aria-hidden="true">${escapeHtml(theme.name.slice(0, 2).toUpperCase())}</span><h1>${escapeHtml(theme.name)}</h1></div>
      <div class="page-meta"><span>by ${escapeHtml(theme.author)}</span><span>${escapeHtml(theme.backgroundCount)} ${theme.backgroundCount === 1 ? "wallpaper" : "wallpapers"}</span><span>${escapeHtml(theme.mode)} mode</span><span><code>${escapeHtml(theme.slug)}</code></span></div>
      ${engagementEnabled ? `<div class="detail-engagement-cluster">${engagementSummary(theme, engagement, { detail: true, pending: pendingEngagement })}${themeHeartButton(theme, engagement, { detail: true, hearted: hasThemeHeart(theme.id), pending: pendingEngagement })}</div>` : ""}
    </header>
    <p class="detail-description">${escapeHtml(theme.description)}</p>
    ${preview ? `<button class="detail-preview" type="button" data-open-preview aria-label="Open ${escapeHtml(theme.name)} preview"><img src="${escapeHtml(preview)}" alt="${escapeHtml(theme.name)} theme preview" width="1600" height="900"></button>` : ""}
    <div class="theme-tags">${(theme.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>

    ${wallpaperGallery(theme)}
    <section class="detail-section" id="palette"><h2>Palette</h2><p>Colors resolved from the theme's root <code>colors.toml</code>, using the same fallback relationships as Omarchy.</p>${paletteMarkup(theme)}</section>
    <section class="detail-section" id="install"><h2>${theme.builtIn ? "Set theme" : "Install theme"}</h2><p>${escapeHtml(installExplanation)}</p><div class="install-location"><span>Local theme path</span><code>${escapeHtml(installedPath)}</code></div>${commandPanel(theme)}</section>
    <section class="detail-section" id="compatibility"><h2>Omarchy compatibility</h2><p>The catalog checks theme structure and palette data without executing repository code.</p>${compatibilityList(theme)}</section>
    <section class="detail-section" id="source"><h2>Trust &amp; source</h2><div class="trust-notice"><strong>Compatibility is not a security review.</strong><p>Inspect the source before installing. The catalog evidence describes one exact snapshot; ${theme.builtIn ? "your locally installed Omarchy package may contain a different revision" : "the install command downloads current mutable upstream"}.${licenseWarning}</p></div>${sourceTrace(theme)}</section>
    <section class="detail-section" id="related"><h2>Related palettes</h2><p>Other ${escapeHtml(theme.mode)} themes with the closest core palette values.</p><div class="related-theme-grid">${related.map(relatedThemeCard).join("")}</div></section>
  </article>`;

  content.querySelector("[data-copy-command]")?.addEventListener("click", async (event) => {
    try {
      if (await copyCommand(event.currentTarget.dataset.copyCommand, event.currentTarget)) await onCopy();
    } catch {
      const toast = document.querySelector("#toast");
      toast.textContent = "Copy failed — select the command manually";
      toast.classList.add("show");
    }
  });

  const heartButton = content.querySelector("[data-theme-heart]");
  heartButton?.addEventListener("click", () => onHeart(heartButton));

  const previewButton = content.querySelector("[data-open-preview]");
  if (previewButton) {
    previewButton.addEventListener("click", () => {
      openPreviewDialog(preview, `${theme.name} theme preview`);
    });
  }
  setupWallpaperGallery(theme);
}

setupThemeToggle();

try {
  const catalog = await loadCatalog();
  const theme = catalog.themes.find((candidate) => candidate.id === themeId);
  if (!theme) throw new Error("Theme not found");
  const engagementEnabled = Boolean(engagementApiBaseUrl());
  let engagement = { views: 0, copies: 0, hearts: 0 };
  let engagementLoaded = false;

  const applyEngagement = (result, { animateHeart = false } = {}) => {
    if (!result?.recorded || !result.stats) return;
    engagement = {
      views: Math.max(engagement.views, result.stats.views),
      copies: Math.max(engagement.copies, result.stats.copies),
      hearts: Math.max(engagement.hearts, result.stats.hearts),
    };
    engagementLoaded = true;
    const cluster = content.querySelector(".detail-engagement-cluster");
    if (cluster) cluster.hidden = false;
    updateEngagementSummary(document, theme.id, engagement);
    updateThemeHeart(document, theme.id, engagement, {
      animate: animateHeart,
      hearted: hasThemeHeart(theme.id),
    });
  };

  render(theme, catalog.themes, {
    engagementEnabled,
    engagement,
    pendingEngagement: engagementEnabled,
    onCopy: async () => applyEngagement(await recordThemeCopy(theme.id)),
    onHeart: async (button) => {
      if (button.getAttribute("aria-disabled") === "true" || button.dataset.heartSubmitting === "true") return;
      button.dataset.heartSubmitting = "true";
      button.setAttribute("aria-busy", "true");
      const result = await recordThemeHeart(theme.id);
      delete button.dataset.heartSubmitting;
      button.removeAttribute("aria-busy");
      if (!result?.recorded) {
        showToast("Heart could not be sent. Try again.");
        return;
      }
      applyEngagement(result, { animateHeart: true });
      showToast("Heart sent");
    },
  });

  if (engagementEnabled) {
    loadEngagementStats().then((stats) => {
      const loaded = stats[theme.id] || { views: 0, copies: 0, hearts: 0 };
      engagement = {
        views: Math.max(engagement.views, loaded.views),
        copies: Math.max(engagement.copies, loaded.copies),
        hearts: Math.max(engagement.hearts, loaded.hearts),
      };
      engagementLoaded = true;
      updateEngagementSummary(document, theme.id, engagement);
      updateThemeHeart(document, theme.id, engagement, { hearted: hasThemeHeart(theme.id) });
    }).catch(() => {
      if (!engagementLoaded) {
        hidePendingEngagement(document);
        const cluster = content.querySelector(".detail-engagement-cluster");
        if (cluster) cluster.hidden = true;
      }
    });
    recordThemeView(theme.id).then(applyEngagement);
  }
} catch {
  content.hidden = true;
  errorState.hidden = false;
  document.querySelector("#crumb-name").textContent = "Not found";
}
