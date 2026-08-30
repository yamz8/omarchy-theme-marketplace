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
    if (label) label.textContent = themeCopyLabel(button?.dataset.sourceType);
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
