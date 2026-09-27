import {
  getApiKey,
  setApiKey,
  clearApiKey,
  hasApiKey,
  maskApiKey,
  OPENROUTER_MODEL,
} from "./ai.js";
import {
  REGIONS,
  getStoredRegion,
  setStoredRegion,
  inferRegionFromTimezone,
} from "./regions.js";

/**
 * Settings sheet: OpenRouter key + region/timezone.
 */

let overlayEl = null;

/**
 * @param {{ timezone?: string } | null} [tripHint]
 */
export function openSettings(tripHint = null) {
  ensureOverlay();
  fillForm(tripHint);
  overlayEl.hidden = false;
  document.body.classList.add("sheet-open");
  const input = /** @type {HTMLInputElement | null} */ (
    overlayEl.querySelector("#or-key")
  );
  if (input && !hasApiKey()) input.focus();
}

export function closeSettings() {
  if (!overlayEl) return;
  overlayEl.hidden = true;
  document.body.classList.remove("sheet-open");
}

function ensureOverlay() {
  if (overlayEl) return;

  overlayEl = document.createElement("div");
  overlayEl.id = "settings-sheet";
  overlayEl.className = "sheet";
  overlayEl.hidden = true;
  overlayEl.setAttribute("role", "dialog");
  overlayEl.setAttribute("aria-modal", "true");
  overlayEl.setAttribute("aria-labelledby", "settings-title");

  const regionOptions = REGIONS.map(
    (r) => `<option value="${r.id}">${r.label}</option>`
  ).join("");

  overlayEl.innerHTML = `
    <div class="sheet__backdrop" data-settings-dismiss></div>
    <div class="sheet__panel">
      <header class="sheet__header">
        <h2 class="sheet__title" id="settings-title">הגדרות</h2>
        <button type="button" class="sheet__close" data-settings-dismiss aria-label="סגור">×</button>
      </header>
      <form class="sheet__form" id="settings-form">
        <label class="field">
          <span class="field__label">מדינה / אזור (אזור זמן)</span>
          <select class="field__input" id="region-select" name="region">
            <option value="">לפי קובץ הטיול</option>
            ${regionOptions}
          </select>
        </label>
        <p class="settings-meta settings-meta--muted" id="region-hint"></p>

        <p class="settings-lead">
          מפתח OpenRouter נשמר רק במכשיר שלכם ומשמש להמלצות לפעילויות בחוץ.
        </p>
        <label class="field">
          <span class="field__label">מפתח OpenRouter</span>
          <input
            class="field__input"
            id="or-key"
            name="apiKey"
            type="password"
            autocomplete="off"
            spellcheck="false"
            dir="ltr"
            placeholder="sk-or-…"
          />
        </label>
        <p class="settings-meta" id="or-status"></p>
        <p class="settings-meta settings-meta--muted">
          מודל חינמי: <span dir="ltr">${OPENROUTER_MODEL}</span>
        </p>
        <div class="sheet__actions sheet__actions--3">
          <button type="button" class="btn btn--ghost" id="or-clear">מחק מפתח</button>
          <button type="button" class="btn btn--ghost" data-settings-dismiss>סגור</button>
          <button type="submit" class="btn btn--primary">שמירה</button>
        </div>
      </form>
    </div>
  `;

  overlayEl.addEventListener("click", (event) => {
    const t = event.target;
    if (t instanceof HTMLElement && t.hasAttribute("data-settings-dismiss")) {
      closeSettings();
    }
  });

  overlayEl.querySelector("#region-select")?.addEventListener("change", () => {
    updateRegionHint();
  });

  overlayEl.querySelector("#settings-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = /** @type {HTMLInputElement} */ (overlayEl.querySelector("#or-key"));
    const value = input.value.trim();
    if (!(value.includes("…") && hasApiKey() && value === maskApiKey())) {
      setApiKey(value);
    }

    const select = /** @type {HTMLSelectElement} */ (
      overlayEl.querySelector("#region-select")
    );
    const region = setStoredRegion(select.value);
    document.dispatchEvent(
      new CustomEvent("trip:region-changed", { detail: { region } })
    );

    fillForm();
    closeSettings();
    document.dispatchEvent(new CustomEvent("trip:settings-changed"));
  });

  overlayEl.querySelector("#or-clear")?.addEventListener("click", () => {
    clearApiKey();
    fillForm();
    document.dispatchEvent(new CustomEvent("trip:settings-changed"));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlayEl && !overlayEl.hidden) {
      closeSettings();
    }
  });

  document.body.append(overlayEl);
}

/**
 * @param {{ timezone?: string } | null} [tripHint]
 */
function fillForm(tripHint = null) {
  if (!overlayEl) return;
  const input = /** @type {HTMLInputElement} */ (overlayEl.querySelector("#or-key"));
  const status = overlayEl.querySelector("#or-status");
  const select = /** @type {HTMLSelectElement} */ (
    overlayEl.querySelector("#region-select")
  );

  const stored = getStoredRegion();
  const inferred = tripHint?.timezone
    ? inferRegionFromTimezone(tripHint.timezone)
    : null;
  select.value = stored?.id || inferred?.id || "";
  updateRegionHint();

  if (hasApiKey()) {
    input.type = "text";
    input.value = maskApiKey();
    input.dataset.masked = "1";
    status.textContent = `מפתח שמור: ${maskApiKey()}`;
    status.classList.remove("settings-meta--warn");
  } else {
    input.type = "password";
    input.value = "";
    delete input.dataset.masked;
    status.textContent =
      "אין מפתח — המלצות לפעילויות בחוץ כבויות. אפשר לקבל מפתח ב־openrouter.ai";
    status.classList.add("settings-meta--warn");
  }

  input.onfocus = () => {
    if (input.dataset.masked === "1") {
      input.type = "password";
      input.value = "";
      delete input.dataset.masked;
    }
  };
}

function updateRegionHint() {
  if (!overlayEl) return;
  const select = /** @type {HTMLSelectElement} */ (
    overlayEl.querySelector("#region-select")
  );
  const hint = overlayEl.querySelector("#region-hint");
  const region = REGIONS.find((r) => r.id === select.value);
  if (!hint) return;
  if (!region) {
    hint.textContent = "בלי בחירה — נשאר אזור הזמן מקובץ הטיול המיובא.";
    return;
  }
  hint.textContent = `אזור זמן: ${region.timezone} · מטבע מקומי לרוב: ${region.currencyLabel} (${region.currency})`;
}
