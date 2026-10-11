import type { AuthError } from '@supabase/supabase-js'

export const GENERIC_AUTH_ERROR = 'Something went wrong. Please try again.'

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Incorrect email or password.',
  user_already_exists: 'An account with this email already exists.',
  email_exists: 'An account with this email already exists.',
  weak_password: 'This password is too weak. Choose a longer one.',
  over_request_rate_limit: 'Too many attempts. Please wait a moment and try again.',
}

const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.'

export const authErrorMessage = (error: Pick<AuthError, 'code' | 'message' | 'name'>): string => {
  if (error.name === 'AuthRetryableFetchError') return NETWORK_ERROR
  return (error.code && MESSAGES[error.code]) || error.message?.trim() || GENERIC_AUTH_ERROR
}
