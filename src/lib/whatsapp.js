// WhatsApp Manual Sender — opens WhatsApp Web/App with pre-filled message, no API needed

// The text onboarding saves for everyone. A clinic still on it gets the fuller
// built-in reminder (it has the date and branch); a clinic that wrote its own
// text in Settings gets exactly that.
const UNCHANGED_DEFAULT_TEMPLATE =
  'مرحباً {client_name}، نذكرك بموعدك في {business_name} لخدمة {service} الساعة {time}. نتطلع لرؤيتك!'

export function generateReminderMessage(appointment, business, branch) {
  const timeFormatted = formatTimeArabic(appointment.appointment_time)
  const dateFormatted = formatDateArabic(appointment.appointment_date)
  const template = business.reminder_template?.trim()
  if (template && template !== UNCHANGED_DEFAULT_TEMPLATE) {
    const values = {
      client_name: appointment.client_name || '',
      service: appointment.services?.name || appointment.service_name || '',
      time: timeFormatted,
      date: dateFormatted,
      business_name: business.name || '',
      branch: branch?.name || business.name || '',
    }
    return template.replace(/\{(client_name|service|time|date|business_name|branch)\}/g, (_, key) => values[key])
  }
  const branchLine = branch?.name
    ? `المكان: ${branch.name}${branch.address ? ' — ' + branch.address : ''}`
    : `المكان: ${business.name}`

  return `السلام عليكم يا ${appointment.client_name}

تذكير بموعدك غداً عند ${business.name}:
التاريخ: ${dateFormatted}
الساعة: ${timeFormatted}
الخدمة: ${appointment.services?.name || appointment.service_name || ''}
${branchLine}

لو محتاج تغيير أو إلغاء، ردّ على هذه الرسالة.

نتطلع نشوفك!
— ${business.name}`
}

export function generateConfirmationMessage(appointment, business, branch) {
  const timeFormatted = formatTimeArabic(appointment.appointment_time)
  const dateFormatted = formatDateArabic(appointment.appointment_date)
  const branchLine = branch?.name
    ? `المكان: ${branch.name}${branch.address ? ' — ' + branch.address : ''}`
    : `المكان: ${business.name}`

  return `أهلاً يا ${appointment.client_name}

تم تأكيد حجزك عند ${business.name}:
التاريخ: ${dateFormatted}
الساعة: ${timeFormatted}
الخدمة: ${appointment.services?.name || appointment.service_name || ''}
${branchLine}

نتطلع نشوفك!
— ${business.name}`
}

// The wa.me redirect turns emoji into broken symbols on the way to WhatsApp, so
// nothing with one goes out, including text a clinic wrote itself.
export function removeEmoji(text) {
  return String(text).replace(/[ \t]*(?:\p{Regional_Indicator}|\p{Extended_Pictographic}|\p{Emoji_Modifier}|️|‍(?=\p{Extended_Pictographic}))+/gu, '')
}

// Returns false when the browser blocked the new tab, so a caller sending many
// messages can say which ones never opened instead of reporting them as sent.
// Phones are different: window.open to wa.me often returns null while handing
// off to the WhatsApp app, which looked like a blocked popup. There a link click
// inside the user's tap is never blocked and the hand-off can't be seen anyway,
// so it reports true.
export function openWhatsApp(phone, message) {
  const cleanPhone = String(phone).replace(/[^0-9]/g, '')
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(removeEmoji(message))}`
  if (window.matchMedia?.('(pointer: coarse)').matches) {
    const link = document.createElement('a')
    link.href = url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    link.remove()
    return true
  }
  const tab = window.open(url, '_blank')
  return !!tab
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
