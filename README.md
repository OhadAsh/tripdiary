# TripDiary

Mobile-first interactive trip diary. Vanilla HTML/CSS/ES modules + PWA. No build step.

**Trip data is never stored in this repository.** You import a JSON itinerary in the browser; it lives only in `localStorage` on that device. Export to move it between phones.

## Run locally

```bash
python3 -m http.server 43127
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127), then **ייבוא קובץ טיול**.

## JSON schema (import ↔ export)

Round-trip compatible:

```json
{
  "tripName": "My Trip",
  "timezone": "Asia/Bangkok",
  "days": [
    {
      "date": "2026-11-10",
      "weekday": "optional",
      "locationLabel": "optional display name",
      "location": "City",
      "lat": 0,
      "lng": 0,
      "events": [
        {
          "time": "09:00",
          "title": "Example",
          "description": "",
          "priceILS": null,
          "tags": ["outdoor", "food", "indoor", "flight"]
        }
      ]
    }
  ]
}
```

Required per day: `date`, `location` (or `locationLabel`), `lat`, `lng`, `events` (array).

## Deploy to GitHub Pages

Repo: [OhadAsh/tripdiary](https://github.com/OhadAsh/tripdiary)  
Live site: [https://OhadAsh.github.io/tripdiary/](https://OhadAsh.github.io/tripdiary/)

Asset URLs are relative (`./js/...`, `./sw.js`, `scope: "./"`), so the app works under the project Pages subpath `/tripdiary/`.

1. Push `main` (app source only — no personal itinerary JSON).
2. Settings → Pages → Source: **Deploy from a branch** → `main` → `/ (root)`.
3. Open the live URL and **ייבוא קובץ טיול**.

Do not switch script/link `href`s to root-absolute `/js/...`.

## Features

- Day tabs + swipe; weather (Open-Meteo forecast / 5-year archive)
- Add / edit events (localStorage)
- Settings: country/region → timezone
- FX button: approximate rates into ILS (USD/THB/VND/EUR) with refresh + amount calculator
- OpenRouter outdoor tips (API key in localStorage only; model `google/gemma-4-26b-a4b-it:free`)
- Import / export / reset (reset clears all trip data — empty splash again)

## Note on trip data

Trip itineraries are **not** in this repository. Import JSON in the browser; it stays in `localStorage` only. `trip.json` is gitignored.
