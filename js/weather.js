/**
 * Phase 2 weather — Open-Meteo forecast + archive only (no climate-api).
 */

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const FORECAST_DAILY =
  "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode";
/** Archive rarely fills precipitation_probability_* — use precip sum for wet-day rate. */
const ARCHIVE_DAILY =
  "temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode";

/** Live forecast when 0 <= (day − today) <= 15 */
export const FORECAST_MAX_DIFF_DAYS = 15;

const FORECAST_TTL_MS = 6 * 60 * 60 * 1000;
/** v2: historical rain uses wet-day frequency from precip sum (invalidates old 100% caches). */
const STORAGE_PREFIX = "weather:v2:";

/** ≥1 mm counts as a wet day for historical frequency (avoids counting trace drizzle as certainty). */
const WET_DAY_MM = 1;

const LABEL_FORECAST = "תחזית עדכנית";
const LABEL_HISTORICAL = "ממוצע היסטורי";

/** @type {Map<string, Promise<WeatherResult>>} */
const inflight = new Map();

/**
 * @typedef {{
 *   source: 'forecast' | 'historical',
 *   label: string,
 *   tempMax: number,
 *   tempMin: number,
 *   rainChance: number,
 *   weatherCode: number | null,
 * }} WeatherResult
 */

/**
 * Optional demo override: ?asOf=YYYY-MM-DD (weather window only).
 * @returns {Date}
 */
export function getWeatherAsOfDate() {
  try {
    const asOf = new URLSearchParams(location.search).get("asOf");
    if (asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      return new Date(`${asOf}T12:00:00`);
    }
  } catch {
    // ignore
  }
  return new Date();
}

/**
 * @param {string} dateStr YYYY-MM-DD
 * @param {Date} [now]
 * @returns {number} day.date − today in whole days
 */
export function diffDaysFromToday(dateStr, now = getWeatherAsOfDate()) {
  const today = formatDateUTC(now);
  return dateDiffDays(dateStr, today);
}

/**
 * @param {string} dateStr
 * @param {Date} [now]
 * @returns {'forecast' | 'historical'}
 */
export function weatherSourceForDate(dateStr, now = getWeatherAsOfDate()) {
  const diff = diffDaysFromToday(dateStr, now);
  if (diff >= 0 && diff <= FORECAST_MAX_DIFF_DAYS) return "forecast";
  return "historical";
}

/**
 * @param {{
 *   lat: number,
 *   lng: number,
 *   date: string,
 *   now?: Date,
 * }} opts
 * @returns {Promise<WeatherResult>}
 */
export async function getDayWeather(opts) {
  const { lat, lng, date } = opts;
  const now = opts.now || getWeatherAsOfDate();
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !date) {
    throw new Error("חסר מיקום או תאריך למזג האוויר");
  }

  const source = weatherSourceForDate(date, now);
  const cacheKey = storageKey(date, lat, lng);

  const fromStore = readCache(cacheKey, source);
  if (fromStore) return fromStore;

  let pending = inflight.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      const result =
        source === "forecast"
          ? await fetchForecast(lat, lng, date)
          : await fetchHistoricalAverage(lat, lng, date);
      writeCache(cacheKey, result);
      return result;
    })().finally(() => inflight.delete(cacheKey));
    inflight.set(cacheKey, pending);
  }
  return pending;
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {string} date
 * @returns {Promise<WeatherResult>}
 */
async function fetchForecast(lat, lng, date) {
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
  url.searchParams.set("daily", FORECAST_DAILY);
  url.searchParams.set("timezone", "auto");

  const data = await fetchJson(url, 12000);
  const daily = data.daily;
  if (!daily?.time?.length) throw new Error("אין נתוני תחזית ליום זה");

  const idx = Math.max(0, daily.time.indexOf(date));
  const code = readCode(daily, idx);

  return {
    source: "forecast",
    label: LABEL_FORECAST,
    tempMax: roundTemp(daily.temperature_2m_max[idx]),
    tempMin: roundTemp(daily.temperature_2m_min[idx]),
    rainChance: clampPct(daily.precipitation_probability_max[idx]),
    weatherCode: code,
  };
}

/**
 * Five archive requests: same calendar day for each of the last 5 years
 * relative to the trip day (e.g. YYYY-MM-DD → same day in each of the prior 5 years).
 * Rain metric = wet-day frequency from precipitation_sum (≥1 mm), not archive
 * precipitation_probability (almost always null → old WMO fallback showed 100%).
 * @param {number} lat
 * @param {number} lng
 * @param {string} date
 * @returns {Promise<WeatherResult>}
 */
async function fetchHistoricalAverage(lat, lng, date) {
  const [yearStr, month, day] = date.split("-");
  const year = Number(yearStr);
  if (!year || !month || !day) throw new Error("תאריך לא תקין");

  const years = [year - 5, year - 4, year - 3, year - 2, year - 1];
  const samples = await Promise.all(
    years.map(async (y) => {
      const histDate = `${y}-${month}-${day}`;
      const url = new URL(ARCHIVE_URL);
      url.searchParams.set("latitude", String(lat));
      url.searchParams.set("longitude", String(lng));
      url.searchParams.set("start_date", histDate);
      url.searchParams.set("end_date", histDate);
      url.searchParams.set("daily", ARCHIVE_DAILY);
      url.searchParams.set("timezone", "auto");

      const data = await fetchJson(url, 12000);
      const daily = data.daily;
      if (!daily?.time?.length) return null;

      const sumRaw = daily.precipitation_sum?.[0];
      const sum =
        sumRaw == null || sumRaw === "" ? null : Number(sumRaw);

      return {
        max: daily.temperature_2m_max[0],
        min: daily.temperature_2m_min[0],
        precipSum: Number.isFinite(sum) ? sum : null,
        code: readCode(daily, 0),
      };
    })
  );

  const valid = samples.filter(Boolean);
  if (!valid.length) throw new Error("אין נתונים היסטוריים");

  const withSum = valid.filter((s) => s.precipSum != null);
  let rainChance;
  if (withSum.length) {
    const wet = withSum.filter((s) => s.precipSum >= WET_DAY_MM).length;
    rainChance = (100 * wet) / withSum.length;
  } else {
    // Last resort if precip_sum missing entirely.
    const rainy = valid.filter((s) => isRainyCode(s.code)).length;
    rainChance = (100 * rainy) / valid.length;
  }

  const codes = valid
    .map((s) => s.code)
    .filter((c) => c != null && Number.isFinite(c));

  return {
    source: "historical",
    label: LABEL_HISTORICAL,
    tempMax: roundTemp(avg(valid.map((s) => s.max))),
    tempMin: roundTemp(avg(valid.map((s) => s.min))),
    rainChance: clampPct(rainChance),
    weatherCode: mode(codes),
  };
}

/**
 * @param {HTMLElement} container
 * @param {import('./data.js').TripDay} day
 * @param {string} [_timezone] unused — API uses timezone=auto
 * @param {{ now?: Date }} [opts]
 */
export async function mountDayWeather(container, day, _timezone, opts = {}) {
  container.hidden = false;
  container.replaceChildren();
  container.className = "weather-card weather-card--loading";
  container.setAttribute("aria-busy", "true");
  container.innerHTML = `<span class="weather-card__status">טוען מזג אוויר…</span>`;

  try {
    // Strictly per-day coordinates from the imported trip — never country/region presets.
    const weather = await getDayWeather({
      lat: day.lat,
      lng: day.lng,
      date: day.date,
      now: opts.now,
    });
    if (!container.isConnected) return;
    const place = String(day.locationLabel || day.location || "").trim();
    renderWeatherSuccess(container, weather, place);
  } catch (err) {
    console.warn(err);
    if (!container.isConnected) return;
    container.className = "weather-card weather-card--error";
    container.removeAttribute("aria-busy");
    container.innerHTML = `<span class="weather-card__status">לא זמין</span>`;
  }
}

/**
 * @param {HTMLElement} container
 * @param {WeatherResult} weather
 * @param {string} [place]
 */
function renderWeatherSuccess(container, weather, place = "") {
  container.hidden = false;
  container.className = `weather-card weather-card--${weather.source}`;
  container.removeAttribute("aria-busy");
  container.replaceChildren();

  const wmo = describeWeatherCode(weather.weatherCode);

  const icon = document.createElement("div");
  icon.className = "weather-card__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = wmo.emoji || "🌤️";

  const main = document.createElement("div");
  main.className = "weather-card__main";

  const temps = document.createElement("p");
  temps.className = "weather-card__temps";
  temps.dir = "ltr";
  temps.innerHTML = `<span class="weather-card__max">${weather.tempMax}°</span><span class="weather-card__sep">/</span><span class="weather-card__min">${weather.tempMin}°</span>`;

  const rain = document.createElement("p");
  rain.className = "weather-card__rain";
  // One condition word + one short rain % — avoid «גשם · גשם ב־…».
  rain.textContent = `${wmo.text} · סיכוי לגשם ${weather.rainChance}%`;
  if (weather.source === "historical") {
    // Tooltip keeps wet-day meaning without cluttering the phone UI.
    // LTR isolate so ≥1 does not visually flip to 1≤ in RTL.
    rain.title =
      "תדירות ימי גשם ב־5 השנים האחרונות (\u2066≥1 מ״מ\u2069)";
  }

  const label = document.createElement("p");
  label.className = "weather-card__label";
  // Short footer: source + day city (same day object used for lat/lng).
  label.textContent = place ? `${weather.label} · ${place}` : weather.label;

  main.append(temps, rain, label);
  container.append(icon, main);
}

/**
 * Fixed WMO table (emoji + Hebrew). Do not invent codes beyond this map.
 * @param {number | null} code
 * @returns {{ emoji: string, text: string }}
 */
export function describeWeatherCode(code) {
  const c = code == null ? NaN : Number(code);
  switch (c) {
    case 0:
      return { emoji: "☀️", text: "בהיר" };
    case 1:
      return { emoji: "🌤️", text: "בהיר בעיקר" };
    case 2:
      return { emoji: "⛅", text: "מעונן חלקית" };
    case 3:
      return { emoji: "☁️", text: "מעונן מלא" };
    case 45:
    case 48:
      return { emoji: "🌫️", text: "ערפל" };
    case 51:
    case 53:
    case 55:
      return { emoji: "🌦️", text: "טפטוף" };
    case 61:
    case 63:
    case 65:
      return { emoji: "🌧️", text: "גשם" };
    case 71:
    case 73:
    case 75:
      return { emoji: "🌨️", text: "שלג" };
    case 80:
    case 81:
    case 82:
      return { emoji: "🌦️", text: "ממטרים" };
    case 95:
    case 96:
    case 97:
    case 99:
      return { emoji: "⛈️", text: "סופת רעמים" };
    default:
      return { emoji: "🌤️", text: "מזג אוויר" };
  }
}

/**
 * @param {number | null} code
 */
function isRainyCode(code) {
  const c = Number(code);
  if (!Number.isFinite(c)) return false;
  return (
    (c >= 51 && c <= 67) ||
    (c >= 80 && c <= 82) ||
    (c >= 95 && c <= 99)
  );
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {string} date
 */
function storageKey(date, lat, lng) {
  return `${STORAGE_PREFIX}${date}:${lat}:${lng}`;
}

/**
 * @param {string} key
 * @param {'forecast' | 'historical'} source
 * @returns {WeatherResult | null}
 */
function readCache(key, source) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.result || !parsed?.ts) return null;
    if (parsed.result.source !== source) return null;
    if (source === "forecast" && Date.now() - parsed.ts > FORECAST_TTL_MS) {
      return null;
    }
    // historical: permanent
    return parsed.result;
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {WeatherResult} result
 */
function writeCache(key, result) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ ts: Date.now(), result })
    );
  } catch (err) {
    console.warn("weather cache write failed:", err);
  }
}

/**
 * @param {URL | string} url
 * @param {number} timeoutMs
 */
async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(String(url), { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Open-Meteo error (${response.status})`);
    }
    const data = await response.json();
    if (data?.error) {
      throw new Error(data.reason || "Open-Meteo error");
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{ weathercode?: unknown[], weather_code?: unknown[] }} daily
 * @param {number} idx
 * @returns {number | null}
 */
function readCode(daily, idx) {
  const raw = daily.weathercode?.[idx] ?? daily.weather_code?.[idx];
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {number[]} values
 */
function avg(values) {
  const nums = values.map(Number).filter((n) => Number.isFinite(n));
  if (!nums.length) return NaN;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * @param {number[]} values
 * @returns {number | null}
 */
function mode(values) {
  if (!values.length) return null;
  /** @type {Map<number, number>} */
  const counts = new Map();
  for (const v of values) {
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = values[0];
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

/**
 * @param {unknown} value
 */
function roundTemp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

/**
 * @param {unknown} value
 */
function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * @param {Date} date
 */
function formatDateUTC(date) {
  // Calendar "today" in local/asOf sense (asOf already noon local-ish).
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * @param {string} a
 * @param {string} b
 */
function dateDiffDays(a, b) {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return Math.round(ms / 86400000);
}
