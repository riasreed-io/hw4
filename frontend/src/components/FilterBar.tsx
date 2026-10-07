import type { Facets, ProductFilters } from '../api'

type Group = {
  key: keyof ProductFilters
  label: string
  options: { value: string; label: string; count: number }[]
}

export default function FilterBar({
  facets,
  filters,
  resultCount,
  onChange,
  onClear,
}: {
  facets: Facets | null
  filters: ProductFilters
  resultCount: number | null
  onChange: (next: Partial<ProductFilters>) => void
  onClear: () => void
}) {
  if (!facets) return null

  const groups: Group[] = [
    {
      key: 'category',
      label: 'Garment',
      options: facets.categories.map((c) => ({ value: c.name, label: c.name, count: c.count })),
    },
    {
      key: 'collection',
      label: 'Collection',
      options: facets.collections.map((c) => ({ value: c.name, label: c.name, count: c.count })),
    },
    {
      key: 'size',
      label: 'Size',
      options: facets.sizes.map((s) => ({ value: s.name, label: s.name, count: s.count })),
    },
    {
      key: 'color',
      label: 'Colour',
      options: facets.colors.map((c) => ({ value: c.name, label: c.name, count: c.count })),
    },
    {
      key: 'price_band',
      label: 'Price',
      options: facets.price_bands.map((b) => ({ value: b.id, label: b.name, count: b.count })),
    },
  ]

  // Chips the shopper can remove one at a time, so narrowing too far is a
  // single click to undo rather than a hunt back through five rows.
  const active: { key: keyof ProductFilters; label: string }[] = []
  for (const g of groups) {
    const v = filters[g.key]
    if (typeof v === 'string' && v) {
      const opt = g.options.find((o) => o.value === v)
      active.push({ key: g.key, label: `${g.label}: ${opt?.label ?? v}` })
    }
  }
  if (filters.in_stock) active.push({ key: 'in_stock', label: 'In stock only' })
  if (filters.q) active.push({ key: 'q', label: `Search: ${filters.q}` })

  return (
    <div className="filters-panel">
      {groups.map((g) => (
        <div className="filter-row" key={String(g.key)}>
          <span className="filter-label">{g.label}</span>
          <div className="filter-chips">
            <button
              className={`chip sm ${!filters[g.key] ? 'on' : ''}`}
              onClick={() => onChange({ [g.key]: undefined } as Partial<ProductFilters>)}
            >
              All
            </button>
            {g.options.map((o) => (
              <button
                key={o.value}
                className={`chip sm ${filters[g.key] === o.value ? 'on' : ''}`}
                onClick={() =>
                  onChange({
                    [g.key]: filters[g.key] === o.value ? undefined : o.value,
                  } as Partial<ProductFilters>)
                }
              >
                {o.label} <span className="chip-count">{o.count}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="filter-row">
        <span className="filter-label">Stock</span>
        <div className="filter-chips">
          <label className="stock-toggle">
            <input
              type="checkbox"
              checked={!!filters.in_stock}
              onChange={(e) => onChange({ in_stock: e.target.checked || undefined })}
            />
            In stock only
          </label>
        </div>
      </div>

      {active.length > 0 && (
        <div className="filter-active">
          <span className="filter-count">
            {resultCount === null ? '...' : resultCount}{' '}
            {resultCount === 1 ? 'product' : 'products'}
          </span>
          {active.map((a) => (
            <button
              key={String(a.key)}
              className="pill"
              onClick={() => onChange({ [a.key]: undefined } as Partial<ProductFilters>)}
              aria-label={`Remove filter ${a.label}`}
            >
              {a.label} <span aria-hidden="true">&times;</span>
            </button>
          ))}
          <button className="linklike" onClick={onClear}>
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
