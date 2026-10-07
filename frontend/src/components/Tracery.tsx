/**
 * A traceried lancet window, drawn in gold line on the hero.
 *
 * The standard gothic composition: a pointed arch, two sub-lancets inside it,
 * a quatrefoil in the head, and mullions down to the sill. Decorative only.
 */
export default function Tracery() {
  return (
    <svg className="tracery" viewBox="0 0 220 420" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {/* outer arch */}
        <path d="M14 410 V140 Q110 -8 206 140 V410" />
        <path d="M24 410 V144 Q110 10 196 144 V410" strokeWidth="1" opacity="0.55" />
        {/* mullions */}
        <path d="M110 410 V196" />
        {/* two sub-lancets */}
        <path d="M44 410 V236 Q77 182 110 236 V410" strokeWidth="1.4" />
        <path d="M110 410 V236 Q143 182 176 236 V410" strokeWidth="1.4" />
        {/* quatrefoil in the arch head */}
        <circle cx="110" cy="150" r="30" strokeWidth="1.4" />
        <circle cx="110" cy="128" r="13" strokeWidth="1.2" />
        <circle cx="110" cy="172" r="13" strokeWidth="1.2" />
        <circle cx="88" cy="150" r="13" strokeWidth="1.2" />
        <circle cx="132" cy="150" r="13" strokeWidth="1.2" />
        {/* transom and sill */}
        <path d="M24 300 H196" strokeWidth="1" opacity="0.5" />
        <path d="M4 410 H216" strokeWidth="3" />
      </g>
    </svg>
  )
}
