# Automatic Gmail Day Planning Integration

## Overview

This **fully automatic** Gmail integration continuously ingests the last 5 days of emails and uses AI to help plan your day with email context, calendar invites, and time-sensitive information. No manual intervention required!

## Features Implemented

✅ **5-Day Email Ingestion**: Changed from 30 days to last 5 days for focused day planning
✅ **Full Body Text Extraction**: Extracts complete email content instead of just snippets
✅ **AI Calendar Detection**: Identifies meeting requests and calendar invites 
✅ **Enhanced Task Creation**: Creates prioritized tasks with calendar context
✅ **Day Planning API**: Uses email context for intelligent schedule optimization
✅ **Smart Action Patterns**: Enhanced pattern matching for better email filtering

## Quick Start (Fully Automatic!)

### 1. Connect Gmail
First, ensure your Google OAuth is set up and you've connected your Gmail account through the app.

### 2. That's it! 🎉
Gmail ingestion now happens **automatically**:
- ✅ When you access the app (instant sync)
- ✅ Every 15 minutes during business hours (7 AM - 8 PM)
- ✅ Every 30 minutes during off hours (8 PM - 7 AM)

### 3. Use the Web Interface
Visit: http://localhost:3000/test-email-planner
- Select a date and click "Plan Day" for AI-powered scheduling advice
- Gmail sync happens automatically in the background

### 4. Optional: Set Up Server Cron (for production)
```bash
cd /root/startup
./setup-auto-cron.sh
```

### 5. API Usage

#### Get Day Planning with Email Context (automatic sync included)
```bash
curl -X POST http://localhost:3000/api/planner/email-context \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{"date": "2024-01-15", "preferences": {"workingHours": {"start": "09:00", "end": "17:00"}}}'
```

#### Manual Trigger (if needed)
```bash
curl -X GET http://localhost:3000/api/auto-ingest \
  -H "Cookie: your-session-cookie"
```

## File Changes

### Core Files Modified:
- `apps/web/src/lib/ingest/gmail.ts` - Enhanced email ingestion with full body text and calendar detection
- `packages/core/src/domain/rules.ts` - Added meeting/calendar patterns for better action detection

### New Files Created:
- `apps/web/src/app/api/planner/email-context/route.ts` - Day planning API with email context
- `apps/web/src/lib/email-calendar-extract.ts` - AI-powered calendar invite detection
- `apps/web/src/components/EmailDayPlanner.tsx` - Simplified auto-sync interface
- `apps/web/src/app/test-email-planner/page.tsx` - Test page
- `apps/web/src/scripts/test-gmail-ingest.ts` - CLI test script
- `apps/web/src/app/api/auto-ingest/route.ts` - Automatic ingestion endpoint
- `apps/web/src/lib/auto-ingest.ts` - Smart auto-ingestion logic
- `apps/web/src/components/AutoIngest.tsx` - Auto-sync component
- `setup-auto-cron.sh` - Server cron setup script

## How It Works (Automatically)

1. **Auto-Sync on Access**: Instantly fetches emails when you open the app
2. **Smart Scheduling**: More frequent sync during business hours, less frequent during off-hours
3. **Background Processing**: Runs in background without blocking the UI
4. **Content Extraction**: Extracts full email body (not just snippets) for better AI context
5. **Action Detection**: Uses enhanced patterns to identify actionable emails and calendar invites
6. **Calendar Analysis**: AI analyzes emails for meeting requests, times, and locations
7. **Task Creation**: Creates prioritized tasks with calendar context and smart tagging
8. **Day Planning**: AI uses email context to provide scheduling advice and conflict detection

## Email Context for AI

The system now provides rich email context including:
- Full email body text (up to 5000 chars stored)
- Meeting detection and extraction
- Sender importance and urgency patterns
- Calendar invite details (dates, times, locations)
- Priority scoring based on content analysis

## Example AI Day Planning Output

The AI can now provide advice like:
- "You have 3 meeting requests that need responses today"
- "Block 2-4pm for deep work based on your energy patterns"
- "Schedule the client call before the internal meeting for better context"
- "Prepare for tomorrow's presentation mentioned in your emails"

## Database Schema

Enhanced `messageIngest.metadata` now includes:
```json
{
  "id": "gmail_message_id",
  "from": "sender@example.com",
  "subject": "Meeting Request",
  "headers": {...},
  "bodyText": "Full email content for AI analysis..."
}
```

Enhanced `task` records include:
- Calendar detection reasoning
- Enhanced priority scoring (1-3)
- Smart tags: ['email', 'calendar', 'meeting']
- Detailed descriptions with calendar context

## Testing

1. **Just visit the app**: Auto-ingestion starts immediately when you access any page
2. **Use the web interface**: Visual testing with automatic sync status
3. **Check browser console**: Look for auto-ingestion success messages
4. **Monitor logs**: `tail -f /var/log/gmail-ingest.log` (if cron is set up)
5. **Check database**: Verify tasks and email ingests are created automatically

## Troubleshooting

- **No emails ingested**: Check Google OAuth connection and Gmail API permissions
- **No tasks created**: Verify emails contain actionable patterns (meetings, deadlines, etc.)
- **AI errors**: Check OpenAI API key and rate limits
- **Calendar detection issues**: Review email content - may need more explicit time/date info

## Automatic Features Summary

✅ **Auto-ingestion on app access** - No manual triggers needed
✅ **Smart background sync** - Every 15-30 minutes based on usage patterns  
✅ **Rate limiting** - Prevents excessive API calls
✅ **Error handling** - Graceful fallbacks if Gmail is unavailable
✅ **Session-based** - Only syncs when users are active
✅ **Status monitoring** - Visual indicators of sync status

## Next Steps

To further enhance the automatic system:
1. Add push notifications for important email-based tasks
2. Implement machine learning for personalized sync timing
3. Add automatic calendar event creation from detected invites
4. Create email thread analysis for better context
5. Add smart retry logic for failed syncs
