import type { AuthContextValue } from '../auth/auth-context'

export const handleAuthFailure = async (
  status: number,
  signOut: AuthContextValue['signOut'],
): Promise<boolean> => {
  if (status === 403) {
    await signOut('blocked')
    return true
  }

  if (status === 401) {
    await signOut()
    return true
  }

  return false
}
