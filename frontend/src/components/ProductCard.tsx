import { Link } from 'react-router-dom'
import { imageUrl, money, type CardProduct } from '../api'

function stockTag(total?: number) {
  if (total === undefined) return null
  if (total === 0) return <span className="tag out">Sold out</span>
  if (total <= 12) return <span className="tag low">Only {total} left</span>
  return <span className="tag">{total} in stock</span>
}

export default function ProductCard({ product }: { product: CardProduct }) {
  return (
    <Link to={`/products/${product.product_id}`} className="card">
      <div className="card-img">
        <img src={imageUrl(product.image_url)} alt={product.name} loading="lazy" />
      </div>
      <div className="card-body">
        <h3>{product.name}</h3>
        <p className="card-desc">{product.description}</p>
        <div className="card-foot">
          <span className="price">{money(product.price)}</span>
          {stockTag(product.total_stock)}
        </div>
      </div>
    </Link>
  )
}
