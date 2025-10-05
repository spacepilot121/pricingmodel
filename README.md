# Precise Influencer Calculator (PIC)

This repository contains the single-page Precise Influencer Calculator front-end (`index.html`) and a lightweight Node.js/Express API located in `server/`.

## New capabilities

- **Secure authentication** – users can register, log in, refresh tokens, and log out. Passwords are hashed with bcrypt and refresh tokens are encrypted, signed, rotated, and stored in HTTP-only cookies.
- **CSV exporting** – campaign selections can be downloaded from the dashboard or editor for easy sharing.
- **Pricing variables menu** – a read-only reference consolidating all pricing multipliers and assumptions.

## Running locally

1. Install API dependencies:

   ```bash
   cd server
   npm install
   ```

2. Start the API (defaults to port `4000`):

   ```bash
   npm run dev
   ```

3. Serve `index.html` with your preferred static server (or open directly in a browser). When hosting the UI separately, configure `CLIENT_ORIGIN` in `server/.env` to include the UI origin so cookies are accepted.

## Environment variables

Create `server/.env` (see `.gitignore`). Available variables:

- `PORT` – API port (default `4000`).
- `CLIENT_ORIGIN` – comma-separated list of allowed origins for CORS (optional when serving API and UI from the same host).
- `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `TOKEN_ENCRYPTION_SECRET` – override cryptographic secrets.
- `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL` – adjust token lifetimes (e.g., `15m`, `7d`).

## Security notes

- Passwords use per-user bcrypt salts and are never returned by the API.
- Refresh tokens are AES-256-GCM encrypted before being stored in cookies and hashed in storage for comparison.
- Logout clears the cookie and invalidates the stored refresh hash to prevent reuse.
