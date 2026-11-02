import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { RequireAuth } from '../auth/RequireAuth'
import { AppShell } from '../components/AppShell'
import { AuthLayout } from '../components/AuthLayout'
import { AdminUsersPage } from '../pages/AdminUsersPage'
import { HomePage } from '../pages/HomePage'
import { NewPlanPage } from '../pages/NewPlanPage'
import { PlanGenerationPage } from '../pages/PlanGenerationPage'
import { SavedPlanPage } from '../pages/SavedPlanPage'
import { SavedPlansPage } from '../pages/SavedPlansPage'
import { SignInPage } from '../pages/SignInPage'
import { SignUpPage } from '../pages/SignUpPage'

const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/dev/kitchen-sink',
        lazy: async () => ({
          Component: (await import('../dev/KitchenSinkPage')).KitchenSinkPage,
        }),
      },
    ]
  : []

export const router = createBrowserRouter([
  ...devRoutes,
  {
    element: <AuthLayout />,
    children: [
      { path: '/sign-up', element: <SignUpPage /> },
      { path: '/sign-in', element: <SignInPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: '/plans', element: <SavedPlansPage /> },
          { path: '/plans/new', element: <NewPlanPage /> },
          { path: '/plans/:id', element: <SavedPlanPage /> },
          { path: '/plans/generate/:jobId', element: <PlanGenerationPage /> },
          { path: '/admin/users', element: <AdminUsersPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
