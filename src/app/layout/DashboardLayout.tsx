import { useState } from 'react'
import { Outlet } from 'react-router'
import Sidebar from '@/app/layout/Sidebar'
import Topbar from '@/app/layout/Topbar'
import PredictiveActionBanner from '@/app/layout/PredictiveActionBanner'
import { cn, shellMainClass } from '@/components/common/uiClassTokens'

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[var(--app-bg)] text-[var(--text-primary)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-16 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute right-[-6rem] top-[-3rem] h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
      </div>

      <div className="relative min-h-screen">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div
          className={cn(
            'flex min-h-screen min-w-0 flex-1 flex-col transition-[margin] duration-300 ease-out',
            sidebarOpen ? 'ml-72' : 'ml-0'
          )}
        >
          <Topbar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />
          <div className="h-16 shrink-0" aria-hidden />
          <PredictiveActionBanner sidebarOpen={sidebarOpen} />
          <main className={shellMainClass}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
