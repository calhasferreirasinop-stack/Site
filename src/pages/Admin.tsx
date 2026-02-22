import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Plus, Trash2, Save, Image as ImageIcon, FileText, Hammer, LayoutGrid, Star, LogOut, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Admin() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'settings' | 'services' | 'posts' | 'gallery' | 'testimonials'>('settings');
  const [settings, setSettings] = useState<any>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [services, setServices] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [gallery, setGallery] = useState<any[]>([]);
  const [testimonials, setTestimonials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Form states
  const [newService, setNewService] = useState({ title: '', description: '', image: null as File | null });
  const [newPost, setNewPost] = useState({ title: '', content: '', image: null as File | null });
  const [newGalleryItem, setNewGalleryItem] = useState({ description: '', serviceId: '', images: [] as File[] });
  const [selectedGalleryIds, setSelectedGalleryIds] = useState<number[]>([]);
  const [newTestimonial, setNewTestimonial] = useState({ author: '', content: '', rating: 5 });
  const [confirmModal, setConfirmModal] = useState<{ show: boolean, type: string, id?: number, bulk?: boolean, title: string, message: string } | null>(null);
  const [toast, setToast] = useState<{ show: boolean, message: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toast?.show) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/check', { credentials: 'include' });
      const data = await res.json();
      if (!data.authenticated) {
        navigate('/login');
      } else {
        fetchData();
      }
    } catch (err) {
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await fetch('/api/admin/data', { credentials: 'include' });

      if (res.status === 401) return navigate('/login');

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Erro ${res.status}`);
      }

      const data = await res.json();
      setSettings(data.settings);
      setServices(data.services);
      setPosts(data.posts);
      setGallery(data.gallery);
      setTestimonials(data.testimonials);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      if (err.message?.includes('Rate exceeded')) {
        setToast({ show: true, message: 'Muitas solicitações. Aguarde um momento.', type: 'error' });
      } else {
        setToast({ show: true, message: 'Erro ao carregar dados do painel.', type: 'error' });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    navigate('/login');
  };

  const handleChangePassword = async () => {
    if (!newPassword) return;
    setChangingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
        credentials: 'include'
      });
      if (res.ok) {
        alert('Senha alterada com sucesso!');
        setNewPassword('');
      } else {
        alert('Erro ao alterar senha');
      }
    } catch (err) {
      alert('Erro de conexão');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSaveSettings = async () => {
    const formData = new FormData();
    Object.entries(settings).forEach(([key, value]) => {
      if (key !== 'logoUrl' && key !== 'heroImageUrl') formData.append(key, String(value));
    });
    if (logoFile) formData.append('logo', logoFile);
    if (heroFile) formData.append('heroImage', heroFile);

    const res = await fetch('/api/settings', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });

    if (res.status === 401) return navigate('/login');

    alert('Configurações salvas!');
    setLogoFile(null);
    setHeroFile(null);
    fetchData();
  };

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('title', newService.title);
    formData.append('description', newService.description);
    if (newService.image) formData.append('image', newService.image);

    const res = await fetch('/api/services', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    if (res.status === 401) return navigate('/login');

    setNewService({ title: '', description: '', image: null });
    fetchData();
  };

  const handleAddPost = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('title', newPost.title);
    formData.append('content', newPost.content);
    if (newPost.image) formData.append('image', newPost.image);

    const res = await fetch('/api/posts', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    if (res.status === 401) return navigate('/login');

    setNewPost({ title: '', content: '', image: null });
    fetchData();
  };

  const handleAddGallery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newGalleryItem.images.length === 0) return;

    const formData = new FormData();
    formData.append('description', newGalleryItem.description);
    if (newGalleryItem.serviceId) formData.append('serviceId', newGalleryItem.serviceId);

    newGalleryItem.images.forEach(image => {
      formData.append('images', image);
    });

    const res = await fetch('/api/gallery', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    if (res.status === 401) return navigate('/login');

    setNewGalleryItem({ description: '', serviceId: '', images: [] });
    fetchData();
  };

  const handleAddTestimonial = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/testimonials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTestimonial),
      credentials: 'include'
    });
    if (res.status === 401) return navigate('/login');

    setNewTestimonial({ author: '', content: '', rating: 5 });
    fetchData();
  };

  const handleDelete = async (type: string, id: number) => {
    // Debug alert to see if the function is even reached
    console.log(`DEBUG: handleDelete chamado para ${type} com ID ${id}`);

    if (!id) {
      alert('Erro: ID inválido');
      return;
    }

    if (!window.confirm('Tem certeza que deseja excluir este item?')) {
      return;
    }

    try {
      const res = await fetch(`/api/${type}/delete/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (res.status === 401) return navigate('/login');

      if (res.ok) {
        await fetchData(true);
        alert('Excluído com sucesso!');
      } else {
        const errorData = await res.json();
        alert(`Erro ao excluir: ${errorData.error || 'Erro desconhecido'}`);
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Erro de conexão ao tentar excluir.');
    }
  };

  const handleBulkDeleteGallery = async () => {
    if (selectedGalleryIds.length === 0) return;

    if (!window.confirm(`Deseja excluir as ${selectedGalleryIds.length} fotos selecionadas?`)) {
      return;
    }

    try {
      const res = await fetch('/api/gallery/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedGalleryIds }),
        credentials: 'include'
      });

      if (res.status === 401) return navigate('/login');

      if (res.ok) {
        setSelectedGalleryIds([]);
        await fetchData(true);
        alert('Fotos excluídas com sucesso!');
      } else {
        const errorData = await res.json();
        alert(`Erro na exclusão em massa: ${errorData.error || 'Erro desconhecido'}`);
      }
    } catch (err) {
      console.error('Bulk delete error:', err);
      alert('Erro de conexão na exclusão em massa.');
    }
  };

  const toggleGallerySelection = (id: number) => {
    setSelectedGalleryIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  if (loading) return null;

  return (
    <div className="pt-32 pb-24 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <aside className="md:w-64 shrink-0">
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 sticky top-32">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-4 mb-4 flex justify-between items-center">
                Painel Administrativo
                {refreshing && <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-3 h-3 border-2 border-brand-primary border-t-transparent rounded-full" />}
              </h2>
              <nav className="space-y-1">
                {[
                  { id: 'settings', label: 'Geral', icon: Settings },
                  { id: 'services', label: 'Serviços', icon: Hammer },
                  { id: 'posts', label: 'Blog', icon: FileText },
                  { id: 'gallery', label: 'Galeria', icon: LayoutGrid },
                  { id: 'testimonials', label: 'Depoimentos', icon: Star },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}

                <div className="pt-4 mt-4 border-t border-slate-100">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 transition-all"
                  >
                    <LogOut className="w-4 h-4" />
                    Sair
                  </button>
                </div>
              </nav>
            </div>
          </aside>

          {/* Content */}
          <main className="flex-grow">
            <div className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-sm border border-slate-100">
              {activeTab === 'settings' && (
                <div className="space-y-8 animate-in fade-in duration-500">
                  <h2 className="text-2xl font-bold mb-8">Configurações Gerais</h2>
                  <div className="grid grid-cols-1 gap-6">
                    <div className="flex items-center gap-6 p-6 bg-slate-50 rounded-2xl">
                      <div className="w-24 h-24 bg-white rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden">
                        {settings.logoUrl ? (
                          <img src={settings.logoUrl} className="w-full h-full object-contain" />
                        ) : (
                          <ImageIcon className="w-8 h-8 text-slate-300" />
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Logo da Empresa</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                          className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-brand-primary file:text-white hover:file:bg-brand-primary/90 cursor-pointer"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Nome da Empresa</label>
                      <input
                        type="text"
                        value={settings.companyName || ''}
                        onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                        className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">WhatsApp (com DDD, apenas números)</label>
                      <input
                        type="text"
                        value={settings.whatsapp || ''}
                        onChange={(e) => setSettings({ ...settings, whatsapp: e.target.value })}
                        className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Endereço Completo</label>
                      <input
                        type="text"
                        value={settings.address || ''}
                        onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                        className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Título Hero (Início)</label>
                      <input
                        type="text"
                        value={settings.heroTitle || ''}
                        onChange={(e) => setSettings({ ...settings, heroTitle: e.target.value })}
                        className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Subtítulo Hero</label>
                      <input
                        type="text"
                        value={settings.heroSubtitle || ''}
                        onChange={(e) => setSettings({ ...settings, heroSubtitle: e.target.value })}
                        className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">E-mail de Contato</label>
                      <input
                        type="email"
                        value={settings.email || ''}
                        onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                        className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                        placeholder="comercialferreiracalhas@gmail.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Texto Sobre a Empresa</label>
                      <textarea
                        rows={4}
                        value={settings.aboutText || ''}
                        onChange={(e) => setSettings({ ...settings, aboutText: e.target.value })}
                        className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                      />
                    </div>

                    {/* Foto da Tela Inicial */}
                    <div className="p-6 bg-slate-50 rounded-2xl">
                      <label className="block text-sm font-bold text-slate-700 mb-3">📸 Foto de Fundo da Tela Inicial</label>
                      {settings.heroImageUrl && (
                        <img src={settings.heroImageUrl} alt="Hero atual" className="w-full h-40 object-cover rounded-xl mb-4" />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setHeroFile(e.target.files?.[0] || null)}
                        className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-brand-primary file:text-white hover:file:bg-brand-primary/90 cursor-pointer"
                      />
                      {heroFile && <p className="text-xs text-brand-primary font-bold mt-2">{heroFile.name} selecionado</p>}
                      <p className="text-xs text-slate-400 mt-2">Se não selecionar, mantém a foto atual.</p>
                    </div>
                  </div>
                  <button
                    onClick={handleSaveSettings}
                    className="bg-brand-primary text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/20"
                  >
                    <Save className="w-5 h-5" /> Salvar Alterações
                  </button>

                  <div className="pt-12 mt-12 border-t border-slate-100">
                    <h3 className="text-xl font-bold mb-6">Segurança</h3>
                    <div className="max-w-md space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Nova Senha</label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                        />
                      </div>
                      <button
                        onClick={handleChangePassword}
                        disabled={changingPassword || newPassword.length < 6}
                        className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all disabled:opacity-50"
                      >
                        {changingPassword ? 'Alterando...' : 'Alterar Senha'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'services' && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold">Gerenciar Serviços</h2>
                  </div>

                  <form onSubmit={handleAddService} className="bg-slate-50 p-8 rounded-3xl space-y-6">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2"><Plus className="w-5 h-5 text-brand-primary" /> Adicionar Novo Serviço</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <input
                        type="text"
                        placeholder="Título do Serviço"
                        required
                        value={newService.title}
                        onChange={(e) => setNewService({ ...newService, title: e.target.value })}
                        className="bg-white border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                      />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setNewService({ ...newService, image: e.target.files?.[0] || null })}
                        className="bg-white border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                      />
                    </div>
                    <textarea
                      placeholder="Descrição detalhada"
                      required
                      rows={3}
                      value={newService.description}
                      onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                      className="w-full bg-white border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                    />
                    <button type="submit" className="bg-brand-primary text-white px-8 py-4 rounded-2xl font-bold hover:bg-brand-primary/90 transition-all">
                      Adicionar Serviço
                    </button>
                  </form>

                  <div className="grid grid-cols-1 gap-4">
                    {services.map((service) => (
                      <div key={service.id} className="p-6 bg-white border border-slate-100 rounded-3xl hover:shadow-md transition-all">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-4">
                            <img src={service.imageUrl} className="w-16 h-16 rounded-xl object-cover" />
                            <div>
                              <h4 className="font-bold">{service.title}</h4>
                              <p className="text-xs text-slate-500 line-clamp-1">{service.description}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDelete('services', service.id);
                            }}
                            className="text-red-500 p-3 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                            title="Excluir Serviço"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>

                        {/* Upload foto destaque na home */}
                        <div className="border-t border-slate-100 pt-4">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">🏠 Foto de destaque na tela inicial</p>
                          <div className="flex items-center gap-4">
                            {service.homeImageUrl && (
                              <img src={service.homeImageUrl} alt="Foto home" className="w-20 h-16 rounded-lg object-cover border border-slate-200" />
                            )}
                            <div className="flex-1">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const fd = new FormData();
                                  fd.append('homeImage', file);
                                  const res = await fetch(`/api/services/${service.id}/home-image`, {
                                    method: 'POST',
                                    body: fd,
                                    credentials: 'include'
                                  });
                                  if (res.ok) {
                                    setToast({ show: true, message: 'Foto da home atualizada!', type: 'success' });
                                    fetchData(true);
                                  } else {
                                    setToast({ show: true, message: 'Erro ao salvar foto.', type: 'error' });
                                  }
                                }}
                                className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-brand-primary hover:file:text-white cursor-pointer"
                              />
                              <p className="text-[10px] text-slate-400 mt-1">Esta foto aparece nos cards da tela inicial</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'posts' && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <h2 className="text-2xl font-bold">Publicações do Blog</h2>
                  <form onSubmit={handleAddPost} className="bg-slate-50 p-8 rounded-3xl space-y-6">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2"><Plus className="w-5 h-5 text-brand-primary" /> Nova Publicação</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <input
                        type="text"
                        placeholder="Título do Post"
                        required
                        value={newPost.title}
                        onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                        className="bg-white border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                      />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setNewPost({ ...newPost, image: e.target.files?.[0] || null })}
                        className="bg-white border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                      />
                    </div>
                    <textarea
                      placeholder="Conteúdo da publicação..."
                      required
                      rows={6}
                      value={newPost.content}
                      onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                      className="w-full bg-white border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                    />
                    <button type="submit" className="bg-brand-primary text-white px-8 py-4 rounded-2xl font-bold hover:bg-brand-primary/90 transition-all">
                      Publicar no Blog
                    </button>
                  </form>

                  <div className="grid grid-cols-1 gap-4">
                    {posts.map((post) => (
                      <div key={post.id} className="flex items-center justify-between p-6 bg-white border border-slate-100 rounded-3xl hover:shadow-md transition-all">
                        <div className="flex items-center gap-4">
                          <img src={post.imageUrl} className="w-16 h-16 rounded-xl object-cover" />
                          <div>
                            <h4 className="font-bold">{post.title}</h4>
                            <p className="text-xs text-slate-500">{new Date(post.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDelete('posts', post.id);
                          }}
                          className="text-red-500 p-3 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                          title="Excluir Post"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'gallery' && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">Galeria de Fotos</h2>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          if (selectedGalleryIds.length === gallery.length) {
                            setSelectedGalleryIds([]);
                          } else {
                            setSelectedGalleryIds(gallery.map(i => i.id));
                          }
                        }}
                        className="text-xs font-bold text-slate-500 hover:text-brand-primary transition-colors px-3 py-2 bg-slate-100 rounded-lg"
                      >
                        {selectedGalleryIds.length === gallery.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                      </button>
                    </div>
                  </div>
                  <form onSubmit={handleAddGallery} className="bg-slate-50 p-8 rounded-3xl space-y-6">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2"><ImageIcon className="w-5 h-5 text-brand-primary" /> Adicionar Foto</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-2">Imagens (Múltiplas)</label>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          required
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            setNewGalleryItem({ ...newGalleryItem, images: files });
                          }}
                          className="w-full bg-white border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                        />
                        {newGalleryItem.images.length > 0 && (
                          <p className="text-xs text-brand-primary font-bold ml-2">
                            {newGalleryItem.images.length} arquivo(s) selecionado(s)
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-2">Serviço Relacionado</label>
                        <select
                          value={newGalleryItem.serviceId}
                          onChange={(e) => setNewGalleryItem({ ...newGalleryItem, serviceId: e.target.value })}
                          className="w-full bg-white border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                        >
                          <option value="">Nenhum (Geral)</option>
                          {services.map(s => (
                            <option key={s.id} value={s.id}>{s.title}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-2">Descrição (opcional)</label>
                        <input
                          type="text"
                          placeholder="Ex: Instalação de calha em Sinop"
                          value={newGalleryItem.description}
                          onChange={(e) => setNewGalleryItem({ ...newGalleryItem, description: e.target.value })}
                          className="w-full bg-white border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                        />
                      </div>
                    </div>
                    <button type="submit" className="bg-brand-primary text-white px-8 py-4 rounded-2xl font-bold hover:bg-brand-primary/90 transition-all">
                      Enviar para Galeria
                    </button>
                  </form>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {gallery.map((item) => (
                      <div
                        key={item.id}
                        className={`relative group aspect-square rounded-2xl overflow-hidden border transition-all ${selectedGalleryIds.includes(item.id) ? 'ring-4 ring-brand-primary border-brand-primary' : 'border-slate-100'
                          }`}
                        onClick={() => toggleGallerySelection(item.id)}
                      >
                        <img src={item.imageUrl} className="w-full h-full object-cover" />

                        {/* Checkbox Overlay */}
                        <div className={`absolute top-3 right-3 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${selectedGalleryIds.includes(item.id)
                            ? 'bg-brand-primary border-brand-primary'
                            : 'bg-white/50 border-white opacity-0 group-hover:opacity-100'
                          }`}>
                          {selectedGalleryIds.includes(item.id) && (
                            <div className="w-2 h-4 border-r-2 border-b-2 border-white rotate-45 mb-1" />
                          )}
                        </div>

                        <div className="absolute top-2 left-2">
                          {item.serviceId && (
                            <span className="bg-brand-primary text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm">
                              {services.find(s => s.id === item.serviceId)?.title}
                            </span>
                          )}
                        </div>

                        {/* Delete Button - Simplified for maximum reliability */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('CLICK DIRETO NO BOTÃO');
                            handleDelete('gallery', item.id);
                          }}
                          className="absolute bottom-2 right-2 bg-red-600 text-white p-2 rounded-xl z-[100] shadow-xl hover:scale-110 active:scale-95 transition-transform cursor-pointer flex items-center justify-center"
                          style={{ minWidth: '40px', minHeight: '40px' }}
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'testimonials' && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <h2 className="text-2xl font-bold">Depoimentos e Avaliações</h2>
                  <form onSubmit={handleAddTestimonial} className="bg-slate-50 p-8 rounded-3xl space-y-6">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2"><Star className="w-5 h-5 text-brand-primary" /> Adicionar Depoimento</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <input
                        type="text"
                        placeholder="Nome do Cliente"
                        required
                        value={newTestimonial.author}
                        onChange={(e) => setNewTestimonial({ ...newTestimonial, author: e.target.value })}
                        className="bg-white border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                      />
                      <select
                        value={newTestimonial.rating}
                        onChange={(e) => setNewTestimonial({ ...newTestimonial, rating: parseInt(e.target.value) })}
                        className="bg-white border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                      >
                        <option value="5">5 Estrelas</option>
                        <option value="4">4 Estrelas</option>
                        <option value="3">3 Estrelas</option>
                        <option value="2">2 Estrelas</option>
                        <option value="1">1 Estrela</option>
                      </select>
                    </div>
                    <textarea
                      placeholder="Conteúdo do depoimento..."
                      required
                      rows={4}
                      value={newTestimonial.content}
                      onChange={(e) => setNewTestimonial({ ...newTestimonial, content: e.target.value })}
                      className="w-full bg-white border-none rounded-2xl px-6 py-4 focus:ring-2 focus:ring-brand-primary transition-all"
                    />
                    <button type="submit" className="bg-brand-primary text-white px-8 py-4 rounded-2xl font-bold hover:bg-brand-primary/90 transition-all">
                      Adicionar Depoimento
                    </button>
                  </form>

                  <div className="grid grid-cols-1 gap-4">
                    {testimonials.map((t) => (
                      <div key={t.id} className="flex items-center justify-between p-6 bg-white border border-slate-100 rounded-3xl hover:shadow-md transition-all">
                        <div className="flex-grow">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold">{t.author}</h4>
                            <div className="flex text-brand-primary">
                              {[...Array(t.rating)].map((_, i) => <Star key={i} className="w-3 h-3 fill-current" />)}
                            </div>
                          </div>
                          <p className="text-sm text-slate-600 italic">"{t.content}"</p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDelete('testimonials', t.id);
                          }}
                          className="text-red-500 p-3 hover:bg-red-50 rounded-xl transition-all shrink-0 cursor-pointer"
                          title="Excluir Depoimento"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      <AnimatePresence>
        {selectedGalleryIds.length > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4"
          >
            <div className="bg-slate-900 text-white rounded-3xl p-4 shadow-2xl flex items-center justify-between border border-white/10 backdrop-blur-xl">
              <div className="flex items-center gap-4 ml-2">
                <div className="bg-brand-primary/20 p-2 rounded-xl">
                  <Check className="w-5 h-5 text-brand-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold">{selectedGalleryIds.length} selecionados</p>
                  <button
                    onClick={() => setSelectedGalleryIds([])}
                    className="text-[10px] text-slate-400 hover:text-white transition-colors uppercase tracking-widest font-bold"
                  >
                    Limpar seleção
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedGalleryIds([])}
                  className="p-3 hover:bg-white/10 rounded-2xl transition-all"
                  title="Cancelar"
                >
                  <X className="w-5 h-5" />
                </button>
                <button
                  onClick={handleBulkDeleteGallery}
                  className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-red-500/40"
                >
                  <Trash2 className="w-5 h-5" />
                  Excluir Agora
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
