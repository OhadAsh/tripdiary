/**
 * Region / timezone presets for TripDiary settings.
 * Maps a friendly country/area choice → IANA timezone (+ local currency hint).
 */

/** @typedef {{ id: string, label: string, timezone: string, currency: string, currencyLabel: string }} Region */

/** @type {Region[]} */
export const REGIONS = [
  {
    id: "vn",
    label: "וייטנאם (הו צ'י מין / האנוי)",
    timezone: "Asia/Ho_Chi_Minh",
    currency: "VND",
    currencyLabel: "דונג",
  },
  {
    id: "th",
    label: "תאילנד (בנגקוק / פוקט)",
    timezone: "Asia/Bangkok",
    currency: "THB",
    currencyLabel: "בהט",
  },
  {
    id: "il",
    label: "ישראל",
    timezone: "Asia/Jerusalem",
    currency: "ILS",
    currencyLabel: "שקל",
  },
  {
    id: "us-east",
    label: "ארה״ב — מזרח",
    timezone: "America/New_York",
    currency: "USD",
    currencyLabel: "דולר",
  },
  {
    id: "eu",
    label: "אירופה (מרכז)",
    timezone: "Europe/Berlin",
    currency: "EUR",
    currencyLabel: "יורו",
  },
];

const REGION_KEY = "tripdiary-region";

/**
 * @param {string} id
 * @returns {Region | null}
 */
export function getRegionById(id) {
  return REGIONS.find((r) => r.id === id) || null;
}

/**
 * @returns {Region | null}
 */
export function getStoredRegion() {
  try {
    const id = localStorage.getItem(REGION_KEY);
    return id ? getRegionById(id) : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} id
 */
export function setStoredRegion(id) {
  const region = getRegionById(id);
  if (!region) {
    try {
      localStorage.removeItem(REGION_KEY);
    } catch {
      // ignore
    }
    return null;
  }
  localStorage.setItem(REGION_KEY, region.id);
  return region;
}

/**
 * Infer a region from trip timezone string when possible.
 * @param {string} [timezone]
 * @returns {Region | null}
 */
export function inferRegionFromTimezone(timezone) {
  if (!timezone) return null;
  const exact = REGIONS.find((r) => r.timezone === timezone);
  if (exact) return exact;
  if (/Bangkok|Phuket/i.test(timezone)) return getRegionById("th");
  if (/Ho_Chi_Minh|Saigon|Hanoi/i.test(timezone)) return getRegionById("vn");
  if (/Jerusalem|Tel_Aviv/i.test(timezone)) return getRegionById("il");
  return null;
}
