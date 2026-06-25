import { useState } from 'react'
import { HiOutlinePlus, HiOutlineCalendarDays, HiOutlineClock } from 'react-icons/hi2'
import { useClientPlan, useCreateClientPlan, useUpdatePlanVisit, useDeleteClientPlan } from '../../hooks/useClientPlan'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import DatePicker from '../../components/ui/DatePicker'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import AppointmentModal from '../../components/appointments/AppointmentModal'
import { todayISO, formatDateAr, formatTime12 } from '../../utils/dateHelpers'

const VISIT_STATUS = {
  pending: { label: 'بانتظار الحجز', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  scheduled: { label: 'محجوزة', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  attended: { label: 'حضر', cls: 'bg-accent-50 text-accent-700 border-accent-200' },
  no_show: { label: 'غاب', cls: 'bg-red-50 text-red-600 border-red-200' },
  cancelled: { label: 'ملغاة', cls: 'bg-slate-50 text-slate-400 border-slate-200' },
}

export default function ClientPlanTab({ businessId, clientPhone, clientName }) {
  const { data: plan, isLoading } = useClientPlan(businessId, clientPhone)
  const createPlan = useCreateClientPlan()
  const updateVisit = useUpdatePlanVisit()
  const deletePlan = useDeleteClientPlan()
  const [showNewPlan, setShowNewPlan] = useState(false)
  const [planName, setPlanName] = useState('')
  const [totalVisits, setTotalVisits] = useState(4)
  const [confirmDeletePlan, setConfirmDeletePlan] = useState(false)
  // { mode: 'book', visit } to create a new appointment for a pending/cancelled
  // visit, or { mode: 'view', visit } to open the already-linked appointment.
  const [modalState, setModalState] = useState(null)

  async function handleCreatePlan() {
    if (!planName.trim()) return
    await createPlan.mutateAsync({ businessId, clientPhone, name: planName.trim(), totalVisits: Number(totalVisits) || 1 })
    setShowNewPlan(false)
    setPlanName('')
  }

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
  }

  if (!plan) {
    return (
      <div className="text-center py-8 space-y-3" dir="rtl">
        <p className="text-slate-400 text-sm">لا توجد خطة زيارات لهذا العميل</p>
        {!showNewPlan ? (
          <Button size="sm" onClick={() => setShowNewPlan(true)} className="mx-auto">
            <HiOutlinePlus className="w-4 h-4" /> إضافة خطة
          </Button>
        ) : (
          <div className="max-w-xs mx-auto space-y-2 text-right">
            <Input label="اسم الخطة" value={planName} onChange={e => setPlanName(e.target.value)} placeholder="مثال: كورس علاج الأسنان" />
            <Input label="عدد الزيارات" type="number" min={1} max={50} value={totalVisits} onChange={e => setTotalVisits(e.target.value)} dir="ltr" />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowNewPlan(false)} className="flex-1">إلغاء</Button>
              <Button onClick={handleCreatePlan} loading={createPlan.isPending} className="flex-1">إنشاء</Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const visits = plan.client_plan_visits || []
  const attendedCount = visits.filter(v => v.status === 'attended').length

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">{plan.name}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{attendedCount} من {visits.length} زيارات مكتملة</p>
        </div>
        <button onClick={() => setConfirmDeletePlan(true)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">حذف الخطة</button>
      </div>

      <div className="space-y-2">
        {visits.map(visit => {
          const cfg = VISIT_STATUS[visit.status] || VISIT_STATUS.pending
          const canBook = visit.status === 'pending' || visit.status === 'cancelled'
          const linkedAppt = visit.appointments

          return (
            <div key={visit.id} className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 flex-wrap">
              <span className="text-xs font-bold text-slate-400 flex-shrink-0">زيارة {visit.visit_number}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${cfg.cls}`}>{cfg.label}</span>

              {canBook ? (
                <>
                  <div className="flex-1 min-w-[110px]">
                    <DatePicker value={visit.suggested_date || ''} onChange={d => updateVisit.mutate({ id: visit.id, suggested_date: d || null })} placeholder="تاريخ مقترح" />
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setModalState({ mode: 'book', visit })} className="flex-shrink-0">
                    {visit.status === 'cancelled' ? 'إعادة حجز' : 'حجز الآن'}
                  </Button>
                </>
              ) : linkedAppt ? (
                <>
                  <div className="flex-1 min-w-[140px] flex items-center gap-3 text-xs text-slate-600">
                    <span className="flex items-center gap-1"><HiOutlineCalendarDays className="w-3.5 h-3.5 text-slate-400" />{formatDateAr(linkedAppt.appointment_date, 'd MMM yyyy')}</span>
                    <span className="flex items-center gap-1" dir="ltr"><HiOutlineClock className="w-3.5 h-3.5 text-slate-400" />{formatTime12(linkedAppt.appointment_time?.slice(0, 5))}</span>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setModalState({ mode: 'view', visit })} className="flex-shrink-0">عرض الموعد</Button>
                </>
              ) : null}
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={confirmDeletePlan}
        onClose={() => setConfirmDeletePlan(false)}
        onConfirm={() => { deletePlan.mutate(plan.id); setConfirmDeletePlan(false) }}
        variant="danger"
        loading={deletePlan.isPending}
        title="حذف الخطة"
        message="هل تريد حذف هذه الخطة؟ المواعيد المحجوزة بالفعل لن تتأثر."
        confirmLabel="حذف"
      />

      {modalState?.mode === 'book' && (
        <AppointmentModal
          open={true}
          onClose={() => setModalState(null)}
          businessId={businessId}
          prefill={{
            client_name: clientName,
            client_phone: clientPhone,
            appointment_date: modalState.visit.suggested_date || todayISO(),
            plan_visit_id: modalState.visit.id,
          }}
        />
      )}

      {modalState?.mode === 'view' && modalState.visit.appointments && (
        <AppointmentModal
          open={true}
          onClose={() => setModalState(null)}
          businessId={businessId}
          appointment={modalState.visit.appointments}
        />
      )}
    </div>
  )
}
