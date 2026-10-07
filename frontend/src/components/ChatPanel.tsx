import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ApiError,
  fetchChatHistory,
  fetchOpener,
  imageUrl,
  money,
  sendChat,
  type ChatProduct,
} from '../api'
import { useAuth } from '../AuthContext'
import { useChatResults } from '../ChatResultsContext'
import { usePageContext } from '../usePageContext'
import { getGuestViews } from '../recentlyViewed'

type Msg = { role: 'user' | 'assistant' | 'system'; content: string; products?: ChatProduct[] }

const GREETING: Msg = {
  role: 'assistant',
  content:
    "Hi! I'm the Campus Customs shop assistant. Ask me about Yale gear - what we carry, what it costs, or whether your size is in stock.",
}

// How long a shopper gets to look around before the chat introduces itself.
const OPENER_DELAY_MS = 3500
const DISMISSED_KEY = 'cc_opener_dismissed'

function Cards({ products }: { products: ChatProduct[] }) {
  return (
    <div className="chat-cards">
      {products.map((p) => (
        <Link key={p.product_id} to={`/products/${p.product_id}`} className="chat-card">
          <img src={imageUrl(p.image_url)} alt={p.name} loading="lazy" />
          <div>
            <b>{p.name}</b>
            <span>
              {money(p.price)}
              {p.total_stock === 0 ? ' - sold out' : ''}
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}

export default function ChatPanel() {
  const { user } = useAuth()
  const { show } = useChatResults()
  const page = usePageContext()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  // `busy` is state, so it is stale inside a handler that fires twice in the
  // same tick - two fast Enter presses would send the message twice. A ref
  // updates immediately and closes that window.
  const sending = useRef(false)
  // The unprompted opener fires once per session, and never while a
  // conversation is already going. A greeting that interrupts is worse than no
  // greeting at all.
  const [opener, setOpener] = useState<{ greeting: string; products: ChatProduct[] } | null>(null)
  const openerTried = useRef(false)
  const pageRef = useRef(page)
  pageRef.current = page

  // Signing in or out swaps whose conversation this is, so reload it. A
  // signed-in shopper's history comes back from chat_messages; everyone else
  // starts fresh.
  useEffect(() => {
    let cancelled = false
    if (!user) {
      setMessages([GREETING])
      return
    }
    fetchChatHistory()
      .then((d) => {
        if (cancelled) return
        setMessages(d.messages.length ? d.messages.map((m) => ({ ...m })) : [GREETING])
      })
      .catch(() => setMessages([GREETING]))
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open, busy])

  // Ask the backend for a greeting written for this page, then show it.
  useEffect(() => {
    if (sessionStorage.getItem(DISMISSED_KEY) === '1') return

    const timer = window.setTimeout(() => {
      // The guard is claimed here, when the timer actually fires - not in the
      // effect body. StrictMode mounts twice in dev, and claiming it up front
      // meant the first mount took the guard, its cleanup killed the timer, and
      // the second mount bailed out. The opener simply never appeared.
      if (openerTried.current || open) return
      openerTried.current = true
      fetchOpener(pageRef.current, getGuestViews())
        .then((d) => {
          if (d.greeting) setOpener({ greeting: d.greeting, products: d.products })
        })
        .catch(() => {
          /* a greeting nobody asked for must never surface an error */
        })
    }, OPENER_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [open])

  function dismissOpener() {
    sessionStorage.setItem(DISMISSED_KEY, '1')
    setOpener(null)
  }

  function acceptOpener() {
    if (!opener) return
    setMessages((m) => [
      ...m.filter((x) => x !== GREETING),
      { role: 'assistant', content: opener.greeting, products: opener.products },
    ])
    if (opener.products.length > 0) show(opener.products, '')
    sessionStorage.setItem(DISMISSED_KEY, '1')
    setOpener(null)
    setOpen(true)
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || sending.current) return
    sending.current = true

    const history = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }))

    setMessages((m) => [...m, { role: 'user', content: text }])
    setDraft('')
    setBusy(true)

    try {
      const data = await sendChat(text, history, page, getGuestViews())
      setMessages((m) => [...m, { role: 'assistant', content: data.reply, products: data.products }])
      // The same matches the agent chose also go onto the page itself, as full
      // product cards above the content.
      show(data.products, data.match_label)
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: 'system', content: (err as ApiError).message || 'Could not reach the assistant.' },
      ])
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <>
        {opener && (
          <div className="opener" role="status">
            <button className="opener-x" onClick={dismissOpener} aria-label="Dismiss">
              &times;
            </button>
            <div className="opener-who">Campus Customs</div>
            <p>{opener.greeting}</p>
            <button className="opener-cta" onClick={acceptOpener}>
              Chat about it
            </button>
          </div>
        )}
        <button
          className="chat-fab"
          onClick={() => (opener ? acceptOpener() : setOpen(true))}
          aria-label="Open shop chat"
        >
          <span aria-hidden="true">&#9679;</span> Ask us anything
        </button>
      </>
    )
  }

  return (
    <div className="chat-panel" role="dialog" aria-label="Campus Customs shop chat">
      <div className="chat-head">
        <div>
          <b>Campus Customs chat</b>
          <small>Ask about gear, price or stock</small>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close chat">
          &times;
        </button>
      </div>

      <div className="chat-log" ref={logRef}>
        {messages.map((m, i) => (
          <div key={i} className="chat-row">
            <div className={`msg ${m.role === 'user' ? 'me' : m.role === 'system' ? 'sys' : 'bot'}`}>
              {m.content}
            </div>
            {m.products && m.products.length > 0 && <Cards products={m.products} />}
          </div>
        ))}
        {busy && (
          <div className="msg bot dots">
            <span /> <span /> <span />
          </div>
        )}
      </div>

      <form className="chat-form" onSubmit={send}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Do you have hoodies in large?"
          aria-label="Message"
        />
        <button type="submit" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
