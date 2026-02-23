import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
    Plus, Trash2, ChevronRight, ChevronLeft, Check, AlertTriangle,
    Printer, Copy, Send, RefreshCw, Undo2, FileDown, ZoomIn, X, PenLine
} from 'lucide-react';
import BendCanvas, {
    Risk, RiskDirection, DIRECTION_LABELS, DIRECTION_ICONS, OPPOSITE_DIRECTION
} from '../components/BendCanvas';

// ─── Rounding Rule ────────────────────────────────────────────────────────────
// Integer → round to nearest multiple of 5 (commercial: 21→20, 23→25, 26→25)
// Decimal  → always ceil to next multiple of 5 (21.01→25, 26.01→30)
function roundToMultipleOf5(value: number): number {
    if (value <= 0) return 5;
    if (value === Math.floor(value)) {
        return Math.round(value / 5) * 5 || 5;
    }
    return Math.ceil(value / 5) * 5;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Bend {
    id: string;
    risks: Risk[];
    confirmed: boolean;
    totalWidthCm: number;
    roundedWidthCm: number;
    lengths: string[];
    totalLengthM: number;
    m2: number;
    svgDataUrl?: string; // captured image
}

// ─── 8-direction grid layout ──────────────────────────────────────────────────
const DIRECTIONS: { dir: RiskDirection; icon: string; label: string; color: string }[] = [
    { dir: 'upLeft', icon: '↖', label: 'Cima-Esq', color: 'from-violet-500 to-violet-600' },
    { dir: 'up', icon: '↑', label: 'Cima', color: 'from-blue-500 to-blue-600' },
    { dir: 'upRight', icon: '↗', label: 'Cima-Dir', color: 'from-cyan-500 to-cyan-600' },
    { dir: 'left', icon: '←', label: 'Esquerda', color: 'from-orange-500 to-orange-600' },
    { dir: 'right', icon: '→', label: 'Direita', color: 'from-green-500 to-green-600' },
    { dir: 'downLeft', icon: '↙', label: 'Baixo-Esq', color: 'from-pink-500 to-pink-600' },
    { dir: 'down', icon: '↓', label: 'Baixo', color: 'from-red-500 to-red-600' },
    { dir: 'downRight', icon: '↘', label: 'Baixo-Dir', color: 'from-amber-500 to-amber-600' },
];

const MAX_WIDTH_CM = 120;
const generateId = () => Math.random().toString(36).slice(2);

function totalRiskWidth(risks: Risk[]) {
    return risks.reduce((s, r) => s + (parseFloat(String(r.sizeCm)) || 0), 0);
}

function calcBendM2(roundedWidthCm: number, lengths: string[]): { totalLengthM: number; m2: number } {
    const vals = lengths.map(l => parseFloat(l)).filter(v => !isNaN(v) && v > 0);
    const totalLengthM = vals.reduce((a, b) => a + b, 0);
    return { totalLengthM, m2: (roundedWidthCm / 100) * totalLengthM };
}

// ─── Capture SVG as PNG data URL ──────────────────────────────────────────────
async function captureSvg(svgEl: SVGSVGElement): Promise<string> {
    return new Promise((resolve) => {
        try {
            const svgData = new XMLSerializer().serializeToString(svgEl);
            const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 920;
                canvas.height = 440;
                const ctx = canvas.getContext('2d')!;
                ctx.fillStyle = '#1e293b';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => resolve('');
            img.src = url;
        } catch { resolve(''); }
    });
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Orcamento() {
    const navigate = useNavigate();
    const [user, setUser] = useState<any>(null);
    const [settings, setSettings] = useState<any>({});
    const [step, setStep] = useState<'bends' | 'summary' | 'payment'>('bends');
    const [bends, setBends] = useState<Bend[]>([]);

    // Current bend builder
    const [currentRisks, setCurrentRisks] = useState<Risk[]>([]);
    const [pendingDirection, setPendingDirection] = useState<RiskDirection | null>(null);
    const [pendingSize, setPendingSize] = useState('');
    const [sizeError, setSizeError] = useState('');
    const [editingRiskIdx, setEditingRiskIdx] = useState<number | null>(null);
    const [editingSize, setEditingSize] = useState('');

    // Post-confirm flow
    const [showPostConfirm, setShowPostConfirm] = useState(false);

    // Image zoom
    const [zoomImg, setZoomImg] = useState<string | null>(null);

    // Payment
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [savedQuote, setSavedQuote] = useState<any>(null);
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [uploadingProof, setUploadingProof] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const svgRef = useRef<SVGSVGElement>(null);
    const topRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }
    }, [toast]);

    useEffect(() => {
        fetch('/api/auth/check', { credentials: 'include' })
            .then(r => r.json())
            .then(d => { if (!d.authenticated) navigate('/login'); else setUser(d); });
        fetch('/api/settings')
            .then(r => r.json())
            .then(d => setSettings(d));
    }, []);

    const currentWidth = totalRiskWidth(currentRisks);
    const currentRounded = roundToMultipleOf5(currentWidth);
    const isOverLimit = currentWidth > MAX_WIDTH_CM;

    // ── Anti-reversal check ───────────────────────────────────────────────────
    const checkReversal = (dir: RiskDirection, size: number): boolean => {
        if (currentRisks.length === 0) return false;
        const last = currentRisks[currentRisks.length - 1];
        return OPPOSITE_DIRECTION[dir] === last.direction && size === last.sizeCm;
    };

    // ── Add risk ──────────────────────────────────────────────────────────────
    const handleAddRisk = () => {
        const size = parseFloat(pendingSize);
        if (!pendingDirection) { setSizeError('Selecione a direção do risco'); return; }
        if (!size || size <= 0) { setSizeError('Informe um tamanho válido'); return; }
        if (checkReversal(pendingDirection, size)) {
            setSizeError('⚠ Este risco anula o anterior e não é permitido.');
            return;
        }
        if (currentWidth + size > MAX_WIDTH_CM) {
            setSizeError(`Soma excede ${MAX_WIDTH_CM} cm. Disponível: ${(MAX_WIDTH_CM - currentWidth).toFixed(1)} cm`);
            return;
        }
        setSizeError('');
        setCurrentRisks(prev => [...prev, { direction: pendingDirection, sizeCm: size }]);
        setPendingDirection(null);
        setPendingSize('');
    };

    const handleUndoRisk = () => setCurrentRisks(prev => prev.slice(0, -1));

    // ── Inline risk editing ───────────────────────────────────────────────────
    const startEditRisk = (idx: number) => {
        setEditingRiskIdx(idx);
        setEditingSize(String(currentRisks[idx].sizeCm));
    };

    const commitEditRisk = (idx: number) => {
        const size = parseFloat(editingSize);
        if (!size || size <= 0) { setEditingRiskIdx(null); return; }
        const newRisks = [...currentRisks];
        newRisks[idx] = { ...newRisks[idx], sizeCm: size };
        // Validate total
        const newTotal = newRisks.reduce((s, r) => s + r.sizeCm, 0);
        if (newTotal > MAX_WIDTH_CM) {
            setSizeError(`Edição excede ${MAX_WIDTH_CM} cm. Total seria: ${newTotal.toFixed(1)} cm`);
            setEditingRiskIdx(null);
            return;
        }
        setCurrentRisks(newRisks);
        setEditingRiskIdx(null);
        setSizeError('');
    };

    // ── Confirm bend ──────────────────────────────────────────────────────────
    const handleConfirmBend = async () => {
        if (currentRisks.length === 0) { setToast({ msg: 'Adicione pelo menos 1 risco', type: 'error' }); return; }
        if (isOverLimit) { setToast({ msg: 'Largura excede 1,20m!', type: 'error' }); return; }

        // Capture SVG image
        let svgDataUrl = '';
        if (svgRef.current) svgDataUrl = await captureSvg(svgRef.current);

        const newBend: Bend = {
            id: generateId(),
            risks: [...currentRisks],
            confirmed: true,
            totalWidthCm: currentWidth,
            roundedWidthCm: currentRounded,
            lengths: [''],
            totalLengthM: 0,
            m2: 0,
            svgDataUrl,
        };
        setBends(prev => [...prev, newBend]);
        setCurrentRisks([]);
        setPendingDirection(null);
        setPendingSize('');
        setShowPostConfirm(true);
    };

    const handleStartNewBend = () => {
        setShowPostConfirm(false);
        topRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // ── Update lengths ────────────────────────────────────────────────────────
    const updateBendLength = (bendId: string, idx: number, value: string) => {
        setBends(prev => prev.map(b => {
            if (b.id !== bendId) return b;
            const newLengths = [...b.lengths];
            newLengths[idx] = value;
            const { totalLengthM, m2 } = calcBendM2(b.roundedWidthCm, newLengths);
            return { ...b, lengths: newLengths, totalLengthM, m2 };
        }));
    };

    const addLength = (bendId: string) =>
        setBends(prev => prev.map(b => b.id === bendId ? { ...b, lengths: [...b.lengths, ''] } : b));

    const removeLength = (bendId: string, idx: number) => {
        setBends(prev => prev.map(b => {
            if (b.id !== bendId || b.lengths.length <= 1) return b;
            const newLengths = b.lengths.filter((_, i) => i !== idx);
            const { totalLengthM, m2 } = calcBendM2(b.roundedWidthCm, newLengths);
            return { ...b, lengths: newLengths, totalLengthM, m2 };
        }));
    };

    const deleteBend = (bendId: string) => setBends(prev => prev.filter(b => b.id !== bendId));

    const editBend = (bendId: string) => {
        const bend = bends.find(b => b.id === bendId);
        if (!bend) return;
        setCurrentRisks(bend.risks);
        setBends(prev => prev.filter(b => b.id !== bendId));
        setShowPostConfirm(false);
    };

    // ── Totals ────────────────────────────────────────────────────────────────
    const totalM2 = bends.reduce((s, b) => s + b.m2, 0);
    const pricePerM2 = parseFloat(settings.pricePerM2 || '50');
    const totalValue = totalM2 * pricePerM2;

    // ── Submit quote ──────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (bends.length === 0) { setToast({ msg: 'Adicione pelo menos uma dobra', type: 'error' }); return; }
        const hasAllLengths = bends.every(b => b.lengths.some(l => parseFloat(l) > 0));
        if (!hasAllLengths) { setToast({ msg: 'Informe metros corridos em todas as dobras', type: 'error' }); return; }
        setSubmitting(true);
        try {
            const payload = {
                clientName: user?.name || user?.username,
                notes,
                bends: bends.map(b => ({
                    risks: b.risks,
                    totalWidthCm: b.totalWidthCm,
                    roundedWidthCm: b.roundedWidthCm,
                    lengths: b.lengths.filter(l => parseFloat(l) > 0).map(Number),
                    totalLengthM: b.totalLengthM,
                    m2: b.m2,
                })),
            };
            const res = await fetch('/api/quotes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'include',
            });
            if (!res.ok) throw new Error((await res.json()).error || await res.text());
            const quote = await res.json();
            setSavedQuote(quote);
            setStep('payment');
            setToast({ msg: 'Orçamento salvo com sucesso!', type: 'success' });

            // WhatsApp notification
            const phone = settings.whatsappMaster || settings.whatsapp;
            if (phone) {
                const msg = encodeURIComponent(
                    `🔔 *Novo Orçamento #${quote.id}*\n` +
                    `👤 Cliente: ${quote.clientName}\n` +
                    `📐 Total m²: ${totalM2.toFixed(4)} m²\n` +
                    `💰 Valor: R$ ${totalValue.toFixed(2)}\n` +
                    `📅 Data: ${new Date().toLocaleDateString('pt-BR')}`
                );
                window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
            }
        } catch (err: any) {
            setToast({ msg: err.message || 'Erro ao salvar orçamento. Tente novamente.', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    // ── Upload proof ──────────────────────────────────────────────────────────
    const handleUploadProof = async () => {
        if (!proofFile || !savedQuote) return;
        setUploadingProof(true);
        const fd = new FormData();
        fd.append('proof', proofFile);
        const res = await fetch(`/api/quotes/${savedQuote.id}/proof`, { method: 'POST', body: fd, credentials: 'include' });
        if (res.ok) {
            setToast({ msg: 'Comprovante enviado! Aguarde a validação.', type: 'success' });
            setProofFile(null);
        } else {
            setToast({ msg: 'Erro ao enviar comprovante', type: 'error' });
        }
        setUploadingProof(false);
    };

    // ── Print / PDF ───────────────────────────────────────────────────────────
    const handlePrint = () => window.print();

    const handleDownloadPDF = () => {
        const rows = bends.map((b, i) => `
            <tr>
                <td>#${i + 1}</td>
                <td>${b.risks.map(r => `${DIRECTION_ICONS[r.direction]} ${r.sizeCm}cm`).join(', ')}</td>
                <td>${b.totalWidthCm.toFixed(1)} → <strong>${b.roundedWidthCm}cm</strong></td>
                <td>${b.lengths.filter(l => parseFloat(l) > 0).join(' + ')} = ${b.totalLengthM.toFixed(2)}m</td>
                <td>${b.m2.toFixed(4)}</td>
                <td>R$ ${(b.m2 * pricePerM2).toFixed(2)}</td>
            </tr>
        `).join('');
        const imgRows = bends.map((b, i) =>
            b.svgDataUrl ? `<div style="margin:16px 0"><p style="font-weight:bold">Dobra #${i + 1}</p><img src="${b.svgDataUrl}" style="width:100%;max-height:200px;object-fit:contain;background:#1e293b;border-radius:8px"/></div>` : ''
        ).join('');
        const html = `<!DOCTYPE html><html lang="pt-BR"><head>
            <meta charset="UTF-8"><title>Orçamento Ferreira Calhas</title>
            <style>
                body{font-family:Arial,sans-serif;padding:32px;color:#111;max-width:900px;margin:auto}
                h1{font-size:22px;margin-bottom:4px}
                table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}
                th{background:#1e293b;color:#fff;text-align:left;padding:9px 8px}
                td{padding:8px;border-bottom:1px solid #e8e8e8}
                tr:nth-child(even) td{background:#f8fafc}
                .total-row td{border-top:2px solid #1e293b;font-weight:bold}
                @media print{body{padding:16px}}
            </style></head><body>
            <h1>Orçamento — Ferreira Calhas</h1>
            <p style="color:#555;font-size:13px">${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
            <p style="font-size:12px">Cliente: <strong>${user?.name || user?.username || ''}</strong>${notes ? ' | Obs: ' + notes : ''}</p>
            ${imgRows}
            <table>
                <thead><tr><th>#</th><th>Riscos</th><th>Largura</th><th>Metros corridos</th><th>m²</th><th>Valor</th></tr></thead>
                <tbody>${rows}</tbody>
                <tfoot>
                    <tr><td colspan="4" style="text-align:right;padding-top:16px">Total m²:</td><td colspan="2"><strong>${totalM2.toFixed(4)} m²</strong></td></tr>
                    <tr><td colspan="4" style="text-align:right">Valor por m²:</td><td colspan="2">R$ ${pricePerM2.toFixed(2)}</td></tr>
                    <tr class="total-row"><td colspan="4" style="text-align:right">TOTAL A PAGAR:</td><td colspan="2" style="color:#16a34a;font-size:16px">R$ ${totalValue.toFixed(2)}</td></tr>
                </tfoot>
            </table>
            <script>window.onload=()=>window.print();<\/script>
        </body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (win) setTimeout(() => URL.revokeObjectURL(url), 10000);
    };

    // ════════════════════════════ RENDER ════════════════════════════════════
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pt-24 pb-16 px-4" ref={topRef}>
            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                        className={`fixed top-6 right-6 z-[9999] px-6 py-3 rounded-2xl text-white font-bold shadow-xl ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                        {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Image zoom modal */}
            <AnimatePresence>
                {zoomImg && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9998] bg-black/80 flex items-center justify-center p-4"
                        onClick={() => setZoomImg(null)}>
                        <button className="absolute top-4 right-4 text-white p-2 bg-white/10 rounded-full cursor-pointer">
                            <X className="w-6 h-6" />
                        </button>
                        <img src={zoomImg} alt="Dobra em zoom" className="max-w-full max-h-full rounded-2xl" onClick={e => e.stopPropagation()} />
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
                    <h1 className="text-4xl font-black text-white mb-2">📐 Calculadora de Orçamento</h1>
                    <p className="text-slate-400">Monte as dobras da calha e gere o orçamento automaticamente</p>
                </motion.div>

                {/* Step Indicator */}
                <div className="flex items-center justify-center gap-4 mb-8">
                    {[{ id: 'bends', label: '1. Dobras' }, { id: 'summary', label: '2. Resumo' }, { id: 'payment', label: '3. Pagamento' }].map((s, i) => (
                        <React.Fragment key={s.id}>
                            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${step === s.id ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/50'}`}>
                                {s.label}
                            </div>
                            {i < 2 && <ChevronRight className="w-4 h-4 text-white/30" />}
                        </React.Fragment>
                    ))}
                </div>

                {/* ══════════ STEP 1: BENDS ══════════ */}
                {step === 'bends' && (
                    <div className="space-y-6">
                        {/* Current bend builder */}
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-6 space-y-6">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <span className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center text-sm">✏</span>
                                Construindo Dobra #{bends.length + 1}
                            </h2>

                            {/* Canvas with SVG ref */}
                            <BendCanvas risks={currentRisks} svgRef={svgRef} />

                            {/* Width info */}
                            <div className="flex items-center gap-4 text-sm flex-wrap">
                                <div className={`px-4 py-2 rounded-xl font-bold ${isOverLimit ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/10 text-white'}`}>
                                    Soma: <strong>{currentWidth.toFixed(1)} cm</strong>
                                </div>
                                {!isOverLimit && currentWidth > 0 && (
                                    <div className="px-4 py-2 rounded-xl font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                        Arredondado: <strong>{currentRounded} cm</strong>
                                    </div>
                                )}
                                {isOverLimit && (
                                    <div className="flex items-center gap-2 text-red-400 font-bold">
                                        <AlertTriangle className="w-4 h-4" /> Excede 120 cm!
                                    </div>
                                )}
                            </div>

                            {/* Step 1: 8-direction selector (grid 4+4) */}
                            <div>
                                <p className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">Passo 1 — Direção do risco</p>
                                <div className="grid grid-cols-4 gap-2">
                                    {DIRECTIONS.slice(0, 3).map(d => (
                                        <button key={d.dir} onClick={() => setPendingDirection(d.dir)}
                                            className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 font-bold text-xs transition-all cursor-pointer
                                                ${pendingDirection === d.dir
                                                    ? `bg-gradient-to-br ${d.color} border-transparent text-white shadow-lg scale-105`
                                                    : 'border-white/10 text-white/60 hover:border-white/30 hover:text-white'}`}>
                                            <span className="text-3xl leading-none">{d.icon}</span>
                                            <span className="text-center leading-tight mt-1">{d.label}</span>
                                        </button>
                                    ))}
                                    {/* Empty center */}
                                    <div className="rounded-2xl border-2 border-white/5 flex items-center justify-center">
                                        <span className="text-white/20 text-xs text-center">calha</span>
                                    </div>
                                    {/* Row 2: left, right in cols 1,3 */}
                                    <button onClick={() => setPendingDirection('left')}
                                        className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 font-bold text-xs transition-all cursor-pointer
                                            ${pendingDirection === 'left'
                                                ? `bg-gradient-to-br ${DIRECTIONS.find(d => d.dir === 'left')!.color} border-transparent text-white shadow-lg scale-105`
                                                : 'border-white/10 text-white/60 hover:border-white/30 hover:text-white'}`}>
                                        <span className="text-3xl leading-none">←</span>
                                        <span className="leading-tight mt-1">Esquerda</span>
                                    </button>
                                    {/* Center spacer */}
                                    <div />
                                    <button onClick={() => setPendingDirection('right')}
                                        className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 font-bold text-xs transition-all cursor-pointer
                                            ${pendingDirection === 'right'
                                                ? `bg-gradient-to-br ${DIRECTIONS.find(d => d.dir === 'right')!.color} border-transparent text-white shadow-lg scale-105`
                                                : 'border-white/10 text-white/60 hover:border-white/30 hover:text-white'}`}>
                                        <span className="text-3xl leading-none">→</span>
                                        <span className="leading-tight mt-1">Direita</span>
                                    </button>
                                    {/* Empty */}
                                    <div />
                                    {/* Row 3: down-left, down, down-right centered */}
                                    {DIRECTIONS.slice(5, 8).map(d => (
                                        <button key={d.dir} onClick={() => setPendingDirection(d.dir)}
                                            className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 font-bold text-xs transition-all cursor-pointer
                                                ${pendingDirection === d.dir
                                                    ? `bg-gradient-to-br ${d.color} border-transparent text-white shadow-lg scale-105`
                                                    : 'border-white/10 text-white/60 hover:border-white/30 hover:text-white'}`}>
                                            <span className="text-3xl leading-none">{d.icon}</span>
                                            <span className="text-center leading-tight mt-1">{d.label}</span>
                                        </button>
                                    ))}
                                    <div />
                                </div>
                            </div>

                            {/* Step 2: Size */}
                            <div>
                                <p className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">Passo 2 — Tamanho (cm)</p>
                                <div className="flex gap-3">
                                    <input type="number" min="1" max="120" step="0.5" placeholder="Ex: 15"
                                        value={pendingSize}
                                        onChange={e => { setPendingSize(e.target.value); setSizeError(''); }}
                                        onKeyDown={e => e.key === 'Enter' && handleAddRisk()}
                                        disabled={!pendingDirection}
                                        className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-5 py-3 text-white placeholder-white/30 font-bold text-lg focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 disabled:opacity-40 transition-all" />
                                    <button onClick={handleAddRisk} disabled={!pendingDirection || !pendingSize}
                                        className="px-6 py-3 bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white font-bold rounded-2xl transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed">
                                        <Plus className="w-5 h-5" /> Adicionar
                                    </button>
                                </div>
                                {sizeError && <p className="text-red-400 text-sm mt-2 font-medium flex items-center gap-1"><AlertTriangle className="w-4 h-4" />{sizeError}</p>}
                            </div>

                            {/* Risks list — inline editable */}
                            {currentRisks.length > 0 && (
                                <div>
                                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Riscos adicionados (clique no valor para editar):</p>
                                    <div className="flex flex-wrap gap-2">
                                        {currentRisks.map((r, i) => (
                                            <div key={i} className="flex items-center gap-1 px-3 py-1.5 bg-white/10 rounded-xl border border-white/20">
                                                <span className="text-white text-sm">{DIRECTION_ICONS[r.direction]}</span>
                                                {editingRiskIdx === i ? (
                                                    <input type="number" autoFocus
                                                        value={editingSize}
                                                        onChange={e => setEditingSize(e.target.value)}
                                                        onBlur={() => commitEditRisk(i)}
                                                        onKeyDown={e => { if (e.key === 'Enter') commitEditRisk(i); if (e.key === 'Escape') setEditingRiskIdx(null); }}
                                                        className="w-16 bg-white/20 text-white text-sm font-bold rounded px-2 py-0.5 outline-none border border-blue-400" />
                                                ) : (
                                                    <button onClick={() => startEditRisk(i)}
                                                        className="text-white font-bold text-sm hover:text-blue-300 transition-colors cursor-pointer"
                                                        title="Clique para editar">
                                                        <PenLine className="w-3 h-3 inline mr-0.5 opacity-50" />{r.sizeCm}cm
                                                    </button>
                                                )}
                                                <button onClick={() => setCurrentRisks(prev => prev.filter((_, idx) => idx !== i))}
                                                    className="text-red-400/60 hover:text-red-400 transition-colors cursor-pointer ml-1">
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3 flex-wrap">
                                {currentRisks.length > 0 && (
                                    <button onClick={handleUndoRisk}
                                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl flex items-center gap-2 text-sm font-bold transition-all cursor-pointer">
                                        <Undo2 className="w-4 h-4" /> Desfazer
                                    </button>
                                )}
                                <button onClick={handleConfirmBend}
                                    disabled={currentRisks.length === 0 || isOverLimit}
                                    className="px-6 py-3 bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl flex items-center gap-2 transition-all cursor-pointer ml-auto">
                                    <Check className="w-5 h-5" /> Confirmar Dobra #{bends.length + 1}
                                </button>
                            </div>
                        </motion.div>

                        {/* Post-confirm choice */}
                        <AnimatePresence>
                            {showPostConfirm && (
                                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                                    className="bg-green-500/10 border border-green-500/30 rounded-3xl p-6 flex flex-col sm:flex-row items-center gap-4 justify-center">
                                    <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-2xl flex-shrink-0">✓</div>
                                    <div className="text-center sm:text-left">
                                        <p className="text-white font-bold text-lg">Dobra #{bends.length} confirmada!</p>
                                        <p className="text-slate-400 text-sm">O que deseja fazer agora?</p>
                                    </div>
                                    <div className="flex gap-3 flex-wrap justify-center sm:ml-auto">
                                        <button onClick={handleStartNewBend}
                                            className="px-5 py-2.5 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-2xl flex items-center gap-2 transition-all cursor-pointer">
                                            <Plus className="w-4 h-4" /> Nova Dobra
                                        </button>
                                        <button onClick={() => { setShowPostConfirm(false); setStep('summary'); }}
                                            className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-2xl flex items-center gap-2 transition-all cursor-pointer">
                                            📊 Ir para Resumo <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Confirmed bends */}
                        {bends.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="text-white font-bold text-lg">Dobras Confirmadas ({bends.length})</h3>
                                {bends.map((bend, bi) => (
                                    <motion.div key={bend.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                                        className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-black text-sm">{bi + 1}</span>
                                                <div>
                                                    <p className="text-white font-bold">Dobra {bi + 1}</p>
                                                    <p className="text-slate-400 text-xs">
                                                        {bend.risks.length} riscos · {bend.totalWidthCm.toFixed(1)} cm → <strong className="text-blue-400">{bend.roundedWidthCm} cm</strong>
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => editBend(bend.id)} className="p-2 text-yellow-400 hover:bg-yellow-400/10 rounded-xl transition-all cursor-pointer" title="Editar">
                                                    <RefreshCw className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => deleteBend(bend.id)} className="p-2 text-red-400 hover:bg-red-400/10 rounded-xl transition-all cursor-pointer" title="Excluir">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Captured image preview */}
                                        {bend.svgDataUrl && (
                                            <div className="relative group cursor-pointer" onClick={() => setZoomImg(bend.svgDataUrl!)}>
                                                <img src={bend.svgDataUrl} alt={`Dobra ${bi + 1}`} className="w-full rounded-xl opacity-80 group-hover:opacity-100 transition-opacity" style={{ maxHeight: 140, objectFit: 'contain', background: '#1e293b' }} />
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <ZoomIn className="w-8 h-8 text-white drop-shadow-lg" />
                                                </div>
                                            </div>
                                        )}

                                        {/* Lengths */}
                                        <div>
                                            <p className="text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">Metros Corridos</p>
                                            <div className="space-y-2">
                                                {bend.lengths.map((l, li) => (
                                                    <div key={li} className="flex gap-2 items-center">
                                                        <span className="text-slate-500 text-xs w-5">{li + 1}.</span>
                                                        <input type="number" min="0.01" step="0.01" placeholder="Ex: 3.50" value={l}
                                                            onChange={e => updateBendLength(bend.id, li, e.target.value)}
                                                            className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 font-bold focus:outline-none focus:border-blue-400 transition-all" />
                                                        <span className="text-slate-400 text-sm">m</span>
                                                        {bend.lengths.length > 1 && (
                                                            <button onClick={() => removeLength(bend.id, li)} className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-all cursor-pointer">
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                            <button onClick={() => addLength(bend.id)} className="mt-2 text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 cursor-pointer">
                                                <Plus className="w-3.5 h-3.5" /> Adicionar comprimento
                                            </button>
                                        </div>

                                        {/* m² result */}
                                        <div className="flex gap-4 text-sm bg-white/5 rounded-2xl p-4 flex-wrap">
                                            <div><p className="text-slate-400 text-xs">Total metros</p><p className="text-white font-bold">{bend.totalLengthM.toFixed(2)} m</p></div>
                                            <div className="border-l border-white/10 pl-4"><p className="text-slate-400 text-xs">Largura</p><p className="text-white font-bold">{(bend.roundedWidthCm / 100).toFixed(2)} m</p></div>
                                            <div className="border-l border-white/10 pl-4"><p className="text-slate-400 text-xs">Área (m²)</p><p className="text-blue-400 font-black text-lg">{bend.m2.toFixed(4)} m²</p></div>
                                            <div className="border-l border-white/10 pl-4 ml-auto"><p className="text-slate-400 text-xs">Subtotal</p><p className="text-green-400 font-black">R$ {(bend.m2 * pricePerM2).toFixed(2)}</p></div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}

                        {/* Total bar */}
                        {bends.length > 0 && !showPostConfirm && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="sticky bottom-4 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-5 flex items-center justify-between gap-4 flex-wrap">
                                <div className="flex gap-6">
                                    <div><p className="text-slate-400 text-xs">Total m²</p><p className="text-white font-black text-xl">{totalM2.toFixed(4)} m²</p></div>
                                    <div className="border-l border-white/10 pl-6"><p className="text-slate-400 text-xs">Valor Estimado</p><p className="text-green-400 font-black text-2xl">R$ {totalValue.toFixed(2)}</p></div>
                                </div>
                                <button onClick={() => setStep('summary')}
                                    className="px-6 py-3 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-2xl flex items-center gap-2 transition-all cursor-pointer">
                                    Ver Resumo <ChevronRight className="w-5 h-5" />
                                </button>
                            </motion.div>
                        )}
                    </div>
                )}

                {/* ══════════ STEP 2: SUMMARY ══════════ */}
                {step === 'summary' && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6" id="quote-print">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h2 className="text-2xl font-black text-white">Resumo do Orçamento</h2>
                                    <p className="text-slate-400 text-sm mt-1">{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                                    <p className="text-slate-300 text-sm mt-1">Cliente: <strong>{user?.name || user?.username}</strong></p>
                                </div>
                                <div className="text-right">
                                    <p className="text-slate-400 text-xs uppercase tracking-wider">Ferreira Calhas</p>
                                    {settings.address && <p className="text-slate-500 text-xs mt-1">{settings.address}</p>}
                                </div>
                            </div>

                            {/* Bends with images */}
                            {bends.map((b, i) => (
                                <div key={b.id} className="border border-white/10 rounded-2xl p-5 space-y-4">
                                    <div className="flex items-center gap-3">
                                        <span className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-black text-sm">{i + 1}</span>
                                        <div>
                                            <p className="text-white font-bold">Dobra {i + 1}</p>
                                            <p className="text-slate-400 text-xs">{b.risks.map(r => `${DIRECTION_ICONS[r.direction]} ${r.sizeCm}cm`).join(' · ')}</p>
                                        </div>
                                        <div className="ml-auto text-right">
                                            <p className="text-white font-bold">{(b.roundedWidthCm / 100).toFixed(2)}m × {b.totalLengthM.toFixed(2)}m</p>
                                            <p className="text-blue-400 font-black">{b.m2.toFixed(4)} m²</p>
                                            <p className="text-green-400 font-bold text-sm">R$ {(b.m2 * pricePerM2).toFixed(2)}</p>
                                        </div>
                                    </div>
                                    {b.svgDataUrl && (
                                        <div className="relative group cursor-pointer" onClick={() => setZoomImg(b.svgDataUrl!)}>
                                            <img src={b.svgDataUrl} alt={`Dobra ${i + 1}`}
                                                className="w-full rounded-xl group-hover:opacity-90 transition-opacity"
                                                style={{ maxHeight: 180, objectFit: 'contain', background: '#1e293b' }} />
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <ZoomIn className="w-8 h-8 text-white drop-shadow-lg" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Total */}
                            <div className="border-t border-white/10 pt-4 space-y-2 text-sm">
                                <div className="flex justify-between text-slate-300"><span>Total m²:</span><strong className="text-white">{totalM2.toFixed(4)} m²</strong></div>
                                <div className="flex justify-between text-slate-300"><span>Preço por m²:</span><span>R$ {pricePerM2.toFixed(2)}</span></div>
                                <div className="flex justify-between text-lg font-black"><span className="text-white">TOTAL A PAGAR:</span><span className="text-green-400">R$ {totalValue.toFixed(2)}</span></div>
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="block text-sm font-bold text-slate-300 mb-2">Observações (opcional)</label>
                                <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                                    placeholder="Ex: Cor da calha, material, urgência..."
                                    className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-3 text-white placeholder-white/30 focus:outline-none focus:border-blue-400 transition-all" />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap gap-3 justify-between">
                            <div className="flex gap-3 flex-wrap">
                                <button onClick={() => setStep('bends')}
                                    className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl flex items-center gap-2 font-bold transition-all cursor-pointer">
                                    <ChevronLeft className="w-4 h-4" /> Voltar
                                </button>
                                <button onClick={handlePrint}
                                    className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl flex items-center gap-2 font-bold transition-all cursor-pointer">
                                    <Printer className="w-4 h-4" /> Imprimir
                                </button>
                                <button onClick={handleDownloadPDF}
                                    className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl flex items-center gap-2 font-bold transition-all cursor-pointer">
                                    <FileDown className="w-4 h-4" /> Baixar PDF
                                </button>
                            </div>
                            <button onClick={handleSubmit} disabled={submitting}
                                className="px-8 py-3 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-black rounded-2xl flex items-center gap-2 transition-all cursor-pointer text-lg">
                                {submitting ? <><RefreshCw className="w-5 h-5 animate-spin" /> Enviando...</> : <><Send className="w-5 h-5" /> Enviar Orçamento</>}
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* ══════════ STEP 3: PAYMENT ══════════ */}
                {step === 'payment' && savedQuote && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                        <div className="text-center bg-green-500/10 border border-green-500/30 rounded-3xl p-8">
                            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
                            <h2 className="text-2xl font-black text-white mb-2">Orçamento #{savedQuote.id} criado!</h2>
                            <p className="text-slate-300">Nossa equipe foi notificada. Realize o pagamento via PIX abaixo.</p>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6">
                            <h3 className="text-xl font-bold text-white">💳 Pagamento via PIX</h3>
                            <div className="grid sm:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div className="bg-white/5 rounded-2xl p-5">
                                        <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">Valor a Pagar</p>
                                        <p className="text-4xl font-black text-green-400">R$ {parseFloat(savedQuote.finalValue || savedQuote.totalValue || 0).toFixed(2)}</p>
                                    </div>
                                    {settings.pixKey ? (
                                        <div className="bg-white/5 rounded-2xl p-5">
                                            <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">Chave PIX</p>
                                            <div className="flex items-center gap-3">
                                                <code className="text-white font-bold flex-1 break-all">{settings.pixKey}</code>
                                                <button onClick={() => navigator.clipboard.writeText(settings.pixKey).then(() => setToast({ msg: 'Chave PIX copiada!', type: 'success' }))}
                                                    className="p-2 bg-blue-500 hover:bg-blue-400 text-white rounded-xl transition-all cursor-pointer">
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 text-yellow-300 text-sm">
                                            ⚠ Chave PIX não configurada. Entre em contato via WhatsApp.
                                        </div>
                                    )}
                                </div>
                                {settings.pixQrCodeUrl && (
                                    <div className="flex items-center justify-center">
                                        <div className="bg-white p-4 rounded-2xl">
                                            <img src={settings.pixQrCodeUrl} alt="QR Code PIX" className="w-40 h-40 object-contain" />
                                            <p className="text-center text-slate-700 text-xs mt-2 font-bold">Escaneie para pagar</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-white/10 pt-6">
                                <h4 className="font-bold text-white mb-3">📎 Enviar Comprovante</h4>
                                <div className="flex gap-3 flex-wrap">
                                    <input type="file" accept="image/*,application/pdf"
                                        onChange={e => setProofFile(e.target.files?.[0] || null)}
                                        className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white text-sm file:mr-3 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-white/20 file:text-white cursor-pointer" />
                                    <button onClick={handleUploadProof} disabled={!proofFile || uploadingProof}
                                        className="px-6 py-3 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center gap-2 transition-all cursor-pointer">
                                        {uploadingProof ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar
                                    </button>
                                </div>
                                <p className="text-slate-500 text-xs mt-2">Após enviar o comprovante, aguarde a validação da nossa equipe.</p>
                            </div>

                            {settings.whatsapp && (
                                <a href={`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(`Olá! Realizei o pagamento do orçamento #${savedQuote.id}.`)}`}
                                    target="_blank" rel="noopener"
                                    className="flex items-center justify-center gap-3 w-full p-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-2xl transition-all">
                                    <span className="text-xl">📱</span> Confirmar pagamento pelo WhatsApp
                                </a>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-3 justify-between">
                            <div className="flex gap-3 flex-wrap">
                                <button onClick={handlePrint} className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl flex items-center gap-2 font-bold transition-all cursor-pointer">
                                    <Printer className="w-4 h-4" /> Imprimir
                                </button>
                                <button onClick={handleDownloadPDF} className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl flex items-center gap-2 font-bold transition-all cursor-pointer">
                                    <FileDown className="w-4 h-4" /> Baixar PDF
                                </button>
                            </div>
                            <button onClick={() => { setBends([]); setStep('bends'); setSavedQuote(null); setNotes(''); setShowPostConfirm(false); }}
                                className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl flex items-center gap-2 font-bold transition-all cursor-pointer">
                                <Plus className="w-4 h-4" /> Novo Orçamento
                            </button>
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Print styles */}
            <style>{`
                @media print {
                    body * { visibility: hidden; background: white !important; color: black !important; }
                    #quote-print, #quote-print * { visibility: visible; }
                    #quote-print { position: fixed; top: 0; left: 0; width: 100%; color: black !important; background: white !important; }
                }
            `}</style>
        </div>
    );
}
