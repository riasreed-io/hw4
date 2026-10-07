import { useEffect, useRef, useState } from 'react'

/**
 * Ivy climbing the margins of the page.
 *
 * Drawn, not loaded: each vine is an SVG path whose stroke is revealed with
 * stroke-dashoffset, and the offset is tied to scroll position. The ivy grows
 * as you read down the page, the way it grows up a wall over years.
 *
 * Purely decorative - aria-hidden, pointer-events: none, and it stands down
 * entirely for anyone who has asked for reduced motion.
 */

// Three-lobed, like real ivy, with a stalk back to the stem.
const LEAF =
  'M0 0 L4 -1 C6 -7 11 -10 13 -6 C15 -10 20 -8 19 -2 C24 -3 26 2 21 5 ' +
  'C23 10 18 13 15 9 C14 15 8 15 8 9 C3 12 -1 8 2 4 Z'

type Vine = { d: string; leaves: { x: number; y: number; r: number; s: number }[] }

// Hand-placed rather than generated: a vine wants a few confident curves and
// leaves clustered at the bends, which random placement does not give you.
const LEFT: Vine = {
  d: 'M30 1000 C 10 900, 46 860, 26 770 C 8 690, 44 640, 24 560 C 6 480, 42 430, 22 350 C 6 280, 38 230, 20 150 C 10 100, 30 60, 22 0',
  leaves: [
    { x: 30, y: 940, r: -24, s: 1 }, { x: 16, y: 880, r: 150, s: 0.8 },
    { x: 38, y: 806, r: -12, s: 1.1 }, { x: 14, y: 742, r: 164, s: 0.9 },
    { x: 36, y: 668, r: -30, s: 1 }, { x: 14, y: 596, r: 158, s: 1.05 },
    { x: 38, y: 520, r: -18, s: 0.85 }, { x: 12, y: 446, r: 172, s: 1 },
    { x: 34, y: 372, r: -26, s: 1.1 }, { x: 12, y: 298, r: 150, s: 0.9 },
    { x: 32, y: 224, r: -14, s: 1 }, { x: 14, y: 152, r: 166, s: 0.95 },
    { x: 30, y: 84, r: -22, s: 0.8 },
  ],
}

const RIGHT: Vine = {
  d: 'M30 1000 C 50 910, 14 866, 34 782 C 52 700, 16 652, 36 568 C 54 486, 18 438, 38 356 C 54 284, 22 234, 40 156 C 50 102, 30 62, 38 0',
  leaves: [
    { x: 30, y: 958, r: 24, s: 0.9 }, { x: 46, y: 892, r: 196, s: 1.05 },
    { x: 22, y: 820, r: 12, s: 1 }, { x: 48, y: 754, r: 186, s: 0.85 },
    { x: 22, y: 682, r: 28, s: 1.1 }, { x: 48, y: 608, r: 200, s: 0.95 },
    { x: 24, y: 532, r: 16, s: 1 }, { x: 50, y: 458, r: 190, s: 1.05 },
    { x: 24, y: 384, r: 26, s: 0.9 }, { x: 50, y: 310, r: 194, s: 1 },
    { x: 26, y: 236, r: 14, s: 1.05 }, { x: 48, y: 164, r: 184, s: 0.9 },
    { x: 30, y: 92, r: 22, s: 0.85 },
  ],
}

function VineSvg({ vine, side, grown }: { vine: Vine; side: 'left' | 'right'; grown: number }) {
  const LENGTH = 1400
  return (
    <svg className={`ivy ivy-${side}`} viewBox="0 0 60 1000" preserveAspectRatio="none" aria-hidden="true">
      <path
        d={vine.d}
        className="ivy-stem"
        strokeDasharray={LENGTH}
        strokeDashoffset={LENGTH * (1 - grown)}
      />
      {vine.leaves.map((leaf, i) => {
        // Each leaf unfurls just after the stem has reached its height.
        const at = 1 - leaf.y / 1000
        const open = Math.max(0, Math.min(1, (grown - at * 0.92) * 7))
        return (
          <g
            key={i}
            transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.r}) scale(${leaf.s * open})`}
            className="ivy-leaf"
            style={{ opacity: open }}
          >
            <path d={LEAF} />
          </g>
        )
      })}
    </svg>
  )
}

export default function Ivy() {
  const [grown, setGrown] = useState(0.42)
  const frame = useRef(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setGrown(1)
      return
    }

    const update = () => {
      frame.current = 0
      const scrollable = document.body.scrollHeight - window.innerHeight
      const progress = scrollable > 40 ? window.scrollY / scrollable : 1
      // Starts well grown so the page is never bare, and finishes early so the
      // ivy has reached the top by the time the footer does.
      setGrown(Math.min(1, 0.42 + progress * 0.8))
    }

    const onScroll = () => {
      if (!frame.current) frame.current = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [])

  return (
    <div className="ivy-layer" aria-hidden="true">
      <VineSvg vine={LEFT} side="left" grown={grown} />
      <VineSvg vine={RIGHT} side="right" grown={grown} />
    </div>
  )
}
