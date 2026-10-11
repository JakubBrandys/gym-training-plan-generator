import { supabase } from './supabase'

// Reads the current access token right before each call so a refreshed
// token is always used. Non-2xx responses are returned, not thrown.
export const apiFetch = async (path: string, init?: RequestInit): Promise<Response> => {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const headers = new Headers(init?.headers)
  if (session) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  return fetch(`${import.meta.env.VITE_API_URL}${path}`, { ...init, headers })
}
