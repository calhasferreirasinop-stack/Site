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

const NO_CHROME = ['/login', '/admin', '/orcamento'];

function AppContent() {
  const location = useLocation();
  const showChrome = !NO_CHROME.some(p => location.pathname.startsWith(p));

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans text-slate-900">
      {showChrome && <Navbar />}
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
          {/* Admin — wrapped in ErrorBoundary so crashes never show white screen */}
          <Route path="/admin" element={
            <ErrorBoundary>
              <Admin />
            </ErrorBoundary>
          } />
          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {showChrome && <Footer />}
      {showChrome && <WhatsAppButton />}
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
