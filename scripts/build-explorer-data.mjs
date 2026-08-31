import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const catalogPath = resolve(root, "site/catalog.json");
const registryPath = resolve(root, "registry.json");
const outputPath = resolve(root, "site/explorer-data.json");

function dateOnly(value) {
  const calendarDate = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  if (calendarDate) return calendarDate[1];
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : "";
}

async function registryHistory() {
  try {
    const { stdout } = await execFileAsync("git", ["log", "--format=%H%x09%aI", "--", "registry.json"], {
      cwd: root,
      maxBuffer: 4 * 1024 * 1024,
    });
    const observations = [];
    for (const line of stdout.trim().split("\n").filter(Boolean)) {
      const [commit, committedAt] = line.split("\t");
      try {
        const { stdout: registryText } = await execFileAsync("git", ["show", `${commit}:registry.json`], {
          cwd: root,
          maxBuffer: 32 * 1024 * 1024,
        });
        const registry = JSON.parse(registryText);
        if (registry?.schemaVersion !== 1 || !Array.isArray(registry.sources) || !Array.isArray(registry.builtInSources)) continue;
        observations.push({
          date: dateOnly(committedAt),
          community: registry.sources.length,
          commit,
        });
      } catch {
        // Older registry revisions can use a different product schema.
      }
    }
    return observations;
  } catch {
    return [];
  }
}

function growthPoints(observations, builtInCount, currentCommunityCount, currentSnapshotAt) {
  const byDate = new Map();
  for (const observation of observations.reverse()) {
    if (!observation.date) continue;
    byDate.set(observation.date, {
      date: observation.date,
      builtIn: builtInCount,
      community: observation.community,
      total: builtInCount + observation.community,
      commit: observation.commit,
    });
  }
  const currentDate = dateOnly(currentSnapshotAt) || new Date().toISOString().slice(0, 10);
  const existing = byDate.get(currentDate);
  byDate.set(currentDate, {
    date: currentDate,
    builtIn: builtInCount,
    community: currentCommunityCount,
    total: builtInCount + currentCommunityCount,
    commit: existing?.commit || "",
  });
  return [...byDate.values()].sort((first, second) => first.date.localeCompare(second.date));
}

export async function buildExplorerData() {
  const [catalog, registry] = await Promise.all([
    readFile(catalogPath, "utf8").then(JSON.parse),
    readFile(registryPath, "utf8").then(JSON.parse),
  ]);
  if (!Array.isArray(catalog.themes) || registry?.schemaVersion !== 1) {
    throw new Error("Theme catalog and registry must be built before explorer data");
  }

  const builtInCount = catalog.themes.filter((theme) => theme.builtIn).length;
  const communityCount = catalog.themes.length - builtInCount;
  const authors = new Set(catalog.themes.map((theme) => theme.author).filter(Boolean));
  const history = await registryHistory();
  const currentSnapshotAt = [catalog.generatedAt, ...registry.sources.map((source) => source.addedAt)]
    .filter(Boolean)
    .sort()
    .at(-1);
  const themes = catalog.themes.map((theme) => ({
    id: theme.id,
    name: theme.name,
    author: theme.author,
    sourceType: theme.sourceType,
    mode: theme.mode,
    accent: theme.accent,
    background: theme.palette?.background || "#000000",
    foreground: theme.palette?.foreground || "#ffffff",
    palette: Object.fromEntries(
      ["red", "yellow", "green", "cyan", "blue", "magenta"]
        .filter((key) => theme.palette?.[key])
        .map((key) => [key, theme.palette[key]]),
    ),
    backgroundCount: theme.backgroundCount,
    addedAt: theme.addedAt,
    preview: theme.preview?.card || "",
    repo: theme.repo,
  }));
  const output = {
    generatedAt: catalog.generatedAt,
    schemaVersion: 1,
    summary: {
      total: themes.length,
      builtIn: builtInCount,
      community: communityCount,
      authors: authors.size,
      dark: themes.filter((theme) => theme.mode === "dark").length,
      light: themes.filter((theme) => theme.mode === "light").length,
      wallpapers: themes.reduce((total, theme) => total + Number(theme.backgroundCount || 0), 0),
    },
    themes,
    growth: growthPoints(history, builtInCount, communityCount, currentSnapshotAt),
  };
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const data = await buildExplorerData();
  console.log(`Built theme explorer data for ${data.themes.length} themes and ${data.growth.length} registry snapshots.`);
}
