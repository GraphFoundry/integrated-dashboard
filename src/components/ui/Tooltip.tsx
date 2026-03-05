import { 
    Tooltip as AriaTooltip, 
    TooltipTrigger as AriaTooltipTrigger, 
    OverlayArrow as AriaOverlayArrow,
    type TooltipProps as AriaTooltipProps 
} from "react-aria-components"
import { cn } from "@/components/common/uiClassTokens"

export const TooltipTrigger = AriaTooltipTrigger

export const Tooltip = ({ className, children, ...props }: AriaTooltipProps) => (
    <AriaTooltip
        {...props}
        className={(values) => cn(
            "surface-panel z-50 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-primary)] shadow-[0_8px_30px_rgba(2,6,23,0.3)] backdrop-blur-md",
            values.isEntering && "animate-in fade-in zoom-in-95 duration-200",
            values.isExiting && "animate-out fade-out zoom-out-95 duration-200",
            typeof className === 'function' ? className(values) : className
        )}
    >
        <AriaOverlayArrow>
            <svg width={8} height={8} viewBox="0 0 8 8" className="fill-[var(--surface-contrast)] stroke-[var(--border)]">
                <path d="M0 0 L4 4 L8 0" />
            </svg>
        </AriaOverlayArrow>
        {children as React.ReactNode}
    </AriaTooltip>
)
