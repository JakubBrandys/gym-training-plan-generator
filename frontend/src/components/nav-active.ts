export type NavKey = 'create-plan' | 'my-plans' | 'users'

export type NavItem = {
  key: NavKey
  to: string
  label: string
  adminOnly: boolean
  isActive: (pathname: string) => boolean
}

const normalise = (pathname: string) =>
  pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname

const isCreatePlanPath = (pathname: string) => {
  const path = normalise(pathname)
  return path === '/plans/new' || path.startsWith('/plans/generate/')
}

const isMyPlansPath = (pathname: string) => {
  const path = normalise(pathname)
  return !isCreatePlanPath(path) && (path === '/plans' || path.startsWith('/plans/'))
}

const isUsersPath = (pathname: string) => normalise(pathname) === '/admin/users'

export const NAV_ITEMS: NavItem[] = [
  { key: 'create-plan', to: '/plans/new', label: 'Create plan', adminOnly: false, isActive: isCreatePlanPath },
  { key: 'my-plans', to: '/plans', label: 'My plans', adminOnly: false, isActive: isMyPlansPath },
  { key: 'users', to: '/admin/users', label: 'Users', adminOnly: true, isActive: isUsersPath },
]
