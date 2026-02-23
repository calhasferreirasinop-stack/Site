import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import WhatsAppButton from './components/WhatsAppButton';
import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/Home';
import Services from './pages/Services';
import Blog from './pages/Blog';
import Gallery from './pages/Gallery';
import Admin from './pages/Admin';
import Login from './pages/Login';
import Orcamento from './pages/Orcamento';

// Only /admin hides the site navbar (it has its own internal nav)
// /login is a standalone page without chrome
// All other pages (including /orcamento) show the full navbar
const NO_NAVBAR = ['/admin', '/login'];

function AppContent() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const showNavbar = !NO_NAVBAR.some(p => location.pathname.startsWith(p));

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans text-slate-900">
      {showNavbar && <Navbar />}
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/servicos" element={<Services />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/galeria" element={<Gallery />} />
          <Route path="/login" element={<Login />} />
          <Route path="/orcamento" element={
            <ErrorBoundary>
              <Orcamento />
            </ErrorBoundary>
          } />
          {/* Central do Usuário — /admin (manter compatibilidade) */}
          <Route path="/admin" element={
            <ErrorBoundary>
              <Admin />
            </ErrorBoundary>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {/* Footer and WhatsApp always visible EXCEPT on admin */}
      {!isAdmin && <Footer />}
      {!isAdmin && <WhatsAppButton />}
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
