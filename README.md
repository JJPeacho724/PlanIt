Planner Monorepo
=================

Monorepo with Next.js 14 app, Auth.js (Google OAuth), Prisma + Supabase Postgres (pgvector), API routes, `packages/core` for domain logic, and `packages/ai` for prompts/tools.

Structure
---------

- apps/web: Next.js 14 (App Router), Tailwind, shadcn/ui-ready, FullCalendar timeline, API routes in `app/api/*`
- packages/core: Domain logic, zod-validated ENV loader
- packages/ai: Prompts, schemas, and a placeholder planner (`buildPlan`)

Quickstart
----------

1) Create `.env` at repository root:

DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB?schema=public
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-with-random-long-secret
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
OPENAI_API_KEY=...
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_SIGNING_SECRET=...
ENCRYPTION_KEY=base64-32-bytes

Generate a 32-byte base64 key: `openssl rand -base64 32`

2) Install deps and run dev server:

- npm install
- npm run prisma:generate -w @acme/web
- npm run dev -w @acme/web

3) Database: enable `pgvector` on Supabase/Postgres

- Run this SQL once on your database: `create extension if not exists vector;`

4) Prisma

- Edit database connection in `.env`
- Create and apply migrations: `npm run prisma:migrate -w @acme/web`

Notes
-----

- Auth.js (NextAuth) route handlers under `app/api/auth/[...nextauth]/route.ts`
- Planner chat lives in a persistent right sidebar (`PlannerSidebar`), and timeline uses FullCalendar on the main area
- ENV loader is provided by `@acme/core/env` and used across the app and clients

Scripts
-------

- npm run dev -w @acme/web – start Next.js
- npm run build -w @acme/web – build
- npm run prisma:* -w @acme/web – manage Prisma
 - npm run cron -w @acme/web – run background ingestion (Gmail, Slack, Calendar cache)

Ingest API
----------

- POST `/api/ingest/gmail`: Pull new Gmail messages since last cursor, persist `MessageIngest`, run minimal rules, create `Task`s with source pointers.
- POST `/api/ingest/slack`: Pull Slack DMs/MPIM history since last cursor, persist `MessageIngest`, run minimal rules, create `Task`s.
- POST `/api/ingest/calendar`: Cache Google Calendar events into `CalendarBusy` for busy-time awareness.

Rules engine
------------

- Ignores auto-generated messages (`List-Unsubscribe`, `Precedence: bulk`, `Auto-Submitted`, `X-Auto-Response-Suppress`).
- Converts to tasks only if action language present (e.g., "by", "due", "can you", "schedule", date-like phrases).
- Attaches source pointers by linking tasks to `MessageIngest` via `Task.createdFromMessageId`.

