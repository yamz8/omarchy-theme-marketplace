import {
  copyCommand,
  escapeHtml,
  formatDate,
  loadCatalog,
  safeUrl,
  setupThemeToggle,
  themeCommand,
} from "./shared.js?v=20260831-02";

const content = document.querySelector("#detail-content");
const errorState = document.querySelector("#detail-error");
const themeId = new URLSearchParams(window.location.search).get("id") || "";
const hexColorPattern = /^#[0-9a-f]{6}$/i;

function previewPath(theme, variant = "detail") {
  const path = String(theme?.preview?.[variant] || "");
  return /^assets\/img\/themes\/[A-Za-z0-9._-]+\.webp$/.test(path) ? path : "";
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

function render(theme, themes) {
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
    </header>
    <p class="detail-description">${escapeHtml(theme.description)}</p>
    ${preview ? `<button class="detail-preview" type="button" data-open-preview aria-label="Open ${escapeHtml(theme.name)} preview"><img src="${escapeHtml(preview)}" alt="${escapeHtml(theme.name)} theme preview" width="1600" height="900"></button>` : ""}
    <div class="theme-tags">${(theme.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>

    <section class="detail-section" id="palette"><h2>Palette</h2><p>Colors resolved from the theme's root <code>colors.toml</code>, using the same fallback relationships as Omarchy.</p>${paletteMarkup(theme)}</section>
    <section class="detail-section" id="install"><h2>${theme.builtIn ? "Set theme" : "Install theme"}</h2><p>${escapeHtml(installExplanation)}</p><div class="install-location"><span>Local theme path</span><code>${escapeHtml(installedPath)}</code></div>${commandPanel(theme)}</section>
    <section class="detail-section" id="compatibility"><h2>Omarchy compatibility</h2><p>The catalog checks theme structure and palette data without executing repository code.</p>${compatibilityList(theme)}</section>
    <section class="detail-section" id="source"><h2>Trust &amp; source</h2><div class="trust-notice"><strong>Compatibility is not a security review.</strong><p>Inspect the source before installing. The catalog evidence describes one exact snapshot; ${theme.builtIn ? "your locally installed Omarchy package may contain a different revision" : "the install command downloads current mutable upstream"}.${licenseWarning}</p></div>${sourceTrace(theme)}</section>
    <section class="detail-section" id="related"><h2>Related palettes</h2><p>Other ${escapeHtml(theme.mode)} themes with the closest core palette values.</p><div class="related-theme-grid">${related.map(relatedThemeCard).join("")}</div></section>
  </article>`;

  content.querySelector("[data-copy-command]")?.addEventListener("click", async (event) => {
    try {
      await copyCommand(event.currentTarget.dataset.copyCommand, event.currentTarget);
    } catch {
      const toast = document.querySelector("#toast");
      toast.textContent = "Copy failed — select the command manually";
      toast.classList.add("show");
    }
  });

  const previewButton = content.querySelector("[data-open-preview]");
  if (previewButton) {
    previewButton.addEventListener("click", () => {
      const dialog = document.querySelector("#preview-lightbox");
      dialog.innerHTML = `<button class="lightbox-close" type="button" aria-label="Close preview">×</button><img class="lightbox-img" src="${escapeHtml(preview)}" alt="${escapeHtml(theme.name)} theme preview">`;
      dialog.showModal();
      dialog.querySelector(".lightbox-close").addEventListener("click", () => dialog.close());
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      }, { once: true });
    });
  }
}

setupThemeToggle();

try {
  const catalog = await loadCatalog();
  const theme = catalog.themes.find((candidate) => candidate.id === themeId);
  if (!theme) throw new Error("Theme not found");
  render(theme, catalog.themes);
} catch {
  content.hidden = true;
  errorState.hidden = false;
  document.querySelector("#crumb-name").textContent = "Not found";
}
