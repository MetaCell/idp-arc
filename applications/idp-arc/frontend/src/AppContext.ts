import { createContext, useContext } from 'react'
import type { AuthState } from './core/types'

export type AppContextValue = {
  authState: AuthState
  tokenParsed: Record<string, unknown> | null
  authError: string | null
  username: string
}

export const AppContext = createContext<AppContextValue>({
  authState: 'loading',
  tokenParsed: null,
  authError: null,
  username: 'Unknown user',
})

export function useAppContext(): AppContextValue {
  return useContext(AppContext)
}
