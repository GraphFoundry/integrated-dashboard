import { createBrowserRouter, Navigate } from 'react-router'
import DashboardLayout from '@/app/layout/DashboardLayout'
import PipelinePlayground from '@/pages/pipeline/PipelinePlayground'
import TelemetryDashboard from '@/pages/telemetry/TelemetryDashboard'
import DecisionLogs from '@/pages/decisions/DecisionLogs'
import AlertsPlaceholder from '@/pages/alerts/AlertsPlaceholder'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/telemetry" replace />,
      },
      {
        path: 'pipeline',
        element: <PipelinePlayground />,
      },
      {
        path: 'telemetry',
        element: <TelemetryDashboard />,
      },
      {
        path: 'decisions',
        element: <DecisionLogs />,
      },
      {
        path: 'alerts',
        element: <AlertsPlaceholder />,
      },
    ],
  },
])
