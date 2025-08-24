import type { OAuth2Client } from 'google-auth-library'
import { google } from 'googleapis'

export function createGoogleOAuthClient(params: { clientId: string; clientSecret: string; redirectUri: string }) {
  const { clientId, clientSecret, redirectUri } = params
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function createGoogleCalendarClient(oAuth2Client: OAuth2Client) {
  return google.calendar({ version: 'v3', auth: oAuth2Client })
}

export function createGmailClient(oAuth2Client: OAuth2Client) {
  return google.gmail({ version: 'v1', auth: oAuth2Client })
}

