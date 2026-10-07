import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ProductCard from '../components/ProductCard'
import RecentlyViewed from '../components/RecentlyViewed'
import Tracery from '../components/Tracery'
import { fetchCategories, fetchProducts, type Category, type Product } from '../api'

export default function Home() {
  const [featured, setFeatured] = useState<Product[]>([])
  const [cats, setCats] = useState<Category[]>([])

  useEffect(() => {
    fetchProducts({ limit: 4 }).then((d) => setFeatured(d.products)).catch(() => setFeatured([]))
    fetchCategories().then(setCats).catch(() => setCats([]))
  }, [])

  return (
    <>
      <section className="hero">
        <Tracery />
        <div className="wrap">
          <div className="hero-rule" />
          <h1>
            Yale gear, printed a block from <em>Old Campus</em>.
          </h1>
          <p>
            We have been outfitting Yale students, families and alumni from 57 Broadway since
            1975. Every shirt, crewneck and quarter-zip on this site is officially licensed, and
            most of it is printed in the shop behind the store.
          </p>
          <div className="hero-actions">
            <Link to="/products" className="btn btn-primary">
              Shop the catalogue
            </Link>
            <Link to="/about" className="btn btn-outline">
              Our story
            </Link>
          </div>
        </div>
      </section>

      <RecentlyViewed />

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <h2>Shop by category</h2>
            <p>
              Six categories, {cats.reduce((n, c) => n + c.count, 0) || 102} products. Sizes run
              XS through XXL, and we tell you what is actually on the shelf.
            </p>
          </div>
          <div className="cat-grid">
            {cats.map((c) => (
              <Link key={c.name} to={`/products?category=${encodeURIComponent(c.name)}`} className="cat-tile">
                <b>{c.name}</b>
                <span>{c.count} products</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section soft">
        <div className="wrap">
          <div className="section-head">
            <h2>New in the shop</h2>
            <p>A few things worth a look. The whole catalogue is one click away.</p>
          </div>
          <div className="grid">
            {featured.map((p) => (
              <ProductCard key={p.product_id} product={p} />
            ))}
          </div>
          <p style={{ marginTop: 28 }}>
            <Link to="/products" className="btn btn-navy" style={{ width: 'auto', display: 'inline-block' }}>
              See all products
            </Link>
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <h2>Not sure what you want?</h2>
            <p>
              Open the chat in the corner and describe it. Our assistant reads the same catalogue
              and the same stock counts we do, so if it says your size is gone, your size is gone.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
