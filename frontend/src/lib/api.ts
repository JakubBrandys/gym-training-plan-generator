import { supabase } from './supabase'

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
