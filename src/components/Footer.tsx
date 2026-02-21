import { Instagram, Phone, MapPin, Hammer, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

export default function Footer() {
  const [settings, setSettings] = useState<any>({});

  useEffect(() => {
    fetch('/api/settings').then(res => res.json()).then(setSettings);
  }, []);

  const whatsapp = settings.whatsapp || '5566996172808';
  const whatsappUrl = `https://wa.me/${whatsapp}`;
  const instagramUrl = 'https://www.instagram.com/ferreira.calhas';

  return (
    <footer className="bg-brand-dark text-slate-300 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">

          {/* Brand */}
          <div className="col-span-1 md:col-span-1">
            <div className="flex items-center gap-3 mb-6">
              {settings.logoUrl ? (
                <img
                  src={settings.logoUrl}
                  alt="Logo Ferreira Calhas"
                  className="h-12 w-auto object-contain"
                />
              ) : (
                <>
                  <div className="bg-brand-primary p-2 rounded-lg">
                    <Hammer className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xl font-black text-white tracking-tighter uppercase">
                    FERREIRA
                  </span>
                </>
              )}
            </div>
            <p className="text-sm leading-relaxed mb-6">
              Soluções completas em calhas, rufos e pingadeiras. Qualidade, durabilidade e o melhor acabamento para sua obra.
            </p>

            {/* Caixa Siga-nos */}
            <div className="bg-slate-800/60 rounded-2xl p-5 border border-slate-700/50">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">
                Siga-nos nas redes sociais
              </p>
              <div className="flex gap-3">
                {/* Instagram */}
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-gradient-to-br from-pink-500 via-red-500 to-yellow-400 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-pink-500/20 hover:scale-105"
                  title="Instagram"
                >
                  <Instagram className="w-5 h-5" />
                  <span>Instagram</span>
                </a>

                {/* WhatsApp */}
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-green-500 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-green-400 transition-all shadow-lg shadow-green-500/20 hover:scale-105"
                  title="WhatsApp"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>WhatsApp</span>
                </a>
              </div>
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
              <li className="hover:text-brand-primary cursor-default transition-colors">Instalação de Calhas</li>
              <li className="hover:text-brand-primary cursor-default transition-colors">Fabricação de Rufos</li>
              <li className="hover:text-brand-primary cursor-default transition-colors">Pingadeiras</li>
              <li className="hover:text-brand-primary cursor-default transition-colors">Manutenção Preventiva</li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-white font-bold uppercase tracking-wider text-sm mb-6">Contato</h3>
            <ul className="space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-brand-primary shrink-0 mt-0.5" />
                <span>{settings.address || 'Atendimento em toda região'}</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-brand-primary shrink-0" />
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-brand-primary transition-colors"
                >
                  {whatsapp}
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Instagram className="w-5 h-5 text-brand-primary shrink-0" />
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-brand-primary transition-colors"
                >
                  @ferreira.calhas
                </a>
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
