# Precisify Influencer Calculator

Campaign pricing, campaign backups, creator reputation checks and Commercial Momentum analysis.

## Use the browser app

Open https://spacepilot121.github.io/pricingmodel/ . The existing landing page redirects into the built application under docs/. Keep using the same browser profile and origin to see existing saved campaigns and API keys.

## Pricing backups

The Calculator includes Download pricing backup and Restore pricing backup controls. The JSON download preserves campaigns, templates and active pricing state, excluding API keys. Store it in a folder or cloud drive you can find again. Browser storage alone is not a portable backup.

Restore validates the whole file before writing, retains current campaigns, and imports conflicting versions as separate copies. It downloads a copy of current pricing first. Storage write failures roll back the restore. This does not change the calculator formulas, existing storage keys or stored campaign format.

## API settings

API keys continue to use the existing localStorage keys and Save settings buttons. The key persistence module is unchanged. Google Search and OpenAI calls run in the browser. This keeps the existing personal browser workflow; do not distribute shared provider credentials through this app.

Influencers Club requests use its current profile enrichment and posts endpoints with Bearer authentication. With no API endpoint configured, the app tries the provider directly. If the provider disallows browser CORS access, static GitHub Pages cannot override that restriction. Use the supplied stateless relay in relay/README.md. Paste its HTTPS address into Settings, API endpoint. You still open and use the application on GitHub Pages; there is no local server to run. Your saved Influencers Club key is forwarded through your relay per request, without being stored there.

The API key test checks account credits without fetching a paid creator profile. The separate profile checker makes a paid enrichment request.

## Brand Safety and Commercial Momentum

Provide creator profile URLs, one per line. Name, @handle is also accepted and assumes YouTube when no platform URL is supplied. Plain names can be used for reputation research, but an exact account is needed for creator profile/post analysis.

The scan resolves profile identity when available, runs three focused public search queries, validates source identity in small OpenAI batches, classifies the snippets using a structured schema, then calculates the reputation score. Victim and unrelated coverage contribute no risk. Classification failures do not silently become clean results. Confidence reflects evidence coverage, rather than allegation severity.

Commercial Momentum retrieves up to five pages of posts to cover 90 days. Missing dates, metrics, failed classifications and incomplete coverage are surfaced. A commercial score requires complete collection and at least two sponsored and two organic posts. Caption tone is assessed from captions only; no audience reaction is claimed without comments. Current profile enrichment does not supply a historical growth curve, so unavailable growth is excluded from score weighting.

Rescan bypasses both analysis and provider caches. Only analytical caches were versioned; existing API key and pricing storage is untouched. Old server reputation routes return HTTP 410 to prevent incompatible scores from the retired duplicate engine. The optional Express Influencers Club relay remains available, but GitHub Pages users can use the smaller Cloudflare relay instead.

## Development and verification

In client/, run npm ci and npm run dev. Run npm run build to regenerate the deployed docs/ application. From the repository root run node tests/run-tests.mjs. In client/, run npx tsc --noEmit -p tsconfig.json.

The validation workflow runs regression tests, TypeScript checks and the production build. On the review branch it commits the built docs/ files so the pull request includes the browser application. Merging the pull request is a separate publication decision; the workflow does not deploy the Cloudflare relay.

Automated tests mock providers. A live scan with the owner's configured credentials remains required to verify account access, provider payload variants and CORS behaviour.
