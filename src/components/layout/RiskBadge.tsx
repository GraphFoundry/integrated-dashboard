export type RiskLevel = 'high' | 'medium' | 'low'

interface RiskBadgeProps {
  level: RiskLevel
  className?: string
}

const riskStyles: Record<RiskLevel, string> = {
  high: 'bg-firebase-error/20 text-firebase-error border-firebase-error/30',
  medium: 'bg-firebase-warning/20 text-firebase-warning border-firebase-warning/30',
  low: 'bg-firebase-success/20 text-firebase-success border-firebase-success/30',
}

const riskLabels: Record<RiskLevel, string> = {
  high: 'High Risk',
  medium: 'Medium Risk',
  low: 'Low Risk',
}

export default function RiskBadge({ level, className = '' }: Readonly<RiskBadgeProps>) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${riskStyles[level]} ${className}`}
    >
      {riskLabels[level]}
    </span>
  )
}
