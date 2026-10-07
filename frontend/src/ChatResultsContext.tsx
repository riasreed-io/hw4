import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { ChatProduct } from './api'

type ChatResults = {
  products: ChatProduct[]
  label: string
  /** Bumped on every new set, so the band can scroll itself into view again. */
  version: number
  show: (products: ChatProduct[], label: string) => void
  clear: () => void
}

const Ctx = createContext<ChatResults | null>(null)

export function ChatResultsProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<ChatProduct[]>([])
  const [label, setLabel] = useState('')
  const [version, setVersion] = useState(0)

  const show = useCallback((next: ChatProduct[], nextLabel: string) => {
    // An answer with no products is not a reason to wipe the row the shopper is
    // still looking at - "how much is the second one" should leave it alone.
    if (next.length === 0) return
    setProducts(next)
    setLabel(nextLabel || 'From your chat')
    setVersion((v) => v + 1)
  }, [])

  const clear = useCallback(() => {
    setProducts([])
    setLabel('')
  }, [])

  const value = useMemo(
    () => ({ products, label, version, show, clear }),
    [products, label, version, show, clear],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useChatResults() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useChatResults must be used inside ChatResultsProvider')
  return ctx
}
