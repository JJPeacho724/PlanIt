import { WebClient } from '@slack/web-api'

export function createSlackClient(token: string) {
  return new WebClient(token)
}


