# Influencers Club connection for GitHub Pages

The calculator and brand safety interface remain hosted on GitHub Pages. A static site cannot change another provider's browser CORS rules. If direct API requests are blocked, deploy this small stateless Cloudflare Worker. No local server is required.

## Browser setup

1. In your Cloudflare account, create a Worker under Workers & Pages.
2. Open Edit code, replace the sample with `worker.mjs`, then deploy it.
3. Set the variable `ALLOWED_ORIGINS` to `https://spacepilot121.github.io`. Use origins only, without repository paths. Disable invocation logging and do not add request logging.
4. Copy the Worker HTTPS URL.
5. In the app's Settings, paste that URL into API endpoint and save it.
6. Keep using the existing API key fields and save buttons. Test the connection, then scan a creator profile URL.

Alternatively run `npx wrangler deploy` in this directory using your Cloudflare account. Do not put provider keys in the Worker, GitHub code, or GitHub Actions. Every request carries the caller's existing locally saved Influencers Club key. The relay does not save it. Origin filtering is a browser access restriction, not user authentication; there is no shared paid credential on the relay.

The Worker accepts only the four fixed Influencers Club routes, JSON POST requests up to 64 KB, and the configured origin. It never relays to arbitrary URLs. Add Cloudflare rate limiting if distributing the app widely.

Profile enrichment and post collection consume Influencers Club credits. A scan fetches at most five pages of posts per creator, reuses recent results, and reports incomplete coverage. Rescan explicitly bypasses the analysis and provider caches.

This deployment is a separate setup step. Editing GitHub files does not deploy a Cloudflare Worker.
