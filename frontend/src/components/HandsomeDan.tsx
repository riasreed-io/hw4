import { useEffect, useRef, useState } from 'react'

/**
 * Handsome Dan follows the mouse, and barks when you click.
 *
 * The cursor is an inline SVG data URI rather than a file, so there is no asset
 * to ship and no flash before it loads. The bark is synthesised with the Web
 * Audio API for the same reason - no mp3, about forty lines of maths.
 *
 * Both can be switched off, and the choice persists. A sound on every click is
 * delightful for a minute and infuriating for ten, so the control is in the nav
 * where it can be found, not buried in a footer.
 */

const CURSOR_KEY = 'cc_dan_cursor'
const BARK_KEY = 'cc_dan_bark'

// Handsome Dan at 38px: folded ears, heavy brow, white muzzle, navy collar with
// a brass tag. Drawn large and scaled so the silhouette survives at cursor size.
const DAN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 64 64">
<ellipse cx="32" cy="57" rx="15" ry="5" fill="#002147"/>
<rect x="24" y="49" width="16" height="6" rx="2" fill="#002147"/>
<circle cx="32" cy="53" r="3" fill="#c9a227"/>
<path d="M11 20c-3-9 2-14 7-11l6 5z" fill="#8a6b4a"/>
<path d="M53 20c3-9-2-14-7-11l-6 5z" fill="#8a6b4a"/>
<path d="M13 21c-2-6 1-9 4-7l4 4z" fill="#6b5137"/>
<path d="M51 21c2-6-1-9-4-7l-4 4z" fill="#6b5137"/>
<path d="M32 9c13 0 20 8 20 19s-8 20-20 20-20-9-20-20S19 9 32 9z" fill="#c49a6c"/>
<path d="M32 12c10 0 16 6 16 15 0 4-1 7-3 10H19c-2-3-3-6-3-10 0-9 6-15 16-15z" fill="#d9b389"/>
<path d="M18 22c3-3 7-3 9 0M46 22c-3-3-7-3-9 0" stroke="#5c4530" stroke-width="2.4" fill="none" stroke-linecap="round"/>
<circle cx="23" cy="27" r="3.4" fill="#231a12"/>
<circle cx="41" cy="27" r="3.4" fill="#231a12"/>
<circle cx="24.2" cy="25.8" r="1.2" fill="#fff"/>
<circle cx="42.2" cy="25.8" r="1.2" fill="#fff"/>
<path d="M32 32c9 0 14 4 14 9s-6 8-14 8-14-3-14-8 5-9 14-9z" fill="#f4ece0"/>
<path d="M32 31c3.6 0 6 2 6 4s-2.6 3-6 3-6-1-6-3 2.4-4 6-4z" fill="#231a12"/>
<path d="M32 38v4M32 42c-2.5 0-4-1-4-2M32 42c2.5 0 4-1 4-2" stroke="#5c4530" stroke-width="1.8" fill="none" stroke-linecap="round"/>
<circle cx="24" cy="42" r="1" fill="#b59a7d"/><circle cx="27" cy="45" r="1" fill="#b59a7d"/>
<circle cx="40" cy="42" r="1" fill="#b59a7d"/><circle cx="37" cy="45" r="1" fill="#b59a7d"/>
</svg>`

const cursorUrl = `url("data:image/svg+xml,${encodeURIComponent(DAN_SVG)}") 6 4, auto`

function useStored(key: string, fallback: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? fallback : raw === '1'
    } catch {
      return fallback
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, value ? '1' : '0')
    } catch {
      /* private browsing */
    }
  }, [key, value])
  return [value, setValue] as const
}

export default function HandsomeDan() {
  const [cursorOn, setCursorOn] = useStored(CURSOR_KEY, true)
  const [barkOn, setBarkOn] = useStored(BARK_KEY, true)
  const [menuOpen, setMenuOpen] = useState(false)
  const audio = useRef<AudioContext | null>(null)

  // The custom cursor is set on <html> so it covers the whole page, including
  // the gaps between elements.
  useEffect(() => {
    document.documentElement.style.cursor = cursorOn ? cursorUrl : ''
    document.documentElement.classList.toggle('dan-cursor', cursorOn)
    return () => {
      document.documentElement.style.cursor = ''
      document.documentElement.classList.remove('dan-cursor')
    }
  }, [cursorOn])

  useEffect(() => {
    if (!barkOn) return

    function bark(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      // Typing is not barking at. Neither is adjusting the toggle that turns
      // barking off - that would be a cruel joke.
      if (target?.closest('input, textarea, select, .dan-menu')) return

      try {
        const Ctor = window.AudioContext ?? (window as any).webkitAudioContext
        if (!Ctor) return
        const ctx = (audio.current ??= new Ctor())
        if (ctx.state === 'suspended') void ctx.resume()

        const t = ctx.currentTime
        const out = ctx.createGain()
        out.gain.value = 0.16
        out.connect(ctx.destination)

        // A bark is a voiced burst that falls in pitch, plus a breathy
        // consonant at the front. Two oscillators and a noise burst get close.
        const growl = ctx.createOscillator()
        growl.type = 'sawtooth'
        growl.frequency.setValueAtTime(340, t)
        growl.frequency.exponentialRampToValueAtTime(108, t + 0.13)

        const body = ctx.createOscillator()
        body.type = 'square'
        body.frequency.setValueAtTime(178, t)
        body.frequency.exponentialRampToValueAtTime(76, t + 0.14)

        // A formant filter is what makes it read as an animal rather than a beep.
        const throat = ctx.createBiquadFilter()
        throat.type = 'bandpass'
        throat.Q.value = 2.4
        throat.frequency.setValueAtTime(1150, t)
        throat.frequency.exponentialRampToValueAtTime(420, t + 0.15)

        const env = ctx.createGain()
        env.gain.setValueAtTime(0.0001, t)
        env.gain.exponentialRampToValueAtTime(1, t + 0.012) // hard attack: the "w"
        env.gain.exponentialRampToValueAtTime(0.32, t + 0.07)
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.21) // "oof" tailing off

        growl.connect(throat)
        body.connect(throat)
        throat.connect(env)
        env.connect(out)
        growl.start(t); body.start(t)
        growl.stop(t + 0.22); body.stop(t + 0.22)

        // The breath at the front of the bark.
        const frames = Math.floor(ctx.sampleRate * 0.05)
        const buf = ctx.createBuffer(1, frames, ctx.sampleRate)
        const data = buf.getChannelData(0)
        for (let i = 0; i < frames; i++) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2
        }
        const breath = ctx.createBufferSource()
        breath.buffer = buf
        const hiss = ctx.createBiquadFilter()
        hiss.type = 'bandpass'
        hiss.frequency.value = 1700
        const hissGain = ctx.createGain()
        hissGain.gain.value = 0.5
        breath.connect(hiss); hiss.connect(hissGain); hissGain.connect(out)
        breath.start(t)
      } catch {
        /* audio blocked - never let a sound effect break a click */
      }
    }

    window.addEventListener('pointerdown', bark)
    return () => window.removeEventListener('pointerdown', bark)
  }, [barkOn])

  return (
    <div className="dan-menu">
      <button
        className="dan-btn"
        onClick={() => setMenuOpen((o) => !o)}
        aria-expanded={menuOpen}
        title="Handsome Dan settings"
      >
        <span className="dan-face" aria-hidden="true" dangerouslySetInnerHTML={{ __html: DAN_SVG }} />
        <span className="dan-label">Dan</span>
      </button>

      {menuOpen && (
        <div className="dan-pop">
          <b>Handsome Dan</b>
          <label>
            <input type="checkbox" checked={cursorOn} onChange={(e) => setCursorOn(e.target.checked)} />
            Follow my cursor
          </label>
          <label>
            <input type="checkbox" checked={barkOn} onChange={(e) => setBarkOn(e.target.checked)} />
            Bark when I click
          </label>
          <p>He'll remember what you pick.</p>
        </div>
      )}
    </div>
  )
}
