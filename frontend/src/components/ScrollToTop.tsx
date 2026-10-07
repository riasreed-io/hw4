import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Put every navigation at the top of the page content.
 *
 * Without this, clicking a product card from halfway down the grid lands you
 * halfway down the product page. And once the chat has put a row of cards above
 * the content, "the top of the page" is no longer where the shopper wants to be
 * - clicking a card should show that product, not the row it came from. So this
 * targets <main>, and leaves the chat row one scroll away above it.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    const main = document.querySelector('main')
    const band = document.querySelector('.chat-band')
    if (main && band) {
      const navHeight = document.querySelector('.nav')?.getBoundingClientRect().height ?? 0
      window.scrollTo({ top: main.offsetTop - navHeight, behavior: 'auto' })
    } else {
      window.scrollTo(0, 0)
    }
  }, [pathname])

  return null
}
