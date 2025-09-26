# Personalized Planner Setup Guide

This guide will help you set up the Personalized Planner learning system in your existing Next.js application.

## Overview

The Personalized Planner adds AI-powered learning capabilities that:
- **Learn continuously** from user signals and behavior
- **Personalize recommendations** using user profiles and preferences  
- **A/B test** different planning variants using multi-armed bandits
- **Extract insights** from emails, tasks, and user interactions
- **Decay old information** to keep recommendations fresh

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ (with optional pgvector extension)
- Redis 6+ (optional, for caching and short-term memory)
- OpenAI API key (optional, has fallbacks)

## Environment Configuration

Create a `.env.local` file with these variables:

```bash
# Database (required)
DATABASE_URL="postgresql://username:password@localhost:5432/planner_db"

# Redis (optional - for short-term memory and caching)
REDIS_URL="redis://localhost:6379"

# OpenAI (optional - for embeddings and LLM, has fallbacks)
OPENAI_API_KEY="sk-your-openai-api-key"

# Learning System Configuration
LEARNING_ENABLED="true"
BANDIT_EPSILON="0.1"
FACT_DECAY_ENABLED="true"
MIN_CONFIDENCE_THRESHOLD="0.01"

# Worker Configuration  
DISTILL_SCHEDULE="0 2 * * *"  # Run distillation at 2 AM daily
DECAY_SCHEDULE="0 3 * * *"    # Run decay at 3 AM daily

# Development/Demo
DEMO_MODE="false"
CREATE_SAMPLE_DATA="false"
```

## Setup Steps

### 1. Install Dependencies

The required dependencies have been added to `package.json`:
- `redis` for caching and short-term memory

### 2. Database Migration

Run the database migration to add the new learning tables:

```bash
npm run migrate
```

This adds these new models:
- `UserProfile` - Enhanced user profiles with goals, constraints, preferences
- `UserFact` - Structured facts learned about users with confidence scores
- `SemanticChunk` - Vector-searchable content chunks from emails/tasks
- `Signal` - User behavior signals for learning
- `BanditPolicy` - Multi-armed bandit for A/B testing variants

### 3. Enable pgvector (Optional but Recommended)

For semantic search capabilities, enable the pgvector extension:

```bash
# Connect to your PostgreSQL database
psql "$DATABASE_URL"

# Enable the extension
CREATE EXTENSION IF NOT EXISTS vector;

# Update the schema to enable embeddings (uncomment in schema.prisma)
# Then re-run migrations
```

### 4. Seed Demo Data (Optional)

Create a demo user profile and sample data:

```bash
npm run worker:distill -- --seed-demo
```

## API Endpoints

The learning system adds these new endpoints:

### Signals API (`POST /api/signals`)
Record user behavior signals for learning:

```typescript
const response = await fetch('/api/signals', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key: 'plan_accepted',
    signal: JSON.stringify({ planType: 'time_blocked', duration: '90min' }),
    delta: 0.1, // Positive reinforcement
    success: true
  })
})
```

### Memory API (`POST /api/memory`) 
Store explicit user memories and facts:

```typescript
const response = await fetch('/api/memory', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    remember: {
      factType: 'preference',
      key: 'work_hours',
      value: '9-17',
      confidence: 0.9
    }
  })
})
```

### Enhanced Planner API (`POST /api/planner`)
The planner now uses personalized learning:

```typescript
const response = await fetch('/api/planner', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "Plan my day based on my preferences",
    autoGenerateEvents: true
  })
})

// Response includes learning metadata
const { learning } = await response.json()
console.log(`Confidence: ${learning.confidence}`)
console.log(`Variant: ${learning.variant}`)
console.log(`Personalized: ${learning.personalized}`)
```

## Worker Scripts

Run these scripts to process learning data:

### Nightly Distillation
Extracts patterns and facts from user behavior:

```bash
# Run manually
npm run worker:distill

# Seed demo data
npm run worker:distill -- --seed-demo
```

### Daily Decay
Applies confidence decay and cleans up old data:

```bash
# Run manually
npm run worker:decay

# Generate report only
npm run worker:decay -- --report-only

# With database vacuum
npm run worker:decay -- --with-vacuum
```

### Automated Scheduling
Add to your cron jobs or task scheduler:

```bash
# Daily at 2 AM - distillation
0 2 * * * cd /path/to/your/app && npm run worker:distill

# Daily at 3 AM - decay
0 3 * * * cd /path/to/your/app && npm run worker:decay
```

## Frontend Integration

### Learning Feedback Buttons

Add feedback buttons to your planner UI:

```typescript
// Record positive feedback
const handleAcceptPlan = async () => {
  await fetch('/api/signals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: 'plan_accepted',
      signal: JSON.stringify(planData),
      delta: 0.2,
      banditKey: `planner:variant:${learning.variant}`,
      success: true
    })
  })
}

// Record negative feedback  
const handleRejectPlan = async () => {
  await fetch('/api/signals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: 'plan_rejected',
      signal: JSON.stringify(planData),
      delta: -0.1,
      banditKey: `planner:variant:${learning.variant}`,
      success: false
    })
  })
}
```

### "Remember This" Feature

Add a button to explicitly store user preferences:

```typescript
const handleRememberPreference = async (preference: string) => {
  await fetch('/api/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      remember: {
        factType: 'preference',
        key: 'user_stated_preference',
        value: preference,
        confidence: 0.9,
        source: 'explicit'
      }
    })
  })
}
```

## Configuration Options

### Learning System

- `LEARNING_ENABLED`: Enable/disable the learning system
- `BANDIT_EPSILON`: Exploration rate for A/B testing (0.1 = 10% exploration)
- `FACT_DECAY_ENABLED`: Enable confidence decay over time
- `MIN_CONFIDENCE_THRESHOLD`: Minimum confidence before facts are deleted

### Performance

- `REDIS_URL`: Optional Redis for caching embeddings and short-term memory
- Set `OPENAI_API_KEY` for best embeddings, or use fallback text search

### Development

- `DEMO_MODE`: Enable demo user and sample data
- `CREATE_SAMPLE_DATA`: Auto-create sample tasks and events

## Monitoring and Analytics

### View User Learning Data

```bash
# Get user facts
curl -H "Cookie: session-token" \
  "http://localhost:3000/api/memory?type=facts&minConfidence=0.5"

# Get user signals
curl -H "Cookie: session-token" \
  "http://localhost:3000/api/signals?key=plan_accepted&limit=10"
```

### Monitor Bandit Performance

Check bandit arm performance in your database:

```sql
SELECT 
  banditKey,
  armName,
  pulls,
  rewards,
  CASE WHEN pulls > 0 THEN rewards::float / pulls ELSE 0 END as success_rate
FROM "BanditPolicy" 
WHERE userId = 'your-user-id'
ORDER BY banditKey, success_rate DESC;
```

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**: Redis is optional - the system will work without it
2. **OpenAI API Errors**: Fallback text search will be used automatically  
3. **pgvector Not Available**: System falls back to text-based similarity search
4. **Migration Errors**: Ensure PostgreSQL version is 14+

### Debug Mode

Enable detailed logging:

```bash
DEBUG=planner:* npm run dev
```

### Reset Learning Data

To start fresh (development only):

```sql
-- Clear learning data (keep user accounts)
DELETE FROM "Signal";
DELETE FROM "UserFact";
DELETE FROM "SemanticChunk";
DELETE FROM "BanditPolicy";
DELETE FROM "UserProfile";
```

## Production Deployment

### Security Considerations

- Store sensitive data encrypted in `UserFact` if needed
- Implement data retention policies per GDPR/privacy requirements
- Monitor API rate limits for learning endpoints
- Use Redis password in production

### Scaling

- Consider partitioning large tables by userId
- Use read replicas for analytics queries
- Schedule workers during low-traffic hours
- Monitor embedding generation costs

### Backup Strategy

- Include learning tables in database backups
- Export user profiles for compliance requests
- Archive old signals before deletion

---

## Need Help?

The learning system is designed to be robust with graceful fallbacks. If you encounter issues:

1. Check the console logs for detailed error messages
2. Verify environment variables are set correctly  
3. Ensure database migrations completed successfully
4. Test with demo data first using `--seed-demo`

The system will continue to work even if Redis or OpenAI are unavailable, using fallback implementations.
