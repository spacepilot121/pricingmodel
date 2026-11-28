# Precisify Influencer Calculator

Campaign pricing and browser based YouTube creator evidence reviews.

## Use the app

Open https://spacepilot121.github.io/pricingmodel/docs/ . The Calculator and Settings use the same browser origin and existing storage. Saved data and keys are local to each PC and browser profile. This update does not move API keys, migrate pricing, change formulas or alter saved campaigns.

## Creator review

Brand Safety now opens a YouTube evidence review with separate reputation, content and commercial outcomes. Influencers Club and hosted relays are not used by this workflow. Old modules and stored analytical data remain available in the repository for compatibility, but are not called by the new screen.

Paste up to twenty channel URLs, handles or channel IDs, with optional campaign criteria. Duplicate references are removed. Creators are reviewed sequentially with individual results; quota or access failures pause the batch. Supporting article text is restricted to single creator reviews so it cannot be attributed to the wrong person. Testing mode samples five uploads and caps the single GPT call at 1,800 output tokens. Standard mode samples twenty uploads and caps output at 3,200 tokens. Source text is bounded to 11,000 or 34,000 characters before prompt metadata and schema overhead.

The app resolves channels and reads the uploads playlist directly. It does not use broad YouTube search or automatic retries. A fresh scan normally uses two YouTube list requests. Public metadata and identical assessments are cached for 24 hours. Changing campaign criteria invalidates the assessment cache. Force fresh review bypasses both caches. Actual GPT token usage and provider request counts are shown.

Google public search is optional and uses existing saved credentials. Google has announced Custom Search closure on 1 January 2027. Without it, add source evidence manually; uploads alone do not establish reputation coverage. No replacement search provider or new service key is required to run metadata and supplied evidence reviews.

Source evidence can include article text, creator responses and transcripts. The Read accessible article button fetches only sites permitting direct browser access. Blocked sites, redirects, large pages and unreadable sources require pasted relevant text. No public proxy is used. The YouTube API does not supply arbitrary creator transcripts using only an API key. Audio, visuals, comments and unexamined historical content need human review.

GPT selects numbered passages from supplied evidence. Quotations are inserted locally from the original text, avoiding failures caused by a model retyping punctuation. References to nonexistent passages are excluded and the result is marked incomplete; this cannot produce a clean outcome. Allegations or snippets alone cannot establish a significant reputational finding. Results record source type, dates, excerpts, limitations, coverage and the channel ID. Human decisions remain separate from automated outcomes. Download reports for durable retention; they exclude credentials.

Compact GPT, YouTube and Google Search connection indicators are green only after successful provider responses. Initial checks use a free model access request, one YouTube list request and, when configured, one Google search request. Check results are reused for ten minutes within the page session. These checks are separate from the per review usage counts. Missing or failed connections are indicated; the page does not show setup explanations above the workflow. Desktop and mobile layouts are checked in real Chrome with test data.

## Settings and saved API keys

Settings reads and saves through the unchanged client/src/api/apiKeyStorage.ts module. Existing individual keys and the legacy settings object remain supported. The saved YouTube key is used first; the existing Google key is a fallback if YouTube is enabled for it. OpenAI reuses the saved key and model choice. Saving no longer requires unrelated Google or Influencers Club tests to pass. Provider restrictions, revoked keys or retired models still require action in the provider account or Settings.

## Pricing backups

Download pricing backup and Restore pricing backup are in Settings. Campaigns, templates and active pricing use the existing backup JSON format, excluding API keys. Restore validates all entries, retains existing campaigns, imports conflicting versions as separate copies, requests a download of current pricing and rolls back failed writes. Validation accepts current campaignLines data and older deliverables data. The calculator no longer displays the backup controls.

## Development

In client, npm ci installs the locked dependencies. Run npm run dev or npm run build. From the repository root, node tests/run-tests.mjs runs the mocked provider, evidence validation, cache, quota failure, saved key, pricing preservation and restore checks. The validation workflow also checks TypeScript and client/server builds. On the review branch it commits the built docs application for GitHub Pages.

Live account access and visual browser verification are separate from mocked tests. Automated results are evidence screening aids for human review, not a complete creator audit.
