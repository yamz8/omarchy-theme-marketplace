export async function loadCatalog() {
  const response = await fetch("catalog.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
  const catalog = await response.json();
  if (!Array.isArray(catalog.themes)) throw new Error("Catalog does not contain themes");
  return catalog;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

export function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function formatDate(value) {
  if (!value || Number.isNaN(Date.parse(value))) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function formatCount(value = 0) {
  const count = Math.max(0, Math.trunc(Number(value) || 0));
  if (count < 1_000) return String(count);
  if (count < 10_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
  return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
}

function engagementCount(value) {
  const count = Math.trunc(Number(value));
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function engagementMetric(type, count, detail) {
  const views = type === "views";
  const label = views ? "marketplace detail views" : "successful command copies";
  const icon = views
    ? '<span class="engagement-glyph" aria-hidden="true"></span>'
    : '<span class="copy-icon engagement-copy-icon" aria-hidden="true"></span>';
  const visibleName = views ? "views" : "copies";
  return `<span class="engagement-metric" data-engagement-metric="${type}"${detail ? ` title="${label}"` : ""}><span class="engagement-visual" aria-hidden="true">${icon}<span data-engagement-value>${formatCount(count)}</span>${detail ? `<span class="engagement-name">${visibleName}</span>` : ""}</span><span class="sr-only" data-engagement-accessible>${count} ${label}</span></span>`;
}

export function engagementSummary(theme, stats = {}, {
  detail = false,
  pending = false,
} = {}) {
  const views = engagementCount(stats.views);
  const copies = engagementCount(stats.copies);
  const hasCommand = Boolean(themeCommand(theme));
  return `<div class="theme-engagement${detail ? " detail-engagement" : ""}${pending ? " is-pending" : ""}" data-theme-engagement="${escapeHtml(theme?.id || "")}"${pending ? ' aria-busy="true"' : ""}>${engagementMetric("views", views, detail)}${hasCommand ? engagementMetric("copies", copies, detail) : ""}</div>`;
}

export function themeHeartButton(theme, stats = {}, {
  detail = false,
  hearted = false,
  pending = false,
} = {}) {
  const themeId = escapeHtml(theme?.id || "");
  const themeName = escapeHtml(theme?.name || "theme");
  const count = engagementCount(stats.hearts);
  const action = hearted ? "Heart sent" : "Send a heart";
  return `<button class="theme-heart${detail ? " detail-heart" : ""}${hearted ? " is-hearted" : ""}${pending ? " is-pending" : ""}" type="button" data-theme-heart="${themeId}" data-theme-name="${themeName}" aria-label="${action} for ${themeName}; ${count} anonymous hearts" aria-pressed="${hearted}"${pending ? ' aria-busy="true"' : ""}${hearted ? ' aria-disabled="true"' : ""} title="${action}"><span class="social-glyph heart-glyph" aria-hidden="true"></span><span class="social-count" data-heart-value aria-hidden="true">${formatCount(count)}</span></button>`;
}

export function hidePendingEngagement(root) {
  root.querySelectorAll(".theme-engagement.is-pending, .theme-heart.is-pending").forEach((element) => {
    element.hidden = true;
    element.classList.remove("is-pending");
    element.removeAttribute("aria-busy");
  });
}

export function updateEngagementSummary(root, themeId, stats = {}) {
  const values = {
    views: engagementCount(stats.views),
    copies: engagementCount(stats.copies),
  };
  root.querySelectorAll("[data-theme-engagement]").forEach((summary) => {
    if (summary.dataset.themeEngagement !== themeId) return;
    summary.hidden = false;
    summary.classList.remove("is-pending");
    summary.removeAttribute("aria-busy");
    summary.querySelectorAll("[data-engagement-metric]").forEach((metric) => {
      const type = metric.dataset.engagementMetric;
      if (!Object.hasOwn(values, type)) return;
      const count = values[type];
      const label = type === "views" ? "marketplace detail views" : "successful command copies";
      const value = metric.querySelector("[data-engagement-value]");
      if (value) value.textContent = formatCount(count);
      const accessible = metric.querySelector("[data-engagement-accessible]");
      if (accessible) accessible.textContent = `${count} ${label}`;
    });
  });
}

export function updateThemeHeart(root, themeId, stats = {}, {
  animate = false,
  hearted = false,
} = {}) {
  const count = engagementCount(stats.hearts);
  root.querySelectorAll("[data-theme-heart]").forEach((button) => {
    if (button.dataset.themeHeart !== themeId) return;
    button.hidden = false;
    button.classList.remove("is-pending");
    button.classList.toggle("is-hearted", hearted);
    button.removeAttribute("aria-busy");
    button.setAttribute("aria-pressed", String(hearted));
    if (hearted) button.setAttribute("aria-disabled", "true");
    else button.removeAttribute("aria-disabled");
    const action = hearted ? "Heart sent" : "Send a heart";
    button.title = action;
    button.setAttribute("aria-label", `${action} for ${button.dataset.themeName || "theme"}; ${count} anonymous hearts`);
    const value = button.querySelector("[data-heart-value]");
    if (value) value.textContent = formatCount(count);
    if (!animate) return;
    button.classList.remove("is-celebrating");
    void button.offsetWidth;
    button.classList.add("is-celebrating");
    button.addEventListener("animationend", () => {
      button.classList.remove("is-celebrating");
    }, { once: true });
  });
}

export function themeCommand(theme) {
  return theme?.builtIn ? theme.officialCommand : theme?.installCommand;
}

export function setupThemeToggle(root = document) {
  root.querySelectorAll(".theme-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("omarchy-marketplace-color", next);
    });
  });
}

export async function copyCommand(command, button, toast = document.querySelector("#toast")) {
  if (!command) return false;
  await navigator.clipboard.writeText(command);
  const label = button?.querySelector("[data-copy-label]");
  const icon = button?.querySelector(".copy-icon");
  if (label) label.textContent = "Copied";
  if (icon) icon.classList.add("is-copied");
  if (toast) {
    toast.textContent = "Command copied";
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 1_700);
  }
  window.setTimeout(() => {
    if (label) label.textContent = button?.dataset.copyLabelDefault || themeCopyLabel(button?.dataset.sourceType);
    if (icon) icon.classList.remove("is-copied");
  }, 1_800);
  return true;
}

export function themeCopyLabel(sourceType) {
  return sourceType === "builtin" ? "Copy set command" : "Copy install command";
}

export function paletteStyle(theme) {
  const accent = /^#[0-9a-f]{6}$/i.test(theme?.accent || "") ? theme.accent : "#ff5a36";
  return `--card-accent: ${accent}`;
}
