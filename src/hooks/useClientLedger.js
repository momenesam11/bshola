import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Oldest-first, each entry annotated with the running balance after it —
// reads like a real bank statement.
export function useClientLedger(businessId, clientPhone) {
  return useQuery({
    queryKey: ['client-ledger', businessId, clientPhone],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_ledger_entries')
        .select('*')
        .eq('business_id', businessId)
        .eq('client_phone', clientPhone)
        .order('created_at', { ascending: true })
      if (error) throw error

      // Amounts are numeric in the database and may arrive as text; adding text
      // would concatenate. Rounded to piasters so 0.1 + 0.2 shows as 0.3.
      let balance = 0
      const entries = data.map(entry => {
        const amount = Number(entry.amount)
        balance = Math.round((balance + (entry.entry_type === 'charge' ? amount : -amount)) * 100) / 100
        return { ...entry, amount, balanceAfter: balance }
      })
      return { entries, balance }
    },
    enabled: !!businessId && !!clientPhone,
  })
}

export function useAddLedgerPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ businessId, clientPhone, amount, method, note }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('client_ledger_entries').insert({
        business_id: businessId, client_phone: clientPhone, entry_type: 'payment',
        amount, payment_method: method, description: note || `دفعة - ${PAYMENT_METHOD_LABELS[method] || method}`,
        created_by: user?.id || null,
      })
      if (error) throw error
    },
    onSuccess: (_, { businessId, clientPhone }) =>
      qc.invalidateQueries({ queryKey: ['client-ledger', businessId, clientPhone] }),
  })
}

export function useAddLedgerCharge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ businessId, clientPhone, amount, description }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('client_ledger_entries').insert({
        business_id: businessId, client_phone: clientPhone, entry_type: 'charge',
        amount, description, created_by: user?.id || null,
      })
      if (error) throw error
    },
    onSuccess: (_, { businessId, clientPhone }) =>
      qc.invalidateQueries({ queryKey: ['client-ledger', businessId, clientPhone] }),
  })
}

export const PAYMENT_METHOD_LABELS = {
  cash: 'كاش',
  card: 'فيزا',
  installment: 'تقسيط',
  other: 'أخرى',
}
