'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

const TickContext = createContext(0)

export function TickProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return <TickContext.Provider value={tick}>{children}</TickContext.Provider>
}

export function useTick(): number {
  return useContext(TickContext)
}
