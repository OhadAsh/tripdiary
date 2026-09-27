/**
 * Phase 3 — OpenRouter outdoor advice (API key in localStorage only).
 */

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Free OpenRouter model (no paid tier required when the :free suffix is available).
 * Router alternative: openrouter/free
 */
export const OPENROUTER_MODEL = "google/gemma-4-26b-a4b-it:free";

const KEY_STORAGE = "openrouter-api-key";

/**
 * @returns {string}
 */
export function getApiKey() {
  try {
    return String(localStorage.getItem(KEY_STORAGE) || "").trim();
  } catch {
    return "";
  }
}

/**
 * @param {string} key
 */
export function setApiKey(key) {
  const value = String(key || "").trim();
  if (!value) {
    clearApiKey();
    return;
  }
  localStorage.setItem(KEY_STORAGE, value);
}

export function clearApiKey() {
  try {
    localStorage.removeItem(KEY_STORAGE);
  } catch {
    // ignore
  }
}

export function hasApiKey() {
  return Boolean(getApiKey());
}

/**
 * Mask for settings UI — never log the full key.
 * @param {string} [key]
 */
export function maskApiKey(key = getApiKey()) {
  const k = String(key || "");
  if (!k) return "";
  if (k.length <= 8) return "••••••••";
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

/**
 * @param {string[] | undefined} tags
 */
export function isOutdoorEvent(tags) {
  if (!Array.isArray(tags)) return false;
  return tags.some((t) => {
    const s = String(t || "").toLowerCase();
    return s === "outdoor" || s === "out" || s.includes("outdoor");
  });
}

/**
 * @param {import('./weather.js').WeatherResult | null | undefined} weather
 */
export function formatWeatherForPrompt(weather) {
  if (!weather) return "אין סיכום מזג אוויר זמין ליום זה.";
  const codeBit =
    weather.weatherCode != null ? ` קוד מזג ${weather.weatherCode}.` : "";
  const rainBit =
    weather.source === "historical"
      ? `סיכוי לגשם היסטורי ${weather.rainChance}% (תדירות ימי גשם ≥1 מ״מ ב־5 שנים).`
      : `סיכוי לגשם ${weather.rainChance}%.`;
  return (
    `${weather.label}: מקס ${weather.tempMax}°, מינ ${weather.tempMin}°, ` +
    `${rainBit}${codeBit}`
  );
}

/**
 * Ask OpenRouter for a short outdoor suitability note.
 * @param {{
 *   title: string,
 *   description?: string|null,
 *   weatherSummary: string,
 *   dayDate?: string,
 *   location?: string,
 * }} input
 * @returns {Promise<string>}
 */
export async function fetchOutdoorAdvice(input) {
  const apiKey = getApiKey();
  if (!apiKey) {
    const err = new Error("NO_API_KEY");
    err.code = "NO_API_KEY";
    throw err;
  }

  const title = String(input.title || "").trim() || "פעילות בחוץ";
  const description = String(input.description || "").trim();
  const place = [input.location, input.dayDate].filter(Boolean).join(", ");

  const system =
    "אתה יועץ טיול קצר בעברית. ענה ב־1–3 משפטים בלבד. " +
    "האם סביר לבצע את הפעילות בחוץ לפי מזג האוויר? " +
    "אם לא — הצע חלופה קצרה אחת. בלי הקדמות ובלי רשימות.";

  const user = [
    place ? `מיקום/תאריך: ${place}` : null,
    `פעילות: ${title}`,
    description ? `תיאור: ${description}` : null,
    `מזג אוויר: ${input.weatherSummary}`,
  ]
    .filter(Boolean)
    .join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          typeof location !== "undefined" ? location.origin : "http://localhost",
        "X-Title": "TripDiary Outdoor Advice",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature: 0.4,
        max_tokens: 180,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (response.status === 401 || response.status === 403) {
      const err = new Error("מפתח OpenRouter לא תקין");
      err.code = "AUTH";
      throw err;
    }
    if (response.status === 429) {
      const err = new Error("חריגה ממכסה — נסו שוב בעוד רגע");
      err.code = "RATE_LIMIT";
      throw err;
    }
    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        detail = body?.error?.message || "";
      } catch {
        // ignore
      }
      const err = new Error(detail || `שגיאת OpenRouter (${response.status})`);
      err.code = "HTTP";
      throw err;
    }

    const data = await response.json();
    const text =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      "";
    const cleaned = String(text).trim();
    if (!cleaned) {
      const err = new Error("התקבלה תשובה ריקה");
      err.code = "EMPTY";
      throw err;
    }
    return cleaned;
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeout = new Error("הבקשה ארכה מדי — נסו שוב");
      timeout.code = "TIMEOUT";
      throw timeout;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hebrew status when the feature is disabled (no key).
 */
export const NO_KEY_MESSAGE =
  "כדי לקבל המלצה לפעילויות בחוץ, הוסיפו מפתח OpenRouter בהגדרות.";
