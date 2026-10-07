import { Route, Routes } from 'react-router-dom'
import NavBar from './components/NavBar'
import Footer from './components/Footer'
import ChatPanel from './components/ChatPanel'
import ScrollToTop from './components/ScrollToTop'
import ChatResultsBand from './components/ChatResultsBand'
import { ChatResultsProvider } from './ChatResultsContext'
import Ivy from './components/Ivy'
import { useReveal } from './useReveal'
import Home from './pages/Home'
import Products from './pages/Products'
import ProductDetail from './pages/ProductDetail'
import About from './pages/About'
import Login from './pages/Login'
import CreateAccount from './pages/CreateAccount'

export default function App() {
  useReveal()

  return (
    <ChatResultsProvider>
      <div className="site">
        <ScrollToTop />
        <Ivy />
        <NavBar />
        <ChatResultsBand />
        <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:productId" element={<ProductDetail />} />
          <Route path="/about" element={<About />} />
          <Route path="/login" element={<Login />} />
          <Route path="/create-account" element={<CreateAccount />} />
          <Route
            path="*"
            element={
              <div className="state">
                <b>Page not found</b>
                That link does not go anywhere yet.
              </div>
            }
          />
        </Routes>
        </main>
        <Footer />
        <ChatPanel />
      </div>
    </ChatResultsProvider>
  )
}
