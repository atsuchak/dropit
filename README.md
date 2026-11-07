# Dropit

Temporary file sharing in one Next.js App Router project. A share supports up to 20 files and 100 MB total. The default lifetime is five minutes, with a custom duration from one minute to twelve hours. The default access limit is one page visit.

New share links use an eleven-letter slug at the site root. Existing `/s/` links continue to work. The sender can add or remove files, edit settings, or delete a link while the creation page remains open. Editing keeps the same link. Removed files are excluded from the share immediately, and Blob deletion is attempted immediately. Cleanup retries removed Blob objects after signed upload URLs expire. Deletion blocks access immediately and removes Blob files, then scheduled cleanup removes the temporary MongoDB record after the signed upload URL expires.

## Local setup

1. Install Node.js 20.9 or newer and run `npm install`.
2. Create a MongoDB Atlas Free cluster and a database user with access to the `dropit` database. Add your current IP to the Atlas IP access list for local development. Put the connection string in `MONGODB_URI` inside `.env.local`.

If your DNS resolver rejects Atlas SRV lookups with `querySrv ECONNREFUSED`, copy the standard `mongodb://` connection string from Atlas Connect by turning off the SRV connection string option. The app uses the `dropit` database. 3. Create a private Vercel Blob store connected to the Vercel project. Select a region close to the app's function and MongoDB regions. Enable the read-write token environment variable. Copy `BLOB_READ_WRITE_TOKEN` into `.env.local` for local development. The browser uploads directly to Blob using private, time-limited signed URLs. 4. Create a Cloudflare Turnstile widget for your production domain. Set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in `.env.local`. For local development only, both may be left unset. 5. Set `CLEANUP_SECRET` in `.env.local` to a random value of at least 32 characters. Copy the application variable values to Vercel project environment settings before deployment. Vercel adds the Blob token to connected environments. Never commit `.env.local`. 6. Run `npm run dev` and open <http://localhost:3000>.

Vercel Hobby functions use dynamic outbound IPs. Atlas may require a broader IP access entry for deployment. If you use `0.0.0.0/0`, use a dedicated database user with a strong password and access only to this database.

Use `.env.example` for the required variable names. Codex's MongoDB MCP connection is separate from the application's `MONGODB_URI`.

## Expired file cleanup

The app rejects expired shares immediately, including refreshes and new signed download URLs. Blob files are removed by the scheduled cleanup Worker in `scripts/cleanup-worker.mjs`. It runs every five minutes and calls the protected `/api/internal/cleanup` route. Deploy the Worker using `wrangler.jsonc`, then set Worker secrets `CLEANUP_URL` to `https://YOUR_APP_DOMAIN/api/internal/cleanup` and `CLEANUP_SECRET` to the same value used by the app. Upload URLs last up to ten minutes. Cleanup waits twelve minutes from share creation before deleting expired files, so a still-valid upload URL cannot recreate a deleted file. Monitor cleanup failures, because Blob has no bucket lifecycle rule in this setup.

The scheduled job is separate infrastructure but its source stays in this repository. Deploy it with `npx wrangler@4.156.0 deploy`, then set its secrets with `npx wrangler@4.156.0 secret put CLEANUP_URL` and `npx wrangler@4.156.0 secret put CLEANUP_SECRET`. Before the Worker is deployed, shares still become inaccessible on time, but storage objects are not removed on schedule.

## Commands

- `npm run dev`: Start the development server.
- `npm run build`: Build for production.
- `npm run start`: Start the production server after a build.
- `npm run lint`: Check code with ESLint.
- `npm run typecheck`: Check TypeScript.
- `npm run test:security`: Check short IDs, token hashes, and PIN verification.
- `npm run format:check`: Check formatting.
- `npm run format`: Format files.

## Structure

- `src/app`: Pages and API route handlers.
- `src/features/shares`: Share UI and server logic.
- `src/lib/server`: MongoDB and object storage clients.
- `src/styles`: Global styles.
- `public`: Static assets.
- `scripts`: Scheduled cleanup Worker.

Keep server logic out of client components. Add shared component, hook, type, and utility folders only when real reuse appears.

## Agent rules

Agents must read [AGENTS.md](AGENTS.md) before changing files. Verify compliance by requesting a small change, checking that the agent waits for approval, then inspecting changed files and Git status.

## Icon license

The Cloud Upload icon in the upload area is from [Lucide](https://lucide.dev/icons/cloud-upload) under the ISC License.

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
