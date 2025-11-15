import { createBrowserRouter, Navigate } from 'react-router-dom';
import DashboardLayout from './layout/DashboardLayout';
import PipelinePlayground from '../pages/pipeline/PipelinePlayground';
import AlertsPlaceholder from '../pages/alerts/AlertsPlaceholder';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/pipeline" replace />,
      },
      {
        path: 'pipeline',
        element: <PipelinePlayground />,
      },
      {
        path: 'alerts',
        element: <AlertsPlaceholder />,
      },
    ],
  },
]);
