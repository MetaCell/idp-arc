import { useSyncExternalStore } from 'react'

type Update<T> = T | ((previous: T) => T)

/**
 * State kept outside a component, so it outlives the component being closed or unmounted (a
 * page change remounts it); useSessionStore reads and updates it like useState.
 */
export function createSessionStore<T>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(update: Update<T>) {
      state = typeof update === 'function' ? (update as (previous: T) => T)(state) : update
      listeners.forEach((listener) => listener())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

export type SessionStore<T> = ReturnType<typeof createSessionStore<T>>

export function useSessionStore<T>(store: SessionStore<T>): [T, SessionStore<T>['set']] {
  return [useSyncExternalStore(store.subscribe, store.get), store.set]
}
