import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ProductCard from '../components/ProductCard'
import FilterBar from '../components/FilterBar'
import { fetchFacets, fetchProducts, type Facets, type Product, type ProductFilters } from '../api'

const FILTER_KEYS = ['category', 'collection', 'color', 'size', 'price_band', 'q'] as const

// The whole filter state lives in the URL, so a narrowed grid can be shared,
// bookmarked, and walked back with the browser's own back button.
function readFilters(params: URLSearchParams): ProductFilters {
  const out: ProductFilters = {}
  for (const k of FILTER_KEYS) {
    const v = params.get(k)
    if (v) out[k] = v
  }
  if (params.get('in_stock') === 'true') out.in_stock = true
  return out
}

export default function Products() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)

  const [draft, setDraft] = useState(filters.q ?? '')
  const [facets, setFacets] = useState<Facets | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchFacets().then(setFacets).catch(() => setFacets(null))
  }, [])

  useEffect(() => {
    setDraft(filters.q ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q])

  const key = params.toString()
  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchProducts(readFilters(new URLSearchParams(key)))
      .then((d) => setProducts(d.products))
      .catch(() => setError('Could not reach the catalogue. Is the API running on port 8000?'))
      .finally(() => setLoading(false))
  }, [key])

  function update(next: Partial<ProductFilters>) {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === '' || v === false) p.delete(k)
      else p.set(k, String(v))
    }
    setParams(p)
  }

  const clearAll = () => setParams(new URLSearchParams())

  return (
    <section className="section">
      <div className="wrap">
        <div className="section-head">
          <h2>Products</h2>
          <p>
            Everything we carry, straight from the store catalogue. Narrow by garment,
            collection, size, colour or price - sizes show what is actually on the shelf.
          </p>
        </div>

        <form
          className="search-row"
          onSubmit={(e) => {
            e.preventDefault()
            update({ q: draft.trim() || undefined })
          }}
        >
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search navy, crest, The Game, Handsome Dan..."
            aria-label="Search products"
          />
          <button className="chip" type="submit">
            Search
          </button>
        </form>

        <FilterBar
          facets={facets}
          filters={filters}
          resultCount={loading ? null : products.length}
          onChange={update}
          onClear={clearAll}
        />

        {loading && (
          <div className="grid" aria-busy="true" aria-label="Loading products">
            {Array.from({ length: 8 }).map((_, i) => (
              <div className="card skeleton" key={i}>
                <div className="card-img" />
                <div className="card-body">
                  <span className="sk-line" style={{ width: '72%' }} />
                  <span className="sk-line" style={{ width: '94%' }} />
                  <span className="sk-line" style={{ width: '40%' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="state">
            <b>Catalogue unavailable</b>
            {error}
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <div className="state">
            <b>Nothing matched those filters</b>
            Nothing in the catalogue fits every filter at once. Try removing one - the size
            and in-stock filters are the most likely culprits.
            <div style={{ marginTop: 16 }}>
              <button className="chip" onClick={clearAll}>
                Clear all filters
              </button>
            </div>
          </div>
        )}

        {!loading && !error && products.length > 0 && (
          <div className="grid">
            {products.map((p) => (
              <ProductCard key={p.product_id} product={p} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
