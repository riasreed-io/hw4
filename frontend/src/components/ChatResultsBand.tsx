import { useEffect, useRef } from 'react'
import ProductCard from './ProductCard'
import { useChatResults } from '../ChatResultsContext'

/**
 * The row of product cards the chat puts on the page.
 *
 * It renders the same ProductCard the Products grid uses, so a card the chat
 * created opens the same single-product page as a card the shopper found by
 * browsing - not a lookalike that happens to behave the same today.
 */
export default function ChatResultsBand() {
  const { products, label, version, clear } = useChatResults()
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (products.length > 0) {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [version, products.length])

  if (products.length === 0) return null

  return (
    <section className="chat-band" ref={ref} aria-label="Products from your chat">
      <div className="wrap">
        <div className="chat-band-head">
          <div>
            <span className="chat-band-tag">From the chat</span>
            <h2>{label}</h2>
          </div>
          <button className="chip" onClick={clear}>
            Clear
          </button>
        </div>
        <div className="grid">
          {products.map((p) => (
            <ProductCard key={p.product_id} product={p} />
          ))}
        </div>
      </div>
    </section>
  )
}
