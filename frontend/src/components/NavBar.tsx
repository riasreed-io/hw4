import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import HandsomeDan from './HandsomeDan'

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/products', label: 'Products', end: false },
  { to: '/about', label: 'About us', end: false },
]

export default function NavBar() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()

  async function signOut() {
    await logout()
    navigate('/')
  }

  return (
    <>
      <div className="strip">
        <div className="wrap">
          <span>Officially licensed Yale apparel</span>
          <span>57 Broadway, New Haven CT 06511</span>
        </div>
      </div>
      <nav className="nav">
        <div className="wrap">
          <NavLink to="/" className="brand">
            <b>Campus Customs</b>
            <span>Yale Bulldog Blue</span>
          </NavLink>
          <div className="nav-links">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end}>
                {l.label}
              </NavLink>
            ))}

            {loading ? null : user ? (
              <>
                <span className="who">
                  Hi, {user.first_name || user.name.split(' ')[0]}
                </span>
                <button className="linkbtn" onClick={signOut}>
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className="ghost">
                  Log in
                </NavLink>
                <NavLink to="/create-account" className="solid">
                  Create account
                </NavLink>
              </>
            )}

            <HandsomeDan />
          </div>
        </div>
      </nav>
    </>
  )
}
