import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchProduct, imageUrl, money, recordView, type ProductDetail as Detail } from '../api'
import RelatedProducts from '../components/RelatedProducts'
import { addGuestView } from '../recentlyViewed'
import { useAuth } from '../AuthContext'

export default function ProductDetail() {
  const { productId = '' } = useParams()
  const { user } = useAuth()
  const [product, setProduct] = useState<Detail | null>(null)
  const [size, setSize] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setSize(null)
    fetchProduct(productId)
      .then((p) => {
        setProduct(p)
        // Remember what they looked at. Signed in, this lands in product_views;
        // as a guest it stays in their own browser and never reaches us.
        addGuestView(p.product_id)
        if (user) recordView(p.product_id).catch(() => {})
      })
      .catch(() => setError('We could not find that product.'))
      .finally(() => setLoading(false))
  }, [productId, user])

  if (loading) return <div className="state">Loading...</div>

  if (error || !product) {
    return (
      <div className="state">
        <b>Product not found</b>
        {error} <Link to="/products" style={{ color: 'var(--navy)', fontWeight: 600 }}>Back to products</Link>
      </div>
    )
  }

  const picked = product.sizes.find((s) => s.size === size)

  return (
    <section className="section">
      <div className="wrap">
        <div className="crumbs">
          <Link to="/products">Products</Link> / <Link to={`/products?category=${encodeURIComponent(product.category)}`}>{product.category}</Link> / {product.name}
        </div>

        <div className="detail">
          <div className="detail-img">
            <img src={imageUrl(product.image_url)} alt={product.name} />
          </div>

          <div>
            <span className="tag">{product.category}</span>
            <h1>{product.name}</h1>
            <div className="price-lg">{money(product.price)}</div>
            <p className="lede">{product.description}</p>

            <div>
              <dl className="kv">
                <dt>Size &amp; stock</dt>
                <dd>
                  <div className="sizes">
                    {product.sizes.map((s) => (
                      <button
                        key={s.size}
                        className={`size-btn ${size === s.size ? 'on' : ''}`}
                        disabled={s.quantity === 0}
                        onClick={() => setSize(s.size)}
                      >
                        <b>{s.size}</b>
                        <small>{s.quantity === 0 ? 'sold out' : `${s.quantity} left`}</small>
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 0' }}>
                    {picked
                      ? picked.quantity <= 3
                        ? `Only ${picked.quantity} left in ${picked.size}.`
                        : `${picked.quantity} in stock in ${picked.size}.`
                      : `${product.total_stock} in stock across all sizes.`}
                  </p>
                </dd>
              </dl>

              <dl className="kv">
                <dt>Colors</dt>
                <dd>
                  {product.colors.length > 0
                    ? product.colors.join(', ')
                    : 'Not listed for this item - ask us in the chat.'}
                </dd>
              </dl>

              <dl className="kv">
                <dt>Garment</dt>
                <dd>{product.garment_type}</dd>
              </dl>

              <dl className="kv">
                <dt>Item code</dt>
                <dd style={{ fontFamily: 'monospace', fontSize: 13.5, color: 'var(--muted)' }}>
                  {product.product_id}
                </dd>
              </dl>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 22, marginTop: 4 }}>
                <button className="btn btn-navy" disabled={!size}>
                  {size ? `Add ${size} to bag` : 'Select a size'}
                </button>
                <p className="note">
                  Checkout is not part of this build. Everything above - price, colors, sizes and
                  stock - is read live from the store database.
                </p>
              </div>
            </div>
          </div>
        </div>

        <RelatedProducts productId={product.product_id} />
      </div>
    </section>
  )
}
