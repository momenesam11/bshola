import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  HiOutlinePlus,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineCheck,
  HiOutlineXMark,
  HiOutlineBuildingOffice2,
} from 'react-icons/hi2'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useBusiness } from '../../hooks/useBusiness'
import { MEDICAL_TYPES } from '../../utils/constants'
import PageWrapper from '../../components/layout/PageWrapper'
import Button from '../../components/ui/Button'
import ScheduleBlockEditor from '../../components/ui/ScheduleBlockEditor'

function useBranches(businessId) {
  return useQuery({
    queryKey: ['branches', businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('business_id', businessId)
        .order('is_main', { ascending: false })
        .order('created_at')
      if (error) throw error
      return data
    },
    enabled: !!businessId,
  })
}

function BranchBadge({ isMain }) {
  if (!isMain) return null
  return (
    <span className="px-2 py-0.5 bg-accent-100 text-accent-700 text-xs rounded-full font-medium">
      رئيسي
    </span>
  )
}

function BranchRow({ branch, onEdit, onDelete, canDelete }) {
  return (
    <div className="flex items-start gap-4 p-4 bg-white rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
      <div className="w-10 h-10 bg-accent-50 rounded-xl flex items-center justify-center flex-shrink-0">
        <HiOutlineBuildingOffice2 className="w-5 h-5 text-accent-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-900 text-sm">{branch.name}</span>
          <BranchBadge isMain={branch.is_main} />
        </div>
        {branch.address && (
          <p className="text-xs text-slate-500 mt-0.5 truncate">{branch.address}</p>
        )}
        {branch.phone && (
          <p className="text-xs text-slate-400 mt-0.5 dir-ltr">{branch.phone}</p>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onEdit(branch)}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <HiOutlinePencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => canDelete && onDelete(branch)}
          disabled={!canDelete}
          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <HiOutlineTrash className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function BranchForm({ branch, onSave, onCancel, saving, isClinic }) {
  const [name, setName] = useState(branch?.name || '')
  const [address, setAddress] = useState(branch?.address || '')
  const [phone, setPhone] = useState(branch?.phone || '')
  const [capacity, setCapacity] = useState(branch?.capacity || 1)
  const [scheduleBlocks, setScheduleBlocks] = useState(branch?.schedule_blocks || {})
  const [isValid, setIsValid] = useState(true)

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      name: name.trim(), address: address.trim(), phone: phone.trim(),
      capacity: isClinic ? 1 : capacity, schedule_blocks: scheduleBlocks,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-slate-50 rounded-xl border border-accent-200 space-y-3" dir="rtl">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">اسم الفرع *</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="مثال: فرع المعادي"
          required
          disabled={branch?.is_main}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 disabled:bg-slate-100 disabled:text-slate-400"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">العنوان</label>
        <input
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="عنوان الفرع"
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">رقم الهاتف</label>
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="رقم الهاتف"
          dir="ltr"
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
        />
      </div>

      {!isClinic && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">كام حجز تقدر تستقبله في نفس الوقت؟</label>
          <input type="number" min={1} max={20} value={capacity} onChange={e => setCapacity(Number(e.target.value) || 1)}
            className="w-24 border border-slate-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent-400" dir="ltr" />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-2">ساعات العمل</label>
        <ScheduleBlockEditor value={scheduleBlocks} onChange={setScheduleBlocks} onValidityChange={setIsValid} />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors min-h-[44px]"
        >
          <HiOutlineXMark className="w-4 h-4" />
          إلغاء
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim() || !isValid}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-accent-500 hover:bg-accent-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 min-h-[44px]"
        >
          <HiOutlineCheck className="w-4 h-4" />
          {saving ? 'جاري الحفظ...' : 'حفظ'}
        </button>
      </div>
    </form>
  )
}

export default function BranchSettings() {
  const { data: business } = useBusiness()
  const qc = useQueryClient()
  const { data: branches = [], isLoading } = useBranches(business?.id)
  const [editingBranch, setEditingBranch] = useState(null)
  const [addingNew, setAddingNew] = useState(false)
  const isClinic = MEDICAL_TYPES.includes(business?.type)

  const upsert = useMutation({
    mutationFn: async ({ id, payload }) => {
      if (id) {
        const { error } = await supabase.from('branches').update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('branches').insert({ ...payload, business_id: business.id })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches', business?.id] })
      setEditingBranch(null)
      setAddingNew(false)
      toast.success('تم الحفظ بنجاح')
    },
    onError: (e) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('branches').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches', business?.id] })
      toast.success('تم حذف الفرع')
    },
    onError: (e) => toast.error(e.message),
  })

  function handleDelete(branch) {
    if (!window.confirm(`هل تريد حذف "${branch.name}"؟`)) return
    remove.mutate(branch.id)
  }

  return (
    <PageWrapper title="إدارة الفروع">
      <Helmet>
        <title>إدارة الفروع — بسهولة</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="max-w-2xl space-y-4" dir="rtl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">الفروع</h2>
            <p className="text-sm text-slate-500 mt-0.5">{branches.length} {branches.length === 1 ? 'فرع' : 'فروع'}</p>
          </div>
          {!addingNew && (
            <Button onClick={() => setAddingNew(true)} size="sm">
              <HiOutlinePlus className="w-4 h-4 ml-1" />
              إضافة فرع جديد
            </Button>
          )}
        </div>

        {addingNew && (
          <BranchForm
            onSave={(payload) => upsert.mutate({ payload })}
            onCancel={() => setAddingNew(false)}
            saving={upsert.isPending}
            isClinic={isClinic}
          />
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : branches.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-100">
            <HiOutlineBuildingOffice2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">لا يوجد فروع بعد</p>
          </div>
        ) : (
          <div className="space-y-3">
            {branches.map(branch => (
              <div key={branch.id}>
                {editingBranch?.id === branch.id ? (
                  <BranchForm
                    branch={editingBranch}
                    onSave={(payload) => upsert.mutate({ id: branch.id, payload })}
                    onCancel={() => setEditingBranch(null)}
                    saving={upsert.isPending}
                    isClinic={isClinic}
                  />
                ) : (
                  <BranchRow
                    branch={branch}
                    onEdit={setEditingBranch}
                    onDelete={handleDelete}
                    canDelete={!branch.is_main && branches.length > 1}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  )
}
