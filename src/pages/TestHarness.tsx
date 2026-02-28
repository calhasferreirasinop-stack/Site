import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

// Reusable Table Component (Internal to Harness)
const HarnessTable = ({ title, columns, data, onEdit, onDelete, onCreate }: any) => (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-800">{title}</h3>
            <button onClick={onCreate} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-bold">Novo +</button>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
                <thead>
                    <tr className="bg-slate-50">
                        {columns.map((c: any) => <th key={c.key} className="p-2 border-b font-bold">{c.label}</th>)}
                        <th className="p-2 border-b font-bold">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((row: any) => (
                        <tr key={row.id} className="hover:bg-slate-50">
                            {columns.map((c: any) => <td key={c.key} className="p-2 border-b">{String(row[c.key] || '')}</td>)}
                            <td className="p-2 border-b space-x-2">
                                <button onClick={() => onEdit(row)} className="text-blue-600 hover:underline">Editar</button>
                                <button onClick={() => onDelete(row.id)} className="text-red-600 hover:underline">Excluir</button>
                            </td>
                        </tr>
                    ))}
                    {data.length === 0 && <tr><td colSpan={columns.length + 1} className="p-4 text-center text-slate-400">Nenhum registro.</td></tr>}
                </tbody>
            </table>
        </div>
    </div>
);

export default function TestHarness() {
    const clients = useApi<any>('/api/clients');
    const products = useApi<any>('/api/products');
    const estimates = useApi<any>('/api/estimates');
    const payments = useApi<any>('/api/payments');

    useEffect(() => {
        clients.refresh();
        products.refresh();
        estimates.refresh();
        payments.refresh();
    }, []);

    const [modal, setModal] = useState<{ type: string, data?: any } | null>(null);

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-12 bg-slate-50 min-h-screen font-sans" style={{ paddingTop: '100px' }}>
            <header className="border-b pb-4">
                <h1 className="text-3xl font-black text-slate-900">SaaS V2 Test Harness</h1>
                <p className="text-slate-500">Validação técnica da arquitetura Multi-Tenant</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* 1. Clients */}
                <HarnessTable
                    title="Clientes (Table: clients)"
                    columns={[
                        { key: 'name', label: 'Nome' },
                        { key: 'email', label: 'E-mail' },
                        { key: 'phone', label: 'Telefone' }
                    ]}
                    data={clients.data}
                    onDelete={clients.remove}
                    onEdit={(u: any) => setModal({ type: 'client', data: u })}
                    onCreate={() => setModal({ type: 'client' })}
                />

                {/* 2. Products */}
                <HarnessTable
                    title="Produtos (Table: products)"
                    columns={[
                        { key: 'name', label: 'Nome' },
                        { key: 'price', label: 'Preço (R$)' },
                        { key: 'stock_quantity', label: 'Estoque' }
                    ]}
                    data={products.data}
                    onDelete={products.remove}
                    onEdit={(u: any) => setModal({ type: 'product', data: u })}
                    onCreate={() => setModal({ type: 'product' })}
                />

                {/* 3. Estimates */}
                <HarnessTable
                    title="Orçamentos (Table: estimates)"
                    columns={[
                        { key: 'id', label: 'ID' },
                        { key: 'total_amount', label: 'Total (R$)' },
                        { key: 'status', label: 'Status' }
                    ]}
                    data={estimates.data}
                    onDelete={estimates.remove}
                    onEdit={(u: any) => setModal({ type: 'estimate', data: u })}
                    onCreate={() => setModal({ type: 'estimate' })}
                />

                {/* 4. Payments */}
                <HarnessTable
                    title="Pagamentos (Table: payments)"
                    columns={[
                        { key: 'id', label: 'ID' },
                        { key: 'amount', label: 'Valor (R$)' },
                        { key: 'status', label: 'Status' }
                    ]}
                    data={payments.data}
                    onDelete={payments.remove}
                    onEdit={(u: any) => setModal({ type: 'payment', data: u })}
                    onCreate={() => setModal({ type: 'payment' })}
                />
            </div>

            {/* Basic Modals for CRUD */}
            {modal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[999]">
                    <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl">
                        <h2 className="text-xl font-bold mb-4">{modal.data ? 'Editar' : 'Criar'} {modal.type}</h2>
                        <div className="space-y-4">
                            {modal.type === 'client' && (
                                <>
                                    <input className="w-full border p-2 rounded" placeholder="Nome" defaultValue={modal.data?.name} id="client-name" />
                                    <input className="w-full border p-2 rounded" placeholder="E-mail" defaultValue={modal.data?.email} id="client-email" />
                                    <input className="w-full border p-2 rounded" placeholder="Telefone" defaultValue={modal.data?.phone} id="client-phone" />
                                </>
                            )}
                            {modal.type === 'product' && (
                                <>
                                    <input className="w-full border p-2 rounded" placeholder="Nome" defaultValue={modal.data?.name} id="prod-name" />
                                    <input className="w-full border p-2 rounded" type="number" placeholder="Preço" defaultValue={modal.data?.price} id="prod-price" />
                                    <input className="w-full border p-2 rounded" type="number" placeholder="Estoque" defaultValue={modal.data?.stock_quantity} id="prod-stock" />
                                </>
                            )}
                            {modal.type === 'estimate' && (
                                <p className="text-sm text-slate-500">Criação simplificada via API. Informe apenas o total para teste.</p>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setModal(null)} className="px-4 py-2 text-slate-500">Voltar</button>
                            <button onClick={async () => {
                                try {
                                    if (modal.type === 'client') {
                                        const name = (document.getElementById('client-name') as HTMLInputElement).value;
                                        const email = (document.getElementById('client-email') as HTMLInputElement).value;
                                        const phone = (document.getElementById('client-phone') as HTMLInputElement).value;
                                        if (modal.data) await clients.update(modal.data.id, { name, email, phone });
                                        else await clients.create({ name, email, phone });
                                    } else if (modal.type === 'product') {
                                        const name = (document.getElementById('prod-name') as HTMLInputElement).value;
                                        const price = parseFloat((document.getElementById('prod-price') as HTMLInputElement).value);
                                        const stock_quantity = parseFloat((document.getElementById('prod-stock') as HTMLInputElement).value);
                                        if (modal.data) await products.update(modal.data.id, { name, price, stock_quantity });
                                        else await products.create({ name, price, stock_quantity, description: name });
                                    }
                                    setModal(null);
                                } catch (e: any) { alert(e.message); }
                            }} className="bg-blue-600 text-white px-6 py-2 rounded font-bold">Salvar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
