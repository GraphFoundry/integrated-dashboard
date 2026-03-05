import { 
    Tabs as AriaTabs, 
    TabList as AriaTabList, 
    Tab as AriaTab, 
    TabPanel as AriaTabPanel,
    type TabListProps as AriaTabListProps,
    type TabProps as AriaTabProps,
    type TabPanelProps as AriaTabPanelProps
} from "react-aria-components"
import { cn } from "@/components/common/uiClassTokens"

export const Tabs = AriaTabs

export const TabsList = <T extends object>({ className, ...props }: AriaTabListProps<T>) => (
    <AriaTabList 
        className={(values) => cn(
            "flex border-b border-[var(--border)] bg-[var(--surface-subtle)]/50 backdrop-blur-md", 
            typeof className === 'function' ? className(values) : className
        )} 
        {...props} 
    />
)

export const Tab = ({ className, children, ...props }: AriaTabProps) => (
    <AriaTab
        className={(values) => cn(
            "flex-1 px-4 py-3 text-sm font-medium transition-all outline-none cursor-pointer text-center",
            "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)]",
            values.isSelected && "text-[var(--text-primary)] bg-[var(--surface-soft)] border-b-2 border-[var(--color-emerald-500)]",
            values.isFocusVisible && "shadow-[var(--shadow-neon)] z-10",
            typeof className === 'function' ? className(values) : className
        )}
        {...props}
    >
        {children}
    </AriaTab>
)

export const TabPanel = ({ className, ...props }: AriaTabPanelProps) => (
    <AriaTabPanel 
        className={(values) => cn(
            "outline-none animate-in fade-in duration-300", 
            typeof className === 'function' ? className(values) : className
        )} 
        {...props} 
    />
)
