import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useBusiness } from '../hooks/useBusiness'
import { BranchContext, ALL_BRANCHES } from './branchState'

const STORAGE_KEY = 'beshola_branch_id'

function readStoredBranch() {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

export function BranchProvider({ children }) {
  const { data: business } = useBusiness()
  // Only the chosen id is state; the branch itself is looked up from the list,
  // so a renamed or edited branch shows its new data without a reload.
  const [selectedId, setSelectedId] = useState(readStoredBranch)

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('business_id', business.id)
        .order('is_main', { ascending: false })
        .order('created_at')
      if (error) throw error
      return data
    },
    enabled: !!business?.id,
  })

  const currentBranch = useMemo(() => {
    if (!branches.length) return null
    if (selectedId === 'all') return ALL_BRANCHES
    return branches.find(b => b.id === selectedId) || branches.find(b => b.is_main) || branches[0]
  }, [branches, selectedId])

  function setCurrentBranch(branch) {
    const id = branch.id || 'all'
    setSelectedId(id)
    try { localStorage.setItem(STORAGE_KEY, id) } catch { /* private mode: choice lasts this visit */ }
  }

  const isMultiBranch = branches.length > 1

  return (
    <BranchContext.Provider value={{ currentBranch, setCurrentBranch, branches, isMultiBranch }}>
      {children}
    </BranchContext.Provider>
  )
}
