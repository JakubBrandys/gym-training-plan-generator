import { createBrowserRouter, Navigate } from 'react-router'
import { RequireAuth } from '../auth/RequireAuth'
import { HomePage } from '../pages/HomePage'
import { NewPlanPage } from '../pages/NewPlanPage'
import { PlanGenerationPage } from '../pages/PlanGenerationPage'
import { SignInPage } from '../pages/SignInPage'
import { SignUpPage } from '../pages/SignUpPage'

export const router = createBrowserRouter([
  { path: '/sign-up', element: <SignUpPage /> },
  { path: '/sign-in', element: <SignInPage /> },
  {
    element: <RequireAuth />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '/plans/new', element: <NewPlanPage /> },
      { path: '/plans/generate/:jobId', element: <PlanGenerationPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
