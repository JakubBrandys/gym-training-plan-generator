import { useContext } from 'react'
import { ProfileContext, type ProfileContextValue } from './profile-context'

export const useProfile = (): ProfileContextValue => {
  const value = useContext(ProfileContext)
  if (!value) {
    throw new Error('useProfile must be used within a ProfileProvider')
  }
  return value
}
