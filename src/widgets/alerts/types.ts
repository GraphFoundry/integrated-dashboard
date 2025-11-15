/**
 * Types for the Alerts integration slot.
 * 
 * This file defines the interface that the Alert Engine team should implement
 * when plugging their component into the dashboard.
 */

export interface AlertData {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  serviceId?: string;
  timestamp: string;
  acknowledged?: boolean;
}

export interface AlertsComponentProps {
  /**
   * Current service ID being analyzed (if any)
   * Can be used to filter alerts relevant to the current simulation
   */
  serviceId?: string;

  /**
   * Callback when an alert is clicked
   */
  onAlertClick?: (alert: AlertData) => void;

  /**
   * Maximum number of alerts to display
   */
  maxAlerts?: number;

  /**
   * Whether the alerts panel is expanded
   */
  expanded?: boolean;
}

/**
 * Export types for teammate's Alert Engine component
 */
export type { AlertData as Alert };
