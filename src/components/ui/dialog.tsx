import * as React from "react"
import { 
    Dialog as AriaDialog, 
    DialogTrigger as AriaDialogTrigger, 
    Modal as AriaModal, 
    ModalOverlay as AriaModalOverlay,
    Heading as AriaHeading,
    type ModalOverlayProps as AriaModalOverlayProps
} from "react-aria-components"
import { cn, modalPanelClass } from "@/components/common/uiClassTokens"

const Dialog = AriaDialog

const DialogTrigger = AriaDialogTrigger

const DialogContent = React.forwardRef<HTMLDivElement, AriaModalOverlayProps & { children: React.ReactNode, className?: string }>(({ className, children, ...props }, ref) => (
    <AriaModalOverlay
        ref={ref}
        className={(values) => cn(
            "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4",
            values.isEntering && "animate-in fade-in duration-200",
            values.isExiting && "animate-out fade-out duration-200"
        )}
        {...props}
    >
        <AriaModal
            className={(values) => cn(
                modalPanelClass,
                "w-full max-w-lg overflow-hidden outline-none",
                values.isEntering && "animate-in zoom-in-95 duration-200",
                values.isExiting && "animate-out zoom-out-95 duration-200",
                className
            )}
        >
            <AriaDialog className="outline-none p-6">
                {children}
            </AriaDialog>
        </AriaModal>
    </AriaModalOverlay>
))
DialogContent.displayName = "DialogContent"

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left mb-4", className)} {...props} />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6", className)} {...props} />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
    <AriaHeading 
        slot="title" 
        ref={ref} 
        className={cn("text-xl font-bold leading-none tracking-tight text-[var(--text-primary)]", className)} 
        {...props} 
    />
))
DialogTitle.displayName = "DialogTitle"

const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-[var(--text-muted)] mt-2", className)} {...props} />
))
DialogDescription.displayName = "DialogDescription"

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription }
