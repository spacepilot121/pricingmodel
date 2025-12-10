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
