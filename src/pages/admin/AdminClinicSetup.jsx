import { useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { HiOutlineArrowRight, HiOutlineCamera, HiOutlineCheck, HiOutlinePlus, HiOutlineTrash, HiOutlineArrowTopRightOnSquare } from 'react-icons/hi2'
import Button from '../../components/ui/Button'
import Input, { Textarea } from '../../components/ui/Input'
import Dropdown from '../../components/ui/Dropdown'
import PhoneInput from '../../components/ui/PhoneInput'
import ScheduleBlockEditor from '../../components/ui/ScheduleBlockEditor'
import PasswordGate from '../../components/admin/AdminPasswordGate'
import { BRAND_COLORS, CANCELLATION_OPTIONS, cleanSlug } from '../../lib/businessProfile'
import { hasAdminToken, useClinicSetup, useSetupBusiness, useSetupServices, useSetupBranch, useSetupImage } from '../../hooks/useAdmin'

// /admin/setup/:id — the owner fills in a clinic's settings at the clinic's
// request: profile, pictures, services, branches and hours. It never shows
// appointments or patients; the admin Edge Function only exposes settings.

function Card({ title, subtitle, children }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

const saved = (what) => toast.success(`اتحفظ ${what}`)
const failed = (e) => toast.error(e?.message || 'حدث خطأ')

function ProfileCard({ business }) {
  const save = useSetupBusiness()
  const [f, setF] = useState(() => ({
    name: business.name || '',
    phone: business.phone || '',
    booking_slug: business.booking_slug || '',
    specialty: business.specialty || '',
    years_experience: business.years_experience ?? '',
    bio: business.bio || '',
    welcome_message: business.welcome_message || '',
    cancellation_policy: business.cancellation_policy || CANCELLATION_OPTIONS[0],
    brand_color: business.brand_color || BRAND_COLORS[0].hex,
    instagram_url: business.instagram_url || '',
    facebook_url: business.facebook_url || '',
    google_reviews_url: business.google_reviews_url || '',
  }))
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e?.target ? e.target.value : e }))

  async function submit() {
    try {
      await save.mutateAsync({ id: business.id, fields: f })
      saved('بيانات العيادة')
    } catch (e) { failed(e) }
  }

  return (
    <Card title="بيانات العيادة" subtitle="اللي بيظهر للمرضى في صفحة الحجز">
      <Input label="اسم العيادة" value={f.name} onChange={set('name')} />
      <PhoneInput label="رقم العيادة" value={f.phone} onChange={set('phone')} defaultCountry={business.country || undefined} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="التخصص" value={f.specialty} onChange={set('specialty')} placeholder="مثال: باطنة" />
        <Input label="سنين الخبرة" type="number" min={0} max={80} value={f.years_experience} onChange={set('years_experience')} dir="ltr" />
      </div>
      <Textarea label="نبذة (200 حرف)" value={f.bio} maxLength={200} onChange={set('bio')} />
      <Textarea label="رسالة الترحيب في صفحة الحجز (150 حرف)" value={f.welcome_message} maxLength={150} rows={2} onChange={set('welcome_message')} />
      <Dropdown label="سياسة الإلغاء" value={f.cancellation_policy} onChange={set('cancellation_policy')}
        options={CANCELLATION_OPTIONS.map((o) => ({ value: o, label: o }))} />
      <Input label="رابط الحجز" value={f.booking_slug} dir="ltr" placeholder="clinic-name"
        onChange={(e) => setF((p) => ({ ...p, booking_slug: cleanSlug(e.target.value) }))} />
      <p className="text-xs text-gray-400 -mt-2" dir="ltr">{window.location.origin}/book/{f.booking_slug || business.id}</p>
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">اللون</p>
        <div className="flex gap-2 flex-wrap">
          {BRAND_COLORS.map(({ hex, label }) => (
            <button key={hex} type="button" title={label} aria-label={label} onClick={() => setF((p) => ({ ...p, brand_color: hex }))}
              className={`w-9 h-9 rounded-full border-2 flex items-center justify-center ${f.brand_color === hex ? 'border-gray-700 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: hex }}>
              {f.brand_color === hex && <HiOutlineCheck className="w-4 h-4 text-white" />}
            </button>
          ))}
        </div>
      </div>
      <Input label="فيسبوك" value={f.facebook_url} onChange={set('facebook_url')} dir="ltr" />
      <Input label="إنستجرام" value={f.instagram_url} onChange={set('instagram_url')} dir="ltr" />
      <Input label="تقييمات جوجل" value={f.google_reviews_url} onChange={set('google_reviews_url')} dir="ltr" />
      <Button onClick={submit} loading={save.isPending} size="sm">حفظ البيانات</Button>
    </Card>
  )
}

const readBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1])
  r.onerror = reject
  r.readAsDataURL(file)
})

function ImagePicker({ business, kind, label, wide }) {
  const upload = useSetupImage()
  const ref = useRef(null)
  const current = business[`${kind}_url`]

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 3 * 1024 * 1024) return toast.error('الصورة أكبر من 3 ميجا')
    try {
      await upload.mutateAsync({ id: business.id, kind, base64: await readBase64(file), contentType: file.type })
      saved(label)
    } catch (err) { failed(err) }
  }

  return (
    <div className="flex items-center gap-4">
      <button type="button" onClick={() => ref.current?.click()} disabled={upload.isPending}
        className={`${wide ? 'w-40 h-20 rounded-xl' : 'w-20 h-20 rounded-full'} border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 hover:border-accent-400 flex-shrink-0`}>
        {current ? <img src={current} alt={label} className="w-full h-full object-cover" /> : <HiOutlineCamera className="w-6 h-6 text-gray-400" />}
      </button>
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-400">JPG أو PNG أو WEBP، أقل من 3 ميجا</p>
        <button type="button" onClick={() => ref.current?.click()} className="text-xs text-accent-600 mt-1">
          {upload.isPending ? 'جاري الرفع...' : current ? 'تغيير' : 'رفع صورة'}
        </button>
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} className="hidden" aria-label={label} />
    </div>
  )
}

let tempId = 0
function ServicesCard({ business, services: initial }) {
  const save = useSetupServices()
  const [rows, setRows] = useState(() => initial.map((s) => ({ ...s, key: s.id, price: s.price ?? '' })))
  const [removed, setRemoved] = useState([])
  const setRow = (key, k, v) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: v } : r)))

  function remove(row) {
    setRows((rs) => rs.filter((r) => r.key !== row.key))
    if (row.id) setRemoved((ids) => [...ids, row.id])
  }

  async function submit() {
    try {
      await save.mutateAsync({
        id: business.id,
        remove: removed,
        services: rows.map((r) => ({ id: r.id, name: r.name, duration_minutes: Number(r.duration_minutes), price: r.price === '' ? null : Number(r.price) })),
      })
      setRemoved([])
      saved('الخدمات')
    } catch (e) { failed(e) }
  }

  return (
    <Card title="الخدمات" subtitle="مدة الخدمة هي الوقت اللي بيتقفل في الجدول لما مريض يحجزها">
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.key} data-testid="setup-service" className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100 flex-wrap">
            <input aria-label={`اسم الخدمة ${i + 1}`} value={r.name} onChange={(e) => setRow(r.key, 'name', e.target.value)} placeholder="اسم الخدمة"
              className="flex-1 min-w-[120px] border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            <input aria-label={`مدة الخدمة ${i + 1}`} type="number" min={5} max={480} step={5} value={r.duration_minutes}
              onChange={(e) => setRow(r.key, 'duration_minutes', e.target.value)} className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-sm text-center" dir="ltr" />
            <span className="text-xs text-gray-400">دقيقة</span>
            <input aria-label={`سعر الخدمة ${i + 1}`} type="number" min={0} value={r.price} placeholder="السعر"
              onChange={(e) => setRow(r.key, 'price', e.target.value)} className="w-20 border border-gray-200 rounded-lg px-2 py-2 text-sm text-center" dir="ltr" />
            <button type="button" onClick={() => remove(r)} title="حذف الخدمة" className="text-red-400 hover:text-red-600 p-1.5">
              <HiOutlineTrash className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setRows((rs) => [...rs, { key: `new-${++tempId}`, name: '', duration_minutes: 30, price: '' }])}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-accent-300 hover:text-accent-600">
        <HiOutlinePlus className="w-4 h-4" />إضافة خدمة
      </button>
      <Button onClick={submit} loading={save.isPending} size="sm">حفظ الخدمات</Button>
    </Card>
  )
}

function BranchCard({ business, branch, many }) {
  const save = useSetupBranch()
  const [name, setName] = useState(branch.name || '')
  const [address, setAddress] = useState(branch.address || '')
  const [capacity, setCapacity] = useState(branch.capacity ?? 1)
  const [blocks, setBlocks] = useState(branch.schedule_blocks || {})
  const [valid, setValid] = useState(true)

  async function submit() {
    try {
      await save.mutateAsync({ id: business.id, branchId: branch.id, name, address, capacity: Number(capacity), schedule_blocks: blocks })
      saved(many ? `فرع ${name}` : 'مواعيد الشغل')
    } catch (e) { failed(e) }
  }

  return (
    <Card title={many ? `فرع: ${branch.name}` : 'العنوان ومواعيد الشغل'} subtitle="ممكن أكتر من فترة في اليوم، من غير ما يتقاطعوا">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input label="اسم الفرع" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="sm:col-span-2"><Input label="العنوان" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
      </div>
      <Input label="عدد المرضى في نفس الوقت" type="number" min={1} max={50} value={capacity} onChange={(e) => setCapacity(e.target.value)} dir="ltr" />
      <ScheduleBlockEditor value={blocks} onChange={setBlocks} onValidityChange={setValid} />
      <Button onClick={submit} loading={save.isPending} disabled={!valid} size="sm">{many ? 'حفظ الفرع' : 'حفظ المواعيد'}</Button>
    </Card>
  )
}

function Setup() {
  const { id } = useParams()
  const { data, isLoading, error } = useClinicSetup(id)

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6" dir="rtl">
      <Helmet><title>تجهيز الحساب — بسهولة</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Link to="/admin" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <HiOutlineArrowRight className="w-4 h-4" />لوحة التحكم
          </Link>
          {data?.business && (
            <a href={`/book/${data.business.booking_slug || data.business.id}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-accent-600 hover:text-accent-700">
              صفحة الحجز<HiOutlineArrowTopRightOnSquare className="w-4 h-4" />
            </a>
          )}
        </div>
        {isLoading && <div className="h-40 bg-white rounded-2xl animate-pulse" />}
        {error && <p className="text-sm text-red-600">{error.message}</p>}
        {data && (
          <>
            <div>
              <h1 className="text-xl font-bold text-gray-900">تجهيز حساب {data.business.name}</h1>
              <p className="text-sm text-gray-500 mt-1">كل جزء ليه زرار حفظ لوحده. التغييرات بتظهر للعيادة ولصفحة الحجز على طول.</p>
            </div>
            <ProfileCard key={`p-${data.business.id}`} business={data.business} />
            <Card title="الصور">
              <ImagePicker business={data.business} kind="logo" label="اللوجو أو الصورة الشخصية" />
              <ImagePicker business={data.business} kind="cover" label="صورة الغلاف" wide />
            </Card>
            <ServicesCard key={`s-${data.services.map((s) => s.id).join()}`} business={data.business} services={data.services} />
            {data.branches.map((b) => (
              <BranchCard key={b.id} business={data.business} branch={b} many={data.branches.length > 1} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

export default function AdminClinicSetup() {
  const [authenticated, setAuthenticated] = useState(() => hasAdminToken())
  if (!authenticated) return <PasswordGate onAuthenticated={() => setAuthenticated(true)} />
  return <Setup />
}
