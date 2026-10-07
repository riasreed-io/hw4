import { useLocation } from 'react-router-dom'
import type { PageContext } from './api'

/**
 * Describe the page the shopper is on, for the chat agent.
 *
 * Read from the router rather than tracked separately, so it cannot drift out
 * of sync with what is actually on screen. The backend re-checks any product id
 * against the catalogue before telling the agent about it.
 */
export function usePageContext(): PageContext {
  const { pathname, search } = useLocation()
  const params = new URLSearchParams(search)

  const productMatch = pathname.match(/^\/products\/(.+)$/)

  return {
    path: pathname,
    product_id: productMatch ? decodeURIComponent(productMatch[1]) : null,
    category: pathname === '/products' ? params.get('category') : null,
    search_query: pathname === '/products' ? params.get('q') : null,
  }
}
