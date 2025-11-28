import { createBrowserRouter, Navigate } from 'react-router'
import DashboardLayout from '@/app/layout/DashboardLayout'
import Overview from '@/pages/overview/Overview'
import Metrics from '@/pages/metrics/Metrics'
import Simulations from '@/pages/simulations/Simulations'
import History from '@/pages/history/History'
import DecisionDetail from '@/pages/history/DecisionDetail'
import AlertsPlaceholder from '@/pages/alerts/AlertsPlaceholder'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/overview" replace />,
      },
      {
        path: 'overview',
        element: <Overview />,
      },
      {
        path: 'metrics',
        element: <Metrics />,
      },
      {
        path: 'simulations',
        element: <Simulations />,
      },
      {
        path: 'history',
        element: <History />,
      },
      {
        path: 'history/:id',
        element: <DecisionDetail />,
      },
      // Legacy redirects
      {
        path: 'telemetry',
        element: <Navigate to="/metrics" replace />,
      },
      {
        path: 'pipeline',
        element: <Navigate to="/simulations" replace />,
      },
      {
        path: 'decisions',
        element: <Navigate to="/history" replace />,
      },
      {
        path: 'alerts',
        element: <AlertsPlaceholder />,
      },
    ],
  },
])
