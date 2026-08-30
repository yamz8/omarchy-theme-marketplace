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

function previewPath(theme) {
  const path = String(theme?.preview?.detail || "");
  return /^assets\/img\/themes\/[A-Za-z0-9._-]+\.webp$/.test(path) ? path : "";
}

function paletteRows(theme) {
  const labels = {
    background: "Background",
    foreground: "Foreground",
    accent: "Accent",
    selection: "Selection",
    muted: "Muted",
    red: "Red",
    yellow: "Yellow",
    green: "Green",
    cyan: "Cyan",
    blue: "Blue",
    magenta: "Magenta",
  };
  return Object.entries(labels)
    .filter(([key]) => /^#[0-9a-f]{6}$/i.test(theme?.palette?.[key] || ""))
    .map(([key, label]) => `<div class="theme-palette-row"><dt>${label}</dt><dd><span class="theme-color-swatch" style="--swatch: ${escapeHtml(theme.palette[key])}" aria-hidden="true"></span><code>${escapeHtml(theme.palette[key])}</code></dd></div>`)
    .join("");
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
  return `<ul class="verification-status-list">
    <li><strong>Palette parsed.</strong> The root <code>colors.toml</code> contains the colors Omarchy needs.</li>
    <li><strong>${theme.backgroundCount} ${theme.backgroundCount === 1 ? "background" : "backgrounds"} found.</strong> Image assets under <code>backgrounds/</code> are available to the theme.</li>
    <li><strong>Omarchy command matched.</strong> This listing uses the same theme slug and install/set command convention as Omarchy.</li>
    ${ignored.length ? `<li><strong>${ignored.length} ${ignored.length === 1 ? "file is" : "files are"} ignored by installation.</strong> ${ignored.map((file) => `<code>${escapeHtml(file)}</code>`).join(", ")} ${ignored.length === 1 ? "is" : "are"} not copied by Omarchy's remote-theme installer.</li>` : ""}
  </ul>`;
}

function render(theme) {
  const preview = previewPath(theme);
  const sourceUrl = safeUrl(theme.sourceUrl);
  const repoUrl = safeUrl(theme.repo);
  const sourceLabel = theme.builtIn ? "Built in" : "Community";
  const installExplanation = theme.builtIn
    ? "This theme ships with Omarchy. The set command applies it directly; no repository is cloned."
    : "The install command clones the repository into your local Omarchy themes directory and applies the theme. It downloads the repository's current upstream branch, which can be newer than the commit inspected for this catalog entry.";
  const licenseWarning = theme.license === "Not declared"
    ? " The upstream repository does not currently declare a license, so review its terms before reusing or redistributing its assets."
    : "";

  document.title = `${theme.name} | Omarchy Themes`;
  document.querySelector("#crumb-name").textContent = theme.name;
  document.querySelector("#aside-source").textContent = sourceLabel;
  document.querySelector("#aside-mode").textContent = theme.mode;
  document.querySelector("#aside-license").textContent = theme.license;
  document.querySelector("#aside-owner").textContent = theme.author;
  document.querySelector("#aside-checked").textContent = formatDate(theme.checkedAt);

  content.innerHTML = `<article class="theme-detail-article" style="--card-accent: ${escapeHtml(theme.accent)}">
    <header class="page-header" id="overview">
      <div class="page-eyebrow">${sourceLabel} · ${escapeHtml(theme.kind)}</div>
      <div class="detail-title"><span class="detail-icon" aria-hidden="true">${escapeHtml(theme.name.slice(0, 2).toUpperCase())}</span><h1>${escapeHtml(theme.name)}</h1></div>
      <div class="page-meta"><span>by ${escapeHtml(theme.author)}</span><span>${escapeHtml(theme.backgroundCount)} ${theme.backgroundCount === 1 ? "background" : "backgrounds"}</span><span>${escapeHtml(theme.mode)} mode</span></div>
    </header>
    <p class="detail-description">${escapeHtml(theme.description)}</p>
    ${preview ? `<button class="detail-preview" type="button" data-open-preview aria-label="Open ${escapeHtml(theme.name)} preview"><img src="${escapeHtml(preview)}" alt="${escapeHtml(theme.name)} theme preview" width="1600" height="900"></button>` : ""}
    <div class="theme-tags">${(theme.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>

    <section class="detail-section" id="palette"><h2>Palette</h2><p>Core colors read from the theme's <code>colors.toml</code>.</p><dl class="theme-palette-table">${paletteRows(theme)}</dl></section>
    <section class="detail-section" id="install"><h2>${theme.builtIn ? "Set theme" : "Install theme"}</h2><p>${installExplanation}</p>${commandPanel(theme)}</section>
    <section class="detail-section" id="compatibility"><h2>Omarchy compatibility</h2><p>The catalog checks theme structure without executing repository code.</p>${compatibilityList(theme)}</section>
    <section class="detail-section" id="terms"><h2>Trust &amp; source</h2><p>This compatibility check is not a security review or maintainer endorsement. Inspect the repository and its exact catalog snapshot before installing.${licenseWarning}</p><div class="detail-source-actions">${sourceUrl ? `<a class="button primary" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">Inspected source ↗</a>` : ""}${repoUrl ? `<a class="button" href="${escapeHtml(repoUrl)}" target="_blank" rel="noreferrer">Current repository ↗</a>` : ""}</div></section>
  </article>`;

  content.querySelector("[data-copy-command]")?.addEventListener("click", async (event) => {
    try {
      await copyCommand(event.currentTarget.dataset.copyCommand, event.currentTarget);
    } catch {
      document.querySelector("#toast").textContent = "Copy failed — select the command manually";
      document.querySelector("#toast").classList.add("show");
    }
  });

  const previewButton = content.querySelector("[data-open-preview]");
  if (previewButton) {
    previewButton.addEventListener("click", () => {
      const dialog = document.querySelector("#preview-lightbox");
      dialog.innerHTML = `<button class="lightbox-close" type="button" aria-label="Close preview">×</button><img class="lightbox-img" src="${escapeHtml(preview)}" alt="${escapeHtml(theme.name)} theme preview">`;
      dialog.showModal();
      dialog.querySelector(".lightbox-close").addEventListener("click", () => dialog.close());
    });
  }
}

setupThemeToggle();

try {
  const catalog = await loadCatalog();
  const theme = catalog.themes.find((candidate) => candidate.id === themeId);
  if (!theme) throw new Error("Theme not found");
  render(theme);
} catch {
  content.hidden = true;
  errorState.hidden = false;
  document.querySelector("#crumb-name").textContent = "Not found";
}
