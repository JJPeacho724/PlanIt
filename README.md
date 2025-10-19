# PlanIt — AI-Powered Personal Planner

PlanIt helps you take back control of your day by turning your inbox and calendar into a smart, prioritized daily plan. It ingests Gmail messages, analyzes your Google Calendar, and uses AI to surface the most important tasks, create a time-aware schedule, and keep your day on track.

Why PlanIt
- Save time: automatically extract tasks and commitments from email and calendar events so you don't have to.
- Get a clear plan: receive an ordered, time-aware daily agenda with estimated durations and priorities.
- Stay synchronized: two-way Google Calendar sync keeps events and tasks aligned.
- Learn and adapt: the AI personalizes plans based on your habits and feedback.

Key product features
- Email-to-task extraction: scans Gmail for action items, deadlines, and follow-ups and turns them into tasks.
- Intelligent day planning: generates a prioritized schedule that fits tasks around existing events and estimated durations.
- Google Calendar integration: syncs events and suggested tasks with your Google Calendar for a seamless experience.
- Priority scoring and recommendations: tasks are scored so you see what matters most first.
- Privacy-first design: sensitive tokens are encrypted and user data is stored in your account.

How it works (high level)
1. Connect your Google account (OAuth) to allow safe access to Gmail and Calendar.
2. PlanIt ingests and analyzes incoming emails and calendar events on a scheduled basis.
3. The AI extracts tasks, estimates durations, assigns priorities, and generates a suggested daily timeline.
4. You review, adjust, and confirm the day's plan — changes sync back to your Google Calendar.

Quick start (development)
Prerequisites:
- Node.js 18+
- PostgreSQL
- Redis (optional for caching)
- Google Cloud project with Gmail & Calendar APIs enabled
- OpenAI API key (for AI features)

Minimal setup:
1. Copy .env.example to .env and set the variables (DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OPENAI_API_KEY, NEXTAUTH_SECRET, ENCRYPTION_KEY).
2. Install dependencies: npm install
3. Create/generate the database client and run migrations (Prisma): npm run prisma:generate && npm run prisma:migrate
4. Start the app: npm run dev
5. Open http://localhost:3000 and follow the onboarding to connect Gmail & Calendar.

Configuration pointers
- Gmail ingestion is controlled by the OAuth scopes and background jobs; check GMAIL_DAY_PLANNING_SETUP.md for deployment specifics.
- OpenAI usage is governed by OPENAI_API_KEY and usage limits—monitor your quota in production.
- Encryption: ENCRYPTION_KEY protects sensitive tokens at rest; keep it secret.

Where to find more setup docs
- GMAIL_DAY_PLANNING_SETUP.md — Gmail ingestion & setup
- GOOGLE_OAUTH_SETUP.md — OAuth configuration and redirect URIs
- PERSONALIZED_PLANNER_INTEGRATION.md — advanced personalization and tuning

Troubleshooting (common)
- OAuth/redirect errors: confirm your redirect URIs and test user list in Google Cloud.
- Database connection: verify DATABASE_URL and that Postgres is running and accessible.
- OpenAI errors: check API key and quotas.

Contributing
We welcome improvements. Typical flow:
1. Fork the repo
2. Create a feature branch
3. Run tests and linting
4. Open a pull request describing your change

License
This project is private and proprietary.

Contact
If you need help or want to demo the product, open an issue or contact the maintainers.
