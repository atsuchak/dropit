# Dropit

A single Next.js App Router project for a file-sharing application. This repository currently contains only the project foundation. Uploads, downloads, links, PINs, limits, and expiry are not implemented.

## Local setup

1. Install Node.js 20.9 or newer and npm.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and replace its dummy values when backend features are added. The foundation page does not use these variables.
4. Run `npm run dev` and open <http://localhost:3000>.

## Commands

- `npm run dev`: Start the development server.
- `npm run build`: Build for production.
- `npm run start`: Start the production server after a build.
- `npm run lint`: Check code with ESLint.
- `npm run typecheck`: Check TypeScript.
- `npm run format:check`: Check formatting.
- `npm run format`: Format files.

## Structure

- `src/app`: App Router pages, layouts, and future route handlers.
- `src/styles`: Global CSS and theme settings.
- `public`: Static assets.
- `src/components/ui`: Shared UI components, added when needed.
- `src/features`: Feature UI, validation, types, and server logic, added with the first feature.
- `src/lib/server`: Shared server utilities such as MongoDB and object storage clients, added when needed.
- `src/hooks`: Shared client hooks, added when needed.
- `src/types`: Types used by multiple features, added when needed.
- `src/utils`: Small pure utilities, added when needed.

Keep server-only code in `server` folders, separate from client components. Put feature-specific code under its feature rather than in a shared folder.

## Agent rules

Agents must read [AGENTS.md](AGENTS.md) before making changes. To check compliance, request a small change and confirm the agent presents a plan and waits for approval. After approval, inspect changed files and Git status to confirm the scope and that nothing was staged.
