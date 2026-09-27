/**
 * FX rates → ILS (approximate). Cached in localStorage.
 * Uses open.er-api.com (no API key).
 */

const CACHE_KEY = "tripdiary-fx-v1";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const RATES_URL = "https://open.er-api.com/v6/latest/USD";

/** Currencies we surface for conversion into ILS */
export const FX_CURRENCIES = ["USD", "THB", "VND", "EUR"];

/**
 * @typedef {{
 *   base: 'USD',
 *   ilsPerUsd: number,
 *   perIls: Record<string, number>,
 *   updatedAt: number,
 *   source: string,
 * }} FxSnapshot
 */

/**
 * @returns {FxSnapshot | null}
 */
export function readFxCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ilsPerUsd || !parsed?.perIls) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {boolean} [force]
 * @returns {Promise<FxSnapshot>}
 */
export async function loadFxRates(force = false) {
  const cached = readFxCache();
  if (!force && cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
    return cached;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(RATES_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`FX HTTP ${response.status}`);
    const data = await response.json();
    if (data?.result !== "success" || !data?.rates?.ILS) {
      throw new Error("תשובת שערי חליפין לא תקינה");
    }

    const ilsPerUsd = Number(data.rates.ILS);
    /** @type {Record<string, number>} */
    const perIls = { USD: 1 / ilsPerUsd };
    for (const code of FX_CURRENCIES) {
      if (code === "USD") continue;
      const perUsd = Number(data.rates[code]);
      if (Number.isFinite(perUsd) && perUsd > 0) {
        // units of foreign currency per 1 ILS
        perIls[code] = perUsd / ilsPerUsd;
      }
    }

    /** @type {FxSnapshot} */
    const snap = {
      base: "USD",
      ilsPerUsd,
      perIls,
      updatedAt: Date.now(),
      source: "open.er-api.com",
    };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(snap));
    } catch {
      // ignore quota
    }
    return snap;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ILS per 1 unit of foreign currency (approximate).
 * @param {FxSnapshot} snap
 * @param {string} code
 * @returns {number | null}
 */
export function ilsPerUnit(snap, code) {
  if (!snap || !code) return null;
  if (code === "USD") {
    const n = Number(snap.ilsPerUsd);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const foreignPerIls = Number(snap.perIls?.[code]);
  if (!Number.isFinite(foreignPerIls) || foreignPerIls <= 0) return null;
  return 1 / foreignPerIls;
}

/**
 * Convert an amount of `code` into ILS using the snapshot.
 * @param {FxSnapshot} snap
 * @param {string} code
 * @param {number} amount
 * @returns {number | null}
 */
export function convertToIls(snap, code, amount) {
  const rate = ilsPerUnit(snap, code);
  const n = Number(amount);
  if (rate == null || !Number.isFinite(n)) return null;
  return n * rate;
}

/**
 * Format lines like "1 USD ≈ ₪3.70" for UI.
 * @param {FxSnapshot} snap
 * @returns {{ code: string, line: string }[]}
 */
export function formatFxLines(snap) {
  const lines = [];
  for (const code of FX_CURRENCIES) {
    if (code === "ILS") continue;
    const ilsEach = ilsPerUnit(snap, code);
    if (ilsEach == null) continue;
    lines.push({
      code,
      line: `1 ${code} ≈ ₪${formatIlsAmount(ilsEach)}`,
    });
  }
  return lines;
}

/**
 * @param {number} n
 */
export function formatIlsAmount(n) {
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(3);
  return n.toFixed(5);
}

/**
 * @param {number} ts
 */
export function formatFxUpdatedAt(ts) {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}
