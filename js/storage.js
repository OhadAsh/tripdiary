/**
 * TripDiary persistence — itinerary lives only in localStorage after import.
 */

import { validateTripSchema } from "./data.js";

export const STORAGE_KEY = "tripdiary-v1";

/** Known tag values used in the itinerary UI */
export const KNOWN_TAGS = ["flight", "food", "indoor", "outdoor"];

/** @type {Record<string, string>} */
export const TAG_LABELS = {
  flight: "טיסה",
  food: "אוכל",
  indoor: "מקורה",
  outdoor: "בחוץ",
};

/**
 * @returns {import('./data.js').Trip | null}
 */
export function loadStoredTrip() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    // One-time migrate from pre-TripDiary key if present
    if (!raw) {
      const legacy = localStorage.getItem("trip-working-v1");
      if (legacy) {
        raw = legacy;
        localStorage.setItem(STORAGE_KEY, legacy);
        localStorage.removeItem("trip-working-v1");
      }
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return ensureEventIds(validateTripSchema(parsed));
  } catch (err) {
    console.warn("Failed to load stored trip:", err);
    return null;
  }
}

/**
 * @param {import('./data.js').Trip} trip
 */
export function saveWorkingTrip(trip) {
  try {
    const clean = stripForStorage(trip);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch (err) {
    console.warn("Failed to save trip to localStorage:", err);
    throw new Error("לא ניתן לשמור את הטיול במכשיר");
  }
}

export function clearWorkingTrip() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Import replaces existing data entirely.
 * @param {import('./data.js').Trip} trip
 */
export function importTrip(trip) {
  const normalized = ensureEventIds(cloneTrip(trip));
  saveWorkingTrip(normalized);
  return normalized;
}

/**
 * Ensure every event has a stable id for edit/update.
 * @param {import('./data.js').Trip} trip
 * @returns {import('./data.js').Trip}
 */
export function ensureEventIds(trip) {
  for (const day of trip.days || []) {
    if (!Array.isArray(day.events)) day.events = [];
    day.events.forEach((event, index) => {
      if (!event.id) {
        event.id = `${day.date}:${index}:${slug(event.time)}:${slug(event.title)}`;
      }
    });
  }
  return trip;
}

/**
 * @param {string} [value]
 */
function slug(value) {
  return String(value || "")
    .trim()
    .slice(0, 24)
    .replace(/\s+/g, "-");
}

/**
 * @returns {string}
 */
export function newEventId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `local:${crypto.randomUUID()}`;
  }
  return `local:${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Normalize form values into a TripEvent (without id).
 * @param {{ time: string, title: string, description: string, priceILS: string, tags: string[] }} fields
 * @returns {import('./data.js').TripEvent}
 */
export function fieldsToEvent(fields) {
  const time = String(fields.time || "").trim();
  const title = String(fields.title || "").trim();
  const description = String(fields.description || "").trim();
  const priceRaw = String(fields.priceILS ?? "").trim();
  let priceILS = null;
  if (priceRaw !== "") {
    const n = Number(priceRaw);
    priceILS = Number.isFinite(n) ? n : null;
  }
  const tags = (fields.tags || []).filter((t) => KNOWN_TAGS.includes(t));
  return {
    time,
    title,
    description: description || "",
    priceILS,
    tags,
  };
}

/**
 * Export schema matches import (no internal ids).
 * @param {import('./data.js').Trip} trip
 * @returns {import('./data.js').Trip}
 */
export function toExportTrip(trip) {
  const exportTrip = cloneTrip(trip);
  for (const day of exportTrip.days || []) {
    for (const event of day.events || []) {
      delete event.id;
    }
  }
  return exportTrip;
}

/**
 * Download trip JSON for round-trip import on another device.
 * @param {import('./data.js').Trip} trip
 * @param {string} [filename]
 */
export function downloadTripJson(trip, filename = "tripdiary.json") {
  const exportTrip = toExportTrip(trip);
  const blob = new Blob([JSON.stringify(exportTrip, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * @param {import('./data.js').Trip} trip
 */
function stripForStorage(trip) {
  return cloneTrip(trip);
}

/**
 * @param {import('./data.js').Trip} trip
 * @returns {import('./data.js').Trip}
 */
function cloneTrip(trip) {
  return /** @type {import('./data.js').Trip} */ (
    JSON.parse(JSON.stringify(trip))
  );
}
