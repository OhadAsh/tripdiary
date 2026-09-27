import {
  parseTripFile,
  pickDefaultDayIndex,
} from "./data.js";
import {
  renderHeader,
  renderDayTabs,
  renderDay,
  syncDayTabsSelection,
} from "./render.js";
import { attachDaySwipe } from "./swipe.js";
import { openEventForm } from "./event-form.js";
import {
  loadStoredTrip,
  saveWorkingTrip,
  clearWorkingTrip,
  importTrip,
  fieldsToEvent,
  newEventId,
  downloadTripJson,
} from "./storage.js";
import { mountDayWeather, getDayWeather } from "./weather.js";
import {
  fetchOutdoorAdvice,
  formatWeatherForPrompt,
  hasApiKey,
  NO_KEY_MESSAGE,
} from "./ai.js";
import { openSettings } from "./settings.js";
import { openFxSheet } from "./fx-sheet.js";
import { getStoredRegion } from "./regions.js";

const titleEl = document.getElementById("trip-title");
const metaEl = document.getElementById("trip-meta");
const tabsEl = document.getElementById("day-tabs");
const panelEl = document.getElementById("day-panel");
const statusBoot = document.getElementById("status");
const exportBtn = document.getElementById("export-trip");
const resetBtn = document.getElementById("reset-trip");
const settingsBtn = document.getElementById("open-settings");
const fxBtn = document.getElementById("open-fx");
const importBtn = document.getElementById("import-trip");
const importInput = document.getElementById("import-file");
const emptyEl = document.getElementById("empty-state");
const emptyImportBtn = document.getElementById("empty-import");
const appTopEl = document.querySelector(".app-top");
const importErrorEl = document.getElementById("import-error");

/** @type {import('./data.js').Trip | null} */
let trip = null;
let dayIndex = 0;
let weatherToken = 0;
/** @type {(() => void) | null} */
let detachSwipe = null;

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function showImportError(message) {
  const targets = [importErrorEl, document.getElementById("empty-import-error")];
  for (const el of targets) {
    if (!(el instanceof HTMLElement)) continue;
    el.hidden = !message;
    el.textContent = message || "";
  }
}

function setChromeVisible(hasTrip) {
  if (appTopEl instanceof HTMLElement) appTopEl.hidden = !hasTrip;
  if (panelEl) panelEl.hidden = !hasTrip;
  if (emptyEl) emptyEl.hidden = hasTrip;
  if (exportBtn instanceof HTMLButtonElement) exportBtn.disabled = !hasTrip;
  if (resetBtn instanceof HTMLButtonElement) resetBtn.disabled = !hasTrip;
  if (fxBtn instanceof HTMLButtonElement) fxBtn.disabled = !hasTrip;
  document.title = hasTrip && trip?.tripName ? trip.tripName : "TripDiary";
  if (!hasTrip && titleEl) {
    titleEl.textContent = "TripDiary";
  }
  if (!hasTrip && metaEl) {
    metaEl.hidden = true;
    metaEl.replaceChildren();
  }
}

/** Apply settings region timezone onto the in-memory trip (and persist). */
function applyStoredRegionToTrip() {
  if (!trip) return false;
  const region = getStoredRegion();
  if (!region) return false;
  if (trip.timezone === region.timezone) return false;
  trip.timezone = region.timezone;
  persist();
  return true;
}

function dayActions() {
  return {
    onAdd: () => void addEvent(),
    onEdit: (event) => void editEvent(event),
    onOutdoorAdvice: (event, panel) => void runOutdoorAdvice(event, panel),
  };
}

/**
 * @param {import('./data.js').TripEvent} event
 * @param {HTMLElement} panel
 */
async function runOutdoorAdvice(event, panel) {
  if (!trip) return;
  if (!hasApiKey()) {
    panel.hidden = false;
    panel.className = "outdoor-advice__panel outdoor-advice__panel--info";
    panel.textContent = NO_KEY_MESSAGE;
    return;
  }

  panel.hidden = false;
  panel.className = "outdoor-advice__panel outdoor-advice__panel--loading";
  panel.textContent = "בודקים מזג אוויר והמלצה…";

  const day = trip.days[dayIndex];
  try {
    let weatherSummary = "אין סיכום מזג אוויר זמין ליום זה.";
    try {
      const weather = await getDayWeather({
        lat: day.lat,
        lng: day.lng,
        date: day.date,
      });
      weatherSummary = formatWeatherForPrompt(weather);
    } catch {
      // continue
    }

    const advice = await fetchOutdoorAdvice({
      title: event.title,
      description: event.description,
      weatherSummary,
      dayDate: day.date,
      location: day.locationLabel || day.location || "",
    });

    if (!panel.isConnected) return;
    panel.className = "outdoor-advice__panel outdoor-advice__panel--ok";
    panel.textContent = advice;
  } catch (err) {
    if (!panel.isConnected) return;
    const code = err?.code;
    panel.className = "outdoor-advice__panel outdoor-advice__panel--error";
    if (code === "NO_API_KEY") {
      panel.className = "outdoor-advice__panel outdoor-advice__panel--info";
      panel.textContent = NO_KEY_MESSAGE;
    } else if (code === "RATE_LIMIT") {
      panel.textContent = "חריגה ממכסה — נסו שוב בעוד רגע.";
    } else if (code === "AUTH") {
      panel.textContent = "מפתח OpenRouter לא תקין. בדקו בהגדרות.";
    } else if (code === "TIMEOUT") {
      panel.textContent = "הבקשה ארכה מדי — נסו שוב.";
    } else {
      panel.textContent =
        err instanceof Error ? err.message : "לא הצלחנו לקבל המלצה כרגע.";
    }
  }
}

function refreshWeather() {
  if (!trip || !panelEl) return;
  const slot = panelEl.querySelector("[data-weather-slot]");
  if (!(slot instanceof HTMLElement)) return;
  weatherToken += 1;
  const token = weatherToken;
  const day = trip.days[dayIndex];
  void mountDayWeather(slot, day, trip.timezone).then(() => {
    if (token !== weatherToken) return;
  });
}

function dayContext() {
  return {
    dayIndex,
    dayCount: trip?.days?.length || 0,
  };
}

function refreshDay() {
  if (!trip || !tabsEl || !panelEl) return;
  syncDayTabsSelection(tabsEl, dayIndex);
  renderDay(trip.days[dayIndex], panelEl, dayActions(), dayContext());
  refreshWeather();
}

function selectDay(index) {
  if (!trip || !tabsEl || !panelEl) return;
  const max = trip.days.length - 1;
  dayIndex = Math.max(0, Math.min(max, index));
  refreshDay();
  panelEl.focus({ preventScroll: true });
}

function persist() {
  if (!trip) return;
  saveWorkingTrip(trip);
}

function showEmptyState() {
  trip = null;
  dayIndex = 0;
  if (detachSwipe) {
    detachSwipe();
    detachSwipe = null;
  }
  if (tabsEl) tabsEl.replaceChildren();
  if (panelEl) panelEl.replaceChildren();
  setChromeVisible(false);
  showImportError("");
}

function showLoadedTrip(nextTrip, preferKeepDay = false) {
  trip = nextTrip;
  applyStoredRegionToTrip();
  setChromeVisible(true);
  if (titleEl && metaEl) renderHeader(trip, titleEl, metaEl);

  const prev = dayIndex;
  dayIndex = pickDefaultDayIndex(trip.days, trip.timezone);
  if (preferKeepDay && prev >= 0 && prev < trip.days.length) {
    dayIndex = prev;
  }

  if (tabsEl) renderDayTabs(trip.days, tabsEl, dayIndex, selectDay);
  if (panelEl) {
    renderDay(trip.days[dayIndex], panelEl, dayActions(), dayContext());
    refreshWeather();
    if (!detachSwipe) {
      detachSwipe = attachDaySwipe(panelEl, {
        onPrev: () => selectDay(dayIndex - 1),
        onNext: () => selectDay(dayIndex + 1),
      });
    }
  }
  showImportError("");
}

async function addEvent() {
  if (!trip) return;
  const fields = await openEventForm({ mode: "add" });
  if (!fields) return;
  const event = { ...fieldsToEvent(fields), id: newEventId() };
  if (!event.title) return;
  trip.days[dayIndex].events.push(event);
  persist();
  refreshDay();
}

/**
 * @param {import('./data.js').TripEvent} event
 */
async function editEvent(event) {
  if (!trip || !event?.id) return;
  const fields = await openEventForm({ mode: "edit", event });
  if (!fields) return;
  const updated = fieldsToEvent(fields);
  const events = trip.days[dayIndex].events;
  const idx = events.findIndex((e) => e.id === event.id);
  if (idx === -1) return;
  events[idx] = { ...events[idx], ...updated, id: event.id };
  persist();
  refreshDay();
}

function triggerImportPicker() {
  showImportError("");
  if (importInput instanceof HTMLInputElement) {
    importInput.value = "";
    importInput.click();
  }
}

/**
 * @param {File} file
 */
async function handleImportFile(file) {
  try {
    const parsed = await parseTripFile(file);
    if (trip) {
      const ok = window.confirm(
        "ייבוא יחליף את כל הנתונים הנוכחיים, להמשיך?"
      );
      if (!ok) return;
    }
    const loaded = importTrip(parsed);
    showLoadedTrip(loaded, false);
  } catch (err) {
    console.warn(err);
    showImportError(
      err instanceof Error ? err.message : "ייבוא נכשל — הנתונים הקיימים לא שונו"
    );
  }
}

function init() {
  if (statusBoot) statusBoot.remove();

  const stored = loadStoredTrip();
  if (stored) {
    showLoadedTrip(stored, false);
  } else {
    showEmptyState();
  }

  tabsEl?.addEventListener("keydown", (event) => {
    if (!trip) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectDay(dayIndex + 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      selectDay(dayIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectDay(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectDay(trip.days.length - 1);
    }
  });

  exportBtn?.addEventListener("click", () => {
    if (trip) downloadTripJson(trip);
  });

  resetBtn?.addEventListener("click", () => {
    const ok = window.confirm(
      "למחוק את כל נתוני הטיול מהמכשיר? פעולה זו אינה ניתנת לביטול."
    );
    if (!ok) return;
    clearWorkingTrip();
    showEmptyState();
  });

  const openSettingsUi = () => openSettings(trip ? { timezone: trip.timezone } : null);
  settingsBtn?.addEventListener("click", openSettingsUi);
  fxBtn?.addEventListener("click", () => openFxSheet());
  document.addEventListener("trip:settings-changed", () => {
    if (trip) refreshDay();
  });
  document.addEventListener("trip:region-changed", () => {
    if (!trip) return;
    applyStoredRegionToTrip();
    if (titleEl && metaEl) renderHeader(trip, titleEl, metaEl);
    refreshWeather();
  });

  importBtn?.addEventListener("click", () => triggerImportPicker());
  emptyImportBtn?.addEventListener("click", () => triggerImportPicker());
  document.getElementById("empty-settings")?.addEventListener("click", openSettingsUi);

  importInput?.addEventListener("change", () => {
    const input = /** @type {HTMLInputElement} */ (importInput);
    const file = input.files?.[0];
    if (!file) return;
    void handleImportFile(file);
  });
}

if ("serviceWorker" in navigator) {
  // Reload once when a new SW claims the page (picks up scroll/CSS fixes on Brave).
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    // Relative URL keeps SW working under GitHub Pages project paths.
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      reg.update().catch(() => {});
    }).catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}

init();
