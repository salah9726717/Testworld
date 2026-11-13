# Test World — minimal full-stack Telegram Mini App

This build keeps the existing visible app only: Welcome intro, Home balance, +10 TW logo button, Profile (Telegram identity + balance), TON Connect, and the two-tab navigation.

## Included backend scope
- Telegram `initData` HMAC validation on the server (the frontend's `initDataUnsafe` is not trusted for authentication).
- PostgreSQL user record keyed by Telegram ID.
- Balance is read from PostgreSQL and every successful logo tap atomically adds exactly `10.00 TW`.
- TON Connect wallet address is saved to the same user record.
- No transaction history, withdrawal, task, referral, leaderboard, or other feature tables/APIs.

## Setup
1. Create a PostgreSQL database.
2. Run `database/schema.sql` against it.
3. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`, the Telegram bot token, and your real HTTPS URL.
4. Install and start the API:

   ```bash
   cd backend
   npm install
   npm start
   ```

5. Deploy the project so the backend serves the `frontend/` folder on the same HTTPS origin. Configure that HTTPS URL as the Telegram Mini App URL in BotFather.
6. Replace the placeholder domain in `frontend/tonconnect-manifest.json` with the deployed HTTPS domain. Ensure `icon.png` exists at that public domain path; host a square PNG app icon there.

## Important
- A real Telegram bot token, PostgreSQL connection string, and public HTTPS deployment are required. They are intentionally not embedded in this ZIP.
- TON Connect will not fully connect until the manifest URL and icon URL are publicly reachable over HTTPS.
- The +10 TW action is a server-side database increment. It is intentionally repeatable, matching the current app's existing tap behavior; the API rate-limits excessive requests.
- TW is an in-app unit. This implementation does not claim that TW is TON or a withdrawable on-chain asset.
