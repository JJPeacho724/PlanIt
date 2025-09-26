# Google OAuth Setup Guide

## The Problem
You're getting `Error 401: invalid_client` because your Google OAuth app isn't properly configured.

## Step-by-Step Fix

### 1. Go to Google Cloud Console
- Visit: https://console.cloud.google.com/
- Select your project (or create one if needed)

### 2. Enable Required APIs
- Go to "APIs & Services" > "Library"
- Search for and enable:
  - **Google+ API** (for basic profile info)
  - **Gmail API** (for email integration)
  - **Google Calendar API** (for calendar integration)

### 3. Configure OAuth Consent Screen
- Go to "APIs & Services" > "OAuth consent screen"
- Choose "External" (unless you have Google Workspace)
- Fill out required fields:
  - **App name**: "Timeline Planner" (or your preferred name)
  - **User support email**: Your email
  - **Developer contact**: Your email
- **IMPORTANT**: Add your email as a test user in the "Test users" section
- Save and continue

### 4. Create OAuth 2.0 Credentials
- Go to "APIs & Services" > "Credentials"
- Click "Create Credentials" > "OAuth 2.0 Client IDs"
- Choose "Web application"
- Set name: "Timeline Planner Web Client"
- **Authorized redirect URIs** - Add these exact URLs:
  ```
  http://localhost:3000/api/auth/callback/google
  http://localhost:3000/api/integrations/connect/google/callback
  ```

### 5. Get Your Credentials
After creating, you'll see:
- **Client ID**: Copy this (starts with numbers, ends with .apps.googleusercontent.com)
- **Client Secret**: Copy this (random string of letters/numbers)

### 6. Update Your .env File
Replace the values in your .env file:
```bash
GOOGLE_CLIENT_ID=your_actual_client_id_here
GOOGLE_CLIENT_SECRET=your_actual_client_secret_here
```

## Current Issues in Your Setup:
1. ❌ `GOOGLE_CLIENT_SECRET=...` (this is not a real secret)
2. ❌ Missing proper redirect URI configuration
3. ❌ Possibly not added as test user

## After Setup:
1. Restart your development server
2. Try signing in again
3. You should now be able to authenticate successfully!
