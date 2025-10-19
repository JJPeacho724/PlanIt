# PlanIt — AI-Powered Personal Planner (PM-Friendly)

PlanIt turns your inbox and calendar into a clear, prioritized daily plan so busy professionals can focus on outcomes, not admin. This README highlights the product vision, user value, and the metrics and features that product managers and recruiters care about.

One-line summary
PlanIt ingests Gmail and Google Calendar, extracts commitments and action items, and generates a prioritized, time-aware daily agenda using AI.

Problem we solve
- Users spend a large portion of their day triaging email, scheduling tasks, and deciding what to work on next.
- Fragmented context across inbox and calendar leads to missed deadlines and inefficient planning.

Why it matters (value props for PMs)
- Time saved: Automates task extraction and scheduling so users spend less time planning and more time executing.
- Reduced context switching: Consolidates emails, meeting prep, and tasks into a single daily plan.
- Higher on-time delivery: Prioritized, time-boxed tasks increase the odds work gets done.
- Easy integration: Works with Gmail & Google Calendar (no vendor lock-in for core workflows).

Who benefits
- Individual contributors and knowledge workers who rely on email for requests and info.
- Managers coordinating priorities across calendars.
- Small teams needing lightweight, automated daily planning without changing existing tools.

Key product highlights (what to show PMs/recruiters)
- Email-to-task extraction: Reliable parsing of action items, deadlines, and follow-ups from Gmail.
- Intelligent scheduling: Auto-fit tasks around meetings with estimated durations and buffer time.
- Two-way Calendar sync: Suggest tasks become calendar items when accepted.
- Priority scoring & explainability: Tasks are scored and surfaced with human-readable reasons why they were prioritized.
- Feedback loop & personalization: The AI adapts to user preferences and reschedules based on behavior.
- Privacy & token encryption: Sensitive tokens are encrypted at rest; users control account access.

Demo & assets
- Live demo: Run locally (Quick Start below) and connect a Google account to see the onboarding & planner flow.
- Screenshots/GIFs: Add 1–2 clear images showing (a) inbox -> extracted tasks and (b) daily timeline view. These are high-conversion assets for PM recruiting pages.

How it works (high level)
1. OAuth connect to Gmail & Calendar.
2. Background ingestion and NLP-based extraction of tasks from email.
3. AI planner scores, estimates duration, and schedules tasks into a suggested timeline.
4. User reviews and syncs accepted items to Google Calendar.

Quick start (dev)
Prerequisites:
- Node.js 18+
- PostgreSQL
- Redis (optional)
- Google Cloud project with Gmail + Calendar APIs
- OpenAI API key

Minimal setup:
1. Copy .env.example to .env and set DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OPENAI_API_KEY, NEXTAUTH_SECRET, ENCRYPTION_KEY.
2. npm install
3. npm run prisma:generate && npm run prisma:migrate
4. npm run dev
5. Open http://localhost:3000 and connect Google account to see the planner in action.

Success metrics PMs will ask for
- Activation: % of users who connect Gmail & Calendar during onboarding
- Daily active planners: DAU who review/accept a generated daily plan
- Time saved: average minutes saved per user per day (measured via self-report or behavior proxy)
- Task completion rate: % of AI-suggested tasks completed within their suggested time window
- Retention: 7- & 30-day retention of active users

Roadmap (PM-facing)
- Short-term: improved extraction accuracy, richer explainability, mobile-first timeline
- Mid-term: team-level planning and shared timelines, Slack/MS Teams integrations
- Long-term: calendar-aware suggestions across teams, enterprise SSO & compliance

What to include in a recruiting/PM one-pager
- Elevator pitch + 2–3 screenshots
- Key metrics (activation, DAU, retention) or placeholders if early
- Top 3 product challenges and opportunities (extraction accuracy, explainability, onboarding friction)
- Role expectations for PM candidates (ownership areas, KPIs, collaboration model)

For PM candidates / recruiters
If you're a product manager interested in evaluating PlanIt or joining the team, here’s what we typically look for:
- Experience shipping AI-assisted workflows or SaaS products
- Strong metrics-driven mindset (activation, retention, task completion)
- Empathy for user workflows tied to email & calendar

Interested in a demo or hiring conversation?
- Add a clear screenshot or demo GIF to the repo and open an issue titled "PM Demo Request" or email the maintainer.

Where to find more docs
- GMAIL_DAY_PLANNING_SETUP.md — Gmail ingestion & setup
- GOOGLE_OAUTH_SETUP.md — OAuth configuration
- PERSONALIZED_PLANNER_INTEGRATION.md — advanced personalization

Contributing
- Fork → feature branch → tests & lint → PR. See CONTRIBUTING.md for details.

License
This project is private and proprietary.

Contact
Open an issue or tag @JJPeacho724 on GitHub to request a demo or additional assets.