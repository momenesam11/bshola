import { useState } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import MobileDrawer from './MobileDrawer'
import SupportButton from '../support/SupportButton'

export default function PageWrapper({ title, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      {/*
        Desktop (lg+): sidebar is 256px on the right, so mr-64
        Tablet (md): sidebar is 64px icon-only on the right, so mr-16
        Mobile (<md): no sidebar — nav lives in the slide-in MobileDrawer
      */}
      <div className="lg:mr-64 md:mr-16">
        <TopBar title={title} onMenuClick={() => setDrawerOpen(true)} />
        <main className="p-4 md:p-6 pb-6">{children}</main>
      </div>
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <SupportButton />
    </div>
  )
}
