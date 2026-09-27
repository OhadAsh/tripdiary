import { sortEventsByTime } from "./data.js";
import { TAG_LABELS } from "./storage.js";
import { isOutdoorEvent, hasApiKey, NO_KEY_MESSAGE } from "./ai.js";

/**
 * @param {string} tag
 * @returns {string} SVG markup
 */
function tagIconSvg(tag) {
  switch (tag) {
    case "flight":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 21l1.5-6.5L4 12l1-2 7.5 1.5L14 3l2 0 1.5 8.5L22 13l-1 2-6.5-1.5L13 21z"/></svg>`;
    case "food":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v8M8 11v10M6 3v5a2 2 0 004 0V3M16 3v7c0 1.5 1 2 2 2v9M16 3c2 0 3 1.5 3 4"/></svg>`;
    case "indoor":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"/></svg>`;
    case "outdoor":
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/></svg>`;
  }
}

const CHEVRON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;

/**
 * @param {import('./data.js').Trip} trip
 * @param {HTMLElement} titleEl
 * @param {HTMLElement} metaEl
 */
export function renderHeader(trip, titleEl, metaEl) {
  titleEl.textContent = trip.tripName || "TripDiary";
  document.title = trip.tripName || "TripDiary";

  if (trip.days?.length) {
    const first = trip.days[0].date;
    const last = trip.days[trip.days.length - 1].date;
    metaEl.hidden = false;
    // Isolate the numeric range as LTR so RTL does not visually reverse start/end.
    metaEl.replaceChildren();
    const range = document.createElement("span");
    range.dir = "ltr";
    range.textContent = `${formatDisplayDate(first)} – ${formatDisplayDate(last)}`;
    metaEl.append(range, document.createTextNode(` · ${trip.days.length} ימים`));
  } else {
    metaEl.hidden = true;
  }
}

/**
 * @param {import('./data.js').TripDay[]} days
 * @param {HTMLElement} tabsEl
 * @param {number} selectedIndex
 * @param {(index: number) => void} onSelect
 */
export function renderDayTabs(days, tabsEl, selectedIndex, onSelect) {
  tabsEl.replaceChildren();

  days.forEach((day, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-tab";
    btn.id = `day-tab-${index}`;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(index === selectedIndex));
    btn.setAttribute("aria-controls", "day-panel");
    btn.tabIndex = index === selectedIndex ? 0 : -1;

    const weekday = document.createElement("span");
    weekday.className = "day-tab__weekday";
    weekday.textContent = day.weekday || weekdayShort(day.date);

    const date = document.createElement("span");
    date.className = "day-tab__date";
    date.textContent = shortDate(day.date);

    btn.append(weekday, date);
    btn.addEventListener("click", () => onSelect(index));
    tabsEl.append(btn);
  });

  const selected = tabsEl.children[selectedIndex];
  if (selected instanceof HTMLElement) {
    selected.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }
}

/**
 * Update selected state without full re-render of labels.
 * @param {HTMLElement} tabsEl
 * @param {number} selectedIndex
 */
export function syncDayTabsSelection(tabsEl, selectedIndex) {
  [...tabsEl.children].forEach((child, index) => {
    if (!(child instanceof HTMLElement)) return;
    const selected = index === selectedIndex;
    child.setAttribute("aria-selected", String(selected));
    child.tabIndex = selected ? 0 : -1;
    if (selected) {
      child.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  });
}

/**
 * @typedef {{
 *   onAdd?: () => void,
 *   onEdit?: (event: import('./data.js').TripEvent) => void,
 *   onOutdoorAdvice?: (event: import('./data.js').TripEvent, panel: HTMLElement) => void,
 * }} DayActions
 */

/**
 * @typedef {{ dayIndex?: number, dayCount?: number }} DayContext
 */

/**
 * @param {import('./data.js').TripDay} day
 * @param {HTMLElement} panelEl
 * @param {DayActions} [actions]
 * @param {DayContext} [context]
 */
export function renderDay(day, panelEl, actions = {}, context = {}) {
  panelEl.replaceChildren();

  const heading = document.createElement("div");
  heading.className = "day-heading";

  const location = document.createElement("p");
  location.className = "day-heading__location";
  location.textContent = day.locationLabel || day.location || "—";

  const dateLine = document.createElement("p");
  dateLine.className = "day-heading__date";
  const parts = [day.weekday, formatDisplayDate(day.date)].filter(Boolean);
  dateLine.textContent = parts.join(" · ");

  const metaRow = document.createElement("p");
  metaRow.className = "day-heading__meta";
  const dayIndex = Number.isFinite(context.dayIndex) ? context.dayIndex : 0;
  const dayCount = Number.isFinite(context.dayCount) ? context.dayCount : 0;
  if (dayCount > 0) {
    const progress = document.createElement("span");
    progress.className = "day-heading__progress";
    progress.textContent = `יום ${dayIndex + 1} מתוך ${dayCount}`;
    metaRow.append(progress);
  }
  const country = countryIndicator(day);
  if (country) {
    if (metaRow.childNodes.length) {
      metaRow.append(document.createTextNode(" · "));
    }
    const mark = document.createElement("span");
    mark.className = "day-heading__country";
    mark.setAttribute("aria-label", country.label);
    mark.textContent = `${country.flag} ${country.label}`;
    metaRow.append(mark);
  }

  heading.append(location, dateLine);
  if (metaRow.childNodes.length) heading.append(metaRow);

  const weather = document.createElement("div");
  weather.className = "weather-card weather-card--loading";
  weather.dataset.weatherSlot = "true";
  weather.setAttribute("aria-busy", "true");
  weather.innerHTML = `<span class="weather-card__status">טוען מזג אוויר…</span>`;

  const toolbar = document.createElement("div");
  toolbar.className = "day-toolbar";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn btn--primary btn--block";
  addBtn.textContent = "הוספת אירוע";
  addBtn.addEventListener("click", () => actions.onAdd?.());
  toolbar.append(addBtn);

  const hint = document.createElement("p");
  hint.className = "swipe-hint";
  hint.textContent = "החלק ימינה/שמאלה למעבר בין ימים";

  const events = sortEventsByTime(day.events || []);
  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "empty-day";
    empty.textContent = "אין אירועים ליום זה — אפשר להוסיף למעלה";
    panelEl.append(heading, weather, toolbar, hint, empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "event-list";

  for (const event of events) {
    list.append(renderEventCard(event, actions));
  }

  panelEl.append(heading, weather, toolbar, hint, list);
}

/**
 * @param {import('./data.js').TripEvent} event
 * @param {DayActions} actions
 */
function renderEventCard(event, actions) {
  const li = document.createElement("li");
  li.className = "event-card";
  li.dataset.open = "false";
  if (event.id) li.dataset.eventId = event.id;
  li.dataset.tint = cardTintFromTags(event.tags);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "event-card__toggle";
  toggle.setAttribute("aria-expanded", "false");

  const time = document.createElement("span");
  time.className = "event-card__time";
  time.textContent = event.time || "—";

  const main = document.createElement("div");
  main.className = "event-card__main";

  const title = document.createElement("h2");
  title.className = "event-card__title";
  title.textContent = event.title || "ללא כותרת";

  const meta = document.createElement("div");
  meta.className = "event-card__meta";

  if (event.priceILS != null && !Number.isNaN(Number(event.priceILS))) {
    const price = document.createElement("span");
    price.className = "event-card__price";
    price.textContent = formatPrice(event.priceILS);
    meta.append(price);
  }

  const tags = Array.isArray(event.tags) ? event.tags.filter(Boolean) : [];
  if (tags.length) {
    const tagList = document.createElement("span");
    tagList.className = "tag-list";
    for (const tag of tags) {
      const icon = document.createElement("span");
      icon.className = "tag-icon";
      icon.title = TAG_LABELS[tag] || tag;
      icon.setAttribute("aria-label", TAG_LABELS[tag] || tag);
      icon.innerHTML = tagIconSvg(tag);
      tagList.append(icon);
    }
    meta.append(tagList);
  }

  main.append(title);
  if (meta.childNodes.length) main.append(meta);

  const chevron = document.createElement("span");
  chevron.className = "event-card__chevron";
  chevron.innerHTML = CHEVRON;

  toggle.append(time, main, chevron);

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "event-card__edit-icon";
  editBtn.setAttribute("aria-label", "עריכת אירוע");
  editBtn.title = "עריכה";
  editBtn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4"/></svg>';
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    actions.onEdit?.(event);
  });

  const body = document.createElement("div");
  body.className = "event-card__body";

  const description = document.createElement("div");
  description.className = "event-card__description";
  description.textContent = (event.description || "").trim() || "אין תיאור";

  const editLink = document.createElement("button");
  editLink.type = "button";
  editLink.className = "btn btn--ghost btn--small event-card__edit";
  editLink.textContent = "עריכה";
  editLink.addEventListener("click", (e) => {
    e.stopPropagation();
    actions.onEdit?.(event);
  });

  body.append(description, editLink);

  if (isOutdoorEvent(tags)) {
    const adviceWrap = document.createElement("div");
    adviceWrap.className = "outdoor-advice";

    const adviceBtn = document.createElement("button");
    adviceBtn.type = "button";
    adviceBtn.className = "outdoor-badge";
    adviceBtn.textContent = "🌤 המלצת מזג אוויר";
    adviceBtn.setAttribute(
      "aria-label",
      "המלצה קצרה לפעילות בחוץ לפי מזג האוויר"
    );

    const advicePanel = document.createElement("div");
    advicePanel.className = "outdoor-advice__panel";
    advicePanel.hidden = true;

    adviceBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!hasApiKey()) {
        advicePanel.hidden = false;
        advicePanel.className =
          "outdoor-advice__panel outdoor-advice__panel--info";
        advicePanel.textContent = NO_KEY_MESSAGE;
        return;
      }
      advicePanel.hidden = false;
      advicePanel.className =
        "outdoor-advice__panel outdoor-advice__panel--loading";
      advicePanel.textContent = "בודקים מזג אוויר והמלצה…";
      actions.onOutdoorAdvice?.(event, advicePanel);
    });

    adviceWrap.append(adviceBtn, advicePanel);
    body.append(adviceWrap);
    // Also show a compact badge in the collapsed meta row
    const metaBadge = document.createElement("button");
    metaBadge.type = "button";
    metaBadge.className = "outdoor-badge outdoor-badge--compact";
    metaBadge.textContent = "🌤 המלצה";
    metaBadge.title = "המלצה לפעילות בחוץ";
    metaBadge.addEventListener("click", (e) => {
      e.stopPropagation();
      if (li.dataset.open !== "true") {
        li.dataset.open = "true";
        toggle.setAttribute("aria-expanded", "true");
      }
      adviceBtn.click();
    });
    meta.append(metaBadge);
    if (!main.contains(meta)) main.append(meta);
  }

  const top = document.createElement("div");
  top.className = "event-card__top";
  top.append(toggle, editBtn);

  toggle.addEventListener("click", () => {
    const isOpen = li.dataset.open === "true";
    li.dataset.open = String(!isOpen);
    toggle.setAttribute("aria-expanded", String(!isOpen));
  });

  li.append(top, body);
  return li;
}

/**
 * Tiny local map: country mark from location strings in imported day data.
 * @param {import('./data.js').TripDay} day
 * @returns {{ flag: string, label: string } | null}
 */
function countryIndicator(day) {
  const hay = `${day.location || ""} ${day.locationLabel || ""}`.toLowerCase();
  if (
    /bangkok|phuket|khao\s*lak|krabi|בנגקוק|פוקט|קאו\s*לאק|קראבי/.test(hay)
  ) {
    return { flag: "🇹🇭", label: "תאילנד" };
  }
  if (
    /hanoi|da\s*nang|hoi\s*an|ninh|ha\s*long|chi\s*minh|cao\s*bang|האנוי|דננג|הוי\s*אן/.test(
      hay
    )
  ) {
    return { flag: "🇻🇳", label: "וייטנאם" };
  }
  return null;
}

/**
 * @param {string[] | undefined} tags
 */
function cardTintFromTags(tags) {
  const first = Array.isArray(tags) ? tags.find(Boolean) : null;
  if (first === "outdoor") return "outdoor";
  if (first === "food") return "food";
  return "plain";
}

/**
 * @param {string} isoDate
 */
function formatDisplayDate(isoDate) {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${Number(d)}.${Number(m)}.${y}`;
}

/**
 * @param {string} isoDate
 */
function shortDate(isoDate) {
  const [, m, d] = isoDate.split("-");
  if (!m || !d) return isoDate;
  return `${Number(d)}.${Number(m)}`;
}

/**
 * @param {string} isoDate
 */
function weekdayShort(isoDate) {
  try {
    return new Intl.DateTimeFormat("he-IL", { weekday: "short" }).format(
      new Date(`${isoDate}T12:00:00`)
    );
  } catch {
    return "";
  }
}

/**
 * @param {number} amount
 */
function formatPrice(amount) {
  const n = Number(amount);
  if (Number.isInteger(n)) return `₪${n}`;
  return `₪${n.toFixed(0)}`;
}
