import { createContext } from 'react'

export type Profile = {
  id: string
  email: string
  role: 'MEMBER' | 'ADMIN'
}

export type ProfileState =
  | { status: 'loading' }
  | { status: 'ready'; profile: Profile }
  | { status: 'error' }

export type ProfileContextValue = {
  state: ProfileState
  reload: () => void
}

export const ProfileContext = createContext<ProfileContextValue | null>(null)
