import { Outlet } from 'react-router'
import Sidebar from '@/app/layout/Sidebar'
import Topbar from '@/app/layout/Topbar'

export default function DashboardLayout() {
  return (
    <div className="flex h-screen bg-firebase-dark">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto bg-firebase-dark p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
