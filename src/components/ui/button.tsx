import * as React from "react"
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components"
import { cn } from "@/components/common/uiClassTokens"

export interface ButtonProps extends AriaButtonProps {
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'success'
    size?: 'default' | 'sm' | 'lg' | 'icon'
    className?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", size = "default", ...props }, ref) => {
        return (
            <AriaButton
                ref={ref}
                className={(values) => cn(
                    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-50",
                    variant === "default" && "bg-[var(--color-emerald-500)] text-white hover:bg-[var(--color-emerald-600)] shadow-[0_10px_24px_rgba(5,150,105,0.3)]",
                    variant === "destructive" && "bg-rose-600 text-white hover:bg-rose-700 shadow-[0_10px_24px_rgba(225,29,72,0.3)]",
                    variant === "outline" && "border border-[var(--border)] bg-transparent hover:bg-[var(--surface-soft)] text-[var(--text-primary)]",
                    variant === "secondary" && "bg-[var(--surface-soft)] text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] border border-[var(--border)]",
                    variant === "ghost" && "hover:bg-[var(--surface-soft)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                    variant === "link" && "text-[var(--color-emerald-400)] underline-offset-4 hover:underline",
                    variant === "success" && "bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-[0_10px_24px_rgba(5,150,105,0.3)] hover:brightness-110",
                    size === "default" && "h-10 px-4 py-2",
                    size === "sm" && "h-9 rounded-md px-3",
                    size === "lg" && "h-11 rounded-md px-8",
                    size === "icon" && "h-10 w-10",
                    values.isFocusVisible && "shadow-[var(--shadow-neon)]",
                    values.isPressed && "scale-[0.98]",
                    className
                )}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button }
