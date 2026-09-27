import { KNOWN_TAGS, TAG_LABELS } from "./storage.js";

/**
 * Full-screen sheet for creating / editing an event.
 */

let overlayEl = null;
/** @type {((result: null | { time: string, title: string, description: string, priceILS: string, tags: string[] }) => void) | null} */
let settle = null;

/**
 * @param {{
 *   mode: 'add' | 'edit',
 *   event?: import('./data.js').TripEvent | null,
 * }} options
 * @returns {Promise<null | { time: string, title: string, description: string, priceILS: string, tags: string[] }>}
 */
export function openEventForm(options) {
  ensureOverlay();
  return new Promise((resolve) => {
    settle = resolve;
    fillForm(options);
    overlayEl.hidden = false;
    document.body.classList.add("sheet-open");
    const first = overlayEl.querySelector("#event-time");
    if (first instanceof HTMLElement) first.focus();
  });
}

function closeForm(result) {
  if (!overlayEl) return;
  overlayEl.hidden = true;
  document.body.classList.remove("sheet-open");
  const done = settle;
  settle = null;
  if (done) done(result);
}

function ensureOverlay() {
  if (overlayEl) return;

  overlayEl = document.createElement("div");
  overlayEl.id = "event-sheet";
  overlayEl.className = "sheet";
  overlayEl.hidden = true;
  overlayEl.setAttribute("role", "dialog");
  overlayEl.setAttribute("aria-modal", "true");
  overlayEl.setAttribute("aria-labelledby", "event-sheet-title");

  overlayEl.innerHTML = `
    <div class="sheet__backdrop" data-sheet-dismiss></div>
    <div class="sheet__panel">
      <header class="sheet__header">
        <h2 class="sheet__title" id="event-sheet-title">אירוע</h2>
        <button type="button" class="sheet__close" data-sheet-dismiss aria-label="סגור">×</button>
      </header>
      <form class="sheet__form" id="event-form" novalidate>
        <label class="field">
          <span class="field__label">שעה</span>
          <input class="field__input" id="event-time" name="time" type="time" required dir="ltr" />
        </label>
        <label class="field">
          <span class="field__label">כותרת</span>
          <input class="field__input" id="event-title" name="title" type="text" required maxlength="120" autocomplete="off" />
        </label>
        <label class="field">
          <span class="field__label">תיאור</span>
          <textarea class="field__input field__textarea" id="event-description" name="description" rows="4" maxlength="2000"></textarea>
        </label>
        <label class="field">
          <span class="field__label">מחיר (₪)</span>
          <input class="field__input" id="event-price" name="priceILS" type="number" min="0" step="1" inputmode="decimal" dir="ltr" placeholder="אופציונלי" />
        </label>
        <fieldset class="field field--tags">
          <legend class="field__label">תגיות</legend>
          <div class="tag-picker" id="event-tags"></div>
        </fieldset>
        <p class="field__error" id="event-form-error" hidden></p>
        <div class="sheet__actions">
          <button type="button" class="btn btn--ghost" data-sheet-dismiss>ביטול</button>
          <button type="submit" class="btn btn--primary" id="event-submit">שמירה</button>
        </div>
      </form>
    </div>
  `;

  const tagPicker = overlayEl.querySelector("#event-tags");
  for (const tag of KNOWN_TAGS) {
    const label = document.createElement("label");
    label.className = "tag-picker__item";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "tags";
    input.value = tag;
    const text = document.createElement("span");
    text.textContent = TAG_LABELS[tag] || tag;
    label.append(input, text);
    tagPicker.append(label);
  }

  overlayEl.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.hasAttribute("data-sheet-dismiss")) {
      closeForm(null);
    }
  });

  const form = overlayEl.querySelector("#event-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const errorEl = overlayEl.querySelector("#event-form-error");
    const timeInput = /** @type {HTMLInputElement} */ (overlayEl.querySelector("#event-time"));
    const titleInput = /** @type {HTMLInputElement} */ (overlayEl.querySelector("#event-title"));
    const descInput = /** @type {HTMLTextAreaElement} */ (overlayEl.querySelector("#event-description"));
    const priceInput = /** @type {HTMLInputElement} */ (overlayEl.querySelector("#event-price"));

    const time = timeInput.value.trim();
    const title = titleInput.value.trim();
    if (!time || !title) {
      errorEl.hidden = false;
      errorEl.textContent = "יש למלא שעה וכותרת";
      return;
    }
    errorEl.hidden = true;

    const tags = [...overlayEl.querySelectorAll('input[name="tags"]:checked')].map(
      (el) => /** @type {HTMLInputElement} */ (el).value
    );

    closeForm({
      time: normalizeTime(time),
      title,
      description: descInput.value,
      priceILS: priceInput.value,
      tags,
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlayEl && !overlayEl.hidden) {
      closeForm(null);
    }
  });

  document.body.append(overlayEl);
}

/**
 * @param {{ mode: 'add' | 'edit', event?: import('./data.js').TripEvent | null }} options
 */
function fillForm(options) {
  const titleEl = overlayEl.querySelector("#event-sheet-title");
  const submitEl = overlayEl.querySelector("#event-submit");
  const errorEl = overlayEl.querySelector("#event-form-error");
  titleEl.textContent = options.mode === "edit" ? "עריכת אירוע" : "אירוע חדש";
  submitEl.textContent = "שמירה";
  errorEl.hidden = true;
  errorEl.textContent = "";

  const event = options.event || {};
  /** @type {HTMLInputElement} */ (overlayEl.querySelector("#event-time")).value =
    toTimeInputValue(event.time);
  /** @type {HTMLInputElement} */ (overlayEl.querySelector("#event-title")).value =
    event.title || "";
  /** @type {HTMLTextAreaElement} */ (overlayEl.querySelector("#event-description")).value =
    event.description || "";
  /** @type {HTMLInputElement} */ (overlayEl.querySelector("#event-price")).value =
    event.priceILS != null && event.priceILS !== "" ? String(event.priceILS) : "";

  const selected = new Set(Array.isArray(event.tags) ? event.tags : []);
  for (const input of overlayEl.querySelectorAll('input[name="tags"]')) {
    /** @type {HTMLInputElement} */ (input).checked = selected.has(
      /** @type {HTMLInputElement} */ (input).value
    );
  }
}

/**
 * @param {string} [time]
 */
function toTimeInputValue(time) {
  if (!time) return "";
  const match = String(time).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/**
 * @param {string} time
 */
function normalizeTime(time) {
  const match = String(time).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return time;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}
