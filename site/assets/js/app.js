import {
  copyCommand,
  escapeHtml,
  formatCount,
  loadCatalog,
  paletteStyle,
  setupThemeToggle,
  themeCommand,
  themeCopyLabel,
} from "./shared.js?v=20260831-01";

const grid = document.querySelector("#theme-grid");
const emptyState = document.querySelector("#empty-state");
const count = document.querySelector("#theme-count");
const countLabel = document.querySelector("#theme-count-label");
const search = document.querySelector("#search-input");
const sort = document.querySelector("#sort-select");
const status = document.querySelector("#catalog-result-status");
const sourceButtons = [...document.querySelectorAll("[data-source]")];
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const state = { themes: [], query: "", source: "all", mode: "all", sort: "name" };

function previewPath(theme, variant = "card") {
  const path = String(theme?.preview?.[variant] || "");
  return /^assets\/img\/themes\/[A-Za-z0-9._-]+\.webp$/.test(path) ? path : "";
}

function paletteStrip(theme) {
  const keys = ["background", "foreground", "red", "yellow", "green", "cyan", "blue", "magenta"];
  return `<div class="theme-palette-strip" aria-label="${escapeHtml(theme.name)} color palette">${keys
    .filter((key) => /^#[0-9a-f]{6}$/i.test(theme?.palette?.[key] || ""))
    .map((key) => `<span style="--swatch: ${escapeHtml(theme.palette[key])}" title="${escapeHtml(key)} ${escapeHtml(theme.palette[key])}"></span>`)
    .join("")}</div>`;
}

function themeCard(theme) {
  const detailUrl = `theme.html?id=${encodeURIComponent(theme.id)}`;
  const preview = previewPath(theme);
  const command = themeCommand(theme);
  const copyLabel = themeCopyLabel(theme.sourceType);
  const sourceLabel = theme.builtIn ? "Built in" : "Community";
  const tags = [...new Set([theme.mode, ...(theme.tags || [])])].slice(0, 4);
  const previewMarkup = preview
    ? `<div class="theme-preview image-preview"><img src="${escapeHtml(preview)}" alt="${escapeHtml(theme.name)} theme preview" width="720" height="405" loading="lazy"></div>`
    : `<div class="theme-preview"><span class="theme-preview-mark" aria-hidden="true">${escapeHtml(theme.name.slice(0, 2).toUpperCase())}</span></div>`;

  return `<article class="theme-card${theme.builtIn ? " built-in-card" : ""}" style="${paletteStyle(theme)}">
    ${previewMarkup}
    <div class="theme-card-body">
      <div class="theme-card-content">
        <div class="theme-title-line">
          <h3>${escapeHtml(theme.name)}</h3>
          <span class="${theme.builtIn ? "builtin-badge" : "status-badge"}">${sourceLabel}</span>
        </div>
        <div class="theme-author">by ${escapeHtml(theme.author)}</div>
        <p class="theme-description">${escapeHtml(theme.description)}</p>
      </div>
      ${paletteStrip(theme)}
      <div class="theme-card-bottom">
        <div class="theme-tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
        <div class="theme-card-actions">
          ${theme.builtIn ? "" : `<span class="card-stars" title="GitHub stars"><svg class="social-glyph star-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>${formatCount(theme.stars)}</span>`}
          <button class="card-install" type="button" data-copy-command="${escapeHtml(command)}" data-source-type="${escapeHtml(theme.sourceType)}" aria-label="${escapeHtml(copyLabel)} for ${escapeHtml(theme.name)}">
            <span class="command-glyph" aria-hidden="true"></span><span data-copy-label>${escapeHtml(copyLabel)}</span><span class="copy-icon" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </div>
    <a class="theme-card-link" href="${detailUrl}" aria-label="View ${escapeHtml(theme.name)} theme details"></a>
  </article>`;
}

function matches(theme) {
  if (state.source !== "all" && theme.sourceType !== state.source) return false;
  if (state.mode !== "all" && theme.mode !== state.mode) return false;
  if (!state.query) return true;
  const haystack = [theme.name, theme.description, theme.author, theme.id, ...(theme.tags || [])]
    .join(" ")
    .toLowerCase();
  return state.query.split(/\s+/).every((term) => haystack.includes(term));
}

function compareThemes(first, second) {
  if (state.sort === "source") {
    return Number(second.builtIn) - Number(first.builtIn) || first.name.localeCompare(second.name);
  }
  if (state.sort === "updated") {
    return Date.parse(second.repositoryUpdatedAt || 0) - Date.parse(first.repositoryUpdatedAt || 0)
      || first.name.localeCompare(second.name);
  }
  if (state.sort === "stars") {
    return Number(second.stars || 0) - Number(first.stars || 0) || first.name.localeCompare(second.name);
  }
  return first.name.localeCompare(second.name);
}

function render() {
  const themes = state.themes.filter(matches).sort(compareThemes);
  grid.innerHTML = themes.map(themeCard).join("");
  grid.hidden = themes.length === 0;
  grid.setAttribute("aria-busy", "false");
  emptyState.hidden = themes.length !== 0;
  count.textContent = String(themes.length);
  countLabel.textContent = themes.length === 1 ? "theme" : "themes";
  status.textContent = `${themes.length} ${themes.length === 1 ? "theme" : "themes"} shown`;

  grid.querySelectorAll("[data-copy-command]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await copyCommand(button.dataset.copyCommand, button);
      } catch {
        status.textContent = "Could not copy the command. Select it from the theme detail page.";
      }
    });
  });
}

function selectFilter(buttons, active, key) {
  buttons.forEach((button) => {
    const selected = button === active;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  state[key] = active.dataset[key];
  render();
}

sourceButtons.forEach((button) => button.addEventListener("click", () => selectFilter(sourceButtons, button, "source")));
modeButtons.forEach((button) => button.addEventListener("click", () => selectFilter(modeButtons, button, "mode")));
search.addEventListener("input", () => {
  state.query = search.value.trim().toLowerCase();
  render();
});
sort.addEventListener("change", () => {
  state.sort = sort.value;
  render();
});
document.querySelector("#empty-reset").addEventListener("click", () => {
  search.value = "";
  state.query = "";
  selectFilter(sourceButtons, sourceButtons[0], "source");
  selectFilter(modeButtons, modeButtons[0], "mode");
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    search.focus();
  }
});

setupThemeToggle();

try {
  const catalog = await loadCatalog();
  state.themes = catalog.themes;
  render();
} catch (error) {
  grid.hidden = true;
  grid.setAttribute("aria-busy", "false");
  emptyState.hidden = false;
  emptyState.querySelector("h3").textContent = "Theme catalog unavailable";
  emptyState.querySelector("p").textContent = "Reload the page or try again later.";
  document.querySelector("#empty-reset").hidden = true;
  status.textContent = error.message;
}
