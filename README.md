# Precise Influencer Calculator (PIC)

This repository hosts the single-page Precise Influencer Calculator front-end (`index.html`). The tool lets you configure influencer campaigns, estimate performance, and now offers additional transparency and export options for sharing plans.

## Key capabilities

- **Campaign planning** – mix and match platforms, deliverables, creator sizes, and supporting costs to understand spend versus reach.
- **CSV exporting** – download the active campaign (from the editor) or any saved campaign (from the dashboard) as a CSV snapshot.
- **Pricing variables menu** – open a read-only reference that consolidates all pricing multipliers, view assumptions, and fee adders used by the calculator.

## Running locally

Open `index.html` directly in a modern browser or serve it from any static web server. No build tooling or backend services are required.

## Live preview

GitHub Pages can serve the calculator from the repository root (`/index.html`) or from the optional `docs/` copy used by the Pages default configuration. Visit `https://spacepilot121.github.io/pricingmodel/` to land directly on the calculator UI.

## CSV export tips

- The CSV includes key selectors such as platform, deliverable, creator size, language, vertical, and counts of creators/content.
- Cost metrics (total COGS/client spend, CPV, CPM) are formatted for spreadsheets so you can share or audit pricing assumptions easily.

## Pricing variables reference

Select “Pricing Variables” from either the dashboard or the campaign editor to review the rate card inputs that power the calculator. Toggle advanced variables to reveal less common adjustments such as whitelisting, travel, or niche creator fees.

## Brand safety from static hosts

The Brand Safety tab calls an Express backend (`/api/brand-safety/*`) that lives in the `server/` directory. If you open the app only from GitHub Pages (or any static host) there is no backend on that origin, so the tests and scans cannot succeed unless you point the UI at a deployed server.

To make it work when you can’t run the server locally:

- **Host the backend somewhere** – Deploy the `server/` folder to a small host (Render, Railway, Fly, Vercel, etc.), enable CORS, and set `VITE_BRAND_SAFETY_API_BASE` or use **Settings → API endpoint** (or `?apiBase=...`) to target that host from GitHub Pages.
- **Same-origin deployments still work** – Leave the endpoint blank if you are serving both the frontend and backend from the same origin (local dev or a combined deployment).
