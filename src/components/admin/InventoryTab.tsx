import React, { useState } from 'react';
import { Plus, AlertTriangle, Trash2, Package } from 'lucide-react';

interface Props {
    inventory: any[];
    onSave: () => void;
    showToast: (msg: string, type: 'success' | 'error') => void;
}

const emptyForm = {
    description: '', widthM: '1.2', lengthM: '33',
    costPerUnit: '', quantity: '1', notes: '', lowStockThresholdM2: '5'
};

export default function InventoryTab({ inventory, onSave, showToast }: Props) {
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [loading, setLoading] = useState(false);

    const totalAvailable = inventory.reduce((s, i) => s + parseFloat(i.availableM2 || 0), 0);
    const hasLowStock = inventory.some(i => parseFloat(i.availableM2) < parseFloat(i.lowStockThresholdM2 || 5));

    // Auto-calculate total cost = unit cost × quantity
    const totalCost = (parseFloat(form.costPerUnit) || 0) * (parseInt(form.quantity) || 1);
    // Total m² = width × length × quantity
    const totalM2perEntry = (parseFloat(form.widthM) || 1.2) * (parseFloat(form.lengthM) || 33) * (parseInt(form.quantity) || 1);

    const handleAdd = async () => {
        setLoading(true);
        try {
            const qty = parseInt(form.quantity) || 1;
            // Each bobina is an inventory entry; we batch insert based on quantity
            const entries = [];
            for (let i = 0; i < qty; i++) {
                entries.push({
                    description: form.description,
                    widthM: parseFloat(form.widthM),
                    lengthM: parseFloat(form.lengthM),
                    costPerUnit: parseFloat(form.costPerUnit) || 0,
                    notes: form.notes,
                    lowStockThresholdM2: parseFloat(form.lowStockThresholdM2) || 5,
                });
            }
            const res = await fetch('/api/inventory/batch', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries }), credentials: 'include',
            });
            if (!res.ok) {
                // fallback: single add
                await fetch('/api/inventory', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...form, quantity: qty }), credentials: 'include',
                });
            }
            showToast(`${qty} bobina(s) adicionada(s)!`, 'success');
            setForm(emptyForm); setShowForm(false); onSave();
        } catch (e: any) { showToast(e.message || 'Erro', 'error'); }
        finally { setLoading(false); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Remover bobina?')) return;
        await fetch(`/api/inventory/${id}`, { method: 'DELETE', credentials: 'include' });
        showToast('Bobina removida', 'success'); onSave();
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Estoque de Bobinas</h2>
                <button onClick={() => setShowForm(!showForm)}
                    className="bg-brand-primary text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition-all text-sm cursor-pointer">
                    <Plus className="w-4 h-4" /> Adicionar Bobina
                </button>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-2xl p-4">
                    <p className="text-xs text-blue-600 font-bold uppercase tracking-wider">Total Disponível</p>
                    <p className="text-2xl font-black text-blue-700 mt-1">{totalAvailable.toFixed(2)} m²</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4">
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Bobinas em Estoque</p>
                    <p className="text-2xl font-black text-slate-700 mt-1">{inventory.length}</p>
                </div>
                {hasLowStock && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
                        <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
                        <div>
                            <p className="text-xs text-red-600 font-bold">Estoque Baixo!</p>
                            <p className="text-xs text-red-500">Algumas bobinas estão abaixo do mínimo</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Add form */}
            {showForm && (
                <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200 space-y-4">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2"><Package className="w-4 h-4 text-brand-primary" />Nova Bobina</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {[
                            { label: 'Descrição', key: 'description', ph: 'Ex: Galvanizada #26', span2: true },
                            { label: 'Largura (m)', key: 'widthM', ph: '1.2' },
                            { label: 'Comprimento (m)', key: 'lengthM', ph: '33' },
                            { label: '🔢 Quantidade de bobinas', key: 'quantity', ph: '1', highlight: true },
                            { label: 'Custo unitário (R$)', key: 'costPerUnit', ph: '450.00' },
                            { label: 'Alerta estoque (m²)', key: 'lowStockThresholdM2', ph: '5' },
                            { label: 'Observações', key: 'notes', ph: 'Fornecedor, tipo...', span2: true },
                        ].map(f => (
                            <div key={f.key} className={f.span2 ? 'col-span-2' : ''}>
                                <label className={`text-xs font-bold uppercase ml-1 block mb-1 ${f.highlight ? 'text-brand-primary' : 'text-slate-500'}`}>{f.label}</label>
                                <input value={(form as any)[f.key]} placeholder={f.ph}
                                    type={(f.key === 'quantity' || f.key === 'costPerUnit' || f.key === 'widthM' || f.key === 'lengthM' || f.key === 'lowStockThresholdM2') ? 'number' : 'text'}
                                    min={f.key === 'quantity' ? '1' : undefined}
                                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                                    className={`w-full bg-white border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-primary ${f.highlight ? 'border-brand-primary/40 bg-brand-primary/5' : 'border-slate-200'}`} />
                            </div>
                        ))}
                    </div>

                    {/* Auto-calculated totals */}
                    {(parseFloat(form.quantity) > 1 || parseFloat(form.costPerUnit) > 0) && (
                        <div className="bg-blue-50 rounded-2xl p-4 grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-xs text-blue-600 font-bold uppercase">Custo Total (auto)</p>
                                <p className="text-xl font-black text-blue-700 mt-1">R$ {totalCost.toFixed(2)}</p>
                                <p className="text-xs text-slate-400">{form.quantity}x R$ {form.costPerUnit || '0'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-blue-600 font-bold uppercase">m² Total</p>
                                <p className="text-xl font-black text-blue-700 mt-1">{totalM2perEntry.toFixed(2)} m²</p>
                                <p className="text-xs text-slate-400">{form.quantity}x {form.widthM}×{form.lengthM}m</p>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button onClick={() => setShowForm(false)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-600 cursor-pointer">Cancelar</button>
                        <button onClick={handleAdd} disabled={loading}
                            className="px-6 py-2.5 bg-brand-primary text-white rounded-xl font-bold text-sm cursor-pointer hover:opacity-90 disabled:opacity-50">
                            {loading ? 'Salvando…' : `Adicionar${parseInt(form.quantity) > 1 ? ` ${form.quantity} bobinas` : ' bobina'}`}
                        </button>
                    </div>
                </div>
            )}

            {/* List */}
            <div className="space-y-3">
                {inventory.length === 0 && <p className="text-slate-400 text-center py-8">Nenhuma bobina cadastrada.</p>}
                {inventory.map(inv => {
                    const pct = (parseFloat(inv.availableM2) / (parseFloat(inv.widthM) * parseFloat(inv.lengthM))) * 100;
                    const isLow = parseFloat(inv.availableM2) < parseFloat(inv.lowStockThresholdM2 || 5);
                    return (
                        <div key={inv.id} className={`bg-white border rounded-2xl p-4 ${isLow ? 'border-red-200' : 'border-slate-100'}`}>
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-bold text-slate-900">{inv.description || `Bobina #${inv.id}`}</p>
                                        {isLow && <span className="text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Estoque Baixo</span>}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5">{inv.widthM}m × {inv.lengthM}m · {new Date(inv.purchasedAt).toLocaleDateString('pt-BR')}</p>
                                    {inv.costPerUnit && <p className="text-xs text-slate-500 mt-0.5">Custo unit.: R$ {parseFloat(inv.costPerUnit).toFixed(2)}</p>}
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="font-black text-slate-900">{parseFloat(inv.availableM2).toFixed(2)} m²</p>
                                    <p className="text-xs text-slate-400">disponível</p>
                                </div>
                                <button onClick={() => handleDelete(inv.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-xl cursor-pointer">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="mt-3 bg-slate-100 rounded-full h-2 overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${isLow ? 'bg-red-400' : 'bg-green-400'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                            </div>
                            <p className="text-xs text-slate-400 mt-1">{pct.toFixed(0)}% restante</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
