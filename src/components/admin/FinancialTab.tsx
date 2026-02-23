import React, { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, ShoppingCart, BarChart2 } from 'lucide-react';

interface Props {
    showToast: (msg: string, type: 'success' | 'error') => void;
}

export default function FinancialTab({ showToast }: Props) {
    const [summary, setSummary] = useState<any>(null);
    const [records, setRecords] = useState<any[]>([]);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (from) params.set('from', from);
            if (to) params.set('to', to);
            const [sRes, rRes] = await Promise.all([
                fetch('/api/financial/summary', { credentials: 'include' }),
                fetch(`/api/financial?${params}`, { credentials: 'include' }),
            ]);
            if (sRes.ok) setSummary(await sRes.json());
            if (rRes.ok) setRecords(await rRes.json());
        } catch { showToast('Erro ao carregar dados financeiros', 'error'); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const fmt = (v: number) => `R$ ${(v || 0).toFixed(2)}`;

    const cards = summary ? [
        { label: 'Total Hoje', value: fmt(summary.totalToday), sub: `${summary.countToday} pedidos`, icon: DollarSign, color: 'from-green-500 to-emerald-600' },
        { label: 'Total do Mês', value: fmt(summary.totalMonth), sub: `${summary.countMonth} pedidos`, icon: TrendingUp, color: 'from-blue-500 to-blue-600' },
        { label: 'Total Geral', value: fmt(summary.totalAll), sub: `${summary.countAll} pedidos`, icon: BarChart2, color: 'from-purple-500 to-purple-600' },
        { label: 'Ticket Médio', value: fmt(summary.ticketAverage), sub: 'por pedido', icon: ShoppingCart, color: 'from-orange-500 to-orange-600' },
    ] : [];

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <h2 className="text-2xl font-bold">Fluxo Financeiro</h2>

            {loading ? (
                <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" /></div>
            ) : (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {cards.map(c => {
                            const Icon = c.icon;
                            return (
                                <div key={c.label} className={`bg-gradient-to-br ${c.color} rounded-2xl p-5 text-white`}>
                                    <Icon className="w-6 h-6 opacity-80 mb-3" />
                                    <p className="text-xs font-bold uppercase tracking-wider opacity-80">{c.label}</p>
                                    <p className="text-2xl font-black mt-1">{c.value}</p>
                                    <p className="text-xs opacity-70 mt-0.5">{c.sub}</p>
                                </div>
                            );
                        })}
                    </div>

                    {/* Filters */}
                    <div className="flex gap-3 flex-wrap items-end">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">De</label>
                            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-primary" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Até</label>
                            <input type="date" value={to} onChange={e => setTo(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-primary" />
                        </div>
                        <button onClick={fetchData}
                            className="px-5 py-2.5 bg-brand-primary text-white rounded-xl font-bold text-sm cursor-pointer hover:opacity-90">
                            Filtrar
                        </button>
                        {(from || to) && (
                            <button onClick={() => { setFrom(''); setTo(''); setTimeout(fetchData, 50); }}
                                className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm cursor-pointer hover:bg-slate-200">
                                Limpar
                            </button>
                        )}
                    </div>

                    {/* Records Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100">
                                    {['#', 'Cliente', 'Valor Bruto', 'Desconto', 'Valor Líquido', 'Forma', 'Data'].map(h => (
                                        <th key={h} className="text-left py-3 px-3 text-slate-500 font-bold text-xs uppercase tracking-wider">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {records.length === 0 && (
                                    <tr><td colSpan={7} className="text-center py-8 text-slate-400">Nenhum registro encontrado.</td></tr>
                                )}
                                {records.map(r => (
                                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="py-3 px-3 font-bold text-slate-400">#{r.quoteId}</td>
                                        <td className="py-3 px-3 font-medium text-slate-900">{r.clientName || '—'}</td>
                                        <td className="py-3 px-3 text-slate-700">{fmt(r.grossValue)}</td>
                                        <td className="py-3 px-3 text-red-500">{r.discountValue > 0 ? `-${fmt(r.discountValue)}` : '—'}</td>
                                        <td className="py-3 px-3 font-black text-green-600">{fmt(r.netValue)}</td>
                                        <td className="py-3 px-3">
                                            <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full uppercase">
                                                {r.paymentMethod || 'pix'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-3 text-slate-400 text-xs">
                                            {r.paidAt ? new Date(r.paidAt).toLocaleString('pt-BR') : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            {records.length > 0 && (
                                <tfoot>
                                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                                        <td colSpan={4} className="py-3 px-3 font-bold text-slate-900 text-right">Total:</td>
                                        <td className="py-3 px-3 font-black text-green-600 text-lg">
                                            {fmt(records.reduce((s, r) => s + parseFloat(r.netValue || 0), 0))}
                                        </td>
                                        <td colSpan={2}></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
