import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  HiOutlineXMark,
  HiOutlineClipboard,
  HiOutlineCheck,
  HiOutlineClock,
  HiOutlineDocumentText,
} from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { useClientProfile, useUpdateClientNotes } from '../../hooks/useClients'
import StatusBadge from '../../components/appointments/StatusBadge'
import { useBranch } from '../../context/BranchContext'
import { formatDateAr, formatTime12 } from '../../utils/dateHelpers'
import { MEDICAL_TYPES } from '../../utils/constants'
import RetargetModal from './RetargetModal'

function Avatar({ name }) {
  return (
    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
      {name?.slice(0, 2) || '؟؟'}
    </div>
  )
}

function StatMini({ label, value }) {
  return (
    <div className="flex-1 min-w-[80px] bg-slate-50 rounded-xl p-3 text-center">
      <p className="text-lg font-bold text-slate-900 leading-tight">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}

export default function ClientProfileDrawer({ client, businessId, business, onClose }) {
  const { data: profile, isLoading } = useClientProfile(client.phone, businessId)
  const updateNotes = useUpdateClientNotes(businessId)
  const navigate = useNavigate()
  const [notes, setNotes] = useState('')
  const [notesLoaded, setNotesLoaded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [retargetOpen, setRetargetOpen] = useState(false)
  const isMedical = MEDICAL_TYPES.includes(business?.type)
  const isMultiBranch = !!useBranch()?.isMultiBranch
  const recordLabel = isMedical ? 'ملف المريض الطبي' : 'ملف العميل'

  const waLink = `https://wa.me/${client.phone.replace(/\D/g, '')}`

  const STATUS_BADGE = {
    منتظم: 'bg-accent-100 text-accent-700',
    فاتر: 'bg-amber-100 text-amber-700',
    ضايع: 'bg-red-100 text-red-700',
  }

  function copyPhone() {
    navigator.clipboard.writeText(client.phone)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Sync notes from profile load (once, on first load)
  if (!notesLoaded && profile?.notes !== undefined) {
    setNotes(profile.notes)
    setNotesLoaded(true)
  }

  async function handleSaveNotes() {
    try {
      await updateNotes.mutateAsync({ phone: client.phone, notes, name: profile?.name || client.name })
      toast.success('تم حفظ الملاحظة ✓')
    } catch (e) {
      toast.error(e.message || 'حدث خطأ أثناء حفظ الملاحظة')
    }
  }

  const stats = profile?.stats || {}

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:bg-black/10"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 left-0 h-full w-full md:w-[480px] bg-white z-50 shadow-2xl flex flex-col overflow-hidden"
        style={{ animation: 'slideInLeft 0.25s ease-out' }}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-100 p-5">
          <div className="flex items-start gap-4">
            <Avatar name={profile?.name || client.name} />
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-slate-900 truncate">
                {profile?.name || client.name}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-slate-500" dir="ltr">{client.phone}</span>
                <button onClick={copyPhone} className="text-slate-400 hover:text-accent-600 transition-colors">
                  {copied
                    ? <HiOutlineCheck className="w-4 h-4 text-accent-500" />
                    : <HiOutlineClipboard className="w-4 h-4" />
                  }
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {profile?.status && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGE[profile.status] || 'bg-slate-100 text-slate-600'}`}>
                    {profile.status}
                  </span>
                )}
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent-500 hover:bg-accent-600 text-white text-xs font-semibold rounded-full transition-colors"
                >
                  <FaWhatsapp className="w-3.5 h-3.5" />
                  إرسال واتساب
                </a>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
            >
              <HiOutlineXMark className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* Stats strip */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                <StatMini label="الزيارات" value={stats.totalVisits ?? 0} />
                <StatMini label="الإنفاق ج.م" value={stats.totalSpent ?? 0} />
                <StatMini label="الحضور %" value={`${stats.attendanceRate ?? 0}%`} />
                <StatMini label="آخر زيارة" value={stats.lastVisit ? formatDateAr(stats.lastVisit, 'd/M') : '—'} />
              </div>

              {/* Appointment timeline */}
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-4">سجل المواعيد</h3>
                {!profile?.appointments?.length ? (
                  <p className="text-slate-400 text-sm text-center py-6">لسه مفيش مواعيد</p>
                ) : (
                  <div className="relative">
                    <div className="absolute right-[18px] top-0 bottom-0 w-0.5 bg-slate-100" />
                    <div className="space-y-4">
                      {profile.appointments.map(appt => (
                        <div key={appt.id} className="flex gap-4 relative">
                          <div className="w-9 h-9 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center flex-shrink-0 z-10">
                            <HiOutlineClock className="w-4 h-4 text-slate-400" />
                          </div>
                          <div className="flex-1 bg-slate-50 rounded-xl p-3 min-w-0">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-slate-900">
                                {appt.services?.name || 'غير محدد'}
                              </span>
                              <StatusBadge status={appt.status} />
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                              <span>{formatDateAr(appt.appointment_date, 'd MMM yyyy')}</span>
                              <span dir="ltr">{formatTime12(appt.appointment_time?.slice(0, 5))}</span>
                              {isMultiBranch && appt.branches?.name && (
                                <span className="text-slate-400">{appt.branches.name}</span>
                              )}
                              {appt.services?.price && (
                                <span className="font-medium text-slate-700">{appt.services.price} ج.م</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-2">ملاحظات</h3>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="اكتب ملاحظة عن العميل..."
                  rows={4}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none"
                />
                <button
                  onClick={handleSaveNotes}
                  disabled={updateNotes.isPending}
                  className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 bg-accent-500 hover:bg-accent-600 disabled:bg-accent-300 text-white text-sm font-semibold rounded-xl transition-colors min-h-[44px]"
                >
                  {updateNotes.isPending && (
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  )}
                  حفظ الملاحظة
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer CTA */}
        <div className="flex-shrink-0 p-5 border-t border-slate-100 space-y-2">
          <button
            onClick={() => { onClose(); navigate(`/patients/${client.phone}`) }}
            className="w-full py-3 border border-primary-200 bg-primary-50 hover:bg-primary-100 text-primary-700 text-sm font-semibold rounded-xl transition-colors min-h-[44px] flex items-center justify-center gap-2"
          >
            <HiOutlineDocumentText className="w-4 h-4" />
            {recordLabel}
          </button>
          <button
            onClick={() => setRetargetOpen(true)}
            className="w-full py-3.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold rounded-xl transition-colors min-h-[48px]"
          >
            إعادة الاستهداف بواتساب
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      {retargetOpen && (
        <RetargetModal
          onClose={() => setRetargetOpen(false)}
          businessId={businessId}
          business={business}
          singleClient={profile}
        />
      )}
    </>
  )
}
