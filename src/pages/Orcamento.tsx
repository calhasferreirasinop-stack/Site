import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, ChevronRight, ChevronLeft, Check, AlertTriangle, Printer, Copy, Send, RefreshCw, Undo2, FileDown, ZoomIn, X, PenLine, Save, List, Eye } from 'lucide-react';
import BendCanvas, { Risk, RiskDirection, DIRECTION_ICONS, OPPOSITE_DIRECTION } from '../components/BendCanvas';

// ─── Official rounding rule ────────────────────────────────────────────────────
// floor to nearest 5, compute remainder. If remainder > 1 → round UP, else stay.
// 6→5, 6.01→10, 11→10, 11.01→15, 22→25, 16→15, 16.01→20
function roundToMultipleOf5(value: number): number {
    if (value <= 0) return 5;
    const lower = Math.floor(value / 5) * 5;
    const remainder = value - lower;
    return remainder > 1 ? lower + 5 : (lower || 5);
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Bend { id: string; risks: Risk[]; totalWidthCm: number; roundedWidthCm: number; lengths: string[]; totalLengthM: number; m2: number; svgDataUrl?: string; }
interface SavedBend { risks: Risk[]; roundedWidthCm: number; useCount: number; svgDataUrl?: string; }

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    rascunho: { label: 'Rascunho', color: 'bg-slate-500' },
    pending: { label: 'Aguardando Pgto', color: 'bg-yellow-500' },
    paid: { label: 'Pago', color: 'bg-green-500' },
    in_production: { label: 'Em Produção', color: 'bg-blue-500' },
    finished: { label: 'Finalizado', color: 'bg-slate-600' },
    cancelled: { label: 'Cancelado', color: 'bg-red-500' },
};

// ─── Direction grid ───────────────────────────────────────────────────────────
const DIR_GRID: { dir: RiskDirection; icon: string; label: string; grad: string }[] = [
    { dir: 'upLeft', icon: '↖', label: 'Cima-Esq', grad: 'from-violet-500 to-violet-600' },
    { dir: 'up', icon: '↑', label: 'Cima', grad: 'from-blue-500 to-blue-600' },
    { dir: 'upRight', icon: '↗', label: 'Cima-Dir', grad: 'from-cyan-500 to-cyan-600' },
    { dir: 'left', icon: '←', label: 'Esquerda', grad: 'from-orange-500 to-orange-600' },
    { dir: 'right', icon: '→', label: 'Direita', grad: 'from-green-500 to-green-600' },
    { dir: 'downLeft', icon: '↙', label: 'Baixo-Esq', grad: 'from-pink-500 to-pink-600' },
    { dir: 'down', icon: '↓', label: 'Baixo', grad: 'from-red-500 to-red-600' },
    { dir: 'downRight', icon: '↘', label: 'Baixo-Dir', grad: 'from-amber-500 to-amber-600' },
];

const MAX_W = 120;
const uid = () => Math.random().toString(36).slice(2);
const sumRisks = (risks: Risk[]) => risks.reduce((s, r) => s + (parseFloat(String(r.sizeCm)) || 0), 0);
function calcM2(roundedWidthCm: number, lengths: string[]) {
    const vals = lengths.map(l => parseFloat(l)).filter(v => v > 0);
    const totalLengthM = vals.reduce((a, b) => a + b, 0);
    return { totalLengthM, m2: (roundedWidthCm / 100) * totalLengthM };
}
async function captureSvg(el: SVGSVGElement): Promise<string> {
    return new Promise(resolve => {
        try {
            // Clone SVG and remove edit-mode elements (INÍCIO label, grid)
            const clone = el.cloneNode(true) as SVGSVGElement;
            // Remove INÍCIO text and info bar text
            clone.querySelectorAll('text').forEach(t => {
                const txt = t.textContent?.trim() || '';
                if (txt === 'INÍCIO' || txt.includes('Adicione riscos')) t.remove();
            });
            // Remove grid lines (very faint ones)
            clone.querySelectorAll('line').forEach(l => {
                const s = l.getAttribute('stroke') || '';
                if (s.includes('0.035')) l.remove();
            });
            // Remove real sum circle for export
            clone.querySelectorAll('g').forEach(g => {
                if (g.textContent?.includes('SOMA REAL')) g.remove();
            });
            const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas'); c.width = 920; c.height = 440;
                const ctx = c.getContext('2d')!;
                ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, 920, 440);
                ctx.drawImage(img, 0, 0, 920, 440);
                URL.revokeObjectURL(url);
                resolve(c.toDataURL('image/png'));
            };
            img.onerror = () => resolve('');
            img.src = url;
        } catch { resolve(''); }
    });
}

export default function Orcamento() {
    const navigate = useNavigate();
    const [user, setUser] = useState<any>(null);
    const [settings, setSettings] = useState<any>({});
    const [step, setStep] = useState<'bends' | 'summary' | 'payment'>('bends');
    const [bends, setBends] = useState<Bend[]>([]);

    // Quotes listing
    const [myQuotes, setMyQuotes] = useState<any[]>([]);
    const [showMyQuotes, setShowMyQuotes] = useState(true);
    const [clientName, setClientName] = useState('');
    const [pixKeys, setPixKeys] = useState<any[]>([]);
    const [savingDraft, setSavingDraft] = useState(false);
    const [libraryZoom, setLibraryZoom] = useState<SavedBend | null>(null);
    const [editingQuoteId, setEditingQuoteId] = useState<string | number | null>(null);
    const [reportQuote, setReportQuote] = useState<any | null>(null);
    const [reportBends, setReportBends] = useState<any[]>([]);

    // Current bend
    const [currentRisks, setCurrentRisks] = useState<Risk[]>([]);
    const [pendingDir, setPendingDir] = useState<RiskDirection | null>(null);
    const [pendingSize, setPendingSize] = useState('');
    const [sizeError, setSizeError] = useState('');

    // Risk editing
    const [editSizeIdx, setEditSizeIdx] = useState<number | null>(null);
    const [editSizeVal, setEditSizeVal] = useState('');
    const [editDirIdx, setEditDirIdx] = useState<number | null>(null);

    // Preserved lengths when editing existing bend
    const [editingBendLengths, setEditingBendLengths] = useState<string[] | null>(null);

    // Otimização de Cortes
    const [optimization, setOptimization] = useState<any[]>([]);

    const calculateOptimization = (allBends: Bend[]) => {
        const BIN_CAPACITY = 1.2; // 1.20m sheet

        // 1. Collect all cuts and split those > 1.20m
        let pieces: { bendId: string, originalIdx: number, length: number }[] = [];
        allBends.forEach(b => {
            b.lengths.forEach((lenStr, idx) => {
                let len = parseFloat(lenStr);
                if (isNaN(len) || len <= 0) return;

                // If its a long piece, we basically just keep track of it
                // FFD on lengths into 1.2m bins
                while (len > BIN_CAPACITY) {
                    pieces.push({ bendId: b.id, originalIdx: idx, length: BIN_CAPACITY });
                    len -= BIN_CAPACITY;
                }
                if (len > 0) {
                    pieces.push({ bendId: b.id, originalIdx: idx, length: len });
                }
            });
        });

        // 2. Sort descending for FFD
        pieces.sort((a, b) => b.length - a.length);

        // 3. First Fit
        let bins: typeof pieces[] = [];
        pieces.forEach(p => {
            let found = false;
            for (let b of bins) {
                let currentTotal = b.reduce((s, x) => s + x.length, 0);
                if (currentTotal + p.length <= BIN_CAPACITY + 0.001) { // Floating point leeway
                    b.push(p);
                    found = true;
                    break;
                }
            }
            if (!found) bins.push([p]);
        });

        return bins;
    };

    useEffect(() => {
        if (step === 'summary' || (step === 'bends' && bends.length > 0)) {
            setOptimization(calculateOptimization(bends));
        }
    }, [bends, step]);

    // Post-confirm
    const [showPostConfirm, setShowPostConfirm] = useState(false);

    // Bend library
    const [bendLibrary, setBendLibrary] = useState<SavedBend[]>(() => {
        try { return JSON.parse(localStorage.getItem('bendLibrary') || '[]'); } catch { return []; }
    });
    const [showLibrary, setShowLibrary] = useState(false);

    // UI
    const [zoomImg, setZoomImg] = useState<string | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [savedQuote, setSavedQuote] = useState<any>(null);
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [uploadingProof, setUploadingProof] = useState(false);

    // Caída Lateral State
    const [isLateralSlope, setIsLateralSlope] = useState(false);
    const [slopeSide, setSlopeSide] = useState<'D' | 'E'>('D');
    const [slopeH1, setSlopeH1] = useState('');
    const [slopeH2, setSlopeH2] = useState('');

    const svgRef = useRef<SVGSVGElement>(null);
    const topRef = useRef<HTMLDivElement>(null);
    const metersRef = useRef<HTMLDivElement>(null);
    const sizeInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 3500);
        return () => clearTimeout(t);
    }, [toast]);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/auth/check', { credentials: 'include' })
            .then(r => r.json())
            .then(d => {
                if (cancelled) return;
                if (!d.authenticated) {
                    localStorage.removeItem('user');
                    navigate('/login', { replace: true });
                } else {
                    setUser(d);
                    localStorage.setItem('user', JSON.stringify({
                        authenticated: true, role: d.role, name: d.name, id: d.id,
                    }));
                    fetch('/api/quotes', { credentials: 'include' })
                        .then(r => r.json()).then(setMyQuotes).catch(() => { });
                }
            })
            .catch(() => {
                if (!cancelled) {
                    localStorage.removeItem('user');
                    navigate('/login', { replace: true });
                }
            });
        fetch('/api/settings').then(r => r.json()).then(setSettings).catch(() => { });
        fetch('/api/pix-keys').then(r => r.json()).then(setPixKeys).catch(() => { });
        return () => { cancelled = true; };
    }, []);

    const curWidth = sumRisks(currentRisks);
    const curRounded = roundToMultipleOf5(curWidth);
    const isOver = curWidth > MAX_W;

    // ── Helpers ───────────────────────────────────────────────────────────────
    const isReversal = (dir: RiskDirection, size: number) => {
        if (!currentRisks.length) return false;
        const last = currentRisks[currentRisks.length - 1];
        return OPPOSITE_DIRECTION[dir] === last.direction && size === last.sizeCm;
    };

    const saveToBendLibrary = (risks: Risk[], roundedWidthCm: number, svgDataUrl?: string) => {
        setBendLibrary(prev => {
            const key = JSON.stringify(risks);
            const exists = prev.find(b => JSON.stringify(b.risks) === key);
            const updated = exists
                ? prev.map(b => JSON.stringify(b.risks) === key ? { ...b, useCount: b.useCount + 1, svgDataUrl: svgDataUrl || b.svgDataUrl } : b)
                : [{ risks, roundedWidthCm, useCount: 1, svgDataUrl }, ...prev].slice(0, 20);
            localStorage.setItem('bendLibrary', JSON.stringify(updated));
            return updated;
        });
    };

    const selectDirection = (dir: RiskDirection) => {
        setPendingDir(dir);
        setTimeout(() => sizeInputRef.current?.focus(), 50);
    };

    const handleAddRisk = () => {
        let size = parseFloat(pendingSize);
        if (!pendingDir) { setSizeError('Selecione a direção'); return; }

        let riskSlope = undefined;
        if (isLateralSlope) {
            const h1 = parseFloat(slopeH1) || 0;
            const h2 = parseFloat(slopeH2) || 0;
            if (h1 <= 0 || h2 <= 0) { setSizeError('Informe as duas alturas da caída'); return; }
            size = Math.max(h1, h2);
            riskSlope = { side: slopeSide, h1, h2 };
        }

        if (!size || size <= 0) { setSizeError('Informe um tamanho válido'); return; }
        if (isReversal(pendingDir, size)) { setSizeError('⚠ Este risco anula o anterior e não é permitido.'); return; }
        if (curWidth + size > MAX_W) { setSizeError(`Excede ${MAX_W} cm. Disponível: ${(MAX_W - curWidth).toFixed(1)} cm`); return; }

        setSizeError('');
        setCurrentRisks(prev => [...prev, {
            direction: pendingDir,
            sizeCm: size,
            slopeData: riskSlope
        }]);
        setPendingDir(null);
        setPendingSize('');
        // Also clear slope state after adding
        setIsLateralSlope(false);
        setSlopeH1('');
        setSlopeH2('');
    };

    const commitEditSize = (idx: number) => {
        const size = parseFloat(editSizeVal);
        if (!size || size <= 0) { setEditSizeIdx(null); return; }
        const next = [...currentRisks];
        next[idx] = { ...next[idx], sizeCm: size };
        const total = sumRisks(next);
        if (total > MAX_W) { setSizeError(`Edição excede ${MAX_W} cm`); setEditSizeIdx(null); return; }
        setCurrentRisks(next);
        setEditSizeIdx(null);
        setSizeError('');
    };

    const commitEditDir = (idx: number, dir: RiskDirection) => {
        const next = [...currentRisks];
        next[idx] = { ...next[idx], direction: dir };
        setCurrentRisks(next);
        setEditDirIdx(null);
    };

    const handleConfirmBend = async () => {
        if (!currentRisks.length) { setToast({ msg: 'Adicione pelo menos 1 risco', type: 'error' }); return; }
        if (isOver) { setToast({ msg: 'Largura excede 1,20m!', type: 'error' }); return; }
        let svgDataUrl = '';
        if (svgRef.current) svgDataUrl = await captureSvg(svgRef.current);
        const savedLengths = editingBendLengths && editingBendLengths.some(l => parseFloat(l) > 0) ? editingBendLengths : [''];

        const newBend: Bend = {
            id: uid(),
            risks: [...currentRisks],
            totalWidthCm: curWidth,
            roundedWidthCm: curRounded,
            lengths: savedLengths,
            totalLengthM: 0,
            m2: 0,
            svgDataUrl,
        };
        // Recalc m2 if lengths were preserved
        if (savedLengths !== null && savedLengths.some(l => parseFloat(l) > 0)) {
            const calc = calcM2(curRounded, savedLengths);
            newBend.totalLengthM = calc.totalLengthM;
            newBend.m2 = calc.m2;
        }
        setBends(prev => [...prev, newBend]);
        saveToBendLibrary([...currentRisks], curRounded, svgDataUrl);
        setCurrentRisks([]);
        setPendingDir(null);
        setPendingSize('');
        setIsLateralSlope(false);
        setSlopeH1('');
        setSlopeH2('');
        setEditingBendLengths(null);
        setShowPostConfirm(true);
        setShowLibrary(false);
        // Recalc optimization
        setOptimization(calculateOptimization([...bends, newBend]));
        setTimeout(() => metersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    };

    const updateLength = (bendId: string, idx: number, val: string) => {
        setBends(prev => prev.map(b => {
            if (b.id !== bendId) return b;
            const ls = [...b.lengths]; ls[idx] = val;
            return { ...b, lengths: ls, ...calcM2(b.roundedWidthCm, ls) };
        }));
    };

    const handleSubmit = async () => {
        if (!bends.length) { setToast({ msg: 'Adicione pelo menos uma dobra', type: 'error' }); return; }
        const hasLengths = bends.every(b => b.lengths.some(l => parseFloat(l) > 0));
        if (!hasLengths) { setToast({ msg: 'Informe os cortes (metros corridos) em todas as dobras', type: 'error' }); return; }
        setSubmitting(true);
        try {
            const url = editingQuoteId ? `/api/quotes/${editingQuoteId}` : '/api/quotes';
            const method = editingQuoteId ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    clientName: clientName || user?.name || user?.username,
                    notes,
                    bends: bends.map(b => ({
                        risks: b.risks, totalWidthCm: b.totalWidthCm, roundedWidthCm: b.roundedWidthCm,
                        lengths: b.lengths.filter(l => parseFloat(l) > 0).map(Number),
                        totalLengthM: b.totalLengthM, m2: b.m2, svgDataUrl: b.svgDataUrl,
                    })),
                }),
            });
            if (!res.ok) {
                const ct = res.headers.get('content-type') || '';
                const errMsg = ct.includes('json') ? (await res.json()).error : await res.text();
                throw new Error(errMsg || `HTTP ${res.status}`);
            }
            const quote = await res.json();
            setSavedQuote(quote);
            setStep('payment');
            setEditingQuoteId(null);
            setToast({ msg: editingQuoteId ? 'Orçamento atualizado!' : 'Orçamento salvo!', type: 'success' });
            fetch('/api/quotes', { credentials: 'include' }).then(r => r.json()).then(setMyQuotes).catch(() => { });
        } catch (err: any) {
            setToast({ msg: `Erro: ${err.message}`, type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleSaveDraft = async () => {
        if (!bends.length) { setToast({ msg: 'Adicione pelo menos uma dobra', type: 'error' }); return; }
        setSavingDraft(true);
        try {
            const url = editingQuoteId ? `/api/quotes/${editingQuoteId}` : '/api/quotes';
            const method = editingQuoteId ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    clientName: clientName || user?.name || user?.username,
                    notes,
                    status: 'rascunho',
                    bends: bends.map(b => ({
                        risks: b.risks, totalWidthCm: b.totalWidthCm, roundedWidthCm: b.roundedWidthCm,
                        lengths: b.lengths.filter(l => parseFloat(l) > 0).map(Number),
                        totalLengthM: b.totalLengthM, m2: b.m2, svgDataUrl: b.svgDataUrl,
                    })),
                }),
            });
            if (res.ok) {
                setToast({ msg: editingQuoteId ? 'Rascunho atualizado!' : 'Rascunho salvo! Continue depois.', type: 'success' });
                fetch('/api/quotes', { credentials: 'include' }).then(r => r.json()).then(setMyQuotes).catch(() => { });
            } else setToast({ msg: 'Erro ao salvar rascunho', type: 'error' });
        } catch { setToast({ msg: 'Erro ao salvar rascunho', type: 'error' }); }
        finally { setSavingDraft(false); }
    };

    const handleCancelQuote = async (id: string) => {
        if (!confirm('Deseja cancelar este orçamento?')) return;
        const res = await fetch(`/api/quotes/${id}/status`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'cancelled' }), credentials: 'include',
        });
        if (res.ok) {
            setToast({ msg: 'Orçamento cancelado', type: 'success' });
            fetch('/api/quotes', { credentials: 'include' }).then(r => r.json()).then(setMyQuotes).catch(() => { });
        } else setToast({ msg: 'Erro ao cancelar', type: 'error' });
    };

    const handleEditQuote = async (q: any) => {
        // Load bends from API and populate builder
        try {
            const res = await fetch(`/api/quotes/${q.id}/bends`, { credentials: 'include' });
            if (!res.ok) throw new Error();
            const loadedBends = await res.json();
            const mapped: Bend[] = loadedBends.map((b: any) => ({
                id: uid(),
                risks: b.risks || [],
                totalWidthCm: b.totalWidthCm || 0,
                roundedWidthCm: b.roundedWidthCm || 0,
                lengths: b.lengths?.map(String) || [''],
                totalLengthM: b.totalLengthM || 0,
                m2: b.m2 || 0,
                svgDataUrl: b.svgDataUrl || '',
                slopeData: b.slopeData || undefined,
            }));
            setBends(mapped);
            setClientName(q.clientName || '');
            setNotes(q.notes || '');
            setEditingQuoteId(q.id);
            setShowMyQuotes(false);
            setStep('bends');
            setToast({ msg: `Editando orçamento #${q.id}`, type: 'success' });
        } catch {
            setToast({ msg: 'Erro ao carregar dobras do orçamento', type: 'error' });
        }
    };

    // ── View Report / Download PDF for any quote from listing ──────────────
    const handleViewReport = async (q: any) => {
        try {
            const res = await fetch(`/api/quotes/${q.id}/bends`, { credentials: 'include' });
            if (!res.ok) throw new Error();
            const loadedBends = await res.json();
            setReportBends(loadedBends);
            setReportQuote(q);
        } catch {
            setToast({ msg: 'Erro ao carregar relatório', type: 'error' });
        }
    };

    const handleDownloadQuotePDF = (q: any, qBends: any[]) => {
        const pm2 = parseFloat(settings.pricePerM2 || '50');
        const imgRows = qBends.map((b: any, i: number) => {
            const cuts = Array.isArray(b.lengths) ? b.lengths.filter((l: any) => parseFloat(l) > 0) : [];
            const cutsHtml = cuts.length > 0 ? `<table class="cuts-table"><thead><tr><th colspan="2">Cortes</th></tr></thead><tbody>${cuts.map((c: any, ci: number) => `<tr><td>Corte ${ci + 1}</td><td class="cut-val">${parseFloat(c).toFixed(2)}m</td></tr>`).join('')}<tr class="cut-total"><td>Metros corridos</td><td class="cut-val">${(b.totalLengthM || 0).toFixed(2)}m</td></tr></tbody></table>` : '';
            const img = b.svgDataUrl ? `<img src="${b.svgDataUrl}" style="width:100%;max-height:180px;object-fit:contain;background:#1e293b;border-radius:8px"/>` : '';
            return `<div style="margin:16px 0;page-break-inside:avoid"><p style="font-weight:bold;margin:0 0 8px;font-size:14px">Dobra #${i + 1} — <span class="medida">${((b.roundedWidthCm || 0) / 100).toFixed(2)}m larg.</span></p><div style="display:flex;gap:16px;align-items:flex-start">${img ? `<div style="flex:1">${img}</div>` : ''}${cutsHtml ? `<div style="flex:0 0 200px">${cutsHtml}</div>` : ''}</div></div>`;
        }).join('');
        const rows = qBends.map((b: any, i: number) => {
            const lengths = Array.isArray(b.lengths) ? b.lengths : [];
            const totalLen = b.totalLengthM || lengths.filter((l: any) => parseFloat(l) > 0).reduce((a: number, c: any) => a + parseFloat(c), 0);
            const w = b.roundedWidthCm || 0;
            const m2 = b.m2 || (w / 100 * totalLen);
            return `<tr><td>#${i + 1}</td><td>${(b.risks || []).map((r: any) => `${DIRECTION_ICONS[r.direction as RiskDirection] || ''} ${r.sizeCm}cm`).join(', ')}</td><td class="medida">${(w / 100).toFixed(2)}m</td><td class="metros">${lengths.filter((l: any) => parseFloat(l) > 0).join('+')}=${totalLen.toFixed(2)}m</td><td>${m2.toFixed(4)}</td><td>R$${(m2 * pm2).toFixed(2)}</td></tr>`;
        }).join('');
        const tM2 = parseFloat(q.totalM2 || 0);
        const tVal = parseFloat(q.finalValue || q.totalValue || 0);
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Orçamento #${q.id}</title><style>
body{font-family:Arial,sans-serif;padding:24px;color:#111;max-width:900px;margin:auto}
h1{font-size:20px;margin-bottom:4px}
.status{display:inline-block;background:#fef3c7;color:#92400e;border:2px solid #f59e0b;font-weight:bold;font-size:13px;padding:6px 14px;border-radius:8px;margin:8px 0}
table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
th{background:#1e293b;color:#fff;text-align:left;padding:10px}
td{padding:8px;border-bottom:1px solid #e8e8e8}
tr:nth-child(even) td{background:#f8fafc}
.big{font-size:18px;font-weight:bold;color:#16a34a}
.metros{font-size:16px;font-weight:bold;background:#eef2ff;border:2px solid #6366f1;padding:6px 12px;border-radius:6px;color:#4338ca}
.medida{font-size:14px;font-weight:bold;color:#1e40af}
.cuts-table{width:100%;border-collapse:collapse;margin:0;font-size:13px;border:2px solid #6366f1;border-radius:8px;overflow:hidden}
.cuts-table th{background:#4338ca;color:#fff;padding:6px 10px;font-size:12px;text-align:center}
.cuts-table td{padding:6px 10px;border-bottom:1px solid #e0e7ff;background:#eef2ff}
.cuts-table .cut-val{font-weight:bold;color:#4338ca;text-align:right;font-size:15px}
.cuts-table .cut-total{background:#c7d2fe}
.cuts-table .cut-total td{font-weight:900;border-bottom:none;font-size:14px}
.report-header{display:flex;align-items:center;gap:16px;border-bottom:2px solid #e2e8f0;padding-bottom:16px;margin-bottom:16px}
.report-header img{height:50px;object-fit:contain}
.report-header .info{font-size:11px;color:#64748b}
.report-footer{border-top:2px solid #e2e8f0;padding-top:12px;margin-top:24px;text-align:center;font-size:11px;color:#94a3b8}
@media print{body{padding:8px}}
</style></head><body>
${settings.reportLogo || settings.reportCompanyName ? `<div class="report-header">${settings.reportLogo ? `<img src="${settings.reportLogo}" alt="Logo"/>` : ''}<div><strong style="font-size:16px">${settings.reportCompanyName || ''}</strong><div class="info">${[settings.reportPhone, settings.reportEmail].filter(Boolean).join(' | ')}${settings.reportAddress ? `<br/>${settings.reportAddress}` : ''}${settings.reportHeaderText ? `<br/>${settings.reportHeaderText}` : ''}</div></div></div>` : ''}
<h1>Orçamento #${q.id} — ${settings.reportCompanyName || 'Ferreira Calhas'}</h1>
<p>Cliente: <b>${q.clientName || ''}</b>${q.notes ? ` | Obs: ${q.notes}` : ''}</p>
<div class="status">\u23f3 STATUS: ${(STATUS_LABELS[q.status]?.label || q.status).toUpperCase()}</div>
${imgRows}
<table><thead><tr><th>#</th><th>Riscos</th><th>Largura</th><th style="background:#4338ca">Metros corridos</th><th>m\u00b2</th><th>Valor</th></tr></thead><tbody>${rows}</tbody>
<tfoot>
<tr><td colspan="4" align="right">Total m\u00b2:</td><td colspan="2"><b>${tM2.toFixed(4)} m\u00b2</b></td></tr>
<tr><td colspan="4" align="right">Pre\u00e7o/m\u00b2:</td><td colspan="2">R$ ${pm2.toFixed(2)}</td></tr>
<tr><td colspan="4" align="right" style="font-size:18px;font-weight:900">TOTAL:</td><td colspan="2" class="big">R$ ${tVal.toFixed(2)}</td></tr>
</tfoot></table>
${settings.reportFooterText ? `<div class="report-footer">${settings.reportFooterText}</div>` : ''}
<p style="margin-top:16px;color:#888;font-size:11px">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
</body></html>`;
        const w2 = window.open('', '_blank');
        if (w2) { w2.document.write(html); w2.document.close(); w2.print(); }
    };

    const handleUploadProof = async () => {
        if (!proofFile || !savedQuote) return;
        setUploadingProof(true);
        try {
            const fd = new FormData(); fd.append('proof', proofFile);
            const res = await fetch(`/api/quotes/${savedQuote.id}/proof`, { method: 'POST', body: fd, credentials: 'include' });
            if (res.ok) {
                setToast({ msg: 'Comprovante enviado!', type: 'success' });
                setProofFile(null);
            } else {
                const err = await res.json().catch(() => ({}));
                setToast({ msg: err.error || 'Erro ao enviar comprovante', type: 'error' });
            }
        } catch {
            setToast({ msg: 'Erro de conexão ao enviar comprovante', type: 'error' });
        } finally {
            setUploadingProof(false);
        }
    };

    const pricePerM2 = parseFloat(settings.pricePerM2 || '50');
    const totalM2 = bends.reduce((s, b) => s + b.m2, 0);
    const totalValue = totalM2 * pricePerM2;

    const handleDownloadPDF = () => {
        const imgRows = bends.map((b, i) => {
            const cuts = b.lengths.filter(l => parseFloat(l) > 0);
            const cutsHtml = cuts.length > 0 ? `<table class="cuts-table"><thead><tr><th colspan="2">Cortes</th></tr></thead><tbody>${cuts.map((c, ci) => `<tr><td>Corte ${ci + 1}</td><td class="cut-val">${parseFloat(c).toFixed(2)}m</td></tr>`).join('')}<tr class="cut-total"><td>Metros corridos</td><td class="cut-val">${b.totalLengthM.toFixed(2)}m</td></tr></tbody></table>` : '';
            const img = b.svgDataUrl ? `<img src="${b.svgDataUrl}" style="width:100%;max-height:180px;object-fit:contain;background:#1e293b;border-radius:8px"/>` : '';
            return `<div style="margin:16px 0;page-break-inside:avoid"><p style="font-weight:bold;margin:0 0 8px;font-size:14px">Dobra #${i + 1} — <span class="medida">${(b.roundedWidthCm / 100).toFixed(2)}m larg.</span></p><div style="display:flex;gap:16px;align-items:flex-start">${img ? `<div style="flex:1">${img}</div>` : ''}${cutsHtml ? `<div style="flex:0 0 200px">${cutsHtml}</div>` : ''}</div></div>`;
        }).join('');
        const rows = bends.map((b, i) => `<tr><td>#${i + 1}</td><td>${b.risks.map(r => `${DIRECTION_ICONS[r.direction]} ${r.sizeCm}cm`).join(', ')}</td><td class="medida">${(b.roundedWidthCm / 100).toFixed(2)}m</td><td class="metros">${b.lengths.filter(l => parseFloat(l) > 0).join('+')}=${b.totalLengthM.toFixed(2)}m</td><td>${b.m2.toFixed(4)}</td><td>R$${(b.m2 * pricePerM2).toFixed(2)}</td></tr>`).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Orçamento Ferreira Calhas</title><style>
body{font-family:Arial,sans-serif;padding:24px;color:#111;max-width:900px;margin:auto}
h1{font-size:20px;margin-bottom:4px}
.status{display:inline-block;background:#fef3c7;color:#92400e;border:2px solid #f59e0b;font-weight:bold;font-size:13px;padding:6px 14px;border-radius:8px;margin:8px 0}
table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
th{background:#1e293b;color:#fff;text-align:left;padding:10px}
td{padding:8px;border-bottom:1px solid #e8e8e8}
tr:nth-child(even) td{background:#f8fafc}
.big{font-size:18px;font-weight:bold;color:#16a34a}
.metros{font-size:16px;font-weight:bold;background:#eef2ff;border:2px solid #6366f1;padding:6px 12px;border-radius:6px;color:#4338ca}
.medida{font-size:14px;font-weight:bold;color:#1e40af}
.cuts-table{width:100%;border-collapse:collapse;margin:0;font-size:13px;border:2px solid #6366f1;border-radius:8px;overflow:hidden}
.cuts-table th{background:#4338ca;color:#fff;padding:6px 10px;font-size:12px;text-align:center}
.cuts-table td{padding:6px 10px;border-bottom:1px solid #e0e7ff;background:#eef2ff}
.cuts-table .cut-val{font-weight:bold;color:#4338ca;text-align:right;font-size:15px}
.cuts-table .cut-total{background:#c7d2fe}
.cuts-table .cut-total td{font-weight:900;border-bottom:none;font-size:14px}
.report-header{display:flex;align-items:center;gap:16px;border-bottom:2px solid #e2e8f0;padding-bottom:16px;margin-bottom:16px}
.report-header img{height:50px;object-fit:contain}
.report-header .info{font-size:11px;color:#64748b}
.report-footer{border-top:2px solid #e2e8f0;padding-top:12px;margin-top:24px;text-align:center;font-size:11px;color:#94a3b8}
@media print{body{padding:8px}}
</style></head><body>
${settings.reportLogo || settings.reportCompanyName ? `<div class="report-header">${settings.reportLogo ? `<img src="${settings.reportLogo}" alt="Logo"/>` : ''}<div><strong style="font-size:16px">${settings.reportCompanyName || ''}</strong><div class="info">${[settings.reportPhone, settings.reportEmail].filter(Boolean).join(' | ')}${settings.reportAddress ? `<br/>${settings.reportAddress}` : ''}${settings.reportHeaderText ? `<br/>${settings.reportHeaderText}` : ''}</div></div></div>` : ''}
<h1>Orçamento — ${settings.reportCompanyName || 'Ferreira Calhas'}</h1>
<p style="color:#555;font-size:12px">${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
<p>Cliente: <b>${clientName || user?.name || user?.username || ''}</b>${notes ? ` | Obs: ${notes}` : ''}</p>
<div class="status">\u23f3 STATUS: AGUARDANDO PAGAMENTO</div>
${imgRows}
<table><thead><tr><th>#</th><th>Riscos</th><th>Largura</th><th style="background:#4338ca">Metros corridos</th><th>m\u00b2</th><th>Valor</th></tr></thead><tbody>${rows}</tbody>
<tfoot>
<tr><td colspan="4" align="right">Total m\u00b2:</td><td colspan="2"><b>${totalM2.toFixed(4)} m\u00b2</b></td></tr>
<tr><td colspan="4" align="right">Pre\u00e7o/m\u00b2:</td><td colspan="2">R$ ${pricePerM2.toFixed(2)}</td></tr>
<tr><td colspan="4" align="right" style="font-weight:bold">TOTAL A PAGAR:</td><td colspan="2" class="big">R$ ${totalValue.toFixed(2)}</td></tr>
</tfoot></table>
${settings.reportFooterText ? `<div class="report-footer">${settings.reportFooterText}</div>` : ''}
<script>window.onload=()=>window.print();<\/script>
</body></html>`;
        const b2 = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(b2);
        const w = window.open(url, '_blank');
        if (w) setTimeout(() => URL.revokeObjectURL(url), 10000);
    };

    // ── Render helpers ────────────────────────────────────────────────────────
    const DirBtn = ({ d, active, onClick }: { d: typeof DIR_GRID[0]; active: boolean; onClick: () => void }) => (
        <button onClick={onClick} className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 font-bold text-xs transition-all cursor-pointer
            ${active ? `bg-gradient-to-br ${d.grad} border-transparent text-white shadow-lg scale-105` : 'border-white/10 text-white/60 hover:border-white/30 hover:text-white'}`}>
            <span className="text-3xl leading-none">{d.icon}</span>
            <span className="text-center leading-tight mt-1">{d.label}</span>
        </button>
    );

    // ════════════════════════════ RENDER ════════════════════════════════════
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pt-24 pb-16 px-4" ref={topRef}>
            {/* Library Zoom Modal */}
            <AnimatePresence>
                {libraryZoom && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4"
                        onClick={() => setLibraryZoom(null)}>
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                            className="bg-slate-800 border border-white/20 rounded-3xl p-6 max-w-lg w-full space-y-4"
                            onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between">
                                <h3 className="text-white font-bold text-lg">📐 Dobra Salva</h3>
                                <button onClick={() => setLibraryZoom(null)} className="text-white/60 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
                            </div>
                            {libraryZoom.svgDataUrl && (
                                <img src={libraryZoom.svgDataUrl} alt="Dobra" className="w-full rounded-xl" style={{ maxHeight: 300, objectFit: 'contain', background: '#1e293b' }} />
                            )}
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="bg-white/5 rounded-xl p-3">
                                    <p className="text-slate-400 text-xs">Largura</p>
                                    <p className="text-white font-black text-lg">{libraryZoom.roundedWidthCm} cm</p>
                                </div>
                                <div className="bg-white/5 rounded-xl p-3">
                                    <p className="text-slate-400 text-xs">Riscos</p>
                                    <p className="text-white font-bold">{libraryZoom.risks.length}</p>
                                </div>
                            </div>
                            <div className="bg-white/5 rounded-xl p-3">
                                <p className="text-slate-400 text-xs mb-1">Detalhes dos riscos</p>
                                <div className="flex flex-wrap gap-2">
                                    {libraryZoom.risks.map((r, i) => (
                                        <span key={i} className="text-white bg-white/10 px-2 py-1 rounded-lg text-sm font-bold">
                                            {DIRECTION_ICONS[r.direction]} {r.sizeCm}cm
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => { setCurrentRisks(libraryZoom.risks); setLibraryZoom(null); setShowLibrary(false); }}
                                    className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-xl cursor-pointer flex items-center justify-center gap-2">
                                    <Plus className="w-4 h-4" /> Usar esta dobra
                                </button>
                                <button onClick={() => setLibraryZoom(null)}
                                    className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl cursor-pointer">
                                    Fechar
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Report View Modal */}
            <AnimatePresence>
                {reportQuote && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 overflow-auto"
                        onClick={() => setReportQuote(null)}>
                        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                            className="bg-slate-800 border border-white/20 rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-4"
                            onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between">
                                <h3 className="text-white font-black text-lg">📊 Relatório — Orçamento #{reportQuote.id}</h3>
                                <button onClick={() => setReportQuote(null)} className="text-white/60 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <span className="text-slate-400">Cliente:</span>
                                <span className="text-white font-bold">{reportQuote.clientName || 'N/A'}</span>
                                <span className={`ml-auto text-xs font-bold px-3 py-1 rounded-full text-white ${(STATUS_LABELS[reportQuote.status] || STATUS_LABELS.pending).color}`}>
                                    {(STATUS_LABELS[reportQuote.status] || STATUS_LABELS.pending).label}
                                </span>
                            </div>
                            <div className="text-right text-green-400 font-black text-2xl">
                                R$ {parseFloat(reportQuote.finalValue || reportQuote.totalValue || 0).toFixed(2)}
                            </div>
                            {reportBends.length > 0 ? reportBends.map((b: any, i: number) => {
                                const cuts = Array.isArray(b.lengths) ? b.lengths.filter((l: any) => parseFloat(l) > 0) : [];
                                return (
                                    <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-white font-bold">Dobra #{i + 1}</p>
                                            <p className="text-blue-400 font-black">{((b.roundedWidthCm || 0) / 100).toFixed(2)}m larg.</p>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {b.svgDataUrl && (
                                                <img src={b.svgDataUrl} alt={`Dobra ${i + 1}`} className="w-full rounded-xl" style={{ maxHeight: 180, objectFit: 'contain', background: '#1e293b' }} />
                                            )}
                                            <div className="space-y-2">
                                                <div className="bg-white/5 rounded-xl p-3">
                                                    <p className="text-slate-400 text-xs mb-1">Riscos</p>
                                                    <p className="text-white font-bold text-sm">{(b.risks || []).map((r: any) => `${DIRECTION_ICONS[r.direction as RiskDirection] || ''} ${r.sizeCm}cm`).join(', ')}</p>
                                                </div>
                                                {cuts.length > 0 && (
                                                    <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3">
                                                        <p className="text-indigo-300 text-xs font-bold mb-2">Cortes</p>
                                                        <div className="space-y-1">
                                                            {cuts.map((c: any, ci: number) => (
                                                                <div key={ci} className="flex justify-between items-center">
                                                                    <span className="text-white text-sm">Corte {ci + 1}:</span>
                                                                    <span className="text-white font-black text-sm bg-indigo-500/20 px-2 py-0.5 rounded">{parseFloat(c).toFixed(2)}m</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="border-t border-indigo-500/30 mt-2 pt-2 flex justify-between items-center">
                                                            <span className="text-indigo-300 font-bold text-sm">Total:</span>
                                                            <span className="text-white font-black text-lg">{(b.totalLengthM || 0).toFixed(2)}m</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            }) : <p className="text-slate-400 text-sm">Nenhuma dobra encontrada.</p>}
                            <div className="flex gap-3">
                                <button onClick={() => handleDownloadQuotePDF(reportQuote, reportBends)}
                                    className="flex-1 px-4 py-3 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-xl cursor-pointer flex items-center justify-center gap-2">
                                    <FileDown className="w-4 h-4" /> Baixar PDF
                                </button>
                                <button onClick={() => setReportQuote(null)}
                                    className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl cursor-pointer">
                                    Fechar
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className={`fixed top-6 right-6 z-[9999] px-6 py-3 rounded-2xl text-white font-bold shadow-xl ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                        {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Image zoom */}
            <AnimatePresence>
                {zoomImg && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9998] bg-black/80 flex items-center justify-center p-4"
                        onClick={() => setZoomImg(null)}>
                        <button className="absolute top-4 right-4 text-white p-2 bg-white/10 rounded-full cursor-pointer"><X className="w-6 h-6" /></button>
                        <img src={zoomImg} alt="Zoom" className="max-w-full max-h-full rounded-2xl" onClick={e => e.stopPropagation()} />
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="max-w-5xl mx-auto space-y-6">
                {/* Header */}
                <div className="text-center">
                    <h1 className="text-4xl font-black text-white mb-2">📐 Calculadora de Orçamento</h1>
                    <p className="text-slate-400">Monte as dobras e gere o orçamento automaticamente</p>
                </div>

                {/* Steps */}
                <div className="flex items-center justify-center gap-4">
                    {(['bends', 'summary', 'payment'] as const).map((s, i) => (
                        <React.Fragment key={s}>
                            <div className={`px-4 py-2 rounded-full text-sm font-bold ${step === s ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/40'}`}>
                                {i + 1}. {s === 'bends' ? 'Dobras' : s === 'summary' ? 'Resumo' : 'Pagamento'}
                            </div>
                            {i < 2 && <ChevronRight className="w-4 h-4 text-white/30" />}
                        </React.Fragment>
                    ))}
                </div>

                {/* ══ MY QUOTES LISTING ══ */}
                {showMyQuotes && step === 'bends' && myQuotes.length > 0 && bends.length === 0 && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                        className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2"><List className="w-5 h-5" /> Meus Orçamentos</h2>
                            <button onClick={() => setShowMyQuotes(false)}
                                className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-xl flex items-center gap-2 text-sm cursor-pointer">
                                <Plus className="w-4 h-4" /> Novo Orçamento
                            </button>
                        </div>
                        <div className="space-y-2">
                            {myQuotes.map(q => {
                                const st = STATUS_LABELS[q.status] || STATUS_LABELS.pending;
                                return (
                                    <div key={q.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 flex-wrap">
                                        <span className="text-white/40 font-black text-sm">#{String(q.id).substring(0, 8)}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white font-bold">{q.clientName || q.client?.name || 'Cliente'}</p>
                                            <p className="text-slate-400 text-xs">{q.createdAt ? new Date(q.createdAt).toLocaleString('pt-BR') : ''}{q.notes ? ` · ${q.notes.substring(0, 50)}` : ''}</p>
                                        </div>
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full text-white ${st.color}`}>{st.label}</span>
                                        <p className="text-white font-black">R$ {parseFloat(q.finalValue || q.totalValue || 0).toFixed(2)}</p>
                                        {q.status !== 'paid' && q.status !== 'cancelled' && (
                                            <button onClick={(e) => { e.stopPropagation(); handleEditQuote(q); }}
                                                className="text-xs text-blue-400 hover:text-blue-300 font-bold px-2 py-1 border border-blue-400/30 rounded-lg cursor-pointer">
                                                ✏ Editar
                                            </button>
                                        )}
                                        {q.status !== 'paid' && q.status !== 'cancelled' && (
                                            <button onClick={(e) => { e.stopPropagation(); handleCancelQuote(q.id); }}
                                                className="text-xs text-red-400 hover:text-red-300 font-bold px-2 py-1 border border-red-400/30 rounded-lg cursor-pointer">
                                                Cancelar
                                            </button>
                                        )}
                                        <button onClick={(e) => { e.stopPropagation(); handleViewReport(q); }}
                                            className="text-xs text-emerald-400 hover:text-emerald-300 font-bold px-2 py-1 border border-emerald-400/30 rounded-lg cursor-pointer">
                                            👁️ Relatório
                                        </button>
                                        <button onClick={async (e) => {
                                            e.stopPropagation();
                                            try {
                                                const r = await fetch(`/api/quotes/${q.id}/bends`, { credentials: 'include' });
                                                if (!r.ok) throw new Error();
                                                handleDownloadQuotePDF(q, await r.json());
                                            } catch { setToast({ msg: 'Erro ao gerar PDF', type: 'error' }); }
                                        }}
                                            className="text-xs text-indigo-400 hover:text-indigo-300 font-bold px-2 py-1 border border-indigo-400/30 rounded-lg cursor-pointer">
                                            📄 PDF
                                        </button>
                                        {q.status === 'draft' && (
                                            <button onClick={(e) => { e.stopPropagation(); setSavedQuote(q); setStep('payment'); }}
                                                className="text-xs text-green-400 hover:text-green-300 font-bold px-2 py-1 border border-green-400/30 rounded-lg cursor-pointer">
                                                💳 Pagar
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}

                {/* ══ STEP 1: BENDS ══ */}
                {step === 'bends' && (!showMyQuotes || myQuotes.length === 0 || bends.length > 0) && (
                    <div className="space-y-6">
                        {/* Client name input */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row gap-3">
                            <div className="flex-1">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Nome do Cliente (opcional)</label>
                                <input type="text" value={clientName} onChange={e => setClientName(e.target.value)}
                                    placeholder="Ex: João Silva"
                                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-white/30 font-medium focus:outline-none focus:border-blue-400 transition-all" />
                            </div>
                            {myQuotes.length > 0 && (
                                <button onClick={() => { setShowMyQuotes(true); setBends([]); setCurrentRisks([]); }}
                                    className="self-end px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl flex items-center gap-2 text-sm font-bold cursor-pointer">
                                    <List className="w-4 h-4" /> Ver Meus Orçamentos
                                </button>
                            )}
                        </div>

                        {/* Builder */}
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-5">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold text-white">✏ Construindo Dobra #{bends.length + 1}</h2>
                                {bendLibrary.length > 0 && (
                                    <button onClick={() => setShowLibrary(v => !v)}
                                        className="text-xs text-blue-400 hover:text-blue-300 font-bold border border-blue-400/30 px-3 py-1.5 rounded-xl transition-all cursor-pointer">
                                        📚 Dobras salvas ({bendLibrary.length})
                                    </button>
                                )}
                            </div>

                            {/* Bend library suggestions */}
                            <AnimatePresence>
                                {showLibrary && bendLibrary.length > 0 && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                        className="bg-white/5 rounded-2xl p-4 space-y-2 overflow-hidden">
                                        <p className="text-xs text-slate-400 uppercase tracking-wider">Clique para carregar uma dobra salva:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {bendLibrary.slice(0, 8).map((b, i) => (
                                                <div key={i} className="flex items-center gap-1">
                                                    <button onClick={() => { setCurrentRisks(b.risks); setShowLibrary(false); }}
                                                        className="flex items-center gap-2 text-xs px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all cursor-pointer border border-white/10">
                                                        {b.svgDataUrl && <img src={b.svgDataUrl} alt="" className="w-10 h-8 rounded object-contain" style={{ background: '#1e293b' }} />}
                                                        <div className="text-left">
                                                            <span>{b.risks.map(r => `${DIRECTION_ICONS[r.direction]}${r.sizeCm}`).join(' ')}</span>
                                                            <span className="text-blue-400 font-bold ml-1">{b.roundedWidthCm}cm</span>
                                                            {b.useCount > 1 && <span className="ml-1 text-white/40">×{b.useCount}</span>}
                                                        </div>
                                                    </button>
                                                    {b.svgDataUrl && (
                                                        <button onClick={() => setLibraryZoom(b)}
                                                            className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all cursor-pointer" title="Ampliar">
                                                            <ZoomIn className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Canvas */}
                            <BendCanvas
                                risks={currentRisks}
                                svgRef={svgRef}
                            />

                            {/* Width info */}
                            <div className="flex gap-3 flex-wrap text-sm">
                                <div className={`px-4 py-2 rounded-xl font-bold ${isOver ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/10 text-white'}`}>
                                    Soma: <strong>{curWidth.toFixed(1)} cm</strong>
                                </div>
                                {!isOver && curWidth > 0 && (
                                    <div className="px-4 py-2 rounded-xl font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                        Arredondado: <strong>{curRounded} cm</strong>
                                    </div>
                                )}
                                {isOver && <div className="flex items-center gap-2 text-red-400 font-bold"><AlertTriangle className="w-4 h-4" /> Excede 120 cm!</div>}
                            </div>

                            {/* Caída Lateral Toggle */}
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors ${isLateralSlope ? 'bg-amber-500' : 'bg-slate-700'}`}
                                            onClick={() => {
                                                if (isLateralSlope) { setSlopeH1(''); setSlopeH2(''); }
                                                setIsLateralSlope(!isLateralSlope);
                                            }}>
                                            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isLateralSlope ? 'translate-x-4' : 'translate-x-0'}`} />
                                        </div>
                                        <span className="text-sm font-bold text-white uppercase tracking-wider">Caída Lateral</span>
                                    </div>
                                    {isLateralSlope && (
                                        <div className="flex bg-slate-800 rounded-lg overflow-hidden border border-white/10">
                                            {(['D', 'E'] as const).map(s => (
                                                <button key={s} onClick={() => setSlopeSide(s)}
                                                    className={`px-3 py-1 text-xs font-black transition-all cursor-pointer ${slopeSide === s ? 'bg-amber-500 text-white' : 'text-white/40 hover:text-white'}`}>
                                                    {s === 'D' ? 'Direita' : 'Esquerda'}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {isLateralSlope && (
                                    <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Altura 1 (cm)</label>
                                            <input type="number" step="0.1" placeholder="H1" value={slopeH1} onChange={e => setSlopeH1(e.target.value)}
                                                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white font-bold focus:outline-none focus:border-amber-400" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Altura 2 (cm)</label>
                                            <input type="number" step="0.1" placeholder="H2" value={slopeH2} onChange={e => setSlopeH2(e.target.value)}
                                                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white font-bold focus:outline-none focus:border-amber-400" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Direction grid (compass 3×3 with center placeholder) */}
                            <div>
                                <p className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">Passo 1 — Direção do risco</p>
                                <div className="grid grid-cols-3 gap-2 max-w-xs">
                                    {[DIR_GRID[0], DIR_GRID[1], DIR_GRID[2]].map(d => <DirBtn key={d.dir} d={d} active={pendingDir === d.dir} onClick={() => selectDirection(d.dir)} />)}
                                    <DirBtn key="left" d={DIR_GRID[3]} active={pendingDir === 'left'} onClick={() => selectDirection('left')} />
                                    <div className="rounded-2xl border-2 border-white/5 flex items-center justify-center"><span className="text-white/20 text-xs">calha</span></div>
                                    <DirBtn key="right" d={DIR_GRID[4]} active={pendingDir === 'right'} onClick={() => selectDirection('right')} />
                                    {[DIR_GRID[5], DIR_GRID[6], DIR_GRID[7]].map(d => <DirBtn key={d.dir} d={d} active={pendingDir === d.dir} onClick={() => selectDirection(d.dir)} />)}
                                </div>
                            </div>

                            {/* Size input */}
                            <div>
                                <p className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">Passo 2 — Tamanho (cm)</p>
                                <div className="flex gap-3">
                                    <input ref={sizeInputRef} type="number" min="1" max="120" step="0.5" placeholder={isLateralSlope ? "Calculado pela caída" : "Ex: 15"}
                                        value={isLateralSlope ? "" : pendingSize} onChange={e => { setPendingSize(e.target.value); setSizeError(''); }}
                                        onKeyDown={e => e.key === 'Enter' && handleAddRisk()}
                                        disabled={!pendingDir || isLateralSlope}
                                        className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-5 py-3 text-white placeholder-white/30 font-bold text-lg focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 disabled:opacity-40 transition-all" />
                                    <button onClick={handleAddRisk} disabled={!pendingDir || (!pendingSize && !isLateralSlope)}
                                        className="px-6 py-3 bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white font-bold rounded-2xl transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed">
                                        <Plus className="w-5 h-5" /> Adicionar
                                    </button>
                                </div>
                                {sizeError && <p className="text-red-400 text-sm mt-2 font-medium flex items-center gap-1"><AlertTriangle className="w-4 h-4" />{sizeError}</p>}
                            </div>

                            {/* Risks list */}
                            {currentRisks.length > 0 && (
                                <div>
                                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Riscos — clique na seta para mudar direção, no valor para editar cm:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {currentRisks.map((r, i) => (
                                            <div key={i} className="relative flex items-center gap-1 px-3 py-1.5 bg-white/10 rounded-xl border border-white/20">
                                                {/* Direction edit */}
                                                <button onClick={() => setEditDirIdx(editDirIdx === i ? null : i)}
                                                    className="text-white hover:text-yellow-300 transition-colors cursor-pointer text-base" title="Editar direção">
                                                    {DIRECTION_ICONS[r.direction]}
                                                </button>
                                                {editDirIdx === i && (
                                                    <div className="absolute top-9 left-0 z-50 bg-slate-800 border border-white/20 rounded-xl p-2 grid grid-cols-3 gap-1 shadow-xl w-32">
                                                        {DIR_GRID.map(d => (
                                                            <button key={d.dir} onClick={() => commitEditDir(i, d.dir)}
                                                                className={`text-lg p-1.5 rounded-lg transition-all cursor-pointer ${r.direction === d.dir ? 'bg-blue-500' : 'hover:bg-white/10'}`}>
                                                                {d.icon}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                {/* Size edit */}
                                                {editSizeIdx === i ? (
                                                    <input type="number" autoFocus value={editSizeVal}
                                                        onChange={e => setEditSizeVal(e.target.value)}
                                                        onBlur={() => commitEditSize(i)}
                                                        onKeyDown={e => { if (e.key === 'Enter') commitEditSize(i); if (e.key === 'Escape') setEditSizeIdx(null); }}
                                                        className="w-16 bg-white/20 text-white text-sm font-bold rounded px-2 py-0.5 outline-none border border-blue-400" />
                                                ) : (
                                                    <button onClick={() => { setEditSizeIdx(i); setEditSizeVal(String(r.sizeCm)); }}
                                                        className="text-white font-bold text-sm hover:text-blue-300 transition-colors cursor-pointer" title="Editar cm">
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
                                    <button onClick={() => setCurrentRisks(prev => prev.slice(0, -1))}
                                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl flex items-center gap-2 text-sm font-bold transition-all cursor-pointer">
                                        <Undo2 className="w-4 h-4" /> Desfazer
                                    </button>
                                )}
                                <button onClick={handleConfirmBend} disabled={!currentRisks.length || isOver}
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
                                        <button onClick={() => { setShowPostConfirm(false); topRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
                                            className="px-5 py-2.5 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-2xl flex items-center gap-2 transition-all cursor-pointer">
                                            <Plus className="w-4 h-4" /> Nova Dobra
                                        </button>
                                        <button onClick={handleSaveDraft} disabled={savingDraft}
                                            className="px-5 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center gap-2 transition-all cursor-pointer">
                                            {savingDraft ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar Orçamento
                                        </button>
                                        <button onClick={() => { setShowPostConfirm(false); setStep('summary'); }}
                                            className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-2xl flex items-center gap-2 transition-all cursor-pointer">
                                            📊 Ir para Resumo <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Confirmed bends with meters input */}
                        {bends.length > 0 && (
                            <div className="space-y-4" ref={metersRef}>
                                <h3 className="text-white font-bold text-lg">Dobras Confirmadas ({bends.length})</h3>
                                {bends.map((bend, bi) => (
                                    <motion.div key={bend.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                                        className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-black text-sm">{bi + 1}</span>
                                                <div>
                                                    <p className="text-white font-bold">Dobra {bi + 1}</p>
                                                    <p className="text-slate-400 text-xs">{bend.risks.length} riscos · {bend.totalWidthCm.toFixed(1)} cm → <strong className="text-blue-400">{bend.roundedWidthCm} cm</strong></p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => { setEditingBendLengths([...bend.lengths]); setCurrentRisks(bend.risks); setBends(prev => prev.filter(b => b.id !== bend.id)); setShowPostConfirm(false); topRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
                                                    className="p-2 text-yellow-400 hover:bg-yellow-400/10 rounded-xl transition-all cursor-pointer" title="Editar">
                                                    <RefreshCw className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => setBends(prev => prev.filter(b => b.id !== bend.id))}
                                                    className="p-2 text-red-400 hover:bg-red-400/10 rounded-xl transition-all cursor-pointer" title="Excluir">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                        {bend.svgDataUrl && (
                                            <div className="relative group cursor-pointer" onClick={() => setZoomImg(bend.svgDataUrl!)}>
                                                <img src={bend.svgDataUrl} alt={`Dobra ${bi + 1}`} className="w-full rounded-xl opacity-80 group-hover:opacity-100 transition-opacity" style={{ maxHeight: 130, objectFit: 'contain', background: '#1e293b' }} />
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><ZoomIn className="w-7 h-7 text-white" /></div>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">Metros Corridos</p>
                                            <div className="space-y-2">
                                                {bend.lengths.map((l, li) => (
                                                    <div key={li} className="flex gap-2 items-center">
                                                        <span className="text-slate-500 text-xs w-4">{li + 1}.</span>
                                                        <div className="flex-1 relative">
                                                            <input type="number" min="0.01" step="0.01" placeholder="Ex: 3.50" value={l}
                                                                onChange={e => updateLength(bend.id, li, e.target.value)}
                                                                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 font-bold focus:outline-none focus:border-blue-400 transition-all pr-12" />
                                                            {/* Production Order Indicator */}
                                                            {optimization.length > 0 && (() => {
                                                                const binIdx = optimization.findIndex(bin => bin.some((p: any) => p.bendId === bend.id && p.originalIdx === li));
                                                                return binIdx !== -1 ? (
                                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20" title="Ordem de Produção (Lote)">
                                                                        ({binIdx + 1})
                                                                    </span>
                                                                ) : null;
                                                            })()}
                                                        </div>
                                                        <span className="text-slate-400 text-sm">m</span>
                                                        {bend.lengths.length > 1 && (
                                                            <button onClick={() => { const ls = bend.lengths.filter((_, i) => i !== li); setBends(prev => prev.map(b => b.id === bend.id ? { ...b, lengths: ls, ...calcM2(b.roundedWidthCm, ls) } : b)); }}
                                                                className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                            <button onClick={() => setBends(prev => prev.map(b => b.id === bend.id ? { ...b, lengths: [...b.lengths, ''] } : b))}
                                                className="mt-2 text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 cursor-pointer">
                                                <Plus className="w-3.5 h-3.5" /> Adicionar comprimento
                                            </button>
                                        </div>
                                        <div className="flex gap-4 text-sm bg-white/5 rounded-2xl p-4 flex-wrap">
                                            <div><p className="text-slate-400 text-xs">Total metros</p><p className="text-white font-bold">{bend.totalLengthM.toFixed(2)} m</p></div>
                                            <div className="border-l border-white/10 pl-4"><p className="text-slate-400 text-xs">Largura</p><p className="text-white font-bold">{(bend.roundedWidthCm / 100).toFixed(2)} m</p></div>
                                            <div className="border-l border-white/10 pl-4"><p className="text-slate-400 text-xs">Área</p><p className="text-blue-400 font-black text-lg">{bend.m2.toFixed(4)} m²</p></div>
                                            <div className="border-l border-white/10 pl-4 ml-auto"><p className="text-slate-400 text-xs">Subtotal</p><p className="text-green-400 font-black">R$ {(bend.m2 * pricePerM2).toFixed(2)}</p></div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}

                        {/* Total sticky bar */}
                        {bends.length > 0 && !showPostConfirm && (
                            <div className="sticky bottom-4 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-5 flex items-center justify-between gap-4 flex-wrap">
                                <div className="flex gap-6">
                                    <div><p className="text-slate-400 text-xs">Total m²</p><p className="text-white font-black text-xl">{totalM2.toFixed(4)} m²</p></div>
                                    <div className="border-l border-white/10 pl-6"><p className="text-slate-400 text-xs">Valor Estimado</p><p className="text-green-400 font-black text-2xl">R$ {totalValue.toFixed(2)}</p></div>
                                </div>
                                <div className="flex gap-3 flex-wrap">
                                    <button onClick={handleSaveDraft} disabled={savingDraft}
                                        className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl flex items-center gap-2 font-bold cursor-pointer disabled:opacity-50">
                                        <Save className="w-4 h-4" /> Salvar Rascunho
                                    </button>
                                    <button onClick={() => setStep('summary')} className="px-6 py-3 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-2xl flex items-center gap-2 transition-all cursor-pointer">
                                        Ver Resumo <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )
                }

                {/* ══ STEP 2: SUMMARY ══ */}
                {
                    step === 'summary' && (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6" id="quote-print">
                                <div className="flex items-start justify-between flex-wrap gap-4">
                                    <div>
                                        <h2 className="text-2xl font-black text-white">Resumo do Orçamento</h2>
                                        <p className="text-slate-400 text-sm mt-1">{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                                        <p className="text-slate-300 text-sm mt-1">Cliente: <strong>{user?.name || user?.username}</strong></p>
                                    </div>
                                    {/* Payment status badge */}
                                    <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl px-4 py-2">
                                        <span className="text-yellow-300 font-black text-sm">⏳ AGUARDANDO PAGAMENTO</span>
                                    </div>
                                </div>

                                {bends.map((b, i) => (
                                    <div key={b.id} className="border border-white/10 rounded-2xl p-5 space-y-3">
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
                                                <img src={b.svgDataUrl} alt={`Dobra ${i + 1}`} className="w-full rounded-xl group-hover:opacity-90" style={{ maxHeight: 180, objectFit: 'contain', background: '#1e293b' }} />
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><ZoomIn className="w-8 h-8 text-white" /></div>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                <div className="border-t border-white/10 pt-4 space-y-2 text-sm">
                                    <div className="flex justify-between text-slate-300"><span>Total m²:</span><strong className="text-white">{totalM2.toFixed(4)} m²</strong></div>
                                    <div className="flex justify-between text-slate-300"><span>Preço por m²:</span><span>R$ {pricePerM2.toFixed(2)}</span></div>
                                    <div className="flex justify-between text-lg font-black"><span className="text-white">TOTAL A PAGAR:</span><span className="text-green-400">R$ {totalValue.toFixed(2)}</span></div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-300 mb-2">Observações (opcional)</label>
                                    <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: endereço da obra, referência do local, cor, material, urgência..."
                                        className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-3 text-white placeholder-white/30 focus:outline-none focus:border-blue-400 transition-all" />
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-3 justify-between">
                                <div className="flex gap-3 flex-wrap">
                                    <button onClick={() => setStep('bends')} className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl flex items-center gap-2 font-bold cursor-pointer"><ChevronLeft className="w-4 h-4" /> Voltar</button>
                                    <button onClick={handleDownloadPDF} className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl flex items-center gap-2 font-bold cursor-pointer"><Printer className="w-4 h-4" /> Imprimir</button>
                                    <button onClick={handleDownloadPDF} className="px-5 py-3 bg-indigo-500 hover:bg-indigo-400 text-white rounded-2xl flex items-center gap-2 font-bold cursor-pointer"><FileDown className="w-4 h-4" /> Baixar PDF</button>
                                </div>
                                <button onClick={handleSubmit} disabled={submitting}
                                    className="px-8 py-3 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-black rounded-2xl flex items-center gap-2 cursor-pointer text-lg">
                                    {submitting ? <><RefreshCw className="w-5 h-5 animate-spin" /> Enviando...</> : <><Send className="w-5 h-5" /> Enviar Orçamento</>}
                                </button>
                            </div>
                        </motion.div>
                    )
                }

                {/* ══ STEP 3: PAYMENT ══ */}
                {
                    step === 'payment' && savedQuote && (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                            <div className="text-center bg-green-500/10 border border-green-500/30 rounded-3xl p-8">
                                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
                                <h2 className="text-2xl font-black text-white mb-2">Orçamento #{savedQuote.id.substring(0, 8)} criado!</h2>
                                <p className="text-slate-300">Nossa equipe foi notificada. Realize o pagamento via PIX.</p>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6">
                                <h3 className="text-xl font-bold text-white">💳 Pagamento via PIX</h3>
                                <div className="bg-white/5 rounded-2xl p-5">
                                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Valor a Pagar</p>
                                    <p className="text-4xl font-black text-green-400">R$ {parseFloat(savedQuote.finalValue || savedQuote.totalValue || 0).toFixed(2)}</p>
                                </div>
                                {pixKeys.length > 0 ? (
                                    <div className="space-y-4">
                                        {pixKeys.map(pk => (
                                            <div key={pk.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
                                                <p className="text-white font-bold text-lg">{pk.bank || 'Banco'}</p>
                                                <p className="text-slate-300 text-sm">Beneficiário: <strong className="text-white">{pk.beneficiary || pk.label || 'N/A'}</strong></p>
                                                <div className="flex items-center gap-3">
                                                    <code className="text-white font-bold flex-1 break-all text-sm bg-white/10 p-2 rounded-lg">{pk.pixKey}</code>
                                                    <button onClick={() => navigator.clipboard.writeText(pk.pixKey).then(() => setToast({ msg: 'Chave PIX copiada!', type: 'success' }))}
                                                        className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white rounded-xl cursor-pointer flex items-center gap-2 text-sm font-bold">
                                                        <Copy className="w-4 h-4" /> Copiar
                                                    </button>
                                                </div>
                                                {pk.pixCode && (
                                                    <div className="flex items-center gap-3">
                                                        <code className="text-white/60 text-xs flex-1 break-all bg-white/5 p-2 rounded-lg">{pk.pixCode.substring(0, 60)}...</code>
                                                        <button onClick={() => navigator.clipboard.writeText(pk.pixCode).then(() => setToast({ msg: 'Código copia-cola copiado!', type: 'success' }))}
                                                            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1">
                                                            <Copy className="w-3 h-3" /> Código
                                                        </button>
                                                    </div>
                                                )}
                                                {pk.qrCodeUrl && (
                                                    <div className="flex justify-center">
                                                        <div className="bg-white p-3 rounded-xl">
                                                            <img src={pk.qrCodeUrl} alt="QR Code" className="w-36 h-36 object-contain" />
                                                            <p className="text-center text-slate-700 text-xs mt-1 font-bold">Escaneie para pagar</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : settings.pixKey ? (
                                    <div className="bg-white/5 rounded-2xl p-5">
                                        <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">Chave PIX</p>
                                        <div className="flex items-center gap-3">
                                            <code className="text-white font-bold flex-1 break-all text-sm">{settings.pixKey}</code>
                                            <button onClick={() => navigator.clipboard.writeText(settings.pixKey).then(() => setToast({ msg: 'Chave PIX copiada!', type: 'success' }))}
                                                className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white rounded-xl cursor-pointer flex items-center gap-2 text-sm font-bold">
                                                <Copy className="w-4 h-4" /> Copiar
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 text-yellow-300 text-sm">⚠ Chave PIX não configurada. Entre em contato via WhatsApp.</div>
                                )}
                                <div className="border-t border-white/10 pt-6">
                                    <h4 className="font-bold text-white mb-3">📎 Enviar Comprovante</h4>
                                    <div className="flex gap-3 flex-wrap">
                                        <input type="file" accept="image/*,application/pdf" onChange={e => setProofFile(e.target.files?.[0] || null)}
                                            className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white text-sm file:mr-3 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-white/20 file:text-white cursor-pointer" />
                                        <button onClick={handleUploadProof} disabled={!proofFile || uploadingProof}
                                            className="px-6 py-3 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center gap-2 cursor-pointer">
                                            {uploadingProof ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar
                                        </button>
                                    </div>
                                </div>
                                {settings.whatsapp && (
                                    <a href={`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(`Realizei o pagamento do orçamento #${savedQuote.id}.`)}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-3 w-full p-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-2xl transition-all">
                                        📱 Confirmar pagamento pelo WhatsApp
                                    </a>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-3 justify-between">
                                <div className="flex gap-3 flex-wrap">
                                    <button onClick={handleDownloadPDF} className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl flex items-center gap-2 font-bold cursor-pointer"><Printer className="w-4 h-4" /> Imprimir</button>
                                    <button onClick={handleDownloadPDF} className="px-5 py-3 bg-indigo-500 hover:bg-indigo-400 text-white rounded-2xl flex items-center gap-2 font-bold cursor-pointer"><FileDown className="w-4 h-4" /> Baixar PDF</button>
                                    <button onClick={() => { setBends([]); setStep('bends'); setSavedQuote(null); setNotes(''); setClientName(''); setShowPostConfirm(false); setShowMyQuotes(true); fetch('/api/quotes', { credentials: 'include' }).then(r => r.json()).then(setMyQuotes).catch(() => { }); }}
                                        className="px-5 py-3 bg-blue-500 hover:bg-blue-400 text-white rounded-2xl flex items-center gap-2 font-bold cursor-pointer">
                                        <List className="w-4 h-4" /> Ir para Listagem
                                    </button>
                                </div>
                                <button onClick={() => { setBends([]); setStep('bends'); setSavedQuote(null); setNotes(''); setClientName(''); setShowPostConfirm(false); }}
                                    className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl flex items-center gap-2 font-bold cursor-pointer">
                                    <Plus className="w-4 h-4" /> Novo Orçamento
                                </button>
                            </div>
                        </motion.div>
                    )
                }
            </div >


        </div >
    );
}
