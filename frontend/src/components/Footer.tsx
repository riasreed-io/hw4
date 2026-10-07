import { Link } from 'react-router-dom'
import PrivacyPanel from './PrivacyPanel'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="cols">
          <div>
            <b>Shop</b>
            <Link to="/products">All products</Link>
            <Link to="/products?category=T-shirts">T-shirts</Link>
            <Link to="/products?category=Hoodies">Hoodies</Link>
            <Link to="/products?category=Crewnecks">Crewnecks</Link>
          </div>
          <div>
            <b>Account</b>
            <Link to="/login">Log in</Link>
            <Link to="/create-account">Create account</Link>
          </div>
          <div>
            <b>Visit the store</b>
            <span>57 Broadway</span>
            <span>New Haven, CT 06511</span>
          </div>
          <div>
            <b>About</b>
            <Link to="/about">Our story</Link>
            <span>Printing on site since the '90s</span>
          </div>
          <PrivacyPanel />
        </div>
        <div className="fine">
          Campus Customs is an officially licensed Yale University retailer. Yale, the Yale
          shield, Handsome Dan and related marks belong to Yale University and are used under
          license. Built as coursework for MGT 409.
        </div>
      </div>
    </footer>
  )
}
