import { cn } from '@/components/common/uiClassTokens'

type SkeletonVariant = 'line' | 'title' | 'card' | 'table-row' | 'chip'

interface SkeletonBlockProps {
  readonly variant?: SkeletonVariant
  readonly className?: string
}

const variantClasses: Record<SkeletonVariant, string> = {
  line: 'h-3 w-full rounded-md',
  title: 'h-5 w-2/5 rounded-md',
  card: 'h-32 w-full rounded-[var(--radius-md)]',
  'table-row': 'h-10 w-full rounded-md',
  chip: 'h-6 w-20 rounded-full',
}

export default function SkeletonBlock({
  variant = 'line',
  className = '',
}: Readonly<SkeletonBlockProps>) {
  return <div aria-hidden="true" className={cn('skeleton', variantClasses[variant], className)} />
}
