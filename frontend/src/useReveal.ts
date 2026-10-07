import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Fade sections up as they are scrolled to.
 *
 * Driven by IntersectionObserver and applied from JS, so the `.reveal` class is
 * only ever added to elements that will also get `.shown` - nothing can end up
 * permanently invisible because a script failed.
 */
export function useReveal() {
  const { pathname } = useLocation()

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const targets = Array.from(
      document.querySelectorAll<HTMLElement>('main .section, main .detail, main .related, main .auth-card'),
    )

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('shown')
            observer.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.04 },
    )

    for (const el of targets) {
      // Anything already on screen at load shows immediately; only what is
      // below the fold animates in.
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
        el.classList.add('reveal', 'shown')
      } else {
        el.classList.add('reveal')
        observer.observe(el)
      }
    }

    return () => observer.disconnect()
  }, [pathname])
}
