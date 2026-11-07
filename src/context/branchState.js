import { createContext, useContext } from 'react'

// Kept apart from BranchProvider so that file exports only a component, which
// is what lets Vite hot-reload it.
export const BranchContext = createContext(null)

// Sentinel for "show all branches together" — id is null on purpose, since
// every appointment query already treats a null branchId as "no filter".
export const ALL_BRANCHES = { id: null, name: 'كل الفروع', isAll: true }

export function useBranch() {
  return useContext(BranchContext)
}
