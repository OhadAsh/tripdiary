/**
 * FX rates sheet — opened from a header button, not settings / main chrome.
 * Includes a small amount → ₪ calculator using the same cached rates.
 */
import {
  FX_CURRENCIES,
  loadFxRates,
  formatFxLines,
  formatFxUpdatedAt,
  formatIlsAmount,
  convertToIls,
  readFxCache,
} from "./rates.js";

let overlayEl = null;
/** @type {import('./rates.js').FxSnapshot | null} */
let currentSnap = null;

export function openFxSheet() {
  ensureOverlay();
  overlayEl.hidden = false;
  document.body.classList.add("sheet-open");
  const cached = readFxCache();
  if (cached) renderFx(cached, false);
  void refreshFx(false);
  updateCalc();
}

export function closeFxSheet() {
  if (!overlayEl) return;
  overlayEl.hidden = true;
  document.body.classList.remove("sheet-open");
}

function ensureOverlay() {
  if (overlayEl) return;

  overlayEl = document.createElement("div");
  overlayEl.id = "fx-sheet";
  overlayEl.className = "sheet";
  overlayEl.hidden = true;
  overlayEl.setAttribute("role", "dialog");
  overlayEl.setAttribute("aria-modal", "true");
  overlayEl.setAttribute("aria-labelledby", "fx-title");

  const currencyOptions = FX_CURRENCIES.map(
    (code) => `<option value="${code}">${code}</option>`
  ).join("");

  overlayEl.innerHTML = `
    <div class="sheet__backdrop" data-fx-dismiss></div>
    <div class="sheet__panel">
      <header class="sheet__header">
        <h2 class="sheet__title" id="fx-title">שערי המרה</h2>
        <button type="button" class="sheet__close" data-fx-dismiss aria-label="סגור">×</button>
      </header>
      <div class="fx-sheet-body">
        <p class="settings-lead">שערים משוערים לשקל (₪). לא לייעוץ פיננסי.</p>
        <div class="fx-panel fx-panel--sheet" id="fx-panel">
          <ul class="fx-panel__list" id="fx-list"></ul>
          <p class="fx-panel__meta" id="fx-meta">טוען שערים…</p>
        </div>

        <div class="fx-calc" id="fx-calc">
          <p class="fx-calc__title">מחשבון לשקל</p>
          <div class="fx-calc__row">
            <label class="field fx-calc__amount">
              <span class="field__label">סכום</span>
              <input
                class="field__input"
                id="fx-amount"
                type="number"
                inputmode="decimal"
                min="0"
                step="any"
                placeholder="0"
                dir="ltr"
              />
            </label>
            <label class="field fx-calc__currency">
              <span class="field__label">מטבע</span>
              <select class="field__input" id="fx-currency" dir="ltr">
                ${currencyOptions}
              </select>
            </label>
          </div>
          <p class="fx-calc__result" id="fx-result" aria-live="polite">₪ —</p>
        </div>

        <div class="sheet__actions">
          <button type="button" class="btn btn--ghost" data-fx-dismiss>סגור</button>
          <button type="button" class="btn btn--primary" id="fx-refresh">רענון</button>
        </div>
      </div>
    </div>
  `;

  overlayEl.addEventListener("click", (event) => {
    const t = event.target;
    if (t instanceof HTMLElement && t.hasAttribute("data-fx-dismiss")) {
      closeFxSheet();
    }
  });

  overlayEl.querySelector("#fx-refresh")?.addEventListener("click", () => {
    void refreshFx(true);
  });

  overlayEl.querySelector("#fx-amount")?.addEventListener("input", () => {
    updateCalc();
  });
  overlayEl.querySelector("#fx-currency")?.addEventListener("change", () => {
    updateCalc();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlayEl && !overlayEl.hidden) {
      closeFxSheet();
    }
  });

  document.body.append(overlayEl);
}

/**
 * @param {boolean} force
 */
async function refreshFx(force) {
  if (!overlayEl) return;
  const meta = overlayEl.querySelector("#fx-meta");
  const panel = overlayEl.querySelector("#fx-panel");
  const refreshBtn = /** @type {HTMLButtonElement | null} */ (
    overlayEl.querySelector("#fx-refresh")
  );
  if (meta) meta.textContent = "טוען שערים…";
  panel?.classList.remove("fx-panel--error");
  if (refreshBtn) refreshBtn.disabled = true;
  try {
    const snap = await loadFxRates(force);
    renderFx(snap, false);
  } catch (err) {
    console.warn(err);
    panel?.classList.add("fx-panel--error");
    const cached = readFxCache();
    if (cached) {
      renderFx(cached, true);
      if (meta) {
        meta.textContent = "לא הצלחנו לרענן — מוצגים שערים שמורים במכשיר.";
      }
    } else if (meta) {
      meta.textContent = "לא ניתן לטעון שערי חליפין כרגע.";
      currentSnap = null;
      updateCalc();
    }
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

/**
 * @param {import('./rates.js').FxSnapshot} snap
 * @param {boolean} stale
 */
function renderFx(snap, stale) {
  if (!overlayEl) return;
  currentSnap = snap;
  const list = overlayEl.querySelector("#fx-list");
  const meta = overlayEl.querySelector("#fx-meta");
  if (list) {
    list.replaceChildren();
    for (const row of formatFxLines(snap)) {
      const li = document.createElement("li");
      li.textContent = row.line;
      list.append(li);
    }
  }
  if (meta && !stale) {
    meta.textContent = `עודכן: ${formatFxUpdatedAt(snap.updatedAt)} · שער משוער`;
  }
  updateCalc();
}

function updateCalc() {
  if (!overlayEl) return;
  const amountInput = /** @type {HTMLInputElement | null} */ (
    overlayEl.querySelector("#fx-amount")
  );
  const currencySelect = /** @type {HTMLSelectElement | null} */ (
    overlayEl.querySelector("#fx-currency")
  );
  const resultEl = overlayEl.querySelector("#fx-result");
  if (!resultEl || !amountInput || !currencySelect) return;

  if (!currentSnap) {
    resultEl.textContent = "₪ —";
    return;
  }

  const raw = amountInput.value.trim();
  if (raw === "") {
    resultEl.textContent = "₪ —";
    return;
  }

  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) {
    resultEl.textContent = "סכום לא תקין";
    return;
  }

  const ils = convertToIls(currentSnap, currencySelect.value, amount);
  if (ils == null) {
    resultEl.textContent = "אין שער למטבע זה";
    return;
  }

  resultEl.textContent = `≈ ₪${formatIlsAmount(ils)}`;
}
