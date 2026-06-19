// WhatsApp Manual Sender — opens WhatsApp Web/App with pre-filled message, no API needed

export function generateReminderMessage(appointment, business, branch) {
  const timeFormatted = formatTimeArabic(appointment.appointment_time)
  const dateFormatted = formatDateArabic(appointment.appointment_date)
  const branchLine = branch?.name
    ? `📍 ${branch.name}${branch.address ? ' — ' + branch.address : ''}`
    : `📍 ${business.name}`

  return `السلام عليكم يا ${appointment.client_name} 👋

تذكير بموعدك غداً عند ${business.name}:
📅 ${dateFormatted}
⏰ الساعة ${timeFormatted}
💼 الخدمة: ${appointment.services?.name || appointment.service_name || ''}
${branchLine}

لو محتاج تغيير أو إلغاء، ردّ على هذه الرسالة.

نتطلع نشوفك! 🗓️
— ${business.name}`
}

export function generateConfirmationMessage(appointment, business, branch) {
  const timeFormatted = formatTimeArabic(appointment.appointment_time)
  const dateFormatted = formatDateArabic(appointment.appointment_date)
  const branchLine = branch?.name
    ? `📍 ${branch.name}${branch.address ? ' — ' + branch.address : ''}`
    : `📍 ${business.name}`

  return `أهلاً يا ${appointment.client_name}! 🎉

تم تأكيد حجزك عند ${business.name}:
📅 ${dateFormatted}
⏰ الساعة ${timeFormatted}
💼 الخدمة: ${appointment.services?.name || appointment.service_name || ''}
${branchLine}

نتطلع نشوفك! 😊
— ${business.name}`
}

export function openWhatsApp(phone, message) {
  const cleanPhone = String(phone).replace(/[^0-9]/g, '')
  window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank')
}

export function formatTimeArabic(time) {
  if (!time) return ''
  const [hours, minutes] = String(time).slice(0, 5).split(':')
  const h = parseInt(hours)
  const period = h >= 12 ? 'م' : 'ص'
  const h12 = h % 12 || 12
  return `${h12}:${minutes} ${period}`
}

export function formatDateArabic(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
