import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function usePatientRecord(businessId, clientPhone) {
  return useQuery({
    queryKey: ['patient-record', businessId, clientPhone],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patient_records')
        .select('*')
        .eq('business_id', businessId)
        .eq('client_phone', clientPhone)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!businessId && !!clientPhone,
  })
}

export function useUpsertPatientRecord(businessId, clientPhone) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates) => {
      const { data, error } = await supabase
        .from('patient_records')
        .upsert({
          business_id: businessId,
          client_phone: clientPhone,
          ...updates,
        }, { onConflict: 'business_id,client_phone' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient-record', businessId, clientPhone] })
    },
  })
}

export function useDiagnoses(businessId, clientPhone) {
  return useQuery({
    queryKey: ['diagnoses', businessId, clientPhone],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('diagnoses')
        .select('*, appointments(appointment_date, appointment_time, services(name))')
        .eq('business_id', businessId)
        .eq('client_phone', clientPhone)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!businessId && !!clientPhone,
  })
}

export function useAddDiagnosis(businessId, clientPhone) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ appointmentId, diagnosis, treatment, notes, follow_up_date }) => {
      const { data, error } = await supabase
        .from('diagnoses')
        .insert({
          business_id: businessId,
          client_phone: clientPhone,
          appointment_id: appointmentId || null,
          diagnosis,
          treatment: treatment || null,
          notes: notes || null,
          follow_up_date: follow_up_date || null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['diagnoses', businessId, clientPhone] }),
  })
}

export function useUpdateDiagnosis(businessId, clientPhone) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }) => {
      const { data, error } = await supabase
        .from('diagnoses')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['diagnoses', businessId, clientPhone] }),
  })
}

export function usePrescriptions(businessId, clientPhone) {
  return useQuery({
    queryKey: ['prescriptions', businessId, clientPhone],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prescriptions')
        .select('*, appointments(appointment_date, services(name))')
        .eq('business_id', businessId)
        .eq('client_phone', clientPhone)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!businessId && !!clientPhone,
  })
}

export function useAddPrescription(businessId, clientPhone) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ appointmentId, medications, instructions }) => {
      const { data, error } = await supabase
        .from('prescriptions')
        .insert({
          business_id: businessId,
          client_phone: clientPhone,
          appointment_id: appointmentId || null,
          medications,
          instructions: instructions || null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prescriptions', businessId, clientPhone] }),
  })
}

// medical-files is a private bucket — public URLs no longer work, so every
// view gets a freshly minted signed URL with a short expiry instead.
const SIGNED_URL_TTL_SECONDS = 300

async function getAttachmentSignedUrl(path) {
  const { data, error } = await supabase.storage
    .from('medical-files')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) throw error
  return data.signedUrl
}

export function useAttachments(businessId, clientPhone) {
  return useQuery({
    queryKey: ['medical-attachments', businessId, clientPhone],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('medical_attachments')
        .select('*')
        .eq('business_id', businessId)
        .eq('client_phone', clientPhone)
        .order('uploaded_at', { ascending: false })
      if (error) throw error

      const withSignedUrls = await Promise.all(
        data.map(async att => {
          if (!att.file_path) return { ...att, signed_url: null }
          try {
            return { ...att, signed_url: await getAttachmentSignedUrl(att.file_path) }
          } catch {
            return { ...att, signed_url: null }
          }
        })
      )
      return withSignedUrls
    },
    enabled: !!businessId && !!clientPhone,
  })
}

export function useUploadAttachment(businessId, clientPhone) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, fileType, notes, appointmentId }) => {
      const ext = file.name.split('.').pop()
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const path = `${businessId}/${clientPhone}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('medical-files')
        .upload(path, file)
      if (uploadError) throw uploadError

      const { data, error } = await supabase
        .from('medical_attachments')
        .insert({
          business_id: businessId,
          client_phone: clientPhone,
          appointment_id: appointmentId || null,
          file_name: file.name,
          file_url: path,
          file_path: path,
          file_type: fileType,
          file_size: file.size,
          notes: notes || null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['medical-attachments', businessId, clientPhone] }),
  })
}

export function useDeleteAttachment(businessId, clientPhone) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, filePath }) => {
      if (filePath) {
        await supabase.storage.from('medical-files').remove([filePath])
      }
      const { error } = await supabase.from('medical_attachments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['medical-attachments', businessId, clientPhone] }),
  })
}

export function usePatientVisits(businessId, clientPhone) {
  return useQuery({
    queryKey: ['patient-visits', businessId, clientPhone],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, services(name)')
        .eq('business_id', businessId)
        .eq('client_phone', clientPhone)
        .order('appointment_date', { ascending: false })
        .order('appointment_time', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!businessId && !!clientPhone,
  })
}
