# Coupon Studio

Design numbered event coupons (refreshment, lunch, high tea, entry passes…) and download a print-ready PDF with precise cutting lines.

**Live:** https://coupon-studio.onrender.com

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/DhruvBasia/coupon-studio)

## What you can change

- **Text** – event heading, coupon type, an extra line (venue / time), the "COUPON NO." label and the signature text. Every element can be switched on or off.
- **Date** – date picker with several formats, date ranges, or your own text.
- **Numbering** – prefix (e.g. `EVT`), separator, suffix, format (`1`, `01`, `001`, `0001`), start number and count. "Stack cut" order keeps numbers sequential when you cut the whole printed stack at once.
- **Logo watermark** – upload or drag in any image; opacity, size, position, grayscale / tint, automatic white-background removal.
- **Colours & style** – 12 themes or custom colours, border and ribbon styles, fonts and per-element text size.
- **Paper & cutting** – A4 / A3 / A5 / Letter / Legal, portrait or landscape, columns × rows or an exact coupon size in mm, margins, gaps, and cutting lines (full page, around coupons, or crop marks) with scissors marks.
- **Several coupon types in one PDF** – e.g. breakfast, lunch and dinner for each day of an event. Each type has its own date, colour, prefix, start number and count; one click adds a whole day of meals. Types can start on a new page each, or share pages to save paper.
- **Saved designs** – keep several designs in the browser, or export / import a settings file.
- **Install as an app** – use "Install app" in Chrome or Edge (or "Add to Home Screen" on a phone). The installed app opens in its own window and works fully offline.

The on-screen preview and the PDF are drawn by the same layout code (`render.js`), so the PDF matches the preview exactly. Text and lines in the PDF are vector, and fonts are embedded.

**Printing:** print at **100% / Actual size** (turn off "Fit to page") so the coupons come out at the exact size shown.

## Running it

It is a static site with no build step and no server code:

- **Locally:** open `index.html` in Chrome or Edge, or serve the folder, e.g. `python -m http.server 8000`.
- **Render:** click the button above, or create a *Static Site* from this repo with publish directory `.` (see `render.yaml`).

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `styles.css` | Editor UI |
| `app.js` | Settings, live preview, logo processing, saving |
| `render.js` | Coupon layout and drawing (canvas preview + jsPDF export) |
| `assets/fonts.js` | Embedded Google Fonts (SIL Open Font License) |
| `lib/jspdf.umd.min.js` | [jsPDF](https://github.com/parallax/jsPDF) 2.5.2 (MIT) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Installable app and offline cache (bump `VERSION` in `sw.js` when adding files) |
| `build-artifact.py` | Bundles everything into one HTML file (`dist/`) for hosting as a single page |
