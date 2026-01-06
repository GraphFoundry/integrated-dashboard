import { createBrowserRouter, Navigate } from 'react-router'
import DashboardLayout from '@/app/layout/DashboardLayout'
import Overview from '@/pages/overview/Overview'
import ServiceHealthDetails from '@/pages/services/ServiceHealthDetails'
import Metrics from '@/pages/metrics/Metrics'
import OffenderDetails from '@/pages/metrics/OffenderDetails'
import Simulations from '@/pages/simulations/Simulations'
import History from '@/pages/history/History'
import DecisionDetail from '@/pages/history/DecisionDetail'
import AlertsPlaceholder from '@/pages/alerts/AlertsPlaceholder'
import IncidentDetail from '@/pages/alerts/IncidentDetail'
import SchedulerDecisions from '@/pages/decisions/SchedulerDecisions'

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
        path: 'services/:serviceId', // Accepts "namespace:serviceName"
        element: <ServiceHealthDetails />,
      },
      {
        path: 'metrics',
        element: <Metrics />,
      },
      {
        path: 'metrics/offenders/:serviceKey', // Accepts "namespace:serviceName"
        element: <OffenderDetails />,
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
      {
        path: 'alerts/:dedupeKey',
        element: <IncidentDetail />,
      },
      {
        path: 'decisions/scheduler',
        element: <SchedulerDecisions />,
      },
    ],
  },
])
