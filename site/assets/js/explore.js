import { formatDate, setupThemeToggle } from "./shared.js?v=20260831-03";
import { colorHue, isHexColor, relativeLuminance } from "./theme-color.js?v=20260831-01";

const svgNamespace = "http://www.w3.org/2000/svg";
const state = { data: null, query: "", source: "all", mode: "all", selected: "" };
const atlas = document.querySelector("#palette-atlas");
const pointLayer = atlas.querySelector("[data-atlas-points]");
const gridLayer = atlas.querySelector("[data-atlas-grid]");
const detail = document.querySelector("#atlas-detail");

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(svgNamespace, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function safePreview(path) {
  return /^assets\/img\/themes\/[A-Za-z0-9._-]+\.webp$/.test(path || "") ? path : "";
}

function idJitter(id, shift = 0) {
  const hash = [...String(id)].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 0);
  return ((hash >>> shift) % 17) - 8;
}

function atlasPosition(theme) {
  const width = 900;
  const height = 560;
  const horizontalPadding = 70;
  const verticalPadding = 48;
  return {
    x: horizontalPadding + (colorHue(theme.accent) / 360) * (width - horizontalPadding * 2) + idJitter(theme.id),
    y: verticalPadding + (1 - relativeLuminance(theme.background)) * (height - verticalPadding * 2) + idJitter(theme.id, 7),
  };
}

function drawAtlasGrid() {
  gridLayer.replaceChildren();
  const hueLabels = ["Red", "Yellow", "Green", "Cyan", "Blue", "Magenta", "Red"];
  hueLabels.forEach((label, index) => {
    const x = 70 + index * (760 / 6);
    gridLayer.append(svgElement("line", { class: "atlas-grid-line", x1: x, y1: 48, x2: x, y2: 512 }));
    const text = svgElement("text", { class: "atlas-grid-label", x, y: 535, "text-anchor": "middle" });
    text.textContent = label;
    gridLayer.append(text);
  });
  [[48, "Light"], [164, "75%"], [280, "50%"], [396, "25%"], [512, "Dark"]].forEach(([y, label]) => {
    gridLayer.append(svgElement("line", { class: "atlas-grid-line", x1: 70, y1: y, x2: 830, y2: y }));
    const text = svgElement("text", { class: "atlas-grid-label", x: 58, y: Number(y) + 4, "text-anchor": "end" });
    text.textContent = label;
    gridLayer.append(text);
  });
}

function themeMatches(theme) {
  if (state.source !== "all" && theme.sourceType !== state.source) return false;
  if (state.mode !== "all" && theme.mode !== state.mode) return false;
  if (!state.query) return true;
  return [theme.name, theme.id, theme.author].join(" ").toLowerCase().includes(state.query);
}

function showThemeDetail(theme) {
  state.selected = theme.id;
  pointLayer.querySelectorAll(".atlas-point").forEach((point) => point.classList.toggle("selected", point.dataset.themeId === theme.id));
  const preview = safePreview(theme.preview);
  const image = document.querySelector("#atlas-detail-preview");
  image.hidden = !preview;
  if (preview) image.src = preview;
  image.alt = preview ? `${theme.name} theme preview` : "";
  document.querySelector("#atlas-detail-source").textContent = theme.sourceType === "builtin" ? "Built in" : "Community";
  document.querySelector("#atlas-detail-title").textContent = theme.name;
  document.querySelector("#atlas-detail-author").textContent = `by ${theme.author}`;
  document.querySelector("#atlas-detail-mode").textContent = theme.mode;
  document.querySelector("#atlas-detail-wallpapers").textContent = String(theme.backgroundCount);
  document.querySelector("#atlas-detail-link").href = `theme.html?id=${encodeURIComponent(theme.id)}`;
  const palette = document.querySelector("#atlas-detail-palette");
  palette.replaceChildren();
  [theme.background, theme.foreground, theme.accent, theme.palette?.red, theme.palette?.blue, theme.palette?.magenta]
    .filter(isHexColor)
    .forEach((color) => {
      const swatch = document.createElement("span");
      swatch.style.setProperty("--swatch", color);
      palette.append(swatch);
    });
  detail.hidden = false;
}

function closeThemeDetail() {
  state.selected = "";
  detail.hidden = true;
  pointLayer.querySelectorAll(".atlas-point").forEach((point) => point.classList.remove("selected"));
}

function createAtlasPoint(theme) {
  const position = atlasPosition(theme);
  const group = svgElement("g", {
    class: `atlas-point ${theme.sourceType}`,
    transform: `translate(${position.x.toFixed(2)} ${position.y.toFixed(2)})`,
    tabindex: "0",
    role: "link",
    "aria-label": `${theme.name}, ${theme.mode} ${theme.sourceType === "builtin" ? "built-in" : "community"} theme by ${theme.author}`,
  });
  group.dataset.themeId = theme.id;
  group.style.setProperty("--point-accent", isHexColor(theme.accent) ? theme.accent : "#ff5a36");
  group.style.setProperty("--point-ring", isHexColor(theme.foreground) ? theme.foreground : "#ffffff");
  group.append(svgElement("circle", { r: theme.sourceType === "community" ? 10 : 8 }));
  const label = svgElement("text", {
    x: position.x > 690 ? -13 : 13,
    y: -10,
    "text-anchor": position.x > 690 ? "end" : "start",
  });
  label.textContent = theme.name;
  group.append(label);
  group.addEventListener("click", () => showThemeDetail(theme));
  group.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    showThemeDetail(theme);
  });
  return group;
}

function renderAtlas() {
  pointLayer.replaceChildren(...state.data.themes.map(createAtlasPoint));
  updateAtlasFilters();
}

function updateAtlasFilters() {
  let visible = 0;
  let dark = 0;
  let light = 0;
  pointLayer.querySelectorAll(".atlas-point").forEach((point) => {
    const theme = state.data.themes.find((candidate) => candidate.id === point.dataset.themeId);
    const matches = themeMatches(theme);
    point.style.display = matches ? "" : "none";
    point.setAttribute("aria-hidden", String(!matches));
    point.setAttribute("tabindex", matches ? "0" : "-1");
    if (matches) {
      visible += 1;
      if (theme.mode === "dark") dark += 1;
      else light += 1;
    }
  });
  if (state.selected) {
    const selected = state.data.themes.find((theme) => theme.id === state.selected);
    if (!selected || !themeMatches(selected)) closeThemeDetail();
  }
  document.querySelector("#atlas-visible").textContent = String(visible);
  document.querySelector("#atlas-dark").textContent = String(dark);
  document.querySelector("#atlas-light").textContent = String(light);
  document.querySelector("#atlas-match-count").textContent = `${visible} / ${state.data.themes.length}`;
}

function drawGrowth(growth) {
  const chart = document.querySelector("#growth-chart");
  const grid = chart.querySelector("[data-growth-grid]");
  const pointsLayer = chart.querySelector("[data-growth-points]");
  const line = chart.querySelector("[data-growth-line]");
  const area = chart.querySelector("[data-growth-area]");
  grid.replaceChildren();
  pointsLayer.replaceChildren();
  const left = 68;
  const right = 862;
  const top = 35;
  const bottom = 365;
  const maximum = Math.max(1, ...growth.map((point) => point.total));
  for (let index = 0; index <= 4; index += 1) {
    const y = top + index * ((bottom - top) / 4);
    const value = Math.round(maximum * (1 - index / 4));
    grid.append(svgElement("line", { class: "growth-grid-line", x1: left, y1: y, x2: right, y2: y }));
    const label = svgElement("text", { class: "growth-grid-label", x: left - 12, y: y + 4, "text-anchor": "end" });
    label.textContent = String(value);
    grid.append(label);
  }
  const xFor = (index) => growth.length === 1 ? (left + right) / 2 : left + index * ((right - left) / (growth.length - 1));
  const yFor = (value) => bottom - (value / maximum) * (bottom - top);
  const positions = growth.map((point, index) => ({ point, x: xFor(index), y: yFor(point.total) }));
  const linePath = positions.map(({ x, y }, index) => `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  line.setAttribute("d", linePath);
  const areaPath = positions.length
    ? `M${positions[0].x.toFixed(2)},${bottom} L${positions.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" L")} L${positions.at(-1).x.toFixed(2)},${bottom} Z`
    : "";
  area.setAttribute("d", areaPath);
  positions.forEach(({ point, x, y }, index) => {
    pointsLayer.append(svgElement("circle", { class: "growth-point", cx: x, cy: y, r: 7 }));
    pointsLayer.append(svgElement("rect", { class: "growth-point-community", x: x - 4, y: yFor(point.community) - 4, width: 8, height: 8 }));
    const value = svgElement("text", { class: "growth-point-label", x, y: y - 14, "text-anchor": "middle" });
    value.textContent = String(point.total);
    pointsLayer.append(value);
    if (growth.length <= 6 || index === 0 || index === growth.length - 1) {
      const date = svgElement("text", { class: "growth-point-date", x, y: 391, "text-anchor": "middle" });
      date.textContent = point.date;
      pointsLayer.append(date);
    }
  });
  const first = growth[0];
  const last = growth.at(-1);
  document.querySelector("#growth-total").textContent = String(last?.total || 0);
  document.querySelector("#growth-community").textContent = String(last?.community || 0);
  document.querySelector("#growth-snapshots").textContent = String(growth.length);
  document.querySelector("#growth-range").textContent = first && last ? `${first.date} → ${last.date}` : "No snapshots";
}

function renderSummary(data) {
  for (const key of ["total", "builtin", "community", "authors", "wallpapers"]) {
    document.querySelector(`#summary-${key}`).textContent = String(data.summary[key === "builtin" ? "builtIn" : key]);
  }
  const time = document.querySelector("#explorer-updated");
  time.dateTime = data.generatedAt;
  time.textContent = formatDate(data.generatedAt);
}

function selectButtons(buttons, selected, key) {
  buttons.forEach((button) => {
    const active = button === selected;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  state[key] = selected.dataset[key === "source" ? "atlasSource" : "atlasMode"];
  updateAtlasFilters();
}

function activateView(button) {
  const tabs = [...document.querySelectorAll("[data-explore-view]")];
  tabs.forEach((tab) => {
    const active = tab === button;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    document.querySelector(`#${tab.dataset.exploreView}-view`).hidden = !active;
  });
}

setupThemeToggle();
drawAtlasGrid();
document.querySelector("#atlas-detail-close").addEventListener("click", closeThemeDetail);
document.querySelector("#atlas-search").addEventListener("input", (event) => {
  state.query = event.currentTarget.value.trim().toLowerCase();
  updateAtlasFilters();
});
const sourceButtons = [...document.querySelectorAll("[data-atlas-source]")];
const modeButtons = [...document.querySelectorAll("[data-atlas-mode]")];
sourceButtons.forEach((button) => button.addEventListener("click", () => selectButtons(sourceButtons, button, "source")));
modeButtons.forEach((button) => button.addEventListener("click", () => selectButtons(modeButtons, button, "mode")));
const tabs = [...document.querySelectorAll("[data-explore-view]")];
tabs.forEach((button, index) => {
  button.addEventListener("click", () => activateView(button));
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    activateView(next);
    next.focus();
  });
});

try {
  const response = await fetch("explorer-data.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Explorer request failed: ${response.status}`);
  state.data = await response.json();
  if (!Array.isArray(state.data.themes) || !Array.isArray(state.data.growth)) throw new Error("Invalid explorer data");
  renderSummary(state.data);
  renderAtlas();
  drawGrowth(state.data.growth);
} catch {
  document.querySelector("#explore-error").hidden = false;
  document.querySelectorAll(".explore-view, .explore-summary").forEach((element) => { element.hidden = true; });
}
