import { useForm, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import Button from '../ui/Button'
import { appointmentSchema } from '../../lib/validators'
import { useCreateAppointment, useUpdateAppointment, useDeleteAppointment } from '../../hooks/useAppointments'
import { useServices, useBusiness } from '../../hooks/useBusiness'
import { useBranch } from '../../context/BranchContext'
import { todayISO } from '../../utils/dateHelpers'
import { MEDICAL_TYPES } from '../../utils/constants'
import { supabase } from '../../lib/supabase'
import { openWhatsApp, generateReminderMessage } from '../../lib/whatsapp'

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

function WaitlistAlert({ appointment, businessId }) {
  const [waitlist, setWaitlist] = useState([])
  const [notified, setNotified] = useState(false)

  useEffect(() => {
    if (!appointment?.appointment_date || !appointment?.appointment_time) return
    supabase
      .from('appointments')
      .select('*')
      .eq('business_id', businessId)
      .eq('appointment_date', appointment.appointment_date)
      .eq('appointment_time', appointment.appointment_time)
      .eq('status', 'waitlist')
      .order('created_at')
      .then(({ data }) => setWaitlist(data || []))
  }, [appointment, businessId])

  if (!waitlist.length) return null

  function notifyFirst() {
    const first = waitlist[0]
    const msg = `يا ${first.client_name}، اتفرج موعد الساعة ${appointment.appointment_time?.slice(0, 5)}. احجز من الرابط: ${window.location.origin}/book/${businessId}`
    openWhatsApp(first.client_phone, msg)
    setNotified(true)
    supabase.from('appointments').update({ status: 'confirmed' }).eq('id', first.id)
    setWaitlist(prev => prev.slice(1))
  }

  if (notified) return (
    <div className="bg-accent-50 border border-accent-200 rounded-xl p-2.5 flex items-center gap-2 text-xs text-accent-700">
      <HiOutlineCheckCircle className="w-4 h-4 flex-shrink-0" />
      تم فتح واتساب للعميل الأول في قائمة الانتظار
    </div>
  )

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 text-xs text-amber-700">
        <HiOutlineBell className="w-3.5 h-3.5 flex-shrink-0" />
        <span><strong>{waitlist.length}</strong> في قائمة الانتظار</span>
      </div>
      <button type="button" onClick={notifyFirst}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-500 hover:bg-accent-600 text-white text-xs font-semibold rounded-lg transition-colors">
        <FaWhatsapp className="w-3.5 h-3.5" />
        أبلّغ {waitlist[0]?.client_name}
      </button>
    </div>
  )
}

export default function AppointmentModal({ open, onClose, businessId, initialDate, initialTime, appointment }) {
  const navigate = useNavigate()
  const isEdit = !!appointment
  const [submitError, setSubmitError] = useState('')
  const [showWaitlist, setShowWaitlist] = useState(false)
  const { data: services = [] } = useServices(businessId)
  const { data: business } = useBusiness()
  const branchCtx = useBranch()
  const currentBranch = branchCtx?.currentBranch
  const isMedical = MEDICAL_TYPES.includes(business?.type)
  const createAppt = useCreateAppointment()
  const updateAppt = useUpdateAppointment()
  const deleteAppt = useDeleteAppointment()

  const { register, handleSubmit, reset, control, setValue, getValues, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      client_name: '', client_phone: '', service_id: '',
      appointment_date: initialDate || todayISO(),
      appointment_time: initialTime || '09:00',
      status: 'confirmed', notes: '',
    },
  })

  const watchedStatus = useWatch({ control, name: 'status' })
  const watchedServiceId = useWatch({ control, name: 'service_id' })
  const prevOpenRef = useRef(false)

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setShowWaitlist(false)
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
        })
      } else {
        reset({
          client_name: '', client_phone: '',
          service_id: services[0]?.id || '',
          appointment_date: initialDate || todayISO(),
          appointment_time: initialTime || '09:00',
          status: 'confirmed', notes: '',
        })
      }
    }
    prevOpenRef.current = open
  }, [open, appointment, initialDate, initialTime, services, reset])

  useEffect(() => {
    if (open && !isEdit && services.length > 0) {
      const current = getValues('service_id')
      if (!current) setValue('service_id', services[0].id)
    }
  }, [services, open, isEdit, setValue, getValues])

  useEffect(() => {
    if (isEdit && watchedStatus === 'cancelled' && appointment?.status !== 'cancelled') {
      setShowWaitlist(true)
    } else {
      setShowWaitlist(false)
    }
  }, [watchedStatus, isEdit, appointment?.status])

  async function onSubmit(values) {
    setSubmitError('')
    try {
      if (isEdit) {
        await updateAppt.mutateAsync({ id: appointment.id, ...values })
      } else {
        if (!currentBranch?.id) {
          setSubmitError('تعذر تحديد الفرع — جرّب تحديث الصفحة')
          return
        }
        const activeCount = await countActiveBookings(businessId, values.client_phone)
        if (activeCount >= 2) {
          const proceed = window.confirm(
            `العميل عنده بالفعل ${activeCount} حجز نشط. متأكد إنك عايز تضيف حجز جديد؟`
          )
          if (!proceed) return
        }
        // branch_id is NOT NULL in the DB — never omit it.
        await createAppt.mutateAsync({ ...values, business_id: businessId, branch_id: currentBranch.id })
      }
      onClose()
    } catch (e) {
      setSubmitError(e?.message || 'حدث خطأ أثناء الحفظ')
    }
  }

  async function handleDelete() {
    if (!window.confirm('هل تريد حذف هذا الموعد؟')) return
    try {
      await deleteAppt.mutateAsync(appointment.id)
      onClose()
    } catch (e) {
      setSubmitError(e?.message || 'حدث خطأ أثناء الحذف')
    }
  }

  async function handleCancel() {
    if (!window.confirm(`متأكد إنك عايز تلغي موعد ${appointment.client_name}؟`)) return
    try {
      await updateAppt.mutateAsync({ id: appointment.id, status: 'cancelled' })
      toast.success('تم إلغاء الموعد')
      onClose()
    } catch (e) {
      toast.error(e?.message || 'حدث خطأ أثناء الإلغاء')
    }
  }

  const selectedService = services.find(s => s.id === watchedServiceId)
  const showPatientRecord = isEdit && !!appointment?.client_phone

  const fieldCls = (err) =>
    `w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white transition-colors ${err ? 'border-red-300 bg-red-50' : 'border-slate-200'}`

  return (
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
            <input {...register('client_phone')} placeholder="201XXXXXXXXX" dir="ltr"
              className={`${fieldCls(errors.client_phone)} font-mono`} />
            {errors.client_phone && <p className="text-xs text-red-500 mt-0.5">{errors.client_phone.message}</p>}
          </div>
        </div>

        {/* Service */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
            <HiOutlineWrenchScrewdriver className="w-3.5 h-3.5" /> الخدمة
          </label>
          <select {...register('service_id')} className={fieldCls(errors.service_id)}>
            <option value="">اختر الخدمة...</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{s.duration_minutes ? ` — ${s.duration_minutes} د` : ''}{s.price ? ` (${s.price} ج.م)` : ''}
              </option>
            ))}
          </select>
          {errors.service_id && <p className="text-xs text-red-500 mt-0.5">{errors.service_id.message}</p>}
          {selectedService && (
            <p className="text-xs text-accent-600 mt-0.5">
              {selectedService.duration_minutes} دقيقة{selectedService.price ? ` · ${selectedService.price} ج.م` : ''}
            </p>
          )}
        </div>

        {/* Date + Time */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
              <HiOutlineCalendarDays className="w-3.5 h-3.5" /> التاريخ
            </label>
            <input type="date" {...register('appointment_date')} className={fieldCls(errors.appointment_date)} />
          </div>
          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
              <HiOutlineClock className="w-3.5 h-3.5" /> الوقت
            </label>
            <input type="time" {...register('appointment_time')} className={fieldCls(errors.appointment_time)} />
          </div>
        </div>

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
          <WaitlistAlert appointment={appointment} businessId={businessId} />
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
        {!isEdit && !currentBranch?.id && (
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
            disabled={!isEdit && !currentBranch?.id}
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
    </Modal>
  )
}
