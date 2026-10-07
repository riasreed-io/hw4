import { useEffect, useState } from 'react'
import ProductCard from './ProductCard'
import { fetchRecentViews, type ChatProduct } from '../api'
import { useAuth } from '../AuthContext'

/**
 * "Pick up where you left off" for signed-in shoppers.
 *
 * Only reads their own `product_views` rows. Guests see nothing here - their
 * browsing never reaches the server, so there is nothing to show them.
 */
export default function RecentlyViewed() {
  const { user } = useAuth()
  const [products, setProducts] = useState<ChatProduct[]>([])

  useEffect(() => {
    if (!user) {
      setProducts([])
      return
    }
    let cancelled = false
    fetchRecentViews()
      .then((d) => !cancelled && setProducts(d.products))
      .catch(() => !cancelled && setProducts([]))
    return () => {
      cancelled = true
    }
  }, [user])

  if (!user || products.length === 0) return null

  return (
    <section className="section">
      <div className="wrap">
        <div className="section-head">
          <h2>Pick up where you left off</h2>
          <p>
            Products you looked at recently, {user.first_name ?? user.name}. Prices and stock are
            current.
          </p>
        </div>
        <div className="grid">
          {products.slice(0, 4).map((p) => (
            <ProductCard key={p.product_id} product={p} />
          ))}
        </div>
      </div>
    </section>
  )
}
