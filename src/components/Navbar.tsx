import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Hammer } from 'lucide-react';
import { useState, useEffect } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [settings, setSettings] = useState<any>({});
  const location = useLocation();
  const isHome = location.pathname === '/';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    
    fetch('/api/settings')
      .then(res => res.json())
      .then(setSettings)
      .catch(err => console.error('Error fetching settings:', err));

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Início', path: '/' },
    { name: 'Serviços', path: '/servicos' },
    { name: 'Galeria', path: '/galeria' },
    { name: 'Blog', path: '/blog' },
  ];

  const isScrolledOrNotHome = scrolled || !isHome;

  return (
    <nav
      className={cn(
        'fixed top-0 w-full z-50 transition-all duration-300',
        isScrolledOrNotHome ? 'bg-white/95 backdrop-blur-md shadow-md py-2' : 'bg-transparent py-4'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <Link to="/" className="flex items-center gap-3 group">
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="h-14 w-auto object-contain" />
            ) : (
              <>
                <div className="bg-brand-primary p-2 rounded-lg group-hover:rotate-12 transition-transform shadow-lg shadow-brand-primary/20">
                  <Hammer className="w-6 h-6 text-white" />
                </div>
                <div className="flex flex-col">
                  <span className={cn(
                    "text-xl font-black tracking-tighter transition-colors leading-none",
                    isScrolledOrNotHome ? "text-brand-dark" : "text-brand-dark md:text-white"
                  )}>
                    FERREIRA
                  </span>
                  <span className={cn(
                    "text-[10px] font-bold tracking-[0.2em] uppercase transition-colors",
                    isScrolledOrNotHome ? "text-brand-primary" : "text-brand-primary"
                  )}>
                    Calhas e Rufos
                  </span>
                </div>
              </>
            )}
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={cn(
                  'text-sm font-bold uppercase tracking-wider transition-colors hover:text-brand-primary',
                  location.pathname === link.path
                    ? 'text-brand-primary'
                    : isScrolledOrNotHome ? 'text-slate-600' : 'text-slate-600 md:text-white/90'
                )}
              >
                {link.name}
              </Link>
            ))}
            <Link
              to="/login"
              className={cn(
                "text-[10px] uppercase tracking-widest font-black transition-colors border rounded-md px-2 py-1",
                isScrolledOrNotHome 
                  ? "text-slate-400 border-slate-200 hover:text-brand-primary hover:border-brand-primary" 
                  : "text-white/60 border-white/20 hover:text-white hover:border-white"
              )}
            >
              Admin
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className={cn(
                "p-2 rounded-md",
                isScrolledOrNotHome ? "text-slate-900" : "text-slate-900 md:text-white"
              )}
            >
              {isOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-white border-b border-slate-100 animate-in slide-in-from-top duration-300">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setIsOpen(false)}
                className={cn(
                  'block px-3 py-2 rounded-md text-base font-bold uppercase tracking-wider',
                  location.pathname === link.path
                    ? 'bg-brand-primary/10 text-brand-primary'
                    : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                {link.name}
              </Link>
            ))}
            <Link
              to="/login"
              onClick={() => setIsOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-medium text-slate-400"
            >
              Painel Admin
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
