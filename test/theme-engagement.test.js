import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  engagementApiBaseUrl,
  hasThemeHeart,
  loadEngagementStats,
  normalizeEngagementStats,
  recordEngagementEvent,
  recordThemeCopy,
  recordThemeHeart,
  recordThemeView,
} from "../site/assets/js/engagement.js";
import {
  engagementSummary,
  hidePendingEngagement,
  themeHeartButton,
} from "../site/assets/js/shared.js";
import {
  engagementUpsertStatement,
  handleRequest,
  parseEngagementEvent,
} from "../worker/src/index.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const productionLocation = { hostname: "themes.example" };
const localLocation = { hostname: "127.0.0.1" };
const apiDocument = (value) => ({
  querySelector(selector) {
    assert.equal(selector, 'meta[name="omarchy-theme-engagement-api"]');
    return { getAttribute: (name) => name === "content" ? value : null };
  },
});

function responseJson(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fakeDatabase(rows = [], {
  recorded = { theme_id: "giants" },
  totals = { views: 9, copies: 4, hearts: 3 },
} = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async all() {
          calls.push({ operation: "all", sql, values: statement.values });
          return { results: rows };
        },
      };
      return statement;
    },
    async batch(statements) {
      calls.push(...statements.map((statement) => ({
        operation: "batch",
        sql: statement.sql,
        values: statement.values,
      })));
      return statements.map((statement) => ({
        success: true,
        results: statement.sql.includes("RETURNING theme_id")
          ? (recorded ? [recorded] : [])
          : [totals],
      }));
    },
  };
}

function fakeRateLimiter(success = true) {
  const keys = [];
  return {
    keys,
    async limit({ key }) {
      keys.push(key);
      return { success };
    },
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const limits = {
  VIEW_MINUTE_EVENT_LIMIT: "2",
  COPY_MINUTE_EVENT_LIMIT: "2",
  HEART_MINUTE_EVENT_LIMIT: "2",
};

test("engagement stays local or requires an explicit reviewed HTTPS endpoint", () => {
  assert.equal(
    engagementApiBaseUrl(localLocation, apiDocument("")),
    "http://127.0.0.1:8787/v1",
  );
  assert.equal(
    engagementApiBaseUrl(productionLocation, apiDocument("https://engagement.example/v1")),
    "https://engagement.example/v1",
  );
  for (const value of [
    "",
    "http://engagement.example/v1",
    "https://engagement.example/api",
    "https://user:secret@engagement.example/v1",
    "https://engagement.example/v1?token=secret",
  ]) {
    assert.equal(engagementApiBaseUrl(productionLocation, apiDocument(value)), "");
  }
});

test("the engagement client accepts only theme-keyed aggregate counts", () => {
  assert.deepEqual(normalizeEngagementStats({
    themes: {
      giants: { views: 12.9, copies: "4", hearts: 7.8 },
      "bad id": { views: 99, copies: 99, hearts: 99 },
      constructor: { views: 99, copies: 99, hearts: 99 },
      negative: { views: -1, copies: Number.NaN, hearts: -4 },
    },
  }), {
    giants: { views: 12, copies: 4, hearts: 7 },
    negative: { views: 0, copies: 0, hearts: 0 },
  });
  assert.deepEqual(normalizeEngagementStats({ plugins: { giants: { views: 9 } } }), {});
});

test("stats and events contain no credentials and only the theme ID plus action", async () => {
  const documentRef = apiDocument("https://engagement.example/v1");
  let statsRequest;
  const stats = await loadEngagementStats({
    locationRef: productionLocation,
    documentRef,
    fetchImpl: async (...values) => {
      statsRequest = values;
      return responseJson({ themes: { giants: { views: 2, copies: 1, hearts: 6 } } });
    },
  });
  assert.deepEqual(stats, { giants: { views: 2, copies: 1, hearts: 6 } });
  assert.equal(statsRequest[0], "https://engagement.example/v1/stats");
  assert.equal(statsRequest[1].credentials, "omit");
  assert.equal(statsRequest[1].headers.Authorization, undefined);

  let eventRequest;
  const event = await recordEngagementEvent("giants", "copy", {
    locationRef: productionLocation,
    documentRef,
    fetchImpl: async (...values) => {
      eventRequest = values;
      return responseJson({
        recorded: true,
        theme: { views: 9, copies: 4, hearts: 3 },
      }, 202);
    },
  });
  assert.deepEqual(event, { recorded: true, stats: { views: 9, copies: 4, hearts: 3 } });
  assert.deepEqual(JSON.parse(eventRequest[1].body), { themeId: "giants", type: "copy" });
  assert.equal(eventRequest[1].credentials, "omit");
  assert.equal(eventRequest[1].headers.Authorization, undefined);
});

test("browser guards bound anonymous theme events without claiming identity", async () => {
  const documentRef = apiDocument("https://engagement.example/v1");
  const session = memoryStorage();
  const local = memoryStorage();
  let requests = 0;
  const options = {
    locationRef: productionLocation,
    documentRef,
    fetchImpl: async (_url, request) => {
      requests += 1;
      const { type } = JSON.parse(request.body);
      return responseJson({
        recorded: true,
        theme: { views: type === "view" ? 1 : 0, copies: type === "copy" ? 1 : 0, hearts: type === "heart" ? 1 : 0 },
      }, 202);
    },
  };

  assert.equal((await recordThemeView("giants-view", { ...options, storage: session })).recorded, true);
  assert.equal((await recordThemeView("giants-view", { ...options, storage: session })).recorded, false);
  assert.equal((await recordThemeCopy("giants-copy", { ...options, storage: session })).recorded, true);
  assert.equal((await recordThemeCopy("giants-copy", { ...options, storage: session })).recorded, false);
  assert.equal(hasThemeHeart("giants-heart", local), false);
  assert.equal((await recordThemeHeart("giants-heart", { ...options, storage: local })).recorded, true);
  assert.equal(hasThemeHeart("giants-heart", local), true);
  assert.equal((await recordThemeHeart("giants-heart", { ...options, storage: local })).recorded, false);
  assert.equal(requests, 3);
  assert.equal(session.values.get("omarchy-theme-view:giants-view"), "1");
  assert.equal(session.values.get("omarchy-theme-copy:giants-copy"), "1");
  assert.equal(local.values.get("omarchy-theme-heart:giants-heart"), "1");
});

test("theme engagement markup is command-aware and accessible", () => {
  const summary = engagementSummary({
    id: "giants",
    installCommand: "omarchy theme install https://github.com/dhh/omarchy-giants-theme",
  }, { views: 1200, copies: 4 }, { detail: true, pending: true });
  assert.match(summary, /data-theme-engagement="giants"/);
  assert.match(summary, /data-engagement-accessible>1200 marketplace detail views</);
  assert.match(summary, /data-engagement-accessible>4 successful command copies</);
  assert.match(summary, /class="theme-engagement detail-engagement is-pending"/);
  const heart = themeHeartButton({ id: "giants", name: "Giants" }, { hearts: 12 }, { hearted: true });
  assert.match(heart, /data-theme-heart="giants"/);
  assert.match(heart, /12 anonymous hearts/);
  assert.match(heart, /aria-pressed="true" aria-disabled="true"/);

  const elements = [
    { hidden: false, classList: { remove: () => {} }, removeAttribute: () => {} },
    { hidden: false, classList: { remove: () => {} }, removeAttribute: () => {} },
  ];
  hidePendingEngagement({
    querySelectorAll(selector) {
      assert.equal(selector, ".theme-engagement.is-pending, .theme-heart.is-pending");
      return elements;
    },
  });
  assert.equal(elements.every((element) => element.hidden), true);
});

test("Worker parsing rejects plugin payloads, extra fields, and unsafe IDs", () => {
  assert.deepEqual(parseEngagementEvent({ themeId: "giants", type: "view" }), {
    themeId: "giants",
    type: "view",
  });
  assert.equal(parseEngagementEvent({ pluginId: "giants", type: "view" }), null);
  assert.equal(parseEngagementEvent({ themeId: "giants", type: "install" }), null);
  assert.equal(parseEngagementEvent({ themeId: "__proto__", type: "copy" }), null);
  assert.equal(parseEngagementEvent({ themeId: "giants", type: "copy", token: "secret" }), null);
});

test("Worker exposes theme-keyed stats and exact configured CORS", async () => {
  const database = fakeDatabase([
    { theme_id: "giants", views: 8, copies: 3, hearts: 5 },
    { theme_id: "bad id", views: 99, copies: 99, hearts: 99 },
  ]);
  const env = {
    ENGAGEMENT_DB: database,
    ALLOWED_ORIGINS: "https://themes.example, https://preview.example",
  };
  const response = await handleRequest(new Request("https://engagement.example/v1/stats"), env, { cache: null });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.deepEqual(await response.json(), {
    schemaVersion: 1,
    themes: { giants: { views: 8, copies: 3, hearts: 5 } },
  });

  for (const origin of ["https://themes.example", "https://preview.example", "http://127.0.0.1:4173"]) {
    const preflight = await handleRequest(new Request("https://engagement.example/v1/events", {
      method: "OPTIONS",
      headers: { Origin: origin },
    }), env);
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
  }
  for (const origin of ["http://themes.example", "https://themes.example.evil.test", "https://themes.example:444"]) {
    const preflight = await handleRequest(new Request("https://engagement.example/v1/events", {
      method: "OPTIONS",
      headers: { Origin: origin },
    }), env);
    assert.equal(preflight.status, 403);
  }
});

test("Worker validates catalog theme IDs before writing anonymous aggregates", async () => {
  const database = fakeDatabase();
  const outerLimiter = fakeRateLimiter();
  const targetLimiter = fakeRateLimiter();
  const env = {
    ENGAGEMENT_DB: database,
    ENGAGEMENT_RATE_LIMITER: outerLimiter,
    ENGAGEMENT_TARGET_RATE_LIMITER: targetLimiter,
    CATALOG_URL: "https://catalog.example/theme-engagement-test.json",
    ALLOWED_ORIGINS: "https://themes.example",
    ...limits,
  };
  const response = await handleRequest(new Request("https://engagement.example/v1/events", {
    method: "POST",
    headers: {
      "CF-Connecting-IP": "192.0.2.8",
      "Content-Type": "application/json",
      Origin: "https://themes.example",
    },
    body: JSON.stringify({ themeId: "giants", type: "copy" }),
  }), env, {
    cache: null,
    fetchImpl: async () => responseJson({ themes: [{ id: "giants" }] }),
  });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), {
    recorded: true,
    theme: { views: 9, copies: 4, hearts: 3 },
  });
  assert.deepEqual(outerLimiter.keys, ["events:192.0.2.8"]);
  assert.deepEqual(targetLimiter.keys, ["target:192.0.2.8:giants:copy"]);
  assert.equal(database.calls[0].values[0], "giants");
  assert.match(database.calls[0].sql, /theme_engagement_daily/);
  assert.doesNotMatch(database.calls[0].sql, /plugin/i);
});

test("the fresh D1 migration and bounded upsert use only the theme schema", async () => {
  const migration = await read("worker/migrations/0001_theme_engagement.sql");
  const database = new DatabaseSync(":memory:");
  database.exec(migration);
  const upsert = database.prepare(engagementUpsertStatement());
  const values = ["giants", "2026-08-31", "2026-08-31T12:34", 1, 0, 0, 10_000, 2, 2, 2];
  assert.equal(upsert.get(...values).theme_id, "giants");
  assert.equal(upsert.get(...values).theme_id, "giants");
  assert.equal(upsert.get(...values), undefined);
  assert.deepEqual(
    { ...database.prepare("SELECT theme_id, views, copies, hearts FROM theme_engagement_daily").get() },
    { theme_id: "giants", views: 2, copies: 0, hearts: 0 },
  );
  assert.throws(() => database.prepare(`
    INSERT INTO theme_engagement_daily (theme_id, day) VALUES (?, ?)
  `).run("bad id", "2026-08-31"));
  database.close();
});

test("active engagement assets contain no copied plugin endpoint or schema", async () => {
  const files = await Promise.all([
    "site/assets/js/engagement.js",
    "worker/src/index.js",
    "worker/README.md",
    "worker/wrangler.example.jsonc",
    "worker/migrations/0001_theme_engagement.sql",
  ].map(read));
  const combined = files.join("\n");
  assert.doesNotMatch(combined, /pluginId|plugin_id|catalog\.plugins|plugin_engagement/);
  assert.doesNotMatch(combined, /omarchyplugins\.com|api\.omarchyplugins/);
  assert.match(combined, /themeId/);
  assert.match(combined, /theme_engagement_daily/);
  assert.match(files[3], /"observability"\s*:\s*\{/);
  assert.match(files[3], /"head_sampling_rate"\s*:\s*1/);
});
