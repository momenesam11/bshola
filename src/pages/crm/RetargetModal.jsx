import { useState, useRef } from 'react'
import { HiOutlineXMark, HiOutlineCheck, HiOutlineUsers } from 'react-icons/hi2'
import { FaWhatsapp } from 'react-icons/fa'
import { useClients } from '../../hooks/useClients'
import { openWhatsApp } from '../../lib/whatsapp'

const VARIABLE_CHIPS = [
  { label: '{client_name}', desc: 'اسم العميل' },
  { label: '{business_name}', desc: 'اسم النشاط' },
  { label: '{booking_link}', desc: 'رابط الحجز' },
]

const AUDIENCE_OPTIONS = [
  { key: 'فاتر', label: 'فاترين', desc: '30-60 يوم', color: 'amber' },
  { key: 'ضايع', label: 'ضايعين', desc: '+60 يوم', color: 'red' },
  { key: '', label: 'الكل', desc: 'جميع العملاء', color: 'slate' },
]

const COLORS = {
  amber: { card: 'border-amber-300 bg-amber-50', badge: 'bg-amber-100 text-amber-700', active: 'border-amber-500 bg-amber-50 shadow-md' },
  red: { card: 'border-red-300 bg-red-50', badge: 'bg-red-100 text-red-700', active: 'border-red-500 bg-red-50 shadow-md' },
  slate: { card: 'border-slate-200 bg-slate-50', badge: 'bg-slate-100 text-slate-700', active: 'border-slate-400 bg-slate-50 shadow-md' },
}

export default function RetargetModal({ onClose, businessId, business, singleClient }) {
  const [step, setStep] = useState(singleClient ? 1 : 0)
  const [audience, setAudience] = useState(null)
  const [message, setMessage] = useState(`مرحباً {client_name}، وحشتنا في ${business?.name || 'نشاطنا'}! احجز موعدك دلوقتي: {booking_link}`)
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState(null)
  const [progress, setProgress] = useState(0)
  const textareaRef = useRef(null)

  const { data: allClients = [] } = useClients(businessId)

  const targetClients = singleClient
    ? [{ name: singleClient.name, phone: singleClient.phone }]
    : audience === null
    ? []
    : audience === ''
    ? allClients
    : allClients.filter(c => c.status === audience)

  function insertVariable(chip) {
    if (!textareaRef.current) return
    const el = textareaRef.current
    const start = el.selectionStart
    const end = el.selectionEnd
    const newMsg = message.slice(0, start) + chip + message.slice(end)
    setMessage(newMsg)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + chip.length, start + chip.length)
    }, 0)
  }

  function renderPreview(msg) {
    return msg
      .replace(/{client_name}/g, 'محمد')
      .replace(/{business_name}/g, business?.name || 'النشاط')
      .replace(/{booking_link}/g, `${window.location.origin}/book/${businessId}`)
  }

  async function handleSend() {
    setSending(true)
    setProgress(0)
    const total = targetClients.length
    let done = 0
    const res = { success: 0, failed: 0, errors: [] }

    for (const client of targetClients) {
      const msg = message
        .replace(/{client_name}/g, client.name)
        .replace(/{business_name}/g, business?.name || '')
        .replace(/{booking_link}/g, `${window.location.origin}/book/${businessId}`)
      try {
        openWhatsApp(client.phone, msg)
        res.success++
      } catch (e) {
        res.failed++
        res.errors.push({ phone: client.phone, error: e.message })
      }
      done++
      setProgress(Math.round((done / total) * 100))
      await new Promise(r => setTimeout(r, 400))
    }

    setResults(res)
    setSending(false)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose} />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
        dir="rtl"
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto pointer-events-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Modal header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">
              {step === 0 ? 'اختر الجمهور' : step === 1 ? 'اكتب الرسالة' : 'إرسال الرسائل'}
            </h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
              <HiOutlineXMark className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Step indicator */}
            {!singleClient && (
              <div className="flex gap-2">
                {['الجمهور', 'الرسالة', 'الإرسال'].map((s, i) => (
                  <div key={i} className="flex items-center gap-1 flex-1">
                    <div className={`w-6 h-6 rounded-full text-xs font-bold leading-none flex items-center justify-center ${i <= step ? 'bg-accent-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {i < step ? <HiOutlineCheck className="w-3 h-3" /> : i + 1}
                    </div>
                    <span className={`text-xs ${i === step ? 'text-accent-600 font-medium' : 'text-slate-400'}`}>{s}</span>
                    {i < 2 && <div className={`flex-1 h-0.5 ${i < step ? 'bg-accent-400' : 'bg-slate-100'}`} />}
                  </div>
                ))}
              </div>
            )}

            {/* Step 0: Audience */}
            {step === 0 && !singleClient && (
              <div className="space-y-3">
                {AUDIENCE_OPTIONS.map(opt => {
                  const count = opt.key === '' ? allClients.length : allClients.filter(c => c.status === opt.key).length
                  const c = COLORS[opt.color]
                  const isActive = audience === opt.key
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setAudience(opt.key)}
                      className={`w-full flex items-center justify-between p-4 rounded-xl border-2 text-right transition-all ${
                        isActive ? c.active : `${c.card} hover:shadow-sm`
                      }`}
                    >
                      <div>
                        <p className="font-bold text-slate-900">{opt.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                      </div>
                      <span className={`text-sm font-bold px-3 py-1.5 rounded-full ${c.badge}`}>
                        {count} عميل
                      </span>
                    </button>
                  )
                })}

                {audience !== null && (
                  <div className="bg-accent-50 rounded-xl p-3 text-sm text-accent-700 flex items-center gap-2">
                    <HiOutlineUsers className="w-4 h-4" />
                    سيتم الإرسال لـ <strong>{targetClients.length}</strong> عميل
                  </div>
                )}

                <button
                  onClick={() => setStep(1)}
                  disabled={audience === null || targetClients.length === 0}
                  className="w-full py-3 bg-accent-500 hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors min-h-[48px]"
                >
                  التالي
                </button>
              </div>
            )}

            {/* Step 1: Message */}
            {step === 1 && (
              <div className="space-y-4">
                {/* Variable chips */}
                <div>
                  <p className="text-xs text-slate-500 mb-2">متغيرات — اضغط لإدراجها في الرسالة:</p>
                  <div className="flex flex-wrap gap-2">
                    {VARIABLE_CHIPS.map(chip => (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => insertVariable(chip.label)}
                        className="px-3 py-1.5 bg-primary-100 text-primary-700 text-xs font-mono font-bold rounded-lg hover:bg-primary-200 transition-colors"
                        title={chip.desc}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={5}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none"
                  placeholder="اكتب رسالتك هنا..."
                />

                <div className="text-left text-xs text-slate-400">{message.length} حرف</div>

                {/* Preview */}
                <div>
                  <p className="text-xs text-slate-500 mb-2">معاينة:</p>
                  <div className="bg-[#DCF8C6] rounded-xl p-4 text-sm text-slate-800 whitespace-pre-wrap shadow-sm">
                    {renderPreview(message)}
                  </div>
                </div>

                <div className="flex gap-3">
                  {!singleClient && (
                    <button
                      onClick={() => setStep(0)}
                      className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      السابق
                    </button>
                  )}
                  <button
                    onClick={() => setStep(2)}
                    disabled={!message.trim()}
                    className="flex-1 py-3 bg-accent-500 hover:bg-accent-600 disabled:opacity-40 text-white font-bold rounded-xl transition-colors min-h-[48px]"
                  >
                    التالي
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Confirm & Send */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">عدد المستلمين</span>
                    <strong>{targetClients.length} عميل</strong>
                  </div>
                  <div className="border-t border-slate-200 pt-2">
                    <p className="text-slate-500 mb-1">الرسالة:</p>
                    <p className="text-slate-800 bg-[#DCF8C6] rounded-lg p-3 text-xs whitespace-pre-wrap">
                      {renderPreview(message)}
                    </p>
                  </div>
                </div>

                {sending && (
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>جاري الإرسال...</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent-500 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {results && (
                  <div className="space-y-2">
                    <div className="flex gap-3">
                      <div className="flex-1 bg-accent-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-accent-600">{results.success}</p>
                        <p className="text-xs text-accent-700">تم الإرسال</p>
                      </div>
                      {results.failed > 0 && (
                        <div className="flex-1 bg-red-50 rounded-xl p-3 text-center">
                          <p className="text-2xl font-bold text-red-600">{results.failed}</p>
                          <p className="text-xs text-red-700">فشل</p>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={onClose}
                      className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors min-h-[48px]"
                    >
                      تم
                    </button>
                  </div>
                )}

                {!results && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep(1)}
                      disabled={sending}
                      className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-40"
                    >
                      السابق
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={sending}
                      className="flex-1 py-3 bg-accent-500 hover:bg-accent-600 disabled:opacity-40 text-white font-bold rounded-xl transition-colors min-h-[48px] flex items-center justify-center gap-2"
                    >
                      <FaWhatsapp className="w-4 h-4" />
                      إرسال الآن
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
