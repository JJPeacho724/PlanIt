import { openai } from '@/lib/clients/openai'

export interface EmailCalendarEvent {
  title: string
  date?: string
  time?: string
  location?: string
  duration?: number
  attendees?: string[]
  description?: string
  confidence: number
  extractedFrom: 'subject' | 'body' | 'both'
}

export interface CalendarInviteDetection {
  isCalendarInvite: boolean
  confidence: number
  events: EmailCalendarEvent[]
  reasoning: string
}

export async function detectCalendarInviteFromEmail(params: {
  subject: string
  bodyText: string
  from: string
  headers?: Record<string, string>
}): Promise<CalendarInviteDetection> {
  const { subject, bodyText, from, headers } = params
  
  // Quick heuristic check first
  const quickCheck = performQuickCalendarCheck(subject, bodyText, headers)
  if (!quickCheck.isCalendarInvite) {
    return quickCheck
  }

  try {
    // Use AI to extract detailed calendar information
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert at extracting calendar event information from emails. 
          
Analyze the email content and extract any calendar events, meetings, appointments, or time-based commitments.

Return a JSON object with this structure:
{
  "isCalendarInvite": boolean,
  "confidence": number (0-1),
  "events": [
    {
      "title": "Event title",
      "date": "YYYY-MM-DD or relative like 'tomorrow', 'next Monday'",
      "time": "HH:MM format or descriptive like 'morning', '2pm'",
      "location": "Location or 'online' or 'zoom'",
      "duration": estimated_minutes,
      "attendees": ["email1", "email2"],
      "description": "Brief description",
      "confidence": number (0-1),
      "extractedFrom": "subject" | "body" | "both"
    }
  ],
  "reasoning": "Why this is/isn't a calendar invite"
}

Focus on:
- Meeting requests and invitations
- Scheduled calls or interviews
- Appointments and deadlines
- Recurring events
- Time-sensitive commitments

Be conservative with confidence scores. Only mark as high confidence if clear time/date info is present.`
        },
        {
          role: 'user',
          content: `Analyze this email for calendar events:

From: ${from}
Subject: ${subject}

Body:
${bodyText}

Headers that might indicate calendar invite:
${headers ? Object.entries(headers)
  .filter(([key]) => key.toLowerCase().includes('calendar') || key.toLowerCase().includes('invite') || key.toLowerCase().includes('method'))
  .map(([key, value]) => `${key}: ${value}`)
  .join('\n') : 'None'}`
        }
      ],
      temperature: 0.3,
      max_tokens: 800,
    })

    const response = completion.choices?.[0]?.message?.content?.trim()
    if (!response) {
      return { isCalendarInvite: false, confidence: 0, events: [], reasoning: 'No AI response' }
    }

    // Clean up the response to handle markdown formatting
    let cleanResponse = response
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }

    try {
      const parsed = JSON.parse(cleanResponse) as CalendarInviteDetection
      return {
        isCalendarInvite: parsed.isCalendarInvite || false,
        confidence: Math.min(parsed.confidence || 0, 1),
        events: parsed.events || [],
        reasoning: parsed.reasoning || 'AI analysis completed'
      }
    } catch (parseError) {
      console.error('Failed to parse AI calendar response:', parseError)
      console.error('Raw response:', response)
      return quickCheck
    }

  } catch (error) {
    console.error('AI calendar detection error:', error)
    // If it's a rate limit error, return the quick check instead of failing
    if (error.code === 'rate_limit_exceeded') {
      console.log('OpenAI rate limit hit, using quick check fallback')
      return quickCheck
    }
    return quickCheck
  }
}

function performQuickCalendarCheck(subject: string, bodyText: string, headers?: Record<string, string>): CalendarInviteDetection {
  const text = `${subject}\n${bodyText}`.toLowerCase()
  let confidence = 0
  const reasons: string[] = []

  // Check headers for calendar indicators
  if (headers) {
    const calendarHeaders = ['content-class', 'x-microsoft-cdo-busystatus', 'method']
    for (const header of calendarHeaders) {
      if (headers[header]) {
        confidence += 0.3
        reasons.push(`calendar header: ${header}`)
      }
    }
  }

  // Check for explicit calendar/meeting terms
  const meetingTerms = ['meeting', 'calendar invite', 'appointment', 'zoom', 'teams', 'webex', 'conference call']
  for (const term of meetingTerms) {
    if (text.includes(term)) {
      confidence += 0.2
      reasons.push(`contains: ${term}`)
    }
  }

  // Check for time indicators
  const timePatterns = [
    /\b\d{1,2}:\d{2}\s*(am|pm)/i,
    /\b\d{1,2}(am|pm)\b/i,
    /\bat\s+\d{1,2}/i,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    /\b(tomorrow|today|next week|this week)/i,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}/i
  ]

  for (const pattern of timePatterns) {
    if (pattern.test(text)) {
      confidence += 0.15
      reasons.push(`time pattern: ${pattern.toString()}`)
    }
  }

  // Check for scheduling language
  const schedulingTerms = ['when:', 'where:', 'join', 'attend', 'rsvp', 'confirm']
  for (const term of schedulingTerms) {
    if (text.includes(term)) {
      confidence += 0.1
      reasons.push(`scheduling term: ${term}`)
    }
  }

  const isCalendarInvite = confidence >= 0.3
  
  return {
    isCalendarInvite,
    confidence: Math.min(confidence, 1),
    events: [], // Quick check doesn't extract events
    reasoning: isCalendarInvite ? `Detected calendar invite: ${reasons.join(', ')}` : `Not a calendar invite: insufficient indicators`
  }
}
