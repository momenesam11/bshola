import { createContext, useContext, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useBusiness } from '../hooks/useBusiness'

const BranchContext = createContext(null)

// Sentinel for "show all branches together" — id is null on purpose, since
// every appointment query already treats a null branchId as "no filter".
export const ALL_BRANCHES = { id: null, name: 'كل الفروع', isAll: true }

export function useBranch() {
  return useContext(BranchContext)
}

export function BranchProvider({ children }) {
  const { data: business } = useBusiness()
  const [currentBranch, setCurrentBranchState] = useState(null)

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

  useEffect(() => {
    if (!branches.length) return
    const stored = localStorage.getItem('beshola_branch_id')
    if (stored === 'all') { setCurrentBranchState(ALL_BRANCHES); return }
    const found = stored ? branches.find(b => b.id === stored) : null
    setCurrentBranchState(found || branches.find(b => b.is_main) || branches[0])
  }, [branches])

  function setCurrentBranch(branch) {
    setCurrentBranchState(branch)
    localStorage.setItem('beshola_branch_id', branch.id || 'all')
  }

  const isMultiBranch = branches.length > 1

  return (
    <BranchContext.Provider value={{ currentBranch, setCurrentBranch, branches, isMultiBranch }}>
      {children}
    </BranchContext.Provider>
  )
}
