# Dropit

Temporary file sharing in one Next.js App Router project. A share supports up to 20 files and 100 MB total. The default lifetime is five minutes, with options from 30 seconds to 24 hours. The default access limit is one browser session.

## Local setup

1. Install Node.js 20.9 or newer and run `npm install`.
2. Create a MongoDB Atlas Free cluster and a database user with access to the `dropit` database. Add your current IP to the Atlas IP access list for local development. Put the connection string in `MONGODB_URI` inside `.env.local`.

If your DNS resolver rejects Atlas SRV lookups with `querySrv ECONNREFUSED`, copy the standard `mongodb://` connection string from Atlas Connect by turning off the SRV connection string option. The app uses the `dropit` database. 3. Create a private Vercel Blob store connected to the Vercel project. Select a region close to the app's function and MongoDB regions. Enable the read-write token environment variable. Copy `BLOB_READ_WRITE_TOKEN` into `.env.local` for local development. The browser uploads directly to Blob using private, time-limited signed URLs. 4. Create a Cloudflare Turnstile widget for your production domain. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in `.env.local`. For local development only, both may be left unset. 5. Set `CLEANUP_SECRET` in `.env.local` to a random value of at least 32 characters. Copy the application variable values to Vercel project environment settings before deployment. Vercel adds the Blob token to connected environments. Never commit `.env.local`. 6. Run `npm run dev` and open <http://localhost:3000>.

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
