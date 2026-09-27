/**
 * TripDiary data types + schema validation + day helpers.
 * No bundled itinerary — data comes from JSON import into localStorage.
 */

/**
 * @typedef {{ id?: string, time: string, title: string, description?: string|null, priceILS?: number|null, tags?: string[] }} TripEvent
 * @typedef {{ date: string, weekday?: string, locationLabel?: string, location?: string, lat?: number, lng?: number, events: TripEvent[] }} TripDay
 * @typedef {{ tripName?: string, timezone?: string, days: TripDay[] }} Trip
 */

/**
 * Validate imported trip JSON. Returns normalized Trip or throws with Hebrew message.
 * @param {unknown} raw
 * @returns {Trip}
 */
export function validateTripSchema(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("הקובץ אינו אובייקט JSON תקין של טיול");
  }
  const obj = /** @type {Record<string, unknown>} */ (raw);
  if (!Array.isArray(obj.days) || obj.days.length === 0) {
    throw new Error("חסר מערך days עם לפחות יום אחד");
  }

  /** @type {TripDay[]} */
  const days = [];
  for (let i = 0; i < obj.days.length; i += 1) {
    const day = obj.days[i];
    if (!day || typeof day !== "object") {
      throw new Error(`יום ${i + 1}: מבנה לא תקין`);
    }
    const d = /** @type {Record<string, unknown>} */ (day);
    const date = String(d.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`יום ${i + 1}: חסר תאריך תקין (YYYY-MM-DD)`);
    }
    const location = String(d.location || d.locationLabel || "").trim();
    if (!location) {
      throw new Error(`יום ${i + 1}: חסר location`);
    }
    const lat = Number(d.lat);
    const lng = Number(d.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error(`יום ${i + 1}: חסרים lat/lng מספריים`);
    }
    if (!Array.isArray(d.events)) {
      throw new Error(`יום ${i + 1}: חסר מערך events`);
    }
    /** @type {TripEvent[]} */
    const events = d.events.map((ev, j) => {
      if (!ev || typeof ev !== "object") {
        throw new Error(`יום ${i + 1}, אירוע ${j + 1}: מבנה לא תקין`);
      }
      const e = /** @type {Record<string, unknown>} */ (ev);
      const tags = Array.isArray(e.tags)
        ? e.tags.map((t) => String(t)).filter(Boolean)
        : [];
      let priceILS = null;
      if (e.priceILS != null && e.priceILS !== "") {
        const n = Number(e.priceILS);
        priceILS = Number.isFinite(n) ? n : null;
      }
      return {
        time: String(e.time || "").trim(),
        title: String(e.title || "").trim() || "ללא כותרת",
        description: e.description == null ? "" : String(e.description),
        priceILS,
        tags,
      };
    });

    days.push({
      date,
      weekday: d.weekday != null ? String(d.weekday) : undefined,
      locationLabel:
        d.locationLabel != null ? String(d.locationLabel) : undefined,
      location: String(d.location || location),
      lat,
      lng,
      events,
    });
  }

  return {
    tripName: obj.tripName != null ? String(obj.tripName) : "טיול",
    timezone: obj.timezone != null ? String(obj.timezone) : undefined,
    days,
  };
}

/**
 * Parse a File / Blob as trip JSON and validate.
 * @param {Blob} file
 * @returns {Promise<Trip>}
 */
export async function parseTripFile(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    throw new Error("לא ניתן לקרוא את הקובץ");
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("הקובץ אינו JSON תקין");
  }
  return validateTripSchema(raw);
}

/**
 * Pick the day index for "today" in the trip timezone when possible.
 * @param {TripDay[]} days
 * @param {string} [timezone]
 * @param {Date} [now]
 * @returns {number}
 */
export function pickDefaultDayIndex(days, timezone, now = new Date()) {
  if (!days.length) return 0;

  const today = formatDateInZone(now, timezone);
  const first = days[0].date;
  const last = days[days.length - 1].date;

  if (today < first) return 0;
  if (today > last) return days.length - 1;

  const exact = days.findIndex((day) => day.date === today);
  if (exact !== -1) return exact;

  let best = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < days.length; i += 1) {
    const delta = Math.abs(dateDiffDays(days[i].date, today));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  return best;
}

/**
 * @param {TripEvent[]} events
 * @returns {TripEvent[]}
 */
export function sortEventsByTime(events) {
  return [...events].sort((a, b) =>
    String(a.time || "").localeCompare(String(b.time || ""))
  );
}

/**
 * @param {Date} date
 * @param {string} [timezone]
 * @returns {string} YYYY-MM-DD
 */
function formatDateInZone(date, timezone) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // Invalid timezone — fall through
  }
  return date.toISOString().slice(0, 10);
}

/**
 * @param {string} a YYYY-MM-DD
 * @param {string} b YYYY-MM-DD
 */
function dateDiffDays(a, b) {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return ms / 86400000;
}
