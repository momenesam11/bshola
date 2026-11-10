import { useForm, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  HiOutlineBell,
  HiOutlineUserCircle,
  HiOutlinePhone,
  HiOutlineCalendarDays,
  HiOutlineClock,
  HiOutlineWrenchScrewdriver,
  HiOutlineTrash,
  HiOutlineXCircle,
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineClipboardDocument,
} from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import Modal from '../ui/Modal'
import ConfirmDialog from '../ui/ConfirmDialog'
import Button from '../ui/Button'
import Dropdown from '../ui/Dropdown'
import DatePicker from '../ui/DatePicker'
import TimePicker from '../ui/TimePicker'
import { getAppointmentSchema } from '../../lib/validators'
import { useCreateAppointment, useUpdateAppointment, useDeleteAppointment, invalidateAll } from '../../hooks/useAppointments'
import { useServices, useBusiness } from '../../hooks/useBusiness'
import { useBranch } from '../../context/branchState'
import { todayISO, formatTime12, getPeakBookings } from '../../utils/dateHelpers'
import { MEDICAL_TYPES } from '../../utils/constants'
import { supabase } from '../../lib/supabase'
import { openWhatsApp } from '../../lib/whatsapp'
import PhoneInput from '../ui/PhoneInput'
import { formatMoney } from '../../lib/countries'

async function countActiveBookings(businessId, phone) {
  const { count } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('client_phone', phone)
    .in('status', ['confirmed', 'waitlist'])
    .gte('appointment_date', todayISO())
  return count || 0
}

const STATUS_OPTIONS = [
  { value: 'confirmed', label: 'مؤكد', colors: 'bg-accent-50 text-accent-700 border-accent-300', dot: 'bg-accent-500' },
  { value: 'completed', label: 'مكتمل', colors: 'bg-blue-50 text-blue-700 border-blue-300', dot: 'bg-blue-500' },
  { value: 'cancelled', label: 'ملغي', colors: 'bg-red-50 text-red-600 border-red-300', dot: 'bg-red-400' },
  { value: 'no_show', label: 'لم يحضر', colors: 'bg-amber-50 text-amber-700 border-amber-300', dot: 'bg-amber-400' },
]

// The booking page puts a visitor on the waitlist for a whole day (it has no
// time to offer), so the match is by date and branch, not by time.
function WaitlistAlert({ appointment, businessId, onPromoted }) {
  const [waitlist, setWaitlist] = useState([])
  const [notified, setNotified] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!appointment?.appointment_date) return
    let q = supabase
      .from('appointments')
      .select('*')
      .eq('business_id', businessId)
      .eq('appointment_date', appointment.appointment_date)
      .eq('status', 'waitlist')
    if (appointment.branch_id) q = q.eq('branch_id', appointment.branch_id)
    q.order('created_at').then(({ data }) => setWaitlist(data || []))
  }, [appointment, businessId])

  // Frees the slot first (the double-booking guard would refuse the move
  // otherwise), then gives it to the first person waiting, then tells them.
  async function notifyFirst() {
    const first = waitlist[0]
    const time = appointment.appointment_time?.slice(0, 5)
    setBusy(true)
    try {
      const { error: cancelError } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appointment.id)
      if (cancelError) throw cancelError
      const { error } = await supabase.from('appointments')
        .update({ status: 'confirmed', appointment_time: time })
        .eq('id', first.id)
      if (error) throw error
      const msg = `يا ${first.client_name}، اتفرج ميعاد يوم ${appointment.appointment_date} الساعة ${formatTime12(time)} وحجزناه ليك. لو مش مناسب ردّ على الرسالة دي.`
      openWhatsApp(first.client_phone, msg)
      setNotified(true)
      setWaitlist(prev => prev.slice(1))
      onPromoted?.()
    } catch (e) {
      toast.error(e?.message || 'تعذر نقل العميل من قائمة الانتظار')
    } finally {
      setBusy(false)
    }
  }

  if (notified) return (
    <div className="bg-accent-50 border border-accent-200 rounded-xl p-2.5 flex items-center gap-2 text-xs text-accent-700">
      <HiOutlineCheckCircle className="w-4 h-4 flex-shrink-0" />
      تم فتح واتساب للعميل الأول في قائمة الانتظار
    </div>
  )

  if (!waitlist.length) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 text-xs text-amber-700">
        <HiOutlineBell className="w-3.5 h-3.5 flex-shrink-0" />
        <span><strong>{waitlist.length}</strong> في قائمة الانتظار</span>
      </div>
      <button type="button" onClick={notifyFirst} disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-500 hover:bg-accent-600 text-white text-xs font-semibold rounded-lg transition-colors">
        <FaWhatsapp className="w-3.5 h-3.5" />
        أبلّغ {waitlist[0]?.client_name}
      </button>
    </div>
  )
}

export default function AppointmentModal({ open, onClose, businessId, initialDate, initialTime, appointment, prefill }) {
  const navigate = useNavigate()
  const isEdit = !!appointment
  const [submitError, setSubmitError] = useState('')
  const [confirmDialog, setConfirmDialog] = useState(null)
  const { data: services = [] } = useServices(businessId)
  const { data: business } = useBusiness()
  const branchCtx = useBranch()
  const currentBranch = branchCtx?.currentBranch
  const branches = branchCtx?.branches || []
  const qc = useQueryClient()
  // In "كل الفروع" there is no current branch to book into, so the form asks.
  const fixedBranchId = currentBranch && !currentBranch.isAll ? currentBranch.id : (branches.length === 1 ? branches[0].id : null)
  const [chosenBranchId, setChosenBranchId] = useState('')
  const targetBranchId = fixedBranchId || chosenBranchId
  const needsBranchChoice = !isEdit && !fixedBranchId && branches.length > 1
  const isMedical = MEDICAL_TYPES.includes(business?.type)
  const createAppt = useCreateAppointment()
  const updateAppt = useUpdateAppointment()
  const deleteAppt = useDeleteAppointment()

  const { register, handleSubmit, reset, control, setValue, getValues, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(getAppointmentSchema(isEdit)),
    defaultValues: {
      client_name: '', client_phone: '', service_id: '',
      appointment_date: initialDate || todayISO(),
      appointment_time: initialTime || '09:00',
      status: 'confirmed', notes: '',
      price: null, payment_status: 'unpaid', payment_type: '', amount_paid: 0,
    },
  })

  const watchedStatus = useWatch({ control, name: 'status' })
  const watchedServiceId = useWatch({ control, name: 'service_id' })
  const watchedDate = useWatch({ control, name: 'appointment_date' })
  const watchedTime = useWatch({ control, name: 'appointment_time' })
  const { data: dayBookings = [] } = useQuery({
    queryKey: ['booked-slots', 'dashboard', businessId, watchedDate, targetBranchId],
    queryFn: async () => {
      let q = supabase
        .from('appointments')
        .select('id, appointment_time, services(duration_minutes)')
        .eq('business_id', businessId)
        .eq('appointment_date', watchedDate)
        .eq('status', 'confirmed')
      if (targetBranchId) q = q.eq('branch_id', targetBranchId)
      const { data, error } = await q
      if (error) throw error
      return data
    },
    enabled: open && !!businessId && !!watchedDate,
  })
  const prevOpenRef = useRef(false)

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setChosenBranchId('')
      setSubmitError('')
      if (appointment) {
        reset({
          client_name: appointment.client_name,
          client_phone: appointment.client_phone,
          service_id: appointment.service_id || '',
          appointment_date: appointment.appointment_date,
          appointment_time: appointment.appointment_time?.slice(0, 5),
          status: appointment.status,
          notes: appointment.notes || '',
          price: appointment.price ?? null,
          payment_status: appointment.payment_status || 'unpaid',
          payment_type: appointment.payment_type || '',
          amount_paid: appointment.amount_paid || 0,
        })
      } else {
        reset({
          client_name: prefill?.client_name || '', client_phone: prefill?.client_phone || '',
          service_id: prefill?.service_id || services[0]?.id || '',
          appointment_date: prefill?.appointment_date || initialDate || todayISO(),
          appointment_time: initialTime || '09:00',
          status: 'confirmed', notes: '',
          price: prefill?.price ?? null,
          payment_status: 'unpaid',
          payment_type: prefill?.payment_type || '',
          amount_paid: 0,
        })
      }
    }
    prevOpenRef.current = open
  }, [open, appointment, initialDate, initialTime, prefill, services, reset])

  useEffect(() => {
    if (open && !isEdit && services.length > 0) {
      const current = getValues('service_id')
      if (!current) setValue('service_id', services[0].id)
    }
  }, [services, open, isEdit, setValue, getValues])

  // Offered while the owner is cancelling an appointment that wasn't cancelled.
  const showWaitlist = isEdit && watchedStatus === 'cancelled' && appointment?.status !== 'cancelled'

  async function saveAppointment(values) {
    setSubmitError('')
    // payment_type has a CHECK constraint allowing only specific strings or
    // NULL — an empty string from the "— اختر —" placeholder option violates it.
    const payload = { ...values, payment_type: values.payment_type || null }
    try {
      if (isEdit) {
        await updateAppt.mutateAsync({ id: appointment.id, ...payload })
        toast.success('تم حفظ الموعد')
      } else {
        // branch_id is NOT NULL in the DB — never omit it. plan_visit_id is
        // metadata from a client-plan prefill, not a form field.
        await createAppt.mutateAsync({
          ...payload, business_id: businessId, branch_id: targetBranchId,
          plan_visit_id: prefill?.plan_visit_id || null,
        })
        toast.success('تم الحجز بنجاح')
      }
      onClose()
    } catch (e) {
      if (e?.message?.includes('CAPACITY_EXCEEDED')) {
        setSubmitError('هذا الموعد ممتلئ بالفعل — اختر وقتاً آخر')
        toast.error('هذا الموعد ممتلئ بالفعل — اختر وقتاً آخر')
      } else {
        setSubmitError(e?.message || 'حدث خطأ أثناء الحفظ')
        toast.error('حدث خطأ أثناء الحفظ')
      }
    }
  }

  async function onSubmit(values) {
    setSubmitError('')
    if (isEdit) {
      await saveAppointment(values)
      return
    }
    if (!targetBranchId) {
      setSubmitError(needsBranchChoice ? 'اختر الفرع' : 'تعذر تحديد الفرع — جرّب تحديث الصفحة')
      return
    }
    const activeCount = await countActiveBookings(businessId, values.client_phone)
    if (activeCount >= 2) {
      setConfirmDialog({ type: 'overbook', values, activeCount })
      return
    }
    await saveAppointment(values)
  }

  async function handleDelete() {
    setConfirmDialog({ type: 'delete' })
  }

  async function handleCancel() {
    setConfirmDialog({ type: 'cancel' })
  }

  async function runConfirmedAction() {
    const action = confirmDialog
    setConfirmDialog(null)
    if (!action) return
    if (action.type === 'overbook') {
      await saveAppointment(action.values)
    } else if (action.type === 'delete') {
      try {
        await deleteAppt.mutateAsync(appointment.id)
        toast.success('تم حذف الموعد')
        onClose()
      } catch (e) {
        setSubmitError(e?.message || 'حدث خطأ أثناء الحذف')
        toast.error('حدث خطأ أثناء الحذف')
      }
    } else if (action.type === 'cancel') {
      try {
        await updateAppt.mutateAsync({ id: appointment.id, status: 'cancelled' })
        toast.success('تم إلغاء الموعد')
        onClose()
      } catch (e) {
        toast.error(e?.message || 'حدث خطأ أثناء الإلغاء')
      }
    }
  }

  const selectedService = services.find(s => s.id === watchedServiceId)
  // Only a heads-up: a patient who walks in still goes on the calendar.
  const fallbackDuration = business?.slot_duration || 30
  const otherBookings = dayBookings
    .filter(a => a.id !== appointment?.id)
    .map(a => ({ start_time: a.appointment_time, duration_minutes: a.services?.duration_minutes || fallbackDuration }))
  const capacity = branches.find(b => b.id === targetBranchId)?.capacity || 1
  const overlapsAnother = watchedStatus === 'confirmed' && !!watchedTime
    && getPeakBookings(watchedTime, selectedService?.duration_minutes || fallbackDuration, otherBookings) >= capacity
  const showPatientRecord = isEdit && !!appointment?.client_phone

  // Pre-fill price from the service default when creating a new appointment
  // — never overwrite a price the owner already typed or one loaded from an
  // existing appointment being edited.
  useEffect(() => {
    if (!isEdit && selectedService?.price != null && getValues('price') == null) {
      setValue('price', selectedService.price)
    }
  }, [selectedService, isEdit, setValue, getValues])

  const fieldCls = (err) =>
    `w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white transition-colors ${err ? 'border-red-300 bg-red-50' : 'border-slate-200'}`

  return (
    <>
    <Modal open={open} onClose={onClose} title={isEdit ? 'تعديل الموعد' : 'موعد جديد'} size="md">
      <form onSubmit={handleSubmit(onSubmit)} dir="rtl" className="space-y-3">

        {/* Client name + phone — 2 cols */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
              <HiOutlineUserCircle className="w-3.5 h-3.5" /> الاسم
            </label>
            <input {...register('client_name')} placeholder="محمد أحمد"
              className={fieldCls(errors.client_name)} />
            {errors.client_name && <p className="text-xs text-red-500 mt-0.5">{errors.client_name.message}</p>}
          </div>
          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
              <HiOutlinePhone className="w-3.5 h-3.5" /> واتساب
            </label>
            <Controller
              name="client_phone"
              control={control}
              render={({ field }) => (
                <PhoneInput {...field} ariaLabel="رقم واتساب المريض" defaultCountry={business?.country} error={errors.client_phone?.message} />
              )}
            />
          </div>
        </div>

        {needsBranchChoice && (
          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">الفرع</label>
            <Dropdown
              value={chosenBranchId}
              onChange={setChosenBranchId}
              placeholder="اختر الفرع..."
              options={branches.map(b => ({ value: b.id, label: b.name }))}
            />
          </div>
        )}

        {/* Service */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
            <HiOutlineWrenchScrewdriver className="w-3.5 h-3.5" /> الخدمة
          </label>
          <Controller
            control={control}
            name="service_id"
            render={({ field }) => (
              <Dropdown
                value={field.value}
                onChange={field.onChange}
                placeholder="اختر الخدمة..."
                options={services.map(s => ({
                  value: s.id,
                  label: `${s.name}${s.duration_minutes ? ` — ${s.duration_minutes} د` : ''}${s.price ? ` (${formatMoney(s.price, business?.currency)})` : ''}`,
                }))}
              />
            )}
          />
          {errors.service_id && <p className="text-xs text-red-500 mt-0.5">{errors.service_id.message}</p>}
          {selectedService && (
            <p className="text-xs text-accent-600 mt-0.5">
              {selectedService.duration_minutes} دقيقة{selectedService.price ? ` · ${formatMoney(selectedService.price, business?.currency)}` : ''}
            </p>
          )}
        </div>

        {/* Date + Time — stacked on mobile */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="w-full sm:w-1/2">
            <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
              <HiOutlineCalendarDays className="w-3.5 h-3.5" /> التاريخ
            </label>
            <Controller
              control={control}
              name="appointment_date"
              render={({ field }) => (
                <DatePicker value={field.value} onChange={field.onChange} allowClear={false} />
              )}
            />
          </div>
          <div className="w-full sm:w-1/2">
            <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
              <HiOutlineClock className="w-3.5 h-3.5" /> الوقت
            </label>
            <Controller
              control={control}
              name="appointment_time"
              render={({ field }) => (
                <TimePicker value={field.value} onChange={field.onChange} label="وقت الموعد" className={fieldCls(errors.appointment_time)} />
              )}
            />
          </div>
        </div>

        {overlapsAnother && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            فيه موعد تاني في الوقت ده، وهيتضاف عادي.
          </p>
        )}

        {/* Status pills */}
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1.5 block">الحالة</label>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <div className="flex gap-1.5 flex-wrap">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => field.onChange(opt.value)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                      field.value === opt.value
                        ? opt.colors + ' shadow-sm'
                        : 'border-slate-200 text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${opt.dot}`} />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          />
        </div>

        {/* Waitlist alert (compact) */}
        {showWaitlist && isEdit && (
          <WaitlistAlert appointment={appointment} businessId={businessId} onPromoted={() => invalidateAll(qc)} />
        )}

        {/* Notes — only 1 row */}
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">
            ملاحظات <span className="text-slate-400 font-normal">(اختياري)</span>
          </label>
          <textarea {...register('notes')} placeholder="أي ملاحظات..." rows={1}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white resize-none" />
        </div>

        {/* Error */}
        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 flex items-start gap-2 text-xs text-red-600">
            <HiOutlineExclamationCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="break-all">{submitError}</span>
          </div>
        )}
        {!isEdit && !targetBranchId && !needsBranchChoice && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 flex items-start gap-2 text-xs text-red-600">
            <HiOutlineExclamationCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>تعذر تحديد الفرع — لا يمكن إضافة موعد الآن. جرّب تحديث الصفحة.</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {isEdit && (
            <button type="button" onClick={handleDelete} disabled={deleteAppt.isPending}
              title="حذف الموعد نهائياً"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 border-2 border-red-200 text-red-500 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors min-h-[44px]">
              <HiOutlineTrash className="w-4 h-4" />
            </button>
          )}
          <Button type="submit" loading={isSubmitting || createAppt.isPending || updateAppt.isPending}
            disabled={!isEdit && !targetBranchId && !needsBranchChoice}
            className="flex-1 min-h-[44px]">
            {isEdit ? 'حفظ' : 'إضافة الموعد'}
          </Button>
          {showPatientRecord && (
            <button type="button"
              onClick={() => { onClose(); navigate(`/patients/${appointment.client_phone}`) }}
              title={isMedical ? 'فتح الملف الطبي' : 'فتح ملف العميل'}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 border-2 border-primary-200 text-primary-600 hover:bg-primary-50 rounded-xl text-sm font-medium transition-colors min-h-[44px]">
              <HiOutlineClipboardDocument className="w-4 h-4" />
            </button>
          )}
        </div>

        {isEdit && appointment.status !== 'cancelled' && (
          <button type="button" onClick={handleCancel} disabled={updateAppt.isPending}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors min-h-[44px]">
            <HiOutlineXCircle className="w-4 h-4" />
            إلغاء الموعد
          </button>
        )}

      </form>

      <ConfirmDialog
        open={!!confirmDialog}
        onClose={() => setConfirmDialog(null)}
        onConfirm={runConfirmedAction}
        variant={confirmDialog?.type === 'delete' || confirmDialog?.type === 'cancel' ? 'danger' : 'default'}
        loading={createAppt.isPending || updateAppt.isPending || deleteAppt.isPending}
        title={
          confirmDialog?.type === 'overbook' ? 'حجز نشط بالفعل'
            : confirmDialog?.type === 'delete' ? 'حذف الموعد'
            : confirmDialog?.type === 'cancel' ? 'إلغاء الموعد'
            : ''
        }
        message={
          confirmDialog?.type === 'overbook' ? `العميل عنده بالفعل ${confirmDialog.activeCount} حجز نشط. متأكد إنك عايز تضيف حجز جديد؟`
            : confirmDialog?.type === 'delete' ? 'هل تريد حذف هذا الموعد؟'
            : confirmDialog?.type === 'cancel' ? `متأكد إنك عايز تلغي موعد ${appointment?.client_name}؟`
            : ''
        }
        confirmLabel={confirmDialog?.type === 'delete' ? 'حذف' : confirmDialog?.type === 'cancel' ? 'إلغاء الموعد' : 'تأكيد'}
      />
    </Modal>
    </>
  )
}
