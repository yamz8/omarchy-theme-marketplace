import {
  copyCommand,
  engagementSummary,
  escapeHtml,
  formatCount,
  hidePendingEngagement,
  loadCatalog,
  paletteStyle,
  safeUrl,
  setupThemeToggle,
  themeCommand,
  themeCopyLabel,
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
} from "./engagement.js?v=20260831-01";

const grid = document.querySelector("#theme-grid");
const emptyState = document.querySelector("#empty-state");
const count = document.querySelector("#theme-count");
const countLabel = document.querySelector("#theme-count-label");
const search = document.querySelector("#search-input");
const sort = document.querySelector("#sort-select");
const status = document.querySelector("#catalog-result-status");
const sourceButtons = [...document.querySelectorAll("[data-source]")];
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const wallpaperButtons = [...document.querySelectorAll("[data-wallpapers]")];
const state = {
  themes: [],
  query: "",
  source: "all",
  mode: "all",
  wallpapers: "all",
  sort: "name",
  engagement: {},
  engagementEnabled: false,
  engagementLoaded: false,
};

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
  const copyLabel = theme.builtIn ? "Set" : "Install";
  const copyAccessibleLabel = themeCopyLabel(theme.sourceType);
  const sourceUrl = safeUrl(theme.sourceUrl);
  const sourceAction = sourceUrl
    ? `<a class="card-install builtin-source-action" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer" aria-label="View source for ${escapeHtml(theme.name)}">View source ↗</a>`
    : "";
  const sourceLabel = theme.builtIn ? "Built in" : "Community";
  const tags = [...new Set([theme.mode, ...(theme.tags || [])])].slice(0, 4);
  const themeStats = state.engagement[theme.id] || {};
  const stars = theme.builtIn ? "" : `<span class="card-stars" title="GitHub stars"><svg class="social-glyph star-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>${formatCount(theme.stars)}</span>`;
  const heart = state.engagementEnabled
    ? themeHeartButton(theme, themeStats, {
        hearted: hasThemeHeart(theme.id),
        pending: !state.engagementLoaded,
      })
    : "";
  const social = stars || heart ? `<div class="card-social">${stars}${heart}</div>` : "";
  const previewMarkup = preview
    ? `<div class="theme-preview image-preview"><img src="${escapeHtml(preview)}" alt="${escapeHtml(theme.name)} theme preview" width="720" height="405" loading="lazy"></div>`
    : `<div class="theme-preview"><span class="theme-preview-mark" aria-hidden="true">${escapeHtml(theme.name.slice(0, 2).toUpperCase())}</span></div>`;

  return `<article class="theme-card${theme.builtIn ? " built-in-card" : ""}" style="${paletteStyle(theme)}">
    ${previewMarkup}
    <div class="theme-card-body">
      ${social}
      <div class="theme-card-content">
        <div class="theme-title-line">
          <h3>${escapeHtml(theme.name)}</h3>
          <span class="${theme.builtIn ? "builtin-badge" : "status-badge"}">${sourceLabel}</span>
        </div>
        <div class="theme-author">by ${escapeHtml(theme.author)}</div>
        <p class="theme-description">${escapeHtml(theme.description)}</p>
      </div>
      <div class="theme-card-facts"><span><i aria-hidden="true"></i>${escapeHtml(theme.mode)} mode</span><span>${escapeHtml(theme.backgroundCount)} ${theme.backgroundCount === 1 ? "wallpaper" : "wallpapers"}</span></div>
      ${paletteStrip(theme)}
      <div class="theme-card-bottom">
        <div class="theme-tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
        <div class="theme-card-actions">
          ${state.engagementEnabled ? engagementSummary(theme, themeStats, { pending: !state.engagementLoaded }) : ""}
          ${sourceAction}
          <button class="card-install" type="button" data-copy-command="${escapeHtml(command)}" data-source-type="${escapeHtml(theme.sourceType)}" data-copy-label-default="${copyLabel}" aria-label="${escapeHtml(copyAccessibleLabel)} for ${escapeHtml(theme.name)}">
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
  if (state.wallpapers !== "all" && wallpaperGroup(theme.backgroundCount) !== state.wallpapers) return false;
  if (!state.query) return true;
  const haystack = [theme.name, theme.description, theme.author, theme.id, ...(theme.tags || [])]
    .join(" ")
    .toLowerCase();
  return state.query.split(/\s+/).every((term) => haystack.includes(term));
}

function wallpaperGroup(value) {
  const count = Number(value || 0);
  if (count >= 6) return "deep";
  if (count >= 4) return "varied";
  return "compact";
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
  if (state.sort === "backgrounds") {
    return Number(second.backgroundCount || 0) - Number(first.backgroundCount || 0) || first.name.localeCompare(second.name);
  }
  return first.name.localeCompare(second.name);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 1_700);
}

function applyEngagement(themeId, result, { animateHeart = false } = {}) {
  if (!result?.recorded || !result.stats) return;
  const current = state.engagement[themeId] || { views: 0, copies: 0, hearts: 0 };
  const next = {
    views: Math.max(current.views || 0, result.stats.views),
    copies: Math.max(current.copies || 0, result.stats.copies),
    hearts: Math.max(current.hearts || 0, result.stats.hearts),
  };
  state.engagement[themeId] = next;
  updateEngagementSummary(document, themeId, next);
  updateThemeHeart(document, themeId, next, {
    animate: animateHeart,
    hearted: hasThemeHeart(themeId),
  });
}

function wireCardActions(root) {
  root.querySelectorAll("[data-theme-heart]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.getAttribute("aria-disabled") === "true" || button.dataset.heartSubmitting === "true") return;
      button.dataset.heartSubmitting = "true";
      button.setAttribute("aria-busy", "true");
      const result = await recordThemeHeart(button.dataset.themeHeart);
      delete button.dataset.heartSubmitting;
      button.removeAttribute("aria-busy");
      if (!result?.recorded) {
        showToast("Heart could not be sent. Try again.");
        return;
      }
      applyEngagement(button.dataset.themeHeart, result, { animateHeart: true });
      showToast("Heart sent");
    });
  });
  root.querySelectorAll("[data-copy-command]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        if (await copyCommand(button.dataset.copyCommand, button)) {
          const themeId = button.closest(".theme-card")?.querySelector("[data-theme-heart]")?.dataset.themeHeart
            || button.closest(".theme-card")?.querySelector("[data-theme-engagement]")?.dataset.themeEngagement;
          if (themeId) applyEngagement(themeId, await recordThemeCopy(themeId));
        }
      } catch {
        status.textContent = "Could not copy the command. Select it from the theme detail page.";
      }
    });
  });
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

  wireCardActions(grid);
}

function renderCatalogSummary() {
  const builtIn = state.themes.filter((theme) => theme.builtIn).length;
  const community = state.themes.length - builtIn;
  const dark = state.themes.filter((theme) => theme.mode === "dark").length;
  const light = state.themes.length - dark;
  document.querySelector("#stat-total").textContent = String(state.themes.length);
  document.querySelector("#stat-builtin").textContent = String(builtIn);
  document.querySelector("#stat-community").textContent = String(community);
  document.querySelector("#stat-modes").textContent = `${dark} / ${light}`;

  document.querySelectorAll("[data-source-count]").forEach((element) => {
    const source = element.dataset.sourceCount;
    element.textContent = String(source === "all" ? state.themes.length : state.themes.filter((theme) => theme.sourceType === source).length);
  });
  document.querySelectorAll("[data-mode-count]").forEach((element) => {
    const mode = element.dataset.modeCount;
    element.textContent = String(mode === "all" ? state.themes.length : state.themes.filter((theme) => theme.mode === mode).length);
  });
  document.querySelectorAll("[data-wallpaper-count]").forEach((element) => {
    const group = element.dataset.wallpaperCount;
    element.textContent = String(group === "all" ? state.themes.length : state.themes.filter((theme) => wallpaperGroup(theme.backgroundCount) === group).length);
  });
}

function renderCommunitySpotlight() {
  const section = document.querySelector("#community-section");
  const feature = document.querySelector("#community-feature");
  const communityThemes = state.themes
    .filter((theme) => !theme.builtIn)
    .sort((first, second) => Date.parse(second.addedAt || 0) - Date.parse(first.addedAt || 0));
  if (!communityThemes.length) return;
  feature.innerHTML = themeCard(communityThemes[0]);
  wireCardActions(feature);
  section.hidden = false;
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
wallpaperButtons.forEach((button) => button.addEventListener("click", () => selectFilter(wallpaperButtons, button, "wallpapers")));
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
  selectFilter(wallpaperButtons, wallpaperButtons[0], "wallpapers");
});
document.querySelector("[data-community-filter]").addEventListener("click", (event) => {
  event.preventDefault();
  selectFilter(sourceButtons, sourceButtons.find((button) => button.dataset.source === "community"), "source");
  document.querySelector("#catalog").scrollIntoView({ behavior: "smooth", block: "start" });
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
  state.engagementEnabled = Boolean(engagementApiBaseUrl());
  renderCatalogSummary();
  renderCommunitySpotlight();
  render();
  if (state.engagementEnabled) {
    loadEngagementStats().then((stats) => {
      state.engagement = { ...stats, ...state.engagement };
      state.engagementLoaded = true;
      state.themes.forEach((theme) => {
        const themeStats = state.engagement[theme.id] || { views: 0, copies: 0, hearts: 0 };
        updateEngagementSummary(document, theme.id, themeStats);
        updateThemeHeart(document, theme.id, themeStats, { hearted: hasThemeHeart(theme.id) });
      });
    }).catch(() => {
      state.engagementEnabled = false;
      hidePendingEngagement(document);
    });
  }
} catch (error) {
  grid.hidden = true;
  grid.setAttribute("aria-busy", "false");
  emptyState.hidden = false;
  emptyState.querySelector("h3").textContent = "Theme catalog unavailable";
  emptyState.querySelector("p").textContent = "Reload the page or try again later.";
  document.querySelector("#empty-reset").hidden = true;
  status.textContent = error.message;
}
