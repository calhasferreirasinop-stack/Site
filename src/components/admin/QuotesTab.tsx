import React, { useState } from 'react';
import { Eye, Check, X, Package, ChevronDown, Percent, PenLine } from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    pending: { label: 'Aguardando Pgto', color: 'bg-yellow-100 text-yellow-700' },
    paid: { label: 'Pago', color: 'bg-green-100 text-green-700' },
    in_production: { label: 'Em Produção', color: 'bg-blue-100 text-blue-700' },
    finished: { label: 'Finalizado', color: 'bg-slate-100 text-slate-600' },
    cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
};

interface Props {
    quotes: any[];
    currentUser: any;
    onSave: () => void;
    showToast: (msg: string, type: 'success' | 'error') => void;
}

const emptyManual = { clientName: '', totalValue: '', notes: '', status: 'paid' };

export default function QuotesTab({ quotes, currentUser, onSave, showToast }: Props) {
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [discountModal, setDiscountModal] = useState<any>(null);
    const [discountVal, setDiscountVal] = useState('');
    const [discountReason, setDiscountReason] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [manualForm, setManualForm] = useState(emptyManual);
    const [creating, setCreating] = useState(false);

    const updateStatus = async (id: number, status: string) => {
        const res = await fetch(`/api/quotes/${id}/status`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }), credentials: 'include',
        });
        if (res.ok) { showToast('Status atualizado!', 'success'); onSave(); }
        else showToast('Erro ao atualizar status', 'error');
    };

    const applyDiscount = async () => {
        if (!discountModal) return;
        const res = await fetch(`/api/quotes/${discountModal.id}/discount`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ discountValue: parseFloat(discountVal), reason: discountReason }),
            credentials: 'include',
        });
        if (res.ok) {
            showToast('Desconto aplicado!', 'success');
            setDiscountModal(null); setDiscountVal(''); setDiscountReason('');
            onSave();
        } else showToast('Erro ao aplicar desconto', 'error');
    };

    const handleCreateManual = async () => {
        if (!manualForm.clientName || !manualForm.totalValue) return showToast('Preencha cliente e valor', 'error');
        setCreating(true);
        try {
            const res = await fetch('/api/quotes', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientName: manualForm.clientName,
                    notes: manualForm.notes,
                    totalValue: parseFloat(manualForm.totalValue),
                    totalM2: 0,
                    bends: [],
                    adminCreated: true,
                }),
                credentials: 'include',
            });
            if (!res.ok) throw new Error((await res.json()).error);
            const q = await res.json();
            if (manualForm.status !== 'pending') {
                await fetch(`/api/quotes/${q.id}/status`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: manualForm.status }), credentials: 'include',
                });
            }
            showToast('Orçamento manual criado!', 'success');
            setManualForm(emptyManual); setShowCreate(false); onSave();
        } catch (e: any) { showToast(e.message || 'Erro ao criar', 'error'); }
        finally { setCreating(false); }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Orçamentos</h2>
                <button onClick={() => setShowCreate(!showCreate)}
                    className="bg-brand-primary text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 text-sm cursor-pointer">
                    <PenLine className="w-4 h-4" /> Lançar Manual
                </button>
            </div>

            {showCreate && (
                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 space-y-4">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        <PenLine className="w-4 h-4 text-brand-primary" />Lançamento Manual
                    </h3>
                    <p className="text-xs text-slate-500">Admin pode criar orçamento sem comprovante e marcar como pago / em produção diretamente.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Nome do Cliente *</label>
                            <input value={manualForm.clientName} onChange={e => setManualForm({ ...manualForm, clientName: e.target.value })}
                                placeholder="Ex: João Silva"
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-primary" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Valor Total (R$) *</label>
                            <input type="number" step="0.01" value={manualForm.totalValue}
                                onChange={e => setManualForm({ ...manualForm, totalValue: e.target.value })}
                                placeholder="Ex: 450.00"
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-primary" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Status Inicial</label>
                            <select value={manualForm.status} onChange={e => setManualForm({ ...manualForm, status: e.target.value })}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-primary">
                                <option value="pending">Aguardando Pagamento</option>
                                <option value="paid">Marcar como Pago</option>
                                <option value="in_production">Enviar direto para Produção</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Observações</label>
                            <input value={manualForm.notes} onChange={e => setManualForm({ ...manualForm, notes: e.target.value })}
                                placeholder="Ex: calha 6m galvanizada"
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-primary" />
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => { setShowCreate(false); setManualForm(emptyManual); }}
                            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-600 cursor-pointer">Cancelar</button>
                        <button onClick={handleCreateManual} disabled={creating}
                            className="px-6 py-2.5 bg-brand-primary text-white rounded-xl font-bold text-sm cursor-pointer hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                            <Check className="w-4 h-4" /> {creating ? 'Criando…' : 'Criar Orçamento'}
                        </button>
                    </div>
                </div>
            )}

            {discountModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-8 max-w-sm w-full space-y-4 shadow-2xl">
                        <h3 className="font-bold text-xl flex items-center gap-2"><Percent className="w-5 h-5 text-brand-primary" />Aplicar Desconto</h3>
                        <p className="text-sm text-slate-500">Orçamento #{discountModal.id} — Valor: R$ {parseFloat(discountModal.totalValue || 0).toFixed(2)}</p>
                        <input type="number" placeholder="Valor do desconto (R$)" value={discountVal}
                            onChange={e => setDiscountVal(e.target.value)}
                            className="w-full bg-slate-50 rounded-xl px-4 py-3 border border-slate-200 focus:ring-2 focus:ring-brand-primary outline-none" />
                        <input type="text" placeholder="Motivo do desconto" value={discountReason}
                            onChange={e => setDiscountReason(e.target.value)}
                            className="w-full bg-slate-50 rounded-xl px-4 py-3 border border-slate-200 focus:ring-2 focus:ring-brand-primary outline-none" />
                        <div className="flex gap-3">
                            <button onClick={() => setDiscountModal(null)}
                                className="flex-1 py-2.5 bg-slate-100 rounded-xl font-bold text-slate-600 cursor-pointer hover:bg-slate-200">Cancelar</button>
                            <button onClick={applyDiscount}
                                className="flex-1 py-2.5 bg-brand-primary text-white rounded-xl font-bold cursor-pointer hover:opacity-90">Confirmar</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                {quotes.length === 0 && <p className="text-slate-400 text-center py-8">Nenhum orçamento encontrado.</p>}
                {quotes.map(q => {
                    const st = STATUS_CONFIG[q.status] || STATUS_CONFIG.pending;
                    const isExpanded = expandedId === q.id;
                    return (
                        <div key={q.id} className="bg-white border border-slate-100 rounded-2xl overflow-hidden hover:shadow-sm transition-all">
                            <div className="p-4 flex items-center gap-4 flex-wrap cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : q.id)}>
                                <span className="font-black text-slate-300 text-sm">#{q.id}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-slate-900">{q.clientName || 'Cliente'}</p>
                                    <p className="text-xs text-slate-400">{new Date(q.createdAt).toLocaleString('pt-BR')}</p>
                                </div>
                                <span className={`text-xs font-bold px-3 py-1 rounded-full ${st.color}`}>{st.label}</span>
                                <div className="text-right">
                                    <p className="font-black text-slate-900">R$ {parseFloat(q.finalValue || q.totalValue || 0).toFixed(2)}</p>
                                    <p className="text-xs text-slate-400">{parseFloat(q.totalM2 || 0).toFixed(2)} m²</p>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                            {isExpanded && (
                                <div className="border-t border-slate-100 p-4 space-y-4 bg-slate-50">
                                    {q.pixProofUrl && (
                                        <a href={q.pixProofUrl} target="_blank" rel="noopener"
                                            className="flex items-center gap-2 text-sm font-bold text-brand-primary bg-brand-primary/10 px-4 py-2 rounded-xl w-fit">
                                            <Eye className="w-4 h-4" /> Ver Comprovante PIX
                                        </a>
                                    )}
                                    {q.discountValue > 0 && (
                                        <p className="text-sm text-slate-500">Desconto: <span className="text-red-500 font-bold">-R$ {parseFloat(q.discountValue).toFixed(2)}</span></p>
                                    )}
                                    {q.notes && <p className="text-sm text-slate-600 italic">"{q.notes}"</p>}
                                    <div className="flex flex-wrap gap-2">
                                        {q.status === 'pending' && (<>
                                            <button onClick={() => updateStatus(q.id, 'paid')}
                                                className="px-4 py-2 bg-green-500 text-white text-xs font-bold rounded-xl hover:bg-green-600 cursor-pointer flex items-center gap-1">
                                                <Check className="w-3.5 h-3.5" /> Marcar Pago
                                            </button>
                                            <button onClick={() => updateStatus(q.id, 'in_production')}
                                                className="px-4 py-2 bg-blue-500 text-white text-xs font-bold rounded-xl hover:bg-blue-600 cursor-pointer flex items-center gap-1">
                                                <Package className="w-3.5 h-3.5" /> Produção Direta
                                            </button>
                                            <button onClick={() => updateStatus(q.id, 'cancelled')}
                                                className="px-4 py-2 bg-red-500 text-white text-xs font-bold rounded-xl hover:bg-red-600 cursor-pointer flex items-center gap-1">
                                                <X className="w-3.5 h-3.5" /> Cancelar
                                            </button>
                                            {currentUser?.role === 'master' && (
                                                <button onClick={() => setDiscountModal(q)}
                                                    className="px-4 py-2 bg-purple-500 text-white text-xs font-bold rounded-xl hover:bg-purple-600 cursor-pointer flex items-center gap-1">
                                                    <Percent className="w-3.5 h-3.5" /> Desconto
                                                </button>
                                            )}
                                        </>)}
                                        {q.status === 'paid' && (
                                            <button onClick={() => updateStatus(q.id, 'in_production')}
                                                className="px-4 py-2 bg-blue-500 text-white text-xs font-bold rounded-xl hover:bg-blue-600 cursor-pointer flex items-center gap-1">
                                                <Package className="w-3.5 h-3.5" /> Enviar p/ Produção
                                            </button>
                                        )}
                                        {q.status === 'in_production' && (
                                            <button onClick={() => updateStatus(q.id, 'finished')}
                                                className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-900 cursor-pointer flex items-center gap-1">
                                                <Check className="w-3.5 h-3.5" /> Finalizar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
