import Sidebar from './Sidebar'
import TopBar from './TopBar'
import SupportButton from '../support/SupportButton'

export default function PageWrapper({ title, children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      {/*
        Desktop (lg+): sidebar is 256px on the right, so mr-64
        Tablet (md): sidebar is 64px icon-only on the right, so mr-16
        Mobile (<md): no sidebar, but bottom nav takes 56px + safe area — add pb-20
      */}
      <div className="lg:mr-64 md:mr-16">
        <TopBar title={title} />
        <main className="p-4 md:p-6 pb-24 md:pb-6">{children}</main>
      </div>
      <SupportButton />
    </div>
  )
}
