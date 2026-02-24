import React, { useState, useEffect } from 'react';
import { Save, Upload, Image as ImageIcon, FileText, Trash2 } from 'lucide-react';

interface Props {
    showToast: (msg: string, type: 'success' | 'error') => void;
}

export default function ReportTab({ showToast }: Props) {
    const [config, setConfig] = useState({
        reportLogo: '',
        reportCompanyName: '',
        reportHeaderText: '',
        reportFooterText: '',
        reportPhone: '',
        reportEmail: '',
        reportAddress: '',
    });
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState('');
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/data', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                const s = data.settings || {};
                setConfig({
                    reportLogo: s.reportLogo || '',
                    reportCompanyName: s.reportCompanyName || '',
                    reportHeaderText: s.reportHeaderText || '',
                    reportFooterText: s.reportFooterText || '',
                    reportPhone: s.reportPhone || '',
                    reportEmail: s.reportEmail || '',
                    reportAddress: s.reportAddress || '',
                });
                if (s.reportLogo) setLogoPreview(s.reportLogo);
            }
        } catch { showToast('Erro ao carregar configurações', 'error'); }
        finally { setLoading(false); }
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setLogoFile(file);
            setLogoPreview(URL.createObjectURL(file));
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('reportCompanyName', config.reportCompanyName);
            fd.append('reportHeaderText', config.reportHeaderText);
            fd.append('reportFooterText', config.reportFooterText);
            fd.append('reportPhone', config.reportPhone);
            fd.append('reportEmail', config.reportEmail);
            fd.append('reportAddress', config.reportAddress);
            if (logoFile) fd.append('reportLogoFile', logoFile);
            const res = await fetch('/api/report-settings', {
                method: 'POST', body: fd, credentials: 'include',
            });
            if (res.ok) {
                showToast('Configurações do relatório salvas!', 'success');
                setLogoFile(null);
                fetchConfig();
            } else {
                showToast('Erro ao salvar', 'error');
            }
        } catch { showToast('Erro de conexão', 'error'); }
        finally { setSaving(false); }
    };

    if (loading) return (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" /></div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Configurações do Relatório</h2>
                <button onClick={handleSave} disabled={saving}
                    className="bg-brand-primary text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition-all text-sm cursor-pointer disabled:opacity-50">
                    {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar
                </button>
            </div>

            <p className="text-slate-500 text-sm">Configure o logo, cabeçalho e rodapé que aparecerão em todos os relatórios e PDFs gerados.</p>

            {/* Logo Upload */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 space-y-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2"><ImageIcon className="w-4 h-4 text-brand-primary" /> Logo da Empresa</h3>
                <div className="flex items-center gap-6">
                    {logoPreview ? (
                        <div className="relative">
                            <img src={logoPreview} alt="Logo" className="w-32 h-32 object-contain rounded-xl border border-slate-200 p-2" />
                            <button onClick={() => { setLogoFile(null); setLogoPreview(''); setConfig({ ...config, reportLogo: '' }); }}
                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-red-400">
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ) : (
                        <div className="w-32 h-32 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                            <ImageIcon className="w-8 h-8" />
                        </div>
                    )}
                    <div>
                        <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm cursor-pointer transition-all">
                            <Upload className="w-4 h-4" /> Enviar Logo
                            <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                        </label>
                        <p className="text-xs text-slate-400 mt-2">Recomendado: 300×100px, PNG com fundo transparente</p>
                    </div>
                </div>
            </div>

            {/* Header & Company Info */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 space-y-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2"><FileText className="w-4 h-4 text-brand-primary" /> Cabeçalho do Relatório</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1 block mb-1">Nome da Empresa</label>
                        <input value={config.reportCompanyName} onChange={e => setConfig({ ...config, reportCompanyName: e.target.value })}
                            placeholder="Ex: Ferreira Calhas" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-primary" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1 block mb-1">Telefone</label>
                        <input value={config.reportPhone} onChange={e => setConfig({ ...config, reportPhone: e.target.value })}
                            placeholder="(11) 99999-9999" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-primary" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1 block mb-1">E-mail</label>
                        <input value={config.reportEmail} onChange={e => setConfig({ ...config, reportEmail: e.target.value })}
                            placeholder="contato@empresa.com" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-primary" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1 block mb-1">Endereço</label>
                        <input value={config.reportAddress} onChange={e => setConfig({ ...config, reportAddress: e.target.value })}
                            placeholder="Rua Exemplo, 123 - Cidade/UF" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-primary" />
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1 block mb-1">Texto Adicional do Cabeçalho</label>
                    <textarea value={config.reportHeaderText} onChange={e => setConfig({ ...config, reportHeaderText: e.target.value })}
                        placeholder="CNPJ, slogan, informações extras..." rows={2}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-primary resize-none" />
                </div>
            </div>

            {/* Footer */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 space-y-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2"><FileText className="w-4 h-4 text-brand-primary" /> Rodapé do Relatório</h3>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1 block mb-1">Texto do Rodapé</label>
                    <textarea value={config.reportFooterText} onChange={e => setConfig({ ...config, reportFooterText: e.target.value })}
                        placeholder="Obrigado pela preferência! Garantia de 5 anos em todos os serviços." rows={2}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-primary resize-none" />
                </div>
            </div>

            {/* Preview */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 space-y-4">
                <h3 className="font-bold text-slate-900">📋 Prévia do Relatório</h3>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 bg-white">
                    {/* Header Preview */}
                    <div className="border-b-2 border-slate-200 pb-4 mb-4">
                        <div className="flex items-center gap-4">
                            {logoPreview && <img src={logoPreview} alt="Logo" className="h-12 object-contain" />}
                            <div>
                                <p className="font-black text-lg text-slate-900">{config.reportCompanyName || 'Nome da Empresa'}</p>
                                <div className="flex gap-3 text-xs text-slate-500 flex-wrap">
                                    {config.reportPhone && <span>📞 {config.reportPhone}</span>}
                                    {config.reportEmail && <span>✉ {config.reportEmail}</span>}
                                </div>
                                {config.reportAddress && <p className="text-xs text-slate-400">{config.reportAddress}</p>}
                            </div>
                        </div>
                        {config.reportHeaderText && <p className="text-xs text-slate-500 mt-2">{config.reportHeaderText}</p>}
                    </div>
                    {/* Body placeholder */}
                    <div className="space-y-2 py-8">
                        <div className="h-3 bg-slate-100 rounded-full w-3/4" />
                        <div className="h-3 bg-slate-100 rounded-full w-1/2" />
                        <div className="h-3 bg-slate-100 rounded-full w-2/3" />
                        <div className="h-8 bg-slate-50 rounded-lg mt-4" />
                    </div>
                    {/* Footer Preview */}
                    <div className="border-t-2 border-slate-200 pt-4 mt-4">
                        <p className="text-xs text-slate-400 text-center">{config.reportFooterText || 'Texto do rodapé aparecerá aqui'}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
