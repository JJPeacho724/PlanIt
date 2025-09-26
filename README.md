# Timeline Planner - AI-Powered Day Planning with Email & Calendar Integration

A sophisticated AI-powered planning application that automatically ingests Gmail emails, integrates with Google Calendar, and uses machine learning to provide intelligent day planning and task management.

## 🚀 Quick Start

### Prerequisites
- Node.js 18.18.0 or higher
- PostgreSQL database
- Redis (for caching)
- Google Cloud Console account (for OAuth/Gmail/Calendar APIs)
- OpenAI API key

### 1. Environment Setup

Create a `.env` file in the root directory:

```bash
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/timeline_planner"

# NextAuth Configuration
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-super-secure-random-string-at-least-32-chars"

# Google OAuth (see GOOGLE_OAUTH_SETUP.md for detailed setup)
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# AI Integration
OPENAI_API_KEY="sk-your-openai-api-key"

# Encryption
ENCRYPTION_KEY="your-32-byte-base64-encryption-key"

# Optional: Slack Integration
SLACK_CLIENT_ID=""
SLACK_CLIENT_SECRET=""
SLACK_SIGNING_SECRET=""
```

### 2. Install Dependencies

```bash
# Install all dependencies for the monorepo
npm install

# Build internal packages
npm run build --workspace=@acme/core
npm run build --workspace=@acme/ai
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run prisma:generate -w @acme/web

# Run database migrations
npm run prisma:migrate -w @acme/web

# Optional: Open Prisma Studio to view database
npm run prisma:studio -w @acme/web
```

### 4. Start Development Server

```bash
# Start the Next.js development server
npm run dev -w @acme/web
```

The app will be available at: http://localhost:3000

## 📧 Gmail Integration Setup

Follow the detailed guide in `GMAIL_DAY_PLANNING_SETUP.md` for complete Gmail integration setup.

### Quick Gmail Setup:
1. Ensure Google OAuth is configured (see `GOOGLE_OAUTH_SETUP.md`)
2. Enable Gmail API and Google Calendar API in Google Cloud Console
3. Connect your Gmail account through the web interface
4. Email ingestion happens automatically every 15-30 minutes

## 🛠️ Available Scripts

### Development
```bash
npm run dev              # Start development server
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint
```

### Database
```bash
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run database migrations
npm run prisma:studio    # Open Prisma Studio
```

### Cron Jobs & Automation
```bash
npm run cron             # Run cron jobs manually
npm run worker:distill   # Run nightly distillation
npm run worker:decay     # Run daily decay
```

### Testing
```bash
npm run test             # Run Jest tests
```

## 🏗️ Project Structure

```
planit/
├── apps/
│   └── web/                    # Next.js web application
│       ├── prisma/             # Database schema and migrations
│       ├── src/
│       │   ├── app/            # Next.js app router pages
│       │   ├── components/     # React components
│       │   ├── lib/            # Utility libraries
│       │   └── scripts/        # Utility scripts
├── packages/
│   ├── core/                   # Shared core utilities and types
│   └── ai/                     # AI-related functionality
├── scripts/
│   ├── setup-auto-cron.sh      # Cron job setup for production
│   └── check-env.js            # Environment validation script
└── docs/                       # Setup documentation
```

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_URL` | Yes | NextAuth base URL |
| `NEXTAUTH_SECRET` | Yes | NextAuth secret (32+ chars) |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `OPENAI_API_KEY` | Yes | OpenAI API key for AI features |
| `ENCRYPTION_KEY` | Yes | 32-byte base64 encryption key |

### Database Schema

The application uses PostgreSQL with the following main entities:
- **Users**: User accounts and preferences
- **Tasks**: AI-generated and user-created tasks
- **Events**: Calendar events and integrations
- **MessageIngest**: Gmail email ingestion data
- **Memories**: User interaction history for personalization

## 📱 Features

- **AI-Powered Day Planning**: Intelligent scheduling based on emails and calendar
- **Automatic Gmail Integration**: Continuous email ingestion and analysis
- **Google Calendar Sync**: Bidirectional calendar integration
- **Task Management**: AI-generated tasks with priority scoring
- **Personalized Learning**: Machine learning adapts to user patterns
- **Real-time Sync**: Automatic background synchronization
- **Responsive Design**: Works on desktop and mobile devices

## 🧪 Testing

### Environment Check
```bash
node check-env.js
```

### Manual Testing URLs
- Main app: http://localhost:3000
- Email planner test: http://localhost:3000/test-email-planner
- API health check: http://localhost:3000/api/health

## 🚀 Deployment

### Development
```bash
npm run build
npm run start
```

### Production Setup
1. Set up production database (PostgreSQL)
2. Configure Redis for caching
3. Set environment variables
4. Run database migrations
5. Build and deploy the application
6. Set up cron jobs using `setup-auto-cron.sh`

## 📚 Additional Documentation

- `GMAIL_DAY_PLANNING_SETUP.md` - Detailed Gmail integration guide
- `GOOGLE_OAUTH_SETUP.md` - Google OAuth configuration
- `PERSONALIZED_PLANNER_INTEGRATION.md` - Advanced features setup

## 🐛 Troubleshooting

### Common Issues

1. **Database connection errors**
   - Verify `DATABASE_URL` is correct
   - Ensure PostgreSQL is running
   - Check database permissions

2. **Google OAuth errors**
   - Follow `GOOGLE_OAUTH_SETUP.md` exactly
   - Add your email as a test user
   - Verify redirect URIs match exactly

3. **OpenAI API errors**
   - Check `OPENAI_API_KEY` is valid
   - Verify API quota hasn't been exceeded

4. **Build errors**
   - Run `npm install` in all workspaces
   - Build packages in order: core → ai → web

### Debug Commands
```bash
# Check environment variables
node check-env.js

# Test database connection
npm run prisma:studio

# Clear cache and restart
rm -rf node_modules/.cache
npm run dev
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📄 License

This project is private and proprietary.

