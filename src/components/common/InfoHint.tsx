import { CircleHelp } from 'lucide-react'
import { Button, OverlayArrow, Tooltip, TooltipTrigger } from 'react-aria-components'
import { cn } from '@/components/common/uiClassTokens'

interface InfoHintProps {
  readonly text: string
  readonly className?: string
  readonly iconClassName?: string
}

export default function InfoHint({ text, className, iconClassName }: Readonly<InfoHintProps>) {
  if (!text.trim()) {
    return null
  }

  return (
    <TooltipTrigger delay={120}>
      <Button
        className={cn('inline-flex items-center rounded-sm', className)}
        aria-label="More information"
      >
        <CircleHelp
          aria-hidden
          className={cn('h-3.5 w-3.5 cursor-help text-[var(--text-dim)] hover:text-[var(--text-muted)]', iconClassName)}
        />
      </Button>
      <Tooltip
        placement="top start"
        offset={8}
        className={cn(
          'z-[100] max-w-72 rounded-md border border-[var(--border)] bg-[var(--surface-solid)] px-2.5 py-2 text-xs normal-case tracking-normal text-[var(--text-primary)] shadow-[0_10px_24px_rgba(2,6,23,0.24)]'
        )}
      >
        <OverlayArrow>
          <svg width={8} height={8} viewBox="0 0 8 8" className="fill-[var(--surface-solid)] stroke-[var(--border)]">
            <path d="M0 0 L4 4 L8 0" />
          </svg>
        </OverlayArrow>
        {text}
      </Tooltip>
    </TooltipTrigger>
  )
}
