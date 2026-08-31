const localSiteHosts = new Set(["127.0.0.1", "localhost"]);
const eventTypes = new Set(["view", "copy", "heart"]);
const themeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const unsafeObjectKeys = new Set(["__proto__", "constructor", "prototype"]);
const viewStoragePrefix = "omarchy-theme-view:";
const copyStoragePrefix = "omarchy-theme-copy:";
const heartStoragePrefix = "omarchy-theme-heart:";
const copyRequests = new Map();
const heartRequests = new Map();

function validThemeId(value) {
  return themeIdPattern.test(value) && !unsafeObjectKeys.has(value.toLowerCase());
}

function configuredApiUrl(documentRef) {
  const value = documentRef
    ?.querySelector?.('meta[name="omarchy-theme-engagement-api"]')
    ?.getAttribute?.("content")
    ?.trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    const local = localSiteHosts.has(url.hostname);
    if (url.username || url.password || url.search || url.hash) return "";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return "";
    if (!url.pathname.replace(/\/$/, "").endsWith("/v1")) return "";
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function engagementApiBaseUrl(
  locationRef = globalThis.location,
  documentRef = globalThis.document,
) {
  const hostname = String(locationRef?.hostname || "").toLowerCase();
  if (localSiteHosts.has(hostname)) return "http://127.0.0.1:8787/v1";
  return configuredApiUrl(documentRef);
}

function safeCount(value) {
  const count = Math.trunc(Number(value));
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

export function normalizeEngagementStats(payload) {
  const source = payload?.themes;
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const normalized = {};
  for (const [themeId, value] of Object.entries(source)) {
    if (!validThemeId(themeId) || !value || typeof value !== "object" || Array.isArray(value)) continue;
    normalized[themeId] = {
      views: safeCount(value.views),
      copies: safeCount(value.copies),
      hearts: safeCount(value.hearts),
    };
  }
  return normalized;
}

export async function loadEngagementStats({
  fetchImpl = globalThis.fetch,
  locationRef = globalThis.location,
  documentRef = globalThis.document,
} = {}) {
  const baseUrl = engagementApiBaseUrl(locationRef, documentRef);
  if (!baseUrl || typeof fetchImpl !== "function") return {};
  const response = await fetchImpl(`${baseUrl}/stats`, {
    cache: "no-store",
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Engagement request failed: ${response.status}`);
  return normalizeEngagementStats(await response.json());
}

function normalizedThemeStats(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    views: safeCount(value.views),
    copies: safeCount(value.copies),
    hearts: safeCount(value.hearts),
  };
}

export async function recordEngagementEvent(themeId, type, {
  fetchImpl = globalThis.fetch,
  locationRef = globalThis.location,
  documentRef = globalThis.document,
} = {}) {
  const baseUrl = engagementApiBaseUrl(locationRef, documentRef);
  if (
    !baseUrl
    || typeof fetchImpl !== "function"
    || !validThemeId(String(themeId || ""))
    || !eventTypes.has(type)
  ) return null;

  try {
    const response = await fetchImpl(`${baseUrl}/events`, {
      method: "POST",
      credentials: "omit",
      keepalive: true,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ themeId, type }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    if (payload?.recorded === false) return { recorded: false, stats: null };
    const stats = normalizedThemeStats(payload?.theme);
    return payload?.recorded === true && stats
      ? { recorded: true, stats }
      : null;
  } catch {
    return null;
  }
}

export function hasThemeHeart(themeId, storage = globalThis.localStorage) {
  if (!validThemeId(String(themeId || ""))) return false;
  try {
    return storage?.getItem(`${heartStoragePrefix}${themeId}`) === "1";
  } catch {
    return false;
  }
}

export async function recordThemeHeart(themeId, {
  storage = globalThis.localStorage,
  ...options
} = {}) {
  const baseUrl = engagementApiBaseUrl(
    options.locationRef || globalThis.location,
    options.documentRef || globalThis.document,
  );
  if (!baseUrl || !validThemeId(String(themeId || ""))) return null;
  if (hasThemeHeart(themeId, storage)) return { recorded: false, stats: null };
  if (heartRequests.has(themeId)) return heartRequests.get(themeId);

  const request = (async () => {
    const result = await recordEngagementEvent(themeId, "heart", options);
    if (!result?.recorded) return result;
    try {
      storage?.setItem(`${heartStoragePrefix}${themeId}`, "1");
    } catch {
      // The anonymous reaction is still recorded when browser storage is unavailable.
    }
    return result;
  })();
  heartRequests.set(themeId, request);
  try {
    return await request;
  } finally {
    if (heartRequests.get(themeId) === request) heartRequests.delete(themeId);
  }
}

export async function recordThemeCopy(themeId, {
  storage = globalThis.sessionStorage,
  ...options
} = {}) {
  const baseUrl = engagementApiBaseUrl(
    options.locationRef || globalThis.location,
    options.documentRef || globalThis.document,
  );
  if (!baseUrl || !validThemeId(String(themeId || ""))) return null;
  if (copyRequests.has(themeId)) return copyRequests.get(themeId);

  const key = `${copyStoragePrefix}${themeId}`;
  try {
    if (storage?.getItem(key)) return { recorded: false, stats: null };
    storage?.setItem(key, "1");
  } catch {
    // Storage is only a best-effort repeat guard. The event remains anonymous.
  }

  const request = (async () => {
    const result = await recordEngagementEvent(themeId, "copy", options);
    if (result === null) {
      try {
        storage?.removeItem(key);
      } catch {
        // A later successful copy may still retry when storage is unavailable.
      }
    }
    return result;
  })();
  copyRequests.set(themeId, request);
  try {
    return await request;
  } finally {
    if (copyRequests.get(themeId) === request) copyRequests.delete(themeId);
  }
}

export async function recordThemeView(themeId, {
  storage = globalThis.sessionStorage,
  ...options
} = {}) {
  const baseUrl = engagementApiBaseUrl(
    options.locationRef || globalThis.location,
    options.documentRef || globalThis.document,
  );
  if (!baseUrl || !validThemeId(String(themeId || ""))) return null;
  const key = `${viewStoragePrefix}${themeId}`;
  try {
    if (storage?.getItem(key)) return { recorded: false, stats: null };
    storage?.setItem(key, "1");
  } catch {
    // Storage is only a best-effort refresh guard. The event remains anonymous.
  }

  const result = await recordEngagementEvent(themeId, "view", options);
  if (result === null) {
    try {
      storage?.removeItem(key);
    } catch {
      // A later page load may still retry when storage is unavailable.
    }
  }
  return result;
}
