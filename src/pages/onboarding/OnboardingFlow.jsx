import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  HiOutlineHeart,
  HiOutlineScissors,
  HiOutlineBolt,
  HiOutlineAcademicCap,
  HiOutlineRectangleGroup,
  HiOutlineWrenchScrewdriver,
  HiOutlineCheck,
  HiOutlinePlus,
  HiOutlineXMark,
  HiOutlineBuildingOffice2,
  HiOutlineMapPin,
  HiOutlineTrash,
  HiOutlineCamera,
  HiOutlinePhoto,
  HiOutlineGlobeAlt,
  HiOutlineClipboard,
} from 'react-icons/hi2'
import { FaInstagram, FaFacebook, FaWhatsapp } from 'react-icons/fa'
import { z } from 'zod'
import confetti from 'canvas-confetti'
import { supabase } from '../../lib/supabase'
import { DEFAULT_REMINDER_TEMPLATE, MEDICAL_TYPES } from '../../utils/constants'
import { useCreateBusiness, useUpsertService, uploadBusinessAsset } from '../../hooks/useBusiness'
import Button from '../../components/ui/Button'
import Input, { Select } from '../../components/ui/Input'
import ScheduleBlockEditor from '../../components/ui/ScheduleBlockEditor'
const STEPS = ['نوع النشاط', 'معلوماتك', 'الفروع', 'ساعات العمل', 'الخدمات', 'هويتك']

// Context-aware content based on business type
const TYPE_CONFIG = {
  clinic: {
    businessNameLabel: 'اسم العيادة',
    businessNamePlaceholder: 'مثال: عيادة د. أحمد للأسنان',
    phoneLabel: 'رقم استقبال العيادة',
    branchName: 'العيادة الرئيسية',
    specialtyPlaceholder: 'مثال: أسنان، جلدية، عيون...',
    bioPlaceholder: 'نبذة عن عيادتك وخبرتك وما يميزك...',
  },
  salon: {
    businessNameLabel: 'اسم الصالون',
    businessNamePlaceholder: 'مثال: صالون نور',
    phoneLabel: 'رقم الصالون',
    branchName: 'الصالون الرئيسي',
    specialtyPlaceholder: 'مثال: حلاقة رجالية، تجميل نسائي...',
    bioPlaceholder: 'نبذة عن صالونك وما يميزه عن غيره...',
  },
  gym: {
    businessNameLabel: 'اسم الجيم أو المركز',
    businessNamePlaceholder: 'مثال: Power Gym',
    phoneLabel: 'رقم المركز',
    branchName: 'الفرع الرئيسي',
    specialtyPlaceholder: 'مثال: كروسفيت، يوجا، تدريب شخصي...',
    bioPlaceholder: 'نبذة عن مركزك وما يقدمه من خدمات...',
  },
  education: {
    businessNameLabel: 'اسم المركز أو المدرس',
    businessNamePlaceholder: 'مثال: مركز أ. محمد للرياضيات',
    phoneLabel: 'رقم التواصل',
    branchName: 'المركز الرئيسي',
    specialtyPlaceholder: 'مثال: رياضيات، إنجليزي، فيزياء...',
    bioPlaceholder: 'نبذة عن خبرتك وأسلوبك في التدريس...',
  },
  facility: {
    businessNameLabel: 'اسم المكان أو الملعب',
    businessNamePlaceholder: 'مثال: ملعب النجوم',
    phoneLabel: 'رقم الاستقبال',
    branchName: 'الموقع الرئيسي',
    specialtyPlaceholder: 'مثال: كرة قدم، تنس، كرة سلة...',
    bioPlaceholder: 'نبذة عن مرفقك وما يقدمه...',
  },
  other: {
    businessNameLabel: 'اسم النشاط التجاري',
    businessNamePlaceholder: 'مثال: خدمات أ. علي',
    phoneLabel: 'رقم التواصل',
    branchName: 'الفرع الرئيسي',
    specialtyPlaceholder: 'مجال عملك...',
    bioPlaceholder: 'نبذة عن نشاطك وما تقدمه من خدمات...',
  },
}

const stepBusinessInfoSchema = z.object({
  name: z.string().min(2, 'اسم النشاط يجب أن يكون حرفين على الأقل'),
  public_phone: z.string().optional(),
})

const BUSINESS_VERTICAL_TYPES = [
  { key: 'clinic', icon: HiOutlineHeart, name: 'عيادة طبية', desc: 'أسنان، جلدية، عيون، عامة', services: ['كشف', 'متابعة', 'أشعة', 'تنظيف أسنان', 'حشو', 'خلع'] },
  { key: 'salon', icon: HiOutlineScissors, name: 'صالون وباربر', desc: 'حلاقة، تجميل، مناكير، سبا', services: ['قص شعر', 'صبغة', 'مناكير', 'بيديكير', 'عروس', 'كيراتين'] },
  { key: 'gym', icon: HiOutlineBolt, name: 'مركز لياقة وجيم', desc: 'حصص، اشتراكات، تدريب شخصي', services: ['اشتراك شهري', 'اشتراك 3 شهور', 'حصة فردية', 'حصة جماعية'] },
  { key: 'education', icon: HiOutlineAcademicCap, name: 'تعليم وتدريس', desc: 'حصص خصوصية، مراكز تعليمية', services: ['حصة فردية', 'حصة مجموعة', 'باقة 4 حصص', 'امتحان تجريبي'] },
  { key: 'facility', icon: HiOutlineRectangleGroup, name: 'ملاعب ومرافق', desc: 'حجز ملاعب، صالات، أماكن ترفيهية', services: ['ساعة ملعب', 'نصف يوم', 'يوم كامل', 'بطولة'] },
  { key: 'other', icon: HiOutlineWrenchScrewdriver, name: 'خدمات أخرى', desc: 'مغاسل، صيانة، توصيل', services: ['طلب خدمة', 'زيارة منزلية', 'استشارة'] },
]

const BRAND_COLORS = [
  { hex: '#10B981', label: 'أخضر' },
  { hex: '#3B82F6', label: 'أزرق' },
  { hex: '#8B5CF6', label: 'بنفسجي' },
  { hex: '#F59E0B', label: 'ذهبي' },
  { hex: '#EF4444', label: 'أحمر' },
  { hex: '#EC4899', label: 'وردي' },
  { hex: '#06B6D4', label: 'سماوي' },
  { hex: '#0F172A', label: 'داكن' },
]

const CANCELLATION_OPTIONS = [
  'الإلغاء مجاني في أي وقت',
  'الإلغاء مجاني قبل 24 ساعة',
  'الإلغاء مجاني قبل 48 ساعة',
  'لا يوجد إلغاء بعد الحجز',
]

function ProgressBar({ step }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        {STEPS.map((label, i) => (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
              i < step ? 'bg-accent-500 text-white'
              : i === step ? 'bg-accent-500 text-white ring-4 ring-accent-100'
              : 'bg-gray-100 text-gray-400'
            }`}>
              {i < step ? <HiOutlineCheck className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={`text-[10px] hidden sm:block text-center ${i === step ? 'text-accent-600 font-medium' : 'text-gray-400'}`}>
              {label}
            </span>
          </div>
        ))}
      </div>
      <div className="relative h-1 bg-gray-100 rounded-full mt-2">
        <div
          className="absolute h-1 bg-accent-500 rounded-full transition-all duration-300"
          style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}
        />
      </div>
    </div>
  )
}

// ── Step 0: Business Type ──────────────────────────────────────────
function StepBusinessType({ onNext }) {
  const [selected, setSelected] = useState(null)
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">ما نوع بيزنسك؟</h2>
        <p className="text-slate-500 text-sm mt-1">هنخصص النظام ليك بناءً على نشاطك</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {BUSINESS_VERTICAL_TYPES.map(type => {
          const Icon = type.icon
          const isSelected = selected?.key === type.key
          return (
            <button key={type.key} type="button" onClick={() => setSelected(type)}
              className={`relative text-right p-4 rounded-2xl border-2 transition-all duration-150 active:scale-95 ${isSelected ? 'border-accent-500 bg-accent-50 scale-105 shadow-md' : 'border-slate-100 bg-white hover:border-accent-200 hover:bg-slate-50 hover:shadow-sm'}`}>
              {isSelected && (
                <span className="absolute top-3 left-3 w-5 h-5 bg-accent-500 rounded-full flex items-center justify-center">
                  <HiOutlineCheck className="w-3 h-3 text-white" />
                </span>
              )}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${isSelected ? 'bg-accent-500' : 'bg-slate-100'}`}>
                <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-slate-600'}`} />
              </div>
              <p className={`font-bold text-sm ${isSelected ? 'text-accent-800' : 'text-slate-900'}`}>{type.name}</p>
              <p className={`text-xs mt-0.5 ${isSelected ? 'text-accent-600' : 'text-slate-500'}`}>{type.desc}</p>
            </button>
          )
        })}
      </div>
      <Button onClick={() => selected && onNext(selected)} disabled={!selected} className="w-full">التالي</Button>
    </div>
  )
}

// ── Step 1: Business Info ──────────────────────────────────────────
function StepBusinessInfo({ onNext, onBack, vertical }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(stepBusinessInfoSchema) })
  const cfg = TYPE_CONFIG[vertical?.key] || TYPE_CONFIG.other
  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-4" dir="rtl">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900">معلومات نشاطك</h2>
        <p className="text-gray-500 text-sm mt-1">أخبرنا عن نشاطك حتى نضبط النظام لك</p>
      </div>
      <Input label={cfg.businessNameLabel} placeholder={cfg.businessNamePlaceholder} error={errors.name?.message} {...register('name')} />
      <Input
        label="رقم التواصل مع العيادة (يظهر للعملاء)"
        type="tel"
        placeholder="01XXXXXXXXX"
        dir="ltr"
        helper="اختياري — يظهر لعملائك في صفحة الحجز"
        error={errors.public_phone?.message}
        {...register('public_phone')}
      />
      <div className="flex gap-3 mt-2">
        <Button variant="secondary" type="button" onClick={onBack} className="flex-1">السابق</Button>
        <Button type="submit" loading={isSubmitting} className="flex-1">التالي</Button>
      </div>
    </form>
  )
}

const CAPACITY_LABELS = {
  salon: 'كام كرسي/محطة شغالة في نفس الوقت؟',
  services: 'كام طلب تقدر تستقبله في نفس الوقت؟',
  gym: 'كام شخص يقدر يحضر نفس الحصة؟',
  fitness: 'كام شخص يقدر يحضر نفس الحصة؟',
}

// ── Step 2: Branches ───────────────────────────────────────────────
function StepBranches({ onNext, onBack, vertical }) {
  const cfg = TYPE_CONFIG[vertical?.key] || TYPE_CONFIG.other
  const isClinic = MEDICAL_TYPES.includes(vertical?.key)
  const [isMulti, setIsMulti] = useState(false)
  const [branches, setBranches] = useState([{ name: cfg.branchName, address: '', phone: '', is_main: true }])
  const [capacity, setCapacity] = useState(2)

  function addBranch() {
    if (branches.length >= 10) return
    setBranches(prev => [...prev, { name: '', address: '', phone: '', is_main: false }])
  }

  function removeBranch(i) {
    if (branches[i].is_main) return
    setBranches(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateBranch(i, field, value) {
    setBranches(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: value } : b))
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-xl font-bold text-slate-900">هل عندك أكتر من فرع؟</h2>
        <p className="text-slate-500 text-sm mt-1">تقدر تضيف فروع أكتر بعدين من الإعدادات</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { val: false, Icon: HiOutlineBuildingOffice2, title: 'فرع واحد', desc: 'معظم البيزنس بيبدأ كده' },
          { val: true, Icon: HiOutlineMapPin, title: 'أكتر من فرع', desc: 'إدارة كل فرع بشكل منفصل' },
        ].map(({ val, Icon, title, desc }) => {
          const active = isMulti === val
          return (
            <button key={String(val)} type="button" onClick={() => setIsMulti(val)}
              className={`text-right p-5 rounded-2xl border-2 transition-all duration-150 active:scale-95 ${active ? 'border-accent-500 bg-accent-50 shadow-md' : 'border-slate-100 bg-white hover:border-accent-200 hover:bg-slate-50'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${active ? 'bg-accent-500' : 'bg-slate-100'}`}>
                <Icon className={`w-5 h-5 ${active ? 'text-white' : 'text-slate-600'}`} />
              </div>
              <p className={`font-bold text-sm ${active ? 'text-accent-800' : 'text-slate-900'}`}>{title}</p>
              <p className={`text-xs mt-0.5 ${active ? 'text-accent-600' : 'text-slate-500'}`}>{desc}</p>
            </button>
          )
        })}
      </div>
      {isMulti && (
        <div className="space-y-3">
          {branches.map((branch, i) => (
            <div key={i} className="bg-slate-50 rounded-xl p-4 space-y-2 border border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">{branch.is_main ? 'الفرع الرئيسي' : `فرع ${i + 1}`}</span>
                {!branch.is_main && (
                  <button type="button" onClick={() => removeBranch(i)} className="text-red-400 hover:text-red-600 p-1">
                    <HiOutlineTrash className="w-4 h-4" />
                  </button>
                )}
              </div>
              <input value={branch.name} onChange={e => updateBranch(i, 'name', e.target.value)} placeholder="اسم الفرع" disabled={branch.is_main}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 disabled:bg-slate-100 disabled:text-slate-400" />
              <input value={branch.address} onChange={e => updateBranch(i, 'address', e.target.value)} placeholder="العنوان"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
              <input value={branch.phone} onChange={e => updateBranch(i, 'phone', e.target.value)} placeholder="رقم الهاتف" dir="ltr"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
            </div>
          ))}
          {branches.length < 10 && (
            <button type="button" onClick={addBranch}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-accent-300 hover:text-accent-600 transition-colors min-h-[44px]">
              <HiOutlinePlus className="w-4 h-4" /> إضافة فرع
            </button>
          )}
        </div>
      )}

      {/* Capacity — parallel bookings per time slot */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
        {isClinic ? (
          <p className="text-sm text-slate-500">عيادتك بتستقبل عميل واحد في كل وقت</p>
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {CAPACITY_LABELS[vertical?.key] || 'كام حجز تقدر تستقبله في نفس الوقت؟'}
            </label>
            <input type="number" min={1} max={20} value={capacity} onChange={e => setCapacity(Number(e.target.value) || 1)}
              className="w-24 border border-slate-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent-400" dir="ltr" />
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} className="flex-1">السابق</Button>
        <Button onClick={() => onNext({ branches: isMulti ? branches : [branches[0]], capacity: isClinic ? 1 : capacity })} className="flex-1">التالي</Button>
      </div>
    </div>
  )
}

// ── Step 3: Working Hours ──────────────────────────────────────────
function StepWorkingHours({ onNext, onBack }) {
  const [blocks, setBlocks] = useState({})
  const [slotDuration, setSlotDuration] = useState(30)
  return (
    <div className="space-y-4" dir="rtl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">ساعات العمل</h2>
        <p className="text-gray-500 text-sm mt-1">حدد الأيام والفترات التي تستقبل فيها العملاء — يمكنك إضافة أكتر من فترة لليوم الواحد</p>
      </div>
      <ScheduleBlockEditor value={blocks} onChange={setBlocks} />
      <Select label="مدة الموعد الواحد" value={slotDuration} onChange={e => setSlotDuration(Number(e.target.value))}>
        <option value={15}>15 دقيقة</option>
        <option value={30}>30 دقيقة</option>
        <option value={45}>45 دقيقة</option>
        <option value={60}>ساعة كاملة</option>
        <option value={90}>ساعة ونصف</option>
      </Select>
      <div className="flex gap-3 mt-2">
        <Button variant="secondary" onClick={onBack} className="flex-1">السابق</Button>
        <Button onClick={() => onNext({ schedule_blocks: blocks, slot_duration: slotDuration })} className="flex-1">التالي</Button>
      </div>
    </div>
  )
}

// ── Step 4: Services ───────────────────────────────────────────────
function StepServices({ onNext, onBack, businessVertical }) {
  const suggested = businessVertical?.services || []
  const [selected, setSelected] = useState(new Set(suggested))
  const [customInput, setCustomInput] = useState('')
  const [customServices, setCustomServices] = useState([])
  const [durations, setDurations] = useState({})

  function toggleSuggested(name) {
    setSelected(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next })
  }
  function addCustom() {
    const trimmed = customInput.trim()
    if (!trimmed || selected.has(trimmed)) return
    setCustomServices(prev => [...prev, trimmed])
    setSelected(prev => new Set([...prev, trimmed]))
    setCustomInput('')
  }
  function removeCustom(name) {
    setCustomServices(prev => prev.filter(s => s !== name))
    setSelected(prev => { const next = new Set(prev); next.delete(name); return next })
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h2 className="text-xl font-bold text-gray-900">الخدمات المقدمة</h2>
        <p className="text-gray-500 text-sm mt-1">اختر الخدمات أو أضف خدمات خاصة بك</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggested.map(name => {
          const active = selected.has(name)
          return (
            <button key={name} type="button" onClick={() => toggleSuggested(name)}
              className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-all duration-150 active:scale-95 min-h-[44px] ${active ? 'bg-accent-500 border-accent-500 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-accent-300'}`}>
              {name}
            </button>
          )
        })}
        {customServices.map(name => (
          <span key={name} className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-sm font-medium bg-primary-100 text-primary-700 border-2 border-primary-300 min-h-[44px]">
            {name}
            <button type="button" onClick={() => removeCustom(name)} className="hover:text-primary-900"><HiOutlineXMark className="w-3.5 h-3.5" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input type="text" value={customInput} onChange={e => setCustomInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustom())} placeholder="أضف خدمة مخصصة..."
          className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
        <button type="button" onClick={addCustom} className="px-4 py-3 bg-accent-50 text-accent-600 rounded-xl hover:bg-accent-100 transition-colors min-h-[44px]">
          <HiOutlinePlus className="w-5 h-5" />
        </button>
      </div>
      {selected.size === 0 && <p className="text-amber-600 text-sm bg-amber-50 px-4 py-3 rounded-xl">اختر خدمة واحدة على الأقل</p>}

      {selected.size > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">مدة كل خدمة</p>
          {[...selected].map(name => (
            <div key={name} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
              <span className="text-sm text-slate-700 truncate">{name}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <input type="number" min={5} max={480} step={5} value={durations[name] ?? 30}
                  onChange={e => setDurations(prev => ({ ...prev, [name]: Number(e.target.value) || 30 }))}
                  className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent-400" dir="ltr" />
                <span className="text-xs text-slate-400">دقيقة</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} className="flex-1">السابق</Button>
        <Button onClick={() => onNext({ services: [...selected].map(name => ({ name, duration_minutes: durations[name] ?? 30, price: null })) })} disabled={selected.size === 0} className="flex-1">التالي</Button>
      </div>
    </div>
  )
}

// ── Step 5: Business Identity ──────────────────────────────────────
function MiniBookingPreview({ name, brandColor, logoPreview, coverPreview, bio, specialty, yearsExperience, welcomeMessage, cancellationPolicy }) {
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm" style={{ '--brand': brandColor }}>
      {/* Cover */}
      <div className="h-16 relative flex-shrink-0" style={{ background: coverPreview ? `url(${coverPreview}) center/cover` : `linear-gradient(135deg, ${brandColor}33, ${brandColor}88)` }}>
        {/* Logo */}
        <div className="absolute bottom-0 translate-y-1/2 right-3 w-10 h-10 rounded-full border-2 border-white shadow overflow-hidden bg-white flex items-center justify-center" style={{ backgroundColor: brandColor }}>
          {logoPreview
            ? <img src={logoPreview} alt="" className="w-full h-full object-cover" />
            : <span className="text-white font-bold text-sm">{name?.charAt(0) || 'م'}</span>}
        </div>
      </div>
      <div className="px-3 pt-6 pb-3 space-y-1">
        <p className="font-bold text-slate-900 text-xs truncate">{name || 'اسم البيزنس'}</p>
        {specialty && <p className="text-[10px] text-slate-500 truncate">{specialty}</p>}
        {yearsExperience > 0 && (
          <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: `${brandColor}22`, color: brandColor }}>
            {yearsExperience} سنة خبرة
          </span>
        )}
        {bio && <p className="text-[10px] text-slate-400 line-clamp-2 mt-1">{bio}</p>}
        {welcomeMessage && <p className="text-[10px] italic text-slate-400 border-r-2 pr-1 mt-1" style={{ borderColor: brandColor }}>{welcomeMessage}</p>}
        <button className="w-full mt-2 py-1.5 rounded-lg text-white text-[10px] font-bold" style={{ background: brandColor }}>احجز الآن</button>
        {cancellationPolicy && <p className="text-[9px] text-slate-300 text-center">{cancellationPolicy}</p>}
      </div>
    </div>
  )
}

function ImageUploadCircle({ preview, onChange, label }) {
  const ref = useRef(null)
  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" onClick={() => ref.current?.click()}
        className="w-28 h-28 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden bg-slate-50 hover:border-accent-400 hover:bg-accent-50 transition-colors relative">
        {preview
          ? <img src={preview} alt="" className="w-full h-full object-cover" />
          : <div className="flex flex-col items-center gap-1 text-slate-400">
              <HiOutlineCamera className="w-7 h-7" />
              <span className="text-xs">ارفع</span>
            </div>}
      </button>
      <span className="text-xs text-slate-500 text-center">{label}</span>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => onChange(e.target.files?.[0])} className="hidden" />
    </div>
  )
}

function ImageUploadBanner({ preview, onChange, label }) {
  const ref = useRef(null)
  return (
    <div className="space-y-1">
      <button type="button" onClick={() => ref.current?.click()}
        className="w-full h-[100px] rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-2 bg-slate-50 hover:border-accent-400 hover:bg-accent-50 transition-colors overflow-hidden">
        {preview
          ? <img src={preview} alt="" className="w-full h-full object-cover" />
          : <><HiOutlinePhoto className="w-7 h-7 text-slate-400" /><span className="text-xs text-slate-400">{label}</span></>}
      </button>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => onChange(e.target.files?.[0])} className="hidden" />
    </div>
  )
}

function StepIdentity({ onNext, onBack, businessName, vertical }) {
  const cfg = TYPE_CONFIG[vertical?.key] || TYPE_CONFIG.other
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(null)
  const [brandColor, setBrandColor] = useState('#10B981')
  const [slug, setSlug] = useState(() => {
    if (!businessName) return ''
    return businessName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 20) || ''
  })
  const [slugStatus, setSlugStatus] = useState(null)
  const [bio, setBio] = useState('')
  const [years, setYears] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [instagram, setInstagram] = useState('')
  const [facebook, setFacebook] = useState('')
  const [googleReviews, setGoogleReviews] = useState('')
  const [welcomeMsg, setWelcomeMsg] = useState('أهلاً بك! يسعدنا خدمتك')
  const [cancelPolicy, setCancelPolicy] = useState(CANCELLATION_OPTIONS[0])
  const [showMobilePreview, setShowMobilePreview] = useState(false)
  const slugTimer = useRef(null)

  function handleLogo(file) {
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }
  function handleCover(file) {
    if (!file) return
    setCoverFile(file)
    setCoverPreview(URL.createObjectURL(file))
  }

  function handleSlugChange(val) {
    const clean = val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 30)
    setSlug(clean)
    setSlugStatus('checking')
    clearTimeout(slugTimer.current)
    slugTimer.current = setTimeout(async () => {
      if (!clean) { setSlugStatus(null); return }
      const { data } = await supabase.from('businesses').select('id').eq('booking_slug', clean).maybeSingle()
      setSlugStatus(data ? 'taken' : 'available')
    }, 600)
  }

  const preview = (
    <MiniBookingPreview
      name={businessName}
      brandColor={brandColor}
      logoPreview={logoPreview}
      coverPreview={coverPreview}
      bio={bio}
      specialty={specialty}
      yearsExperience={Number(years) || 0}
      welcomeMessage={welcomeMsg}
      cancellationPolicy={cancelPolicy}
    />
  )

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h2 className="text-xl font-bold text-slate-900">خلّي بيزنسك يبان احترافي</h2>
        <p className="text-slate-500 text-sm mt-1">العملاء بيثقوا أكتر لما يلاقوا صفحة حجز مكتملة</p>
      </div>

      <div className="lg:grid lg:grid-cols-5 lg:gap-6">
        {/* Form col */}
        <div className="lg:col-span-3 space-y-6">
          {/* Visual identity */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">الهوية البصرية</h3>
            <div className="flex items-start gap-6 justify-center">
              <ImageUploadCircle preview={logoPreview} onChange={handleLogo} label="شعارك أو صورتك الشخصية" />
            </div>
            <ImageUploadBanner preview={coverPreview} onChange={handleCover} label={`صورة غلاف ${cfg.businessNameLabel}`} />

            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">لون بيزنسك الأساسي</p>
              <div className="flex gap-2 flex-wrap">
                {BRAND_COLORS.map(({ hex }) => (
                  <button key={hex} type="button" onClick={() => setBrandColor(hex)}
                    className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${brandColor === hex ? 'border-slate-600 ring-2 ring-offset-2' : 'border-transparent hover:scale-110'}`}
                    style={{ backgroundColor: hex, ringColor: hex }}>
                    {brandColor === hex && <HiOutlineCheck className="w-4 h-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile preview toggle */}
          <button type="button" onClick={() => setShowMobilePreview(v => !v)}
            className="lg:hidden w-full py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            {showMobilePreview ? 'إخفاء المعاينة' : 'شوف كيف تظهر صفحتك'}
          </button>
          {showMobilePreview && <div className="lg:hidden max-w-[200px] mx-auto">{preview}</div>}

          {/* Info */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">معلوماتك</h3>

            {/* Slug */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">رابط الحجز الخاص بيك</label>
              <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-accent-400">
                <span className="px-3 py-3 bg-slate-50 text-slate-400 text-xs border-l border-slate-200 flex-shrink-0">mawid.app/book/</span>
                <input value={slug} onChange={e => handleSlugChange(e.target.value)} placeholder="slug-الخاص-بيك" dir="ltr"
                  className="flex-1 px-3 py-3 text-sm focus:outline-none bg-white" />
              </div>
              {slugStatus === 'available' && <p className="text-xs text-accent-600 mt-1 flex items-center gap-1"><HiOutlineCheck className="w-3.5 h-3.5" /> متاح</p>}
              {slugStatus === 'taken' && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><HiOutlineXMark className="w-3.5 h-3.5" /> مش متاح، جرب تاني</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">نبذة عنك <span className="text-slate-400 font-normal">(اختياري)</span></label>
              <textarea value={bio} onChange={e => setBio(e.target.value.slice(0, 200))} rows={3} placeholder={cfg.bioPlaceholder}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none" />
              <p className="text-xs text-slate-400 text-left mt-0.5">{bio.length}/200</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">سنوات الخبرة</label>
                <input type="number" value={years} onChange={e => setYears(e.target.value)} min={0} max={50} placeholder="0"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">تخصصك الدقيق</label>
                <input value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder={cfg.specialtyPlaceholder}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
              </div>
            </div>
          </div>

          {/* Social links */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">روابط التواصل <span className="text-slate-400 font-normal normal-case">(اختياري)</span></h3>
            {[
              { Icon: HiOutlineGlobeAlt, placeholder: 'رابط Google Reviews', val: googleReviews, set: setGoogleReviews },
              { Icon: FaInstagram, placeholder: 'حسابك على Instagram', val: instagram, set: setInstagram },
              { Icon: FaFacebook, placeholder: 'صفحتك على Facebook', val: facebook, set: setFacebook },
            ].map(({ Icon, placeholder, val, set }) => (
              <div key={placeholder} className="flex items-center gap-3 border border-slate-200 rounded-xl px-4 py-3 focus-within:ring-2 focus-within:ring-accent-400">
                <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <input value={val} onChange={e => set(e.target.value)} placeholder={placeholder} dir="ltr"
                  className="flex-1 text-sm focus:outline-none bg-transparent" />
              </div>
            ))}
          </div>

          {/* Custom messages */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">رسائل مخصصة</h3>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">رسالة الترحيب في صفحة الحجز</label>
              <textarea value={welcomeMsg} onChange={e => setWelcomeMsg(e.target.value.slice(0, 150))} rows={2}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none" />
              <p className="text-xs text-slate-400 text-left mt-0.5">{welcomeMsg.length}/150</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">سياسة الإلغاء</label>
              <select value={cancelPolicy} onChange={e => setCancelPolicy(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white">
                {CANCELLATION_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Sticky preview col */}
        <div className="hidden lg:block lg:col-span-2">
          <div className="sticky top-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 text-center">معاينة مباشرة</p>
            {preview}
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onBack} className="flex-1">السابق</Button>
        <Button onClick={() => onNext({ logoFile, coverFile, brandColor, booking_slug: slug || null, bio, years_experience: Number(years) || null, specialty, instagram_url: instagram || null, facebook_url: facebook || null, google_reviews_url: googleReviews || null, welcome_message: welcomeMsg, cancellation_policy: cancelPolicy })} className="flex-1">
          إنهاء الإعداد
        </Button>
      </div>
    </div>
  )
}

// ── Share Kit (Completion Screen) ──────────────────────────────────
function ShareKitScreen({ businessName, slug }) {
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [msgCopied, setMsgCopied] = useState(false)
  const bookingUrl = `https://mawid.app/book/${slug || 'your-link'}`
  const shareMsg = `احجز موعدك مع ${businessName} بسهولة من الرابط ده 👇\n${bookingUrl}\n⏰ اختار الوقت المناسب ليك وهنبعتلك تأكيد على واتساب`

  useEffect(() => {
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.4 }, colors: ['#10B981', '#6366F1', '#F59E0B', '#EF4444'] })
  }, [])

  function copyLink() {
    navigator.clipboard.writeText(bookingUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function copyMsg() {
    navigator.clipboard.writeText(shareMsg)
    setMsgCopied(true)
    setTimeout(() => setMsgCopied(false), 2000)
  }

  return (
    <div className="text-center space-y-6" dir="rtl">
      <div>
        <div className="text-5xl mb-3">🎉</div>
        <h1 className="text-2xl font-bold text-accent-600">جاهز للاستقبال!</h1>
        <p className="text-slate-600 mt-1 font-medium">{businessName}</p>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-lg p-5 space-y-4 text-right">
        <h2 className="font-bold text-slate-900 text-base">شارك رابط الحجز بتاعك</h2>

        {/* Booking link */}
        <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200">
          <span className="flex-1 text-sm text-slate-700 font-mono truncate" dir="ltr">{bookingUrl}</span>
          <button onClick={copyLink}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${copied ? 'bg-accent-100 text-accent-700' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
            {copied ? <HiOutlineCheck className="w-3.5 h-3.5" /> : <HiOutlineClipboard className="w-3.5 h-3.5" />}
            {copied ? 'تم النسخ' : 'نسخ'}
          </button>
          <a href={`https://wa.me/?text=${encodeURIComponent('احجز موعدك معايا بسهولة من هنا 👇 ' + bookingUrl)}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500 hover:bg-green-600 text-white transition-colors">
            <FaWhatsapp className="w-3.5 h-3.5" />
            شارك
          </a>
        </div>

        {/* Ready message */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">رسالة جاهزة للنسخ والمشاركة</p>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-sm text-slate-700 whitespace-pre-line leading-relaxed">{shareMsg}</div>
          <button onClick={copyMsg}
            className={`mt-2 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${msgCopied ? 'bg-accent-100 text-accent-700' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {msgCopied ? <HiOutlineCheck className="w-4 h-4" /> : <HiOutlineClipboard className="w-4 h-4" />}
            {msgCopied ? 'تم النسخ' : 'نسخ الرسالة'}
          </button>
        </div>
      </div>

      <Button onClick={() => navigate('/dashboard')} className="w-full text-base py-4">ابدأ الاستخدام</Button>
    </div>
  )
}

// ── Main Onboarding Flow ───────────────────────────────────────────
export default function OnboardingFlow() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(false)
  const [shareKit, setShareKit] = useState(null)
  const createBusiness = useCreateBusiness()
  const upsertService = useUpsertService()

  function next(updates) {
    setData(prev => ({ ...prev, ...updates }))
    setStep(s => s + 1)
  }

  function handleStep0(vertical) { setData(prev => ({ ...prev, vertical, type: vertical.key })); setStep(1) }
  function handleStep1(values) { setData(prev => ({ ...prev, ...values })); setStep(2) }
  function handleStep2(values) { setData(prev => ({ ...prev, ...values })); setStep(3) }
  function handleStep3(values) { setData(prev => ({ ...prev, ...values })); setStep(4) }
  function handleStep4(values) { setData(prev => ({ ...prev, ...values })); setStep(5) }

  async function handleStep5(identityValues) {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const pendingOwnerPhone = sessionStorage.getItem('mawid_pending_owner_phone')

      const identityFields = {
        ...(pendingOwnerPhone ? { owner_phone: pendingOwnerPhone } : {}),
        public_phone: data.public_phone || null,
        brand_color: identityValues.brandColor,
        bio: identityValues.bio || null,
        years_experience: identityValues.years_experience || null,
        specialty: identityValues.specialty || null,
        instagram_url: identityValues.instagram_url || null,
        facebook_url: identityValues.facebook_url || null,
        google_reviews_url: identityValues.google_reviews_url || null,
        welcome_message: identityValues.welcome_message || null,
        cancellation_policy: identityValues.cancellation_policy || null,
        booking_slug: identityValues.booking_slug || null,
      }

      // Check if business already exists for this user
      const { data: existing } = await supabase
        .from('businesses')
        .select('id, name, booking_slug')
        .eq('owner_id', user.id)
        .maybeSingle()

      let business
      if (existing) {
        // Update existing business
        const { data: updated, error } = await supabase
          .from('businesses')
          .update({
            name: data.name,
            type: data.type || 'other',
            slot_duration: data.slot_duration,
            reminder_template: DEFAULT_REMINDER_TEMPLATE,
            ...identityFields,
          })
          .eq('id', existing.id)
          .select()
          .single()
        if (error) throw error
        business = updated
      } else {
        business = await createBusiness.mutateAsync({
          owner_id: user.id,
          name: data.name,
          type: data.type || 'other',
          slot_duration: data.slot_duration,
          reminder_template: DEFAULT_REMINDER_TEMPLATE,
          ...identityFields,
        })
      }

      // Upload assets
      if (identityValues.logoFile) {
        const logoUrl = await uploadBusinessAsset(business.id, identityValues.logoFile, 'logo')
        await supabase.from('businesses').update({ logo_url: logoUrl }).eq('id', business.id)
      }
      if (identityValues.coverFile) {
        const coverUrl = await uploadBusinessAsset(business.id, identityValues.coverFile, 'cover')
        await supabase.from('businesses').update({ cover_url: coverUrl }).eq('id', business.id)
      }

      if (data.services?.length) {
        await upsertService.mutateAsync({ businessId: business.id, services: data.services })
      }

      // Only insert branches for new businesses; existing ones keep their branches
      if (!existing) {
        const capacity = data.capacity || 1
        const scheduleBlocks = data.schedule_blocks || {}
        if (data.branches?.length) {
          await supabase.from('branches').insert(
            data.branches.map(b => ({ ...b, business_id: business.id, capacity, schedule_blocks: scheduleBlocks }))
          )
        } else {
          await supabase.from('branches').insert({
            business_id: business.id, name: data.name + ' - الفرع الرئيسي', is_main: true, capacity, schedule_blocks: scheduleBlocks,
          })
        }
      }

      if (pendingOwnerPhone) sessionStorage.removeItem('mawid_pending_owner_phone')

      setShareKit({ name: business.name, slug: business.booking_slug })
      setStep(6)
    } catch (e) {
      const msg = e.message || ''
      if (msg.includes('booking_slug')) {
        alert('هذا الرابط مأخوذ من حساب آخر، اختر رابطاً مختلفاً')
      } else {
        alert('حدث خطأ أثناء الحفظ: ' + msg)
      }
    } finally {
      setLoading(false)
    }
  }

  if (step === 6 && shareKit) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-accent-50 to-white flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-6">
          <ShareKitScreen businessName={shareKit.name} slug={shareKit.slug} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-accent-500 rounded-2xl mb-2 shadow-lg">
            <span className="text-white font-bold text-xl">ب</span>
          </div>
          <p className="text-gray-500 text-sm">إعداد حسابك</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <ProgressBar step={step} />

          {step === 0 && <StepBusinessType onNext={handleStep0} />}
          {step === 1 && <StepBusinessInfo onNext={handleStep1} onBack={() => setStep(0)} vertical={data.vertical} />}
          {step === 2 && <StepBranches onNext={handleStep2} onBack={() => setStep(1)} vertical={data.vertical} />}
          {step === 3 && <StepWorkingHours onNext={handleStep3} onBack={() => setStep(2)} />}
          {step === 4 && <StepServices onNext={handleStep4} onBack={() => setStep(3)} businessVertical={data.vertical} />}
          {step === 5 && <StepIdentity onNext={handleStep5} onBack={() => setStep(4)} businessName={data.name} vertical={data.vertical} />}
        </div>
      </div>
    </div>
  )
}
