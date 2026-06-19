import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function buildMessage(template: string, vars: Record<string, string>): string {
  return template
    .replace('{client_name}', vars.client_name)
    .replace('{service}', vars.service)
    .replace('{time}', vars.time)
    .replace('{business_name}', vars.business_name)
}

async function sendViaTwilio(to: string, body: string): Promise<boolean> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!
  const fromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM')!

  const toFormatted = `whatsapp:+${to.replace(/[^0-9]/g, '')}`

  const params = new URLSearchParams({
    From: fromNumber,
    To: toFormatted,
    Body: body,
  })

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  )

  return response.ok
}

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now = new Date()

  const { data: businesses, error: bizErr } = await supabase
    .from('businesses')
    .select('id, name, reminder_hours, reminder_template, slot_duration')

  if (bizErr) {
    console.error('Error fetching businesses:', bizErr)
    return new Response(JSON.stringify({ error: bizErr.message }), { status: 500 })
  }

  const results = []

  for (const biz of businesses ?? []) {
    const windowStart = new Date(now.getTime() + (biz.reminder_hours || 24) * 60 * 60 * 1000)
    const windowEnd = new Date(windowStart.getTime() + 30 * 60 * 1000)

    const targetDate = windowStart.toISOString().split('T')[0]
    const targetTimeStart = windowStart.toTimeString().slice(0, 5)
    const targetTimeEnd = windowEnd.toTimeString().slice(0, 5)

    const { data: appointments, error: apptErr } = await supabase
      .from('appointments')
      .select('id, client_name, client_phone, appointment_time, services(name)')
      .eq('business_id', biz.id)
      .eq('status', 'confirmed')
      .eq('reminder_sent', false)
      .eq('appointment_date', targetDate)
      .gte('appointment_time', targetTimeStart)
      .lt('appointment_time', targetTimeEnd)

    if (apptErr) {
      console.error(`Error fetching appointments for ${biz.id}:`, apptErr)
      continue
    }

    for (const appt of appointments ?? []) {
      const timeFormatted = appt.appointment_time?.slice(0, 5) || ''
      const message = buildMessage(biz.reminder_template || 'مرحباً {client_name}، تذكير بموعدك الساعة {time} في {business_name}', {
        client_name: appt.client_name,
        service: (appt.services as any)?.name || 'الخدمة',
        time: timeFormatted,
        business_name: biz.name,
      })

      try {
        const ok = await sendViaTwilio(appt.client_phone, message)

        if (ok) {
          await supabase
            .from('appointments')
            .update({ reminder_sent: true })
            .eq('id', appt.id)
          results.push({ id: appt.id, status: 'sent' })
        } else {
          results.push({ id: appt.id, status: 'failed' })
        }
      } catch (e) {
        results.push({ id: appt.id, status: 'error', error: String(e) })
      }
    }
  }

  console.log(`Processed ${results.length} reminders`)
  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
