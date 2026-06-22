import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useQueryClient } from '@tanstack/react-query'
import {
  HiOutlinePlus,
  HiOutlineXMark,
  HiOutlineCheck,
  HiOutlineCamera,
  HiOutlinePhoto,
  HiOutlineGlobeAlt,
  HiOutlineTrash,
} from 'react-icons/hi2'
import { FaInstagram, FaFacebook } from 'react-icons/fa'
import PageWrapper from '../../components/layout/PageWrapper'
import Button from '../../components/ui/Button'
import Input, { Textarea } from '../../components/ui/Input'
import Dropdown from '../../components/ui/Dropdown'
import {
  useBusiness,
  useUpdateBusiness,
  useServices,
  useUpsertService,
  useDeleteService,
  useUpdateBusinessIdentity,
  uploadBusinessAsset,
} from '../../hooks/useBusiness'
import { REMINDER_OPTIONS, DEFAULT_REMINDER_TEMPLATE } from '../../utils/constants'
import { supabase } from '../../lib/supabase'
import { useBranch } from '../../context/BranchContext'
import ScheduleBlockEditor from '../../components/ui/ScheduleBlockEditor'
import BookingLinkActions from '../../components/booking/BookingLinkActions'

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

function Section({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-4 sm:space-y-5" dir="rtl">
      <div className="pb-3 border-b border-slate-50">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function SaveFeedback({ status, msg }) {
  if (status === 'loading') return <span className="text-xs text-slate-400">جاري الحفظ...</span>
  if (status === 'ok') return (
    <span className="text-xs text-accent-600 flex items-center gap-1">
      <HiOutlineCheck className="w-3.5 h-3.5" /> تم الحفظ
    </span>
  )
  if (status === 'error') return <span className="text-xs text-red-500 break-all max-w-xs">خطأ: {msg}</span>
  return null
}

// ── Working Hours Section — edits the currently selected branch's schedule ──
function WorkingHoursSection({ business }) {
  const qc = useQueryClient()
  const branchCtx = useBranch()
  const isMultiBranch = !!branchCtx?.isMultiBranch
  const currentBranch = branchCtx?.currentBranch
  const [scheduleBlocks, setScheduleBlocks] = useState({})
  const [isValid, setIsValid] = useState(true)
  const [slotDuration, setSlotDuration] = useState(business?.slot_duration || 30)
  const [saveStatus, setSaveStatus] = useState(null)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    if (currentBranch && !currentBranch.isAll) {
      setScheduleBlocks(currentBranch.schedule_blocks || {})
    }
  }, [currentBranch?.id])

  useEffect(() => {
    setSlotDuration(business?.slot_duration || 30)
  }, [business?.slot_duration])

  async function handleSave() {
    if (!currentBranch || currentBranch.isAll) return
    setSaveStatus('loading')
    try {
      const { error: branchError } = await supabase
        .from('branches')
        .update({ schedule_blocks: scheduleBlocks })
        .eq('id', currentBranch.id)
      if (branchError) throw branchError
      const { error: bizError } = await supabase
        .from('businesses')
        .update({ slot_duration: slotDuration })
        .eq('id', business.id)
      if (bizError) throw bizError
      qc.invalidateQueries({ queryKey: ['branches', business.id] })
      qc.invalidateQueries({ queryKey: ['business'] })
      setSaveStatus('ok')
      setTimeout(() => setSaveStatus(null), 2500)
    } catch (e) {
      setSaveStatus('error')
      setSaveMsg(e?.message || String(e))
    }
  }

  if (!currentBranch) {
    return <div className="h-24 bg-slate-50 rounded-xl animate-pulse" />
  }

  if (currentBranch.isAll) {
    return (
      <p className="text-sm text-slate-500">
        اختر فرع محدد من القائمة في الأعلى لتعديل ساعات عمله، أو من{' '}
        <Link to="/settings/branches" className="text-accent-600 hover:underline font-medium">إدارة الفروع</Link>.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {isMultiBranch && (
        <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm">
          <span className="text-slate-500">بتعدل ساعات فرع:</span>
          <span className="font-semibold text-slate-700">{currentBranch.name}</span>
          <Link to="/settings/branches" className="text-accent-600 hover:underline text-xs mr-auto">إدارة كل الفروع</Link>
        </div>
      )}
      <ScheduleBlockEditor value={scheduleBlocks} onChange={setScheduleBlocks} onValidityChange={setIsValid} />
      <Dropdown
        label="مدة الموعد الواحد"
        value={slotDuration}
        onChange={v => setSlotDuration(Number(v))}
        options={[
          { value: 15, label: '15 دقيقة' },
          { value: 30, label: '30 دقيقة' },
          { value: 45, label: '45 دقيقة' },
          { value: 60, label: 'ساعة كاملة' },
          { value: 90, label: 'ساعة ونصف' },
        ]}
      />
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={saveStatus === 'loading'} disabled={!isValid} size="sm">حفظ</Button>
        <SaveFeedback status={saveStatus} msg={saveMsg} />
      </div>
    </div>
  )
}

// ── Services Section ────────────────────────────────────────────────
function ServicesSection({ businessId }) {
  const { data: services = [], isLoading } = useServices(businessId)
  const upsertService = useUpsertService()
  const deleteService = useDeleteService()

  function addService() {
    upsertService.mutate({ businessId, services: [{ name: 'خدمة جديدة', duration_minutes: 30, price: null }] })
  }

  function updateField(service, field, value) {
    upsertService.mutate({ businessId, services: [{ id: service.id, name: service.name, duration_minutes: service.duration_minutes, price: service.price, [field]: value }] })
  }

  async function handleDelete(id) {
    if (!window.confirm('حذف هذه الخدمة؟')) return
    await deleteService.mutateAsync(id)
  }

  if (isLoading) return <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>

  return (
    <div className="space-y-3">
      {services.map(s => (
        <div key={s.id} className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 flex-wrap">
          <input defaultValue={s.name} onBlur={e => updateField(s, 'name', e.target.value)} placeholder="اسم الخدمة"
            className="flex-1 min-w-[120px] border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
          <div className="flex items-center gap-1.5">
            <input type="number" min={5} max={480} step={5} defaultValue={s.duration_minutes}
              onBlur={e => updateField(s, 'duration_minutes', Number(e.target.value) || 30)}
              className="w-16 border border-slate-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent-400" dir="ltr" />
            <span className="text-xs text-slate-400">دقيقة</span>
          </div>
          <input type="number" min={0} defaultValue={s.price || ''} placeholder="السعر"
            onBlur={e => updateField(s, 'price', e.target.value ? Number(e.target.value) : null)}
            className="w-20 border border-slate-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent-400" dir="ltr" />
          <button onClick={() => handleDelete(s.id)} className="text-red-400 hover:text-red-600 p-1.5">
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button onClick={addService}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-accent-300 hover:text-accent-600 transition-colors min-h-[44px]">
        <HiOutlinePlus className="w-4 h-4" />إضافة خدمة
      </button>
    </div>
  )
}

// ── Identity Section ──────────────────────────────────────────────
function IdentitySection({ business, onSaved }) {
  const updateIdentity = useUpdateBusinessIdentity()
  const [brandColor, setBrandColor] = useState(business?.brand_color || '#10B981')
  const [logoPreview, setLogoPreview] = useState(business?.logo_url || null)
  const [coverPreview, setCoverPreview] = useState(business?.cover_url || null)
  const [logoFile, setLogoFile] = useState(null)
  const [coverFile, setCoverFile] = useState(null)
  const [slug, setSlug] = useState(business?.booking_slug || '')
  const [slugStatus, setSlugStatus] = useState(null)
  const [bio, setBio] = useState(business?.bio || '')
  const [years, setYears] = useState(business?.years_experience || '')
  const [specialty, setSpecialty] = useState(business?.specialty || '')
  const [instagram, setInstagram] = useState(business?.instagram_url || '')
  const [facebook, setFacebook] = useState(business?.facebook_url || '')
  const [googleReviews, setGoogleReviews] = useState(business?.google_reviews_url || '')
  const [welcomeMsg, setWelcomeMsg] = useState(business?.welcome_message || '')
  const [cancelPolicy, setCancelPolicy] = useState(business?.cancellation_policy || CANCELLATION_OPTIONS[0])
  const [saveStatus, setSaveStatus] = useState(null)
  const [saveMsg, setSaveMsg] = useState('')
  const slugTimer = useRef(null)
  const logoRef = useRef(null)
  const coverRef = useRef(null)

  // Sync from parent when business loads
  useEffect(() => {
    if (!business) return
    setBrandColor(business.brand_color || '#10B981')
    setLogoPreview(business.logo_url || null)
    setCoverPreview(business.cover_url || null)
    setSlug(business.booking_slug || '')
    setBio(business.bio || '')
    setYears(business.years_experience || '')
    setSpecialty(business.specialty || '')
    setInstagram(business.instagram_url || '')
    setFacebook(business.facebook_url || '')
    setGoogleReviews(business.google_reviews_url || '')
    setWelcomeMsg(business.welcome_message || '')
    setCancelPolicy(business.cancellation_policy || CANCELLATION_OPTIONS[0])
  }, [business?.id])

  function handleLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  function handleCoverChange(e) {
    const file = e.target.files?.[0]
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
      if (!clean || clean === business?.booking_slug) { setSlugStatus(null); return }
      const { data } = await supabase.from('businesses').select('id').eq('booking_slug', clean).maybeSingle()
      setSlugStatus(data ? 'taken' : 'available')
    }, 600)
  }

  async function handleSave() {
    if (slugStatus === 'taken') {
      setSaveStatus('error')
      setSaveMsg('هذا الرابط مأخوذ من حساب آخر، اختر رابطاً مختلفاً')
      return
    }
    setSaveStatus('loading')
    try {
      let logoUrl = business?.logo_url
      let coverUrl = business?.cover_url
      if (logoFile) logoUrl = await uploadBusinessAsset(business.id, logoFile, 'logo')
      if (coverFile) coverUrl = await uploadBusinessAsset(business.id, coverFile, 'cover')

      await updateIdentity.mutateAsync({
        id: business.id,
        brand_color: brandColor,
        logo_url: logoUrl,
        cover_url: coverUrl,
        booking_slug: slug || null,
        bio: bio || null,
        years_experience: Number(years) || null,
        specialty: specialty || null,
        instagram_url: instagram || null,
        facebook_url: facebook || null,
        google_reviews_url: googleReviews || null,
        welcome_message: welcomeMsg || null,
        cancellation_policy: cancelPolicy || null,
      })
      setLogoFile(null)
      setCoverFile(null)
      setSaveStatus('ok')
      setTimeout(() => setSaveStatus(null), 2500)
      onSaved?.()
    } catch (e) {
      setSaveStatus('error')
      const msg = e.message || ''
      setSaveMsg(msg.includes('booking_slug') ? 'هذا الرابط مأخوذ من حساب آخر، اختر رابطاً مختلفاً' : msg)
    }
  }

  const bookingLink = `${window.location.origin}/book/${slug || business?.id}`

  return (
    <div className="space-y-5">
      {/* Logo + Cover */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">الصور والشعار</p>
        <div className="space-y-3">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => logoRef.current?.click()}
              className="w-20 h-20 rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50 hover:border-accent-400 hover:bg-accent-50 transition-colors flex-shrink-0">
              {logoPreview
                ? <img src={logoPreview} alt="" className="w-full h-full object-cover" />
                : <HiOutlineCamera className="w-6 h-6 text-slate-400" />}
            </button>
            <div>
              <p className="text-sm font-medium text-slate-700">الشعار أو الصورة الشخصية</p>
              <p className="text-xs text-slate-400 mt-0.5">JPG أو PNG · مربع 1:1</p>
              <button type="button" onClick={() => logoRef.current?.click()} className="text-xs text-accent-600 hover:text-accent-700 mt-1">تغيير الصورة</button>
            </div>
            <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleLogoChange} className="hidden" />
          </div>

          {/* Cover */}
          <div>
            <p className="text-xs font-medium text-slate-600 mb-1.5">صورة الغلاف</p>
            <button type="button" onClick={() => coverRef.current?.click()}
              className="w-full h-24 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 bg-slate-50 hover:border-accent-400 hover:bg-accent-50 transition-colors overflow-hidden">
              {coverPreview
                ? <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                : <><HiOutlinePhoto className="w-6 h-6 text-slate-400" /><span className="text-xs text-slate-400">صورة غلاف بنسبة 16:9</span></>}
            </button>
            <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleCoverChange} className="hidden" />
          </div>
        </div>
      </div>

      {/* Brand color */}
      <div>
        <p className="text-xs font-medium text-slate-600 mb-2">اللون الأساسي للبيزنس</p>
        <div className="flex gap-2 flex-wrap">
          {BRAND_COLORS.map(({ hex }) => (
            <button key={hex} type="button" onClick={() => setBrandColor(hex)}
              className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${brandColor === hex ? 'border-slate-700 ring-2 ring-offset-2 scale-110' : 'border-transparent hover:scale-105'}`}
              style={{ backgroundColor: hex, ringColor: hex }}>
              {brandColor === hex && <HiOutlineCheck className="w-4 h-4 text-white" />}
            </button>
          ))}
        </div>
      </div>

      {/* Booking slug */}
      <div>
        <p className="text-xs font-medium text-slate-600 mb-1.5">رابط الحجز المخصص</p>
        <div className="flex flex-col sm:flex-row sm:items-center border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-accent-400">
          <span className="px-3 py-2 sm:py-3 bg-slate-50 text-slate-400 text-xs border-b sm:border-b-0 sm:border-l border-slate-200 flex-shrink-0 truncate" dir="ltr">
            {window.location.origin}/book/
          </span>
          <input value={slug} onChange={e => handleSlugChange(e.target.value)} placeholder="slug-الخاص-بيك" dir="ltr"
            className="flex-1 w-full px-3 py-3 text-sm focus:outline-none bg-white" />
        </div>
        {slugStatus === 'available' && <p className="text-xs text-accent-600 mt-1 flex items-center gap-1"><HiOutlineCheck className="w-3.5 h-3.5" />متاح</p>}
        {slugStatus === 'taken' && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><HiOutlineXMark className="w-3.5 h-3.5" />مش متاح، جرب تاني</p>}
        <div className="mt-2 bg-slate-50 rounded-xl p-2.5 border border-slate-100">
          <span className="block text-xs text-accent-700 font-mono truncate mb-2" dir="ltr">{bookingLink}</span>
          <BookingLinkActions url={bookingLink} shareMessage={`احجز موعدك مع ${business?.name || ''} بسهولة من الرابط ده 👇\n${bookingLink}`} />
        </div>
      </div>

      {/* Bio */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">نبذة عنك <span className="text-slate-400 font-normal">(اختياري)</span></label>
        <textarea value={bio} onChange={e => setBio(e.target.value.slice(0, 200))} rows={3}
          placeholder="مثال: متخصص في تجميل الابتسامة، خبرة أكثر من 10 سنوات..."
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none" />
        <p className="text-xs text-slate-400 text-left mt-0.5">{bio.length}/200</p>
      </div>

      {/* Years + Specialty */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">سنوات الخبرة</label>
          <input type="number" value={years} onChange={e => setYears(e.target.value)} min={0} max={50} placeholder="0"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" dir="ltr" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">التخصص</label>
          <input value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="مثال: تجميل أسنان"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
        </div>
      </div>

      {/* Social links */}
      <div>
        <p className="text-xs font-medium text-slate-600 mb-2">روابط التواصل <span className="text-slate-400 font-normal">(اختياري)</span></p>
        <div className="space-y-2">
          {[
            { Icon: HiOutlineGlobeAlt, placeholder: 'رابط Google Reviews', val: googleReviews, set: setGoogleReviews },
            { Icon: FaInstagram, placeholder: 'حساب Instagram', val: instagram, set: setInstagram },
            { Icon: FaFacebook, placeholder: 'صفحة Facebook', val: facebook, set: setFacebook },
          ].map(({ Icon, placeholder, val, set }) => (
            <div key={placeholder} className="flex items-center gap-3 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-accent-400">
              <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <input value={val} onChange={e => set(e.target.value)} placeholder={placeholder} dir="ltr"
                className="flex-1 text-sm focus:outline-none bg-transparent" />
            </div>
          ))}
        </div>
      </div>

      {/* Welcome message */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">رسالة الترحيب في صفحة الحجز</label>
        <textarea value={welcomeMsg} onChange={e => setWelcomeMsg(e.target.value.slice(0, 150))} rows={2}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none" />
        <p className="text-xs text-slate-400 text-left mt-0.5">{welcomeMsg.length}/150</p>
      </div>

      {/* Cancellation policy */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">سياسة الإلغاء</label>
        <Dropdown
          value={cancelPolicy}
          onChange={setCancelPolicy}
          options={CANCELLATION_OPTIONS.map(o => ({ value: o, label: o }))}
        />
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-1">
        <Button onClick={handleSave} loading={saveStatus === 'loading'} size="sm">حفظ الهوية</Button>
        <SaveFeedback status={saveStatus} msg={saveMsg} />
      </div>
    </div>
  )
}

// ── Main Settings ─────────────────────────────────────────────────
export default function Settings() {
  const navigate = useNavigate()
  const { data: business, isLoading } = useBusiness()
  const updateBusiness = useUpdateBusiness()
  const [bizForm, setBizForm] = useState({ name: '', phone: '' })
  const [reminderHours, setReminderHours] = useState(24)
  const [reminderTemplate, setReminderTemplate] = useState(DEFAULT_REMINDER_TEMPLATE)
  const [saveStatus, setSaveStatus] = useState({})

  useEffect(() => {
    if (business) {
      setBizForm({ name: business.name || '', phone: business.phone || '' })
      setReminderHours(business.reminder_hours || 24)
      setReminderTemplate(business.reminder_template || DEFAULT_REMINDER_TEMPLATE)
    }
  }, [business])

  function setStatus(key, val, msg = '') {
    setSaveStatus(s => ({ ...s, [key]: val, [`${key}Msg`]: msg }))
    if (val === 'ok') setTimeout(() => setSaveStatus(s => ({ ...s, [key]: '' })), 2500)
  }

  async function saveBizInfo() {
    setStatus('biz', 'loading')
    try { await updateBusiness.mutateAsync({ id: business.id, ...bizForm }); setStatus('biz', 'ok') }
    catch (e) { setStatus('biz', 'error', e?.message || String(e)) }
  }

  async function saveReminder() {
    setStatus('reminder', 'loading')
    try { await updateBusiness.mutateAsync({ id: business.id, reminder_hours: reminderHours, reminder_template: reminderTemplate }); setStatus('reminder', 'ok') }
    catch (e) { setStatus('reminder', 'error', e?.message || String(e)) }
  }

  async function handleDeleteAccount() {
    if (!window.confirm('هل أنت متأكد من حذف الحساب؟ لا يمكن التراجع.')) return
    await supabase.auth.signOut()
    navigate('/login')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (isLoading) return (
    <PageWrapper title="الإعدادات">
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-40 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
    </PageWrapper>
  )

  return (
    <PageWrapper title="الإعدادات">
      <Helmet>
        <title>الإعدادات — بسهولة</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="max-w-2xl space-y-6">

        {/* ── Business Info (name + phone only, type is read-only) ── */}
        <Section title="معلومات النشاط" subtitle="الاسم ورقم الهاتف يمكن تعديلهم هنا">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xs text-slate-500">نوع النشاط:</span>
            <span className="text-sm font-semibold text-slate-700">{business?.type || '—'}</span>
            <span className="text-xs text-slate-400 mr-auto">يُحدَّد من الإعداد الأولي</span>
          </div>
          <Input label="اسم النشاط" value={bizForm.name} onChange={e => setBizForm(p => ({ ...p, name: e.target.value }))} placeholder="مثال: عيادة دكتور أحمد" />
          <Input label="رقم الهاتف" value={bizForm.phone} onChange={e => setBizForm(p => ({ ...p, phone: e.target.value }))} dir="ltr" placeholder="01XXXXXXXXX" />
          <div className="flex items-center gap-3">
            <Button onClick={saveBizInfo} loading={saveStatus.biz === 'loading'} size="sm">حفظ</Button>
            <SaveFeedback status={saveStatus.biz} msg={saveStatus.bizMsg} />
          </div>
        </Section>

        {/* ── Identity ─────────────────────────────────────────── */}
        <Section title="هوية البيزنس" subtitle="الصورة، الألوان، الرابط، والمعلومات التي تظهر في صفحة الحجز">
          {business && <IdentitySection business={business} />}
        </Section>

        {/* ── Services ─────────────────────────────────────────── */}
        <Section title="الخدمات" subtitle="حدد مدة وسعر كل خدمة">
          {business && <ServicesSection businessId={business.id} />}
        </Section>

        {/* ── Working Hours ─────────────────────────────────────── */}
        <Section title="ساعات العمل" subtitle="يمكنك إضافة أكتر من فترة لليوم الواحد، بدون تقاطع بينها">
          {business && <WorkingHoursSection business={business} />}
        </Section>

        {/* ── Reminders ─────────────────────────────────────────── */}
        <Section title="إعدادات التذكيرات">
          <Dropdown
            label="وقت إرسال التذكير"
            value={reminderHours}
            onChange={v => setReminderHours(Number(v))}
            options={REMINDER_OPTIONS}
          />
          <Textarea label="نص رسالة التذكير" value={reminderTemplate} onChange={e => setReminderTemplate(e.target.value)} rows={4} />
          <p className="text-xs text-slate-400">
            المتغيرات:{' '}
            {['{client_name}', '{service}', '{time}', '{business_name}', '{branch}'].map(v => (
              <code key={v} className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 mx-0.5 text-[11px]">{v}</code>
            ))}
          </p>
          <div className="flex items-center gap-3">
            <Button onClick={saveReminder} loading={saveStatus.reminder === 'loading'} size="sm">حفظ</Button>
            <SaveFeedback status={saveStatus.reminder} msg={saveStatus.reminderMsg} />
          </div>
        </Section>

{/* ── Logout (mobile only — desktop/tablet sidebar already has it) ── */}
        <div className="md:hidden">
          <Button variant="secondary" onClick={handleLogout} className="w-full">
            تسجيل الخروج
          </Button>
        </div>

{/* ── Danger Zone ──────────────────────────────────────── */}
        <Section title="منطقة الخطر">
          <p className="text-sm text-slate-500">سيتم حذف جميع بياناتك بشكل دائم ولا يمكن التراجع.</p>
          <Button variant="danger" onClick={handleDeleteAccount} size="sm">حذف الحساب نهائياً</Button>
        </Section>

      </div>
    </PageWrapper>
  )
}
