import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api'
import { useAuth } from '../AuthContext'

type Field = 'first_name' | 'last_name' | 'email' | 'password' | 'confirm_password'
type Errors = Partial<Record<Field | 'form', string>>

export default function CreateAccount() {
  const { signup } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    confirm_password: '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((x) => ({ ...x, [k]: undefined, form: undefined }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()

    // Catch the obvious problems here so the password never leaves the browser
    // for a request that was always going to fail. The server re-checks all of
    // it anyway - this is convenience, not the security boundary.
    const next: Errors = {}
    if (!form.first_name.trim()) next.first_name = 'Required.'
    if (!form.last_name.trim()) next.last_name = 'Required.'
    if (!form.email.trim()) next.email = 'Enter your email address.'
    else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'That does not look like an email address.'
    if (form.password.length < 8) next.password = 'Use at least 8 characters.'
    if (form.confirm_password !== form.password) next.confirm_password = 'The two passwords do not match.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setBusy(true)
    try {
      await signup({ ...form, email: form.email.trim() })
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
        <h1>Create an account</h1>
        <p className="sub">
          An account lets the shop assistant greet you by name and keep your conversation between
          visits.
        </p>

        <form onSubmit={submit} noValidate>
          <div className="row2">
            <div className="field">
              <label htmlFor="first_name">First name</label>
              <input id="first_name" type="text" autoComplete="given-name" value={form.first_name} onChange={set('first_name')} />
              {errors.first_name && <div className="err">{errors.first_name}</div>}
            </div>
            <div className="field">
              <label htmlFor="last_name">Last name</label>
              <input id="last_name" type="text" autoComplete="family-name" value={form.last_name} onChange={set('last_name')} />
              {errors.last_name && <div className="err">{errors.last_name}</div>}
            </div>
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} placeholder="you@yale.edu" />
            {errors.email && <div className="err">{errors.email}</div>}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
            {errors.password && <div className="err">{errors.password}</div>}
          </div>

          <div className="field">
            <label htmlFor="confirm_password">Confirm password</label>
            <input id="confirm_password" type="password" autoComplete="new-password" value={form.confirm_password} onChange={set('confirm_password')} />
            {errors.confirm_password && <div className="err">{errors.confirm_password}</div>}
          </div>

          {errors.form && <div className="err" style={{ marginBottom: 14 }}>{errors.form}</div>}

          <button className="btn btn-navy" type="submit" disabled={busy}>
            {busy ? 'Creating...' : 'Create account'}
          </button>
        </form>

        <p className="alt">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  )
}
