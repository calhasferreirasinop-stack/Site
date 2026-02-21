import { Instagram, Phone, Mail, MapPin, Hammer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

export default function Footer() {
  const [settings, setSettings] = useState<any>({});

  useEffect(() => {
    fetch('/api/settings').then(res => res.json()).then(setSettings);
  }, []);

  return (
    <footer className="bg-brand-dark text-slate-300 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="col-span-1 md:col-span-1">
            <div className="flex items-center gap-3 mb-6">
              {settings.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="h-10 w-auto brightness-0 invert" />
              ) : (
                <div className="bg-brand-primary p-2 rounded-lg">
                  <Hammer className="w-5 h-5 text-white" />
                </div>
              )}
              <span className="text-xl font-black text-white tracking-tighter uppercase">
                FERREIRA
              </span>
            </div>
            <p className="text-sm leading-relaxed mb-6">
              Soluções completas em calhas, rufos e pingadeiras. Qualidade, durabilidade e o melhor acabamento para sua obra.
            </p>
            <div className="flex gap-4">
              <a
                href="https://www.instagram.com/ferreira.calhas"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-slate-800 rounded-full hover:bg-brand-primary hover:text-white transition-all"
              >
                <Instagram className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-bold uppercase tracking-wider text-sm mb-6">Links Rápidos</h3>
            <ul className="space-y-4 text-sm">
              <li><Link to="/" className="hover:text-brand-primary transition-colors">Início</Link></li>
              <li><Link to="/servicos" className="hover:text-brand-primary transition-colors">Serviços</Link></li>
              <li><Link to="/galeria" className="hover:text-brand-primary transition-colors">Galeria</Link></li>
              <li><Link to="/blog" className="hover:text-brand-primary transition-colors">Blog</Link></li>
            </ul>
          </div>

          {/* Services */}
          <div>
            <h3 className="text-white font-bold uppercase tracking-wider text-sm mb-6">Nossos Serviços</h3>
            <ul className="space-y-4 text-sm">
              <li className="hover:text-brand-primary cursor-default">Instalação de Calhas</li>
              <li className="hover:text-brand-primary cursor-default">Fabricação de Rufos</li>
              <li className="hover:text-brand-primary cursor-default">Pingadeiras</li>
              <li className="hover:text-brand-primary cursor-default">Manutenção Preventiva</li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-white font-bold uppercase tracking-wider text-sm mb-6">Contato</h3>
            <ul className="space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-brand-primary shrink-0" />
                <span>{settings.address || 'Atendimento em toda região'}</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-brand-primary shrink-0" />
                <span>{settings.whatsapp || '(11) 99999-9999'}</span>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-brand-primary shrink-0" />
                <span>contato@ferreiracalhas.com.br</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-8 text-center text-xs text-slate-500">
          <p>© {new Date().getFullYear()} Ferreira Calhas. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
