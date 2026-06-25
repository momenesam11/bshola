import { formatDateAr, formatTime12 } from '../../utils/dateHelpers'

const STATUS_LABELS = {
  confirmed: 'مؤكد',
  completed: 'مكتمل',
  cancelled: 'ملغي',
  no_show: 'لم يحضر',
  waitlist: 'قائمة انتظار',
}

const STATUS_COLORS = {
  confirmed: '#2563EB',
  completed: '#059669',
  cancelled: '#DC2626',
  no_show: '#D97706',
  waitlist: '#64748B',
}

// Rendered directly in the page (hidden on screen via the `hidden` class,
// shown only when printing via the `print-only` CSS rule in index.css).
// Real browser print rendering — not a canvas screenshot — so Arabic text
// shapes correctly; html2canvas has no native text-shaping support and was
// rendering Arabic letters disconnected.
export default function PrintableReport({ business, bookingUrl, from, to, stats, appointments, visitCountByPhone = {} }) {
  const brand = business?.brand_color || '#10B981'

  return (
    <div className="hidden print-only" style={{ fontFamily: 'Tajawal, sans-serif', direction: 'rtl', color: '#1F2937' }}>
      {/* Header */}
      <div style={{ background: brand, padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {business?.logo_url ? (
            <img src={business.logo_url} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.6)' }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 22, border: '2px solid rgba(255,255,255,0.5)' }}>
              {business?.name?.charAt(0) || 'ب'}
            </div>
          )}
          <div>
            <p style={{ fontWeight: 700, fontSize: 19, color: '#fff', margin: 0 }}>{business?.name}</p>
            {bookingUrl && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', margin: '3px 0 0' }} dir="ltr">{bookingUrl}</p>}
          </div>
        </div>
        <div style={{ textAlign: 'left', color: 'rgba(255,255,255,0.9)' }}>
          <p style={{ fontSize: 11, margin: 0 }}>تقرير الأداء</p>
          <p style={{ fontSize: 11, margin: '3px 0 0' }}>{formatDateAr(from, 'd MMM yyyy')} — {formatDateAr(to, 'd MMM yyyy')}</p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', padding: '24px 32px', gap: 16 }}>
        {[
          { label: 'إجمالي المواعيد', value: stats.total },
          { label: 'الحضور', value: stats.completed },
          { label: 'الغياب', value: stats.noShow },
          { label: 'معدل الحضور', value: `${stats.attendanceRate}%` },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, textAlign: 'center', border: '1px solid #F1F5F9', borderRadius: 10, padding: '14px 8px' }}>
            <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: brand }}>{s.value}</p>
            <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ padding: '0 32px 24px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              {['العميل', 'الهاتف', 'الخدمة', 'التاريخ', 'الوقت', 'الحالة', 'إجمالي الزيارات'].map(h => (
                <th key={h} style={{ textAlign: 'right', padding: '10px 8px', color: '#64748B', fontWeight: 600, borderBottom: '1px solid #E2E8F0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {appointments.map((appt, i) => (
              <tr key={appt.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                <td style={{ padding: '9px 8px', borderBottom: '1px solid #F1F5F9' }}>{appt.client_name}</td>
                <td style={{ padding: '9px 8px', borderBottom: '1px solid #F1F5F9', color: '#475569' }} dir="ltr">{appt.client_phone}</td>
                <td style={{ padding: '9px 8px', borderBottom: '1px solid #F1F5F9', color: '#475569' }}>{appt.services?.name || '—'}</td>
                <td style={{ padding: '9px 8px', borderBottom: '1px solid #F1F5F9', color: '#475569' }}>{formatDateAr(appt.appointment_date, 'd MMM yyyy')}</td>
                <td style={{ padding: '9px 8px', borderBottom: '1px solid #F1F5F9', color: '#475569' }} dir="ltr">{formatTime12(appt.appointment_time?.slice(0, 5))}</td>
                <td style={{ padding: '9px 8px', borderBottom: '1px solid #F1F5F9', color: STATUS_COLORS[appt.status] || '#475569', fontWeight: 600 }}>{STATUS_LABELS[appt.status] || appt.status}</td>
                <td style={{ padding: '9px 8px', borderBottom: '1px solid #F1F5F9', color: '#475569', textAlign: 'center' }}>{visitCountByPhone[appt.client_phone] || 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #F1F5F9', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src="/logo.png" alt="بسهولة" style={{ width: 16, height: 16, borderRadius: 4, objectFit: 'contain' }} />
          تم الإصدار بواسطة بسهولة — {formatDateAr(new Date().toISOString().slice(0, 10), 'd MMM yyyy')}
        </span>
        <span>{appointments.length} موعد</span>
      </div>
    </div>
  )
}
