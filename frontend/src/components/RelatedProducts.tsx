import { useEffect, useState } from 'react'
import ProductCard from './ProductCard'
import { fetchRelated, type Product } from '../api'

/**
 * "More like this" under a product.
 *
 * The shopper who needs this most is the one whose size just came up empty, so
 * the backend ranks in-stock products first - an alternative they also cannot
 * buy is no help.
 */
export default function RelatedProducts({ productId }: { productId: string }) {
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    let cancelled = false
    setProducts([])
    fetchRelated(productId)
      .then((d) => !cancelled && setProducts(d.products))
      .catch(() => !cancelled && setProducts([]))
    return () => {
      cancelled = true
    }
  }, [productId])

  if (products.length === 0) return null

  return (
    <section className="related">
      <h2>More like this</h2>
      <div className="grid">
        {products.map((p) => (
          <ProductCard key={p.product_id} product={p} />
        ))}
      </div>
    </section>
  )
}
