import { createContext, useContext } from 'react'

// { user, theme, setTheme, lang, setLang, stats, statsState, refreshStats,
//   counts, refreshCounts, isAdmin, practice, setPractice, mode,
//   hasCourse, refreshHasCourse, openProfile }  — mode: 'student' | 'teacher'
export const AppContext = createContext(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppContext.Provider>')
  return ctx
}
