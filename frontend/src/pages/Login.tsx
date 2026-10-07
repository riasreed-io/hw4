import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api'
import { useAuth } from '../AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()

    const next: typeof errors = {}
    if (!email.trim()) next.email = 'Enter your email address.'
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'That does not look like an email address.'
    if (!password) next.password = 'Enter your password.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setBusy(true)
    try {
      await login(email.trim(), password)
      navigate('/')
    } catch (err) {
      const e2 = err as ApiError
      setErrors(e2.field ? { [e2.field]: e2.message } : { form: e2.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <h1>Log in</h1>
        <p className="sub">Welcome back. Log in to pick up your chat where you left off.</p>

        <form onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setErrors({})
              }}
              placeholder="you@yale.edu"
            />
            {errors.email && <div className="err">{errors.email}</div>}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setErrors({})
              }}
              placeholder="Your password"
            />
            {errors.password && <div className="err">{errors.password}</div>}
          </div>

          {errors.form && <div className="err" style={{ marginBottom: 14 }}>{errors.form}</div>}

          <button className="btn btn-navy" type="submit" disabled={busy}>
            {busy ? 'Checking...' : 'Log in'}
          </button>
        </form>

        <p className="alt">
          No account yet? <Link to="/create-account">Create one</Link>
        </p>
      </div>
    </div>
  )
}
