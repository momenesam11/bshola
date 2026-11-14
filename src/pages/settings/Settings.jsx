import { useState, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
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
  HiOutlineBuildingOffice2,
  HiOutlineSwatch,
  HiOutlineWrenchScrewdriver,
  HiOutlineClock,
  HiOutlineBellAlert,
  HiOutlineShieldCheck,
} from 'react-icons/hi2'
import { FaInstagram, FaFacebook } from 'react-icons/fa'
import PageWrapper from '../../components/layout/PageWrapper'
import Button from '../../components/ui/Button'
import Input, { Select, Textarea } from '../../components/ui/Input'
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
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useBranch } from '../../context/branchState'
import ScheduleBlockEditor from '../../components/ui/ScheduleBlockEditor'
import BookingLinkActions from '../../components/booking/BookingLinkActions'
import ReferralCard from '../../components/referral/ReferralCard'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import DeleteAccountSection from '../../components/settings/DeleteAccountSection'
import { BRAND_COLORS, CANCELLATION_OPTIONS, cleanSlug } from '../../lib/businessProfile'
import PhoneInput from '../../components/ui/PhoneInput'
import { COUNTRIES, CURRENCIES, DEFAULT_COUNTRY, defaultCurrencyOf } from '../../lib/countries'
import { isReviewUrl } from '../../lib/reviews'
import { MAX_NOTIFY_AHEAD, notifyAheadOf } from '../../lib/queue'
function ServiceRow({ service, onUpdateField, onDelete }) {
  return (
    <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 flex-wrap">
      <input defaultValue={service.name} onBlur={e => onUpdateField(service, 'name', e.target.value)} placeholder="اسم الخدمة"
        className="flex-1 min-w-[120px] border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
      <div className="flex items-center gap-1.5">
        <input type="number" min={5} max={480} step={5} defaultValue={service.duration_minutes}
          onBlur={e => onUpdateField(service, 'duration_minutes', Number(e.target.value) || 30)}
          className="w-16 border border-slate-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent-400" dir="ltr" />
        <span className="text-xs text-slate-400">دقيقة</span>
      </div>
      <input type="number" min={0} defaultValue={service.price || ''} placeholder="السعر"
        onBlur={e => onUpdateField(service, 'price', e.target.value ? Number(e.target.value) : null)}
        className="w-20 border border-slate-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent-400" dir="ltr" />
      <button onClick={() => onDelete(service.id)} className="text-red-400 hover:text-red-600 p-1.5">
        <HiOutlineTrash className="w-4 h-4" />
      </button>
    </div>
  )
}

const SETTINGS_TABS = [
  { id: 'business', label: 'معلومات النشاط', Icon: HiOutlineBuildingOffice2 },
  { id: 'identity', label: 'الهوية البصرية', Icon: HiOutlineSwatch },
  { id: 'services', label: 'الخدمات', Icon: HiOutlineWrenchScrewdriver },
  { id: 'hours', label: 'ساعات العمل', Icon: HiOutlineClock },
  { id: 'reminders', label: 'التذكيرات', Icon: HiOutlineBellAlert },
  { id: 'account', label: 'الحساب والأمان', Icon: HiOutlineShieldCheck },
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

// ── Security Section — change password via Supabase Auth ───────────
function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  async function handleChangePassword() {
    setError('')
    if (!currentPassword) {
      setError('من فضلك ادخل كلمة المرور الحالية')
      return
    }
    if (newPassword.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين')
      return
    }
    setStatus('loading')
    const { data: { user } } = await supabase.auth.getUser()
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })
    if (verifyError) {
      setStatus('error')
      setError('كلمة المرور الحالية غير صحيحة')
      return
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) {
      setStatus('error')
      setError(updateError.message)
      return
    }
    setStatus('ok')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setTimeout(() => setStatus(''), 2500)
  }

  return (
    <div className="space-y-3 max-w-sm">
      <Input label="كلمة المرور الحالية" type="password" placeholder="••••••••" dir="ltr"
        value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
      <Input label="كلمة المرور الجديدة" type="password" placeholder="••••••••" dir="ltr"
        value={newPassword} onChange={e => setNewPassword(e.target.value)} />
      <Input label="تأكيد كلمة المرور الجديدة" type="password" placeholder="••••••••" dir="ltr"
        value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={handleChangePassword} loading={status === 'loading'} size="sm">تغيير كلمة المرور</Button>
        <SaveFeedback status={status} msg={error} />
      </div>
    </div>
  )
}

// ── Working Hours Section — edits the currently selected branch's schedule ──
function WorkingHoursSection({ business }) {
  const qc = useQueryClient()
  const branchCtx = useBranch()
  const isMultiBranch = !!branchCtx?.isMultiBranch
  const currentBranch = branchCtx?.currentBranch
  // Settings remounts this per branch (key), so starting state is enough.
  const [scheduleBlocks, setScheduleBlocks] = useState(() =>
    currentBranch && !currentBranch.isAll ? currentBranch.schedule_blocks || {} : {})
  const [isValid, setIsValid] = useState(true)
  const [saveStatus, setSaveStatus] = useState(null)
  const [saveMsg, setSaveMsg] = useState('')

  async function handleSave() {
    if (!currentBranch || currentBranch.isAll) return
    setSaveStatus('loading')
    try {
      const { error: branchError } = await supabase
        .from('branches')
        .update({ schedule_blocks: scheduleBlocks })
        .eq('id', currentBranch.id)
      if (branchError) throw branchError
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
      <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm">
        {isMultiBranch ? (
          <>
            <span className="text-slate-500">بتعدل ساعات فرع:</span>
            <span className="font-semibold text-slate-700">{currentBranch.name}</span>
          </>
        ) : (
          <span className="text-slate-500">عدد الكراسي وبيانات الفرع</span>
        )}
        <Link to="/settings/branches" className="text-accent-600 hover:underline text-xs mr-auto">إدارة الفروع</Link>
      </div>
      <ScheduleBlockEditor value={scheduleBlocks} onChange={setScheduleBlocks} onValidityChange={setIsValid} />
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
  const [pendingDeleteId, setPendingDeleteId] = useState(null)

  const onSaveError = { onError: e => toast.error(e?.message || 'تعذر حفظ الخدمة') }

  function addService() {
    upsertService.mutate({ businessId, services: [{ name: 'خدمة جديدة', duration_minutes: 30, price: null }] }, onSaveError)
  }

  function updateField(service, field, value) {
    if (field === 'name' && !String(value).trim()) {
      toast.error('اسم الخدمة مايبقاش فاضي')
      return
    }
    if (service[field] === value) return
    upsertService.mutate({ businessId, services: [{ id: service.id, name: service.name, duration_minutes: service.duration_minutes, price: service.price, [field]: value }] }, onSaveError)
  }

  async function confirmDelete() {
    const id = pendingDeleteId
    setPendingDeleteId(null)
    if (!id) return
    try {
      await deleteService.mutateAsync(id)
      toast.success('تم حذف الخدمة')
    } catch (e) {
      toast.error(e?.message || 'تعذر حذف الخدمة')
    }
  }

  if (isLoading) return <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>

  return (
    <div className="space-y-3">
      {services.map(s => (
        <ServiceRow key={s.id} service={s} onUpdateField={updateField} onDelete={setPendingDeleteId} />
      ))}
      <button onClick={addService}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-accent-300 hover:text-accent-600 transition-colors min-h-[44px]">
        <HiOutlinePlus className="w-4 h-4" />إضافة خدمة
      </button>

      <ConfirmDialog
        open={!!pendingDeleteId}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={confirmDelete}
        variant="danger"
        loading={deleteService.isPending}
        title="حذف الخدمة"
        message="حذف هذه الخدمة؟"
        confirmLabel="حذف"
      />
    </div>
  )
}

// ── Identity Section ──────────────────────────────────────────────
function IdentitySection({ business, onSaved }) {
  const updateIdentity = useUpdateBusinessIdentity()
  const [brandColor, setBrandColor] = useState(business?.brand_color || '#0D9B6C')
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
    const clean = cleanSlug(val)
    setSlug(clean)
    setSlugStatus('checking')
    clearTimeout(slugTimer.current)
    slugTimer.current = setTimeout(async () => {
      if (!clean || clean === business?.booking_slug) { setSlugStatus(null); return }
      const { data } = await supabase.rpc('booking_slug_taken', { p_slug: clean })
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
          <BookingLinkActions url={bookingLink} shareMessage={`احجز موعدك مع ${business?.name || ''} بسهولة من الرابط ده\n${bookingLink}`} />
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
  const branchCtx = useBranch()
  // Only what the owner typed is state; everything else shows the saved values.
  const [edits, setEdits] = useState({})
  const bizForm = {
    name: business?.name || '',
    phone: business?.phone || '',
    country: business?.country || DEFAULT_COUNTRY,
    currency: business?.currency || 'EGP',
    ...edits.biz,
  }
  const setBizForm = (fn) => setEdits(e => ({ ...e, biz: fn(bizForm) }))
  const reminderHours = edits.reminderHours ?? (business?.reminder_hours || 24)
  const setReminderHours = (v) => setEdits(e => ({ ...e, reminderHours: v }))
  const reminderTemplate = edits.reminderTemplate ?? (business?.reminder_template || DEFAULT_REMINDER_TEMPLATE)
  const setReminderTemplate = (v) => setEdits(e => ({ ...e, reminderTemplate: v }))
  const [saveStatus, setSaveStatus] = useState({})
  // /settings?tab=reminders opens straight on that tab (the dashboard links there).
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState(() => {
    const asked = searchParams.get('tab')
    return SETTINGS_TABS.some(t => t.id === asked) ? asked : 'business'
  })
  const queueAhead = edits.queueAhead ?? String(notifyAheadOf(business))
  const setQueueAhead = (v) => setEdits(e => ({ ...e, queueAhead: v }))

  async function saveQueueAhead() {
    const n = Number(queueAhead)
    if (!Number.isInteger(n) || n < 1 || n > MAX_NOTIFY_AHEAD) {
      setStatus('queue', 'error', `اكتب رقم من 1 لـ ${MAX_NOTIFY_AHEAD}`)
      return
    }
    setStatus('queue', 'loading')
    try { await updateBusiness.mutateAsync({ id: business.id, queue_notify_ahead: n }); setStatus('queue', 'ok') }
    catch (e) { setStatus('queue', 'error', e?.message || String(e)) }
  }

  const reviewUrl = edits.reviewUrl ?? (business?.google_review_url || '')
  const setReviewUrl = (v) => setEdits(e => ({ ...e, reviewUrl: v }))

  async function saveReviewUrl() {
    const value = reviewUrl.trim()
    if (value && !isReviewUrl(value)) {
      setStatus('review', 'error', 'اللينك لازم يبدأ بـ https://')
      return
    }
    setStatus('review', 'loading')
    try { await updateBusiness.mutateAsync({ id: business.id, google_review_url: value || null }); setStatus('review', 'ok') }
    catch (e) { setStatus('review', 'error', e?.message || String(e)) }
  }

  function setStatus(key, val, msg = '') {
    setSaveStatus(s => ({ ...s, [key]: val, [`${key}Msg`]: msg }))
    if (val === 'ok') setTimeout(() => setSaveStatus(s => ({ ...s, [key]: '' })), 2500)
  }

  async function saveBizInfo() {
    if (bizForm.name.trim().length < 2) {
      setStatus('biz', 'error', 'اسم النشاط لازم يكون حرفين على الأقل')
      return
    }
    setStatus('biz', 'loading')
    try { await updateBusiness.mutateAsync({ id: business.id, ...bizForm, name: bizForm.name.trim(), phone: bizForm.phone.trim() }); setStatus('biz', 'ok') }
    catch (e) { setStatus('biz', 'error', e?.message || String(e)) }
  }

  async function saveReminder() {
    setStatus('reminder', 'loading')
    try { await updateBusiness.mutateAsync({ id: business.id, reminder_hours: reminderHours, reminder_template: reminderTemplate }); setStatus('reminder', 'ok') }
    catch (e) { setStatus('reminder', 'error', e?.message || String(e)) }
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
      <div>
        {/* Tabs — full available width so 6 short labels fit without a
            scrollbar on desktop; on narrow mobile screens they still wrap
            into horizontal scroll naturally via overflow-x-auto. */}
        <div className="flex overflow-x-auto bg-white rounded-2xl border border-slate-100 shadow-sm mb-4 no-print max-w-3xl">
          {SETTINGS_TABS.map(t => {
            const Icon = t.Icon
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${active ? 'border-accent-500 text-accent-700 bg-accent-50/30' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-accent-500' : ''}`} />
                <span>{t.label}</span>
              </button>
            )
          })}
        </div>

        <div className="max-w-2xl space-y-6">

        {/* ── Business Info (name + phone only, type is read-only) ── */}
        {tab === 'business' && (
          <Section title="معلومات النشاط" subtitle="الاسم ورقم الهاتف يمكن تعديلهم هنا">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-500">نوع النشاط:</span>
              <span className="text-sm font-semibold text-slate-700">{business?.type || '—'}</span>
              <span className="text-xs text-slate-400 mr-auto">يُحدَّد من الإعداد الأولي</span>
            </div>
            <Input label="اسم النشاط" value={bizForm.name} onChange={e => setBizForm(p => ({ ...p, name: e.target.value }))} placeholder="مثال: عيادة دكتور أحمد" />
            <PhoneInput label="رقم الهاتف" value={bizForm.phone} onChange={phone => setBizForm(p => ({ ...p, phone }))} defaultCountry={bizForm.country} />
            <Select
              label="الدولة"
              value={bizForm.country}
              onChange={e => setBizForm(p => ({ ...p, country: e.target.value, currency: defaultCurrencyOf(e.target.value) }))}
            >
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </Select>
            <Select
              label="عملة أسعار خدماتك"
              value={bizForm.currency}
              onChange={e => setBizForm(p => ({ ...p, currency: e.target.value }))}
            >
              {Object.entries(CURRENCIES).map(([code, c]) => <option key={code} value={code}>{c.name}</option>)}
            </Select>
            <p className="text-xs text-gray-400 -mt-2">
              تغيير العملة بيغير الاسم اللي بيظهر جنب الأسعار بس، ومش بيحوّل الأرقام المسجلة.
            </p>
            <div className="flex items-center gap-3">
              <Button onClick={saveBizInfo} loading={saveStatus.biz === 'loading'} size="sm">حفظ</Button>
              <SaveFeedback status={saveStatus.biz} msg={saveStatus.bizMsg} />
            </div>
          </Section>
        )}

        {/* ── Identity ─────────────────────────────────────────── */}
        {tab === 'identity' && (
          <Section title="هوية البيزنس" subtitle="الصورة، الألوان، الرابط، والمعلومات التي تظهر في صفحة الحجز">
            {business && <IdentitySection key={business.id} business={business} />}
          </Section>
        )}

        {/* ── Services ─────────────────────────────────────────── */}
        {tab === 'services' && (
          <Section title="الخدمات" subtitle="مدة الخدمة هي الوقت اللي بيتقفل في الجدول لما مريض يحجزها">
            {business && <ServicesSection businessId={business.id} />}
          </Section>
        )}

        {/* ── Working Hours ─────────────────────────────────────── */}
        {tab === 'hours' && (
          <Section title="ساعات العمل" subtitle="يمكنك إضافة أكتر من فترة لليوم الواحد، بدون تقاطع بينها">
            {business && <WorkingHoursSection key={branchCtx?.currentBranch?.id ?? 'none'} business={business} />}
          </Section>
        )}

        {/* ── Reminders ─────────────────────────────────────────── */}
        {tab === 'reminders' && (
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
              {['{client_name}', '{service}', '{date}', '{time}', '{business_name}', '{branch}', '{manage_link}'].map(v => (
                <code key={v} className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 mx-0.5 text-[12.5px]">{v}</code>
              ))}
            </p>
            <div className="flex items-center gap-3">
              <Button onClick={saveReminder} loading={saveStatus.reminder === 'loading'} size="sm">حفظ</Button>
              <SaveFeedback status={saveStatus.reminder} msg={saveStatus.reminderMsg} />
            </div>
          </Section>
        )}

        {tab === 'reminders' && (
          <Section title="الدور النهارده" subtitle="لما المرضى يقربوا من دورهم، الرئيسية هتقولك تبعت لمين رسالة «باقي قدامك كام»">
            <Input label="ابعت للمريض لما يبقى قدامه" type="number" min={1} max={MAX_NOTIFY_AHEAD} value={queueAhead}
              onChange={e => setQueueAhead(e.target.value)} dir="ltr" />
            <p className="text-xs text-slate-500">الترتيب بميعاد الحجز. الرسالة بتتبعت من واتساب العيادة، والمريض مش محتاج يفتح أي لينك.</p>
            <div className="flex items-center gap-3">
              <Button onClick={saveQueueAhead} loading={saveStatus.queue === 'loading'} size="sm">حفظ العدد</Button>
              <SaveFeedback status={saveStatus.queue} msg={saveStatus.queueMsg} />
            </div>
          </Section>
        )}

        {tab === 'reminders' && (
          <Section title="تقييم جوجل" subtitle="بعد ما الزيارة تخلص، الرئيسية هتقترح عليك تبعت للمريض رسالة يقيمك فيها">
            <Input label="لينك التقييم على جوجل" value={reviewUrl} onChange={e => setReviewUrl(e.target.value)}
              placeholder="https://g.page/r/..." dir="ltr" />
            <p className="text-xs text-slate-500 leading-relaxed">
              تجيبه منين: افتح ملف عيادتك على Google Business Profile، ودوس «اطلب تقييمات» أو «Ask for reviews»، وانسخ اللينك والصقه هنا.
            </p>
            <div className="flex items-center gap-3">
              <Button onClick={saveReviewUrl} loading={saveStatus.review === 'loading'} size="sm">حفظ اللينك</Button>
              <SaveFeedback status={saveStatus.review} msg={saveStatus.reviewMsg} />
            </div>
          </Section>
        )}

        {/* ── Account: security + logout + danger zone ──────────── */}
        {tab === 'account' && (
          <>
            <Section title="الأمان" subtitle="تغيير كلمة المرور الخاصة بحسابك">
              <SecuritySection />
            </Section>

            <Section title="🎁 رشّح زميل" subtitle="لينك الترشيح الخاص بيك">
              <ReferralCard business={business} />
            </Section>

            {/* Logout (mobile only — desktop/tablet sidebar already has it) */}
            <div className="md:hidden">
              <Button variant="secondary" onClick={handleLogout} className="w-full">
                تسجيل الخروج
              </Button>
            </div>

            <Section title="منطقة الخطر">
              {/* Deleting a clinic's patients can't be undone, so this records a
                  request the Beshola team approves from /admin. */}
              {business && <DeleteAccountSection businessId={business.id} />}
            </Section>
          </>
        )}

        </div>
      </div>
    </PageWrapper>
  )
}
