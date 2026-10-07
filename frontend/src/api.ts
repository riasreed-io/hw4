// Everything the site knows about a product comes from the FastAPI backend,
// which reads campus_customs.db. Nothing here is hard-coded.

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

export type Product = {
  product_id: string
  name: string
  garment_type: string
  category: string
  description: string
  colors: string[]
  search_tags: string[]
  image_file_path: string
  image_url: string
  price: number
  total_stock?: number
}

// The fields a product card actually renders. Both Product (from the catalogue
// endpoints) and ChatProduct (from the chat endpoint) satisfy this, so the same
// card component handles both and clicking one always behaves the same way.
export type CardProduct = {
  product_id: string
  name: string
  description: string
  price: number
  image_url: string
  total_stock?: number
}

export type SizeStock = { size: string; quantity: number }

export type ProductDetail = Product & { sizes: SizeStock[]; total_stock: number }

export type Category = { name: string; count: number }

export type Facet = { name: string; count: number }
export type PriceBand = { id: string; name: string; count: number }

export type Facets = {
  categories: Facet[]
  collections: Facet[]
  colors: Facet[]
  sizes: Facet[]
  price_bands: PriceBand[]
  total: number
}

export type ProductFilters = {
  category?: string
  collection?: string
  color?: string
  size?: string
  price_band?: string
  in_stock?: boolean
  q?: string
}

export const imageUrl = (path: string) => `${API_BASE}${path}`

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export function fetchProducts(opts: ProductFilters & { limit?: number } = {}) {
  const params = new URLSearchParams()
  const add = (k: string, v?: string) => {
    if (v && v !== 'All') params.set(k, v)
  }
  add('category', opts.category)
  add('collection', opts.collection)
  add('color', opts.color)
  add('size', opts.size)
  add('price_band', opts.price_band)
  if (opts.q) params.set('q', opts.q)
  if (opts.in_stock) params.set('in_stock', 'true')
  if (opts.limit) params.set('limit', String(opts.limit))
  const qs = params.toString()
  return get<{ count: number; products: Product[] }>(`/api/products${qs ? `?${qs}` : ''}`)
}

export const fetchFacets = () => get<Facets>('/api/facets')

export const fetchRelated = (id: string) =>
  get<{ products: Product[] }>(`/api/products/${id}/related`)

export const fetchProduct = (id: string) => get<ProductDetail>(`/api/products/${id}`)

export const fetchCategories = () => get<Category[]>('/api/categories')

export const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })


// ---------------------------------------------------------------- accounts

export type User = {
  id: number
  name: string
  email: string
  first_name: string | null
  last_name: string | null
  created_at: string
}

// The backend answers with { message, field } so a failure can be shown next to
// the input that caused it instead of as one vague banner.
export class ApiError extends Error {
  field?: string
  constructor(message: string, field?: string) {
    super(message)
    this.field = field
  }
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // The session cookie is HttpOnly, so it has to ride along on the request
    // rather than being read out of JS and attached by hand.
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* empty body */
  }

  if (!res.ok) {
    const detail = data?.detail
    if (detail && typeof detail === 'object') throw new ApiError(detail.message, detail.field)
    throw new ApiError(typeof detail === 'string' ? detail : 'Something went wrong. Try again.')
  }
  return data as T
}

export type SignupInput = {
  first_name: string
  last_name: string
  email: string
  password: string
  confirm_password: string
}

export const signup = (input: SignupInput) => post<{ user: User }>('/api/auth/signup', input)

export const login = (email: string, password: string) =>
  post<{ user: User }>('/api/auth/login', { email, password })

export const logout = () => post<{ ok: boolean }>('/api/auth/logout')

export const fetchMe = () => get<{ user: User | null }>('/api/auth/me')


// ------------------------------------------------------------------- chat

export type ChatProduct = {
  product_id: string
  name: string
  category: string
  description: string
  colors: string[]
  price: number
  image_url: string
  total_stock: number
}

export type ChatTurn = { role: 'user' | 'assistant'; content: string; products?: ChatProduct[] }

/** Where the shopper is standing, so "do you have this in pink?" has a referent. */
export type PageContext = {
  path: string
  product_id?: string | null
  category?: string | null
  search_query?: string | null
}

export type ChatResponse = {
  reply: string
  products: ChatProduct[]
  match_label: string
  persisted: boolean
}

export const sendChat = (
  message: string,
  history: { role: string; content: string }[],
  page: PageContext,
  guestRecentIds: string[] = [],
) =>
  post<ChatResponse>('/api/chat', {
    message,
    // Signed-in shoppers get history from the database and this is ignored.
    // Logged-out ones have nowhere to persist it, so the browser sends it back.
    history: history.slice(-10),
    page,
    guest_recent_ids: guestRecentIds.slice(0, 12),
  })

export const fetchChatHistory = () => get<{ messages: ChatTurn[] }>('/api/chat/history')

// ------------------------------------------------- recently viewed + opener

export const recordView = (productId: string) =>
  post<{ recorded: boolean }>(`/api/views/${encodeURIComponent(productId)}`)

export const fetchRecentViews = () => get<{ products: ChatProduct[] }>('/api/views/recent')

// ----------------------------------------------------------- privacy

export type Preferences = { signed_in: boolean; track_views: boolean; store_chat: boolean }

export const fetchPreferences = () => get<Preferences>('/api/preferences')

export async function savePreferences(next: Partial<Omit<Preferences, 'signed_in'>>) {
  const res = await fetch(`${API_BASE}/api/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(next),
  })
  if (!res.ok) throw new ApiError('Could not save that. Try again.')
  return (await res.json()) as Preferences
}

export const forgetMe = () =>
  post<{ views_deleted: number; messages_deleted: number }>('/api/preferences/forget')

export const fetchOpener = (page: PageContext, guestRecentIds: string[]) =>
  post<{ greeting: string; products: ChatProduct[]; match_label: string }>('/api/chat/opener', {
    page,
    guest_recent_ids: guestRecentIds.slice(0, 12),
  })
