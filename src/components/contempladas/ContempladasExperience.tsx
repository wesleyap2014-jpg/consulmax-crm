import React, { useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { BadgeCheck, Calculator, CarFront, Check, Copy, Download, FileText, Home, Layers3, Megaphone, Palette, Search, Share2, Sparkles, Truck, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type OfertaCota = {
  id: string;
  codigo: string;
  segmento: string;
  status: string;
  credito_disponivel: number;
  prazo_restante: number;
  valor_parcela: number;
  admin?: { nome: string } | null;
  _calc: { entrada: number; comissaoVendedor?: number };
};

const brl = (value: number) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const number = (value: number) => Number(value || 0).toLocaleString("pt-BR");
const sum = (items: OfertaCota[], fn: (c: OfertaCota) => number) => items.reduce((s, c) => s + fn(c), 0);

export function resumirOferta(items: OfertaCota[]) {
  const credito = sum(items, (c) => Number(c.credito_disponivel || 0));
  const entrada = sum(items, (c) => Number(c._calc.entrada || 0));
  const saldo = sum(items, (c) => Number(c.prazo_restante || 0) * Number(c.valor_parcela || 0));
  const parcela = sum(items, (c) => Number(c.valor_parcela || 0));
  const prazoMax = Math.max(0, ...items.map((c) => Number(c.prazo_restante || 0)));
  const faixas: Array<{ inicio: number; fim: number; parcelas: number; valor: number }> = [];
  let inicio = 1;
  const prazos = Array.from(new Set(items.map((c) => Number(c.prazo_restante || 0)).filter((n) => n > 0))).sort((a, b) => a - b);
  for (const fim of prazos) {
    if (fim < inicio) continue;
    const valor = sum(items.filter((c) => c.prazo_restante >= inicio), (c) => Number(c.valor_parcela || 0));
    if (valor > 0) faixas.push({ inicio, fim, parcelas: fim - inicio + 1, valor });
    inicio = fim + 1;
  }
  return { credito, entrada, saldo, parcela, prazoMax, pctEntrada: credito > 0 ? 100 * entrada / credito : 0, faixas };
}

type HeroProps = {
  busca: string;
  setBusca: (v: string) => void;
  onOpenMax: () => void;
  origem: string;
};
export function ContempladasHero({ busca, setBusca, onOpenMax, origem }: HeroProps) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-[#1E293F] p-5 text-white shadow-lg sm:p-7 lg:p-9">
      <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-[#A11C27]/35 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 right-24 h-64 w-64 rounded-full bg-[#B5A573]/20 blur-3xl" />
      <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#E0CE8C]/30 bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-widest text-[#E0CE8C]"><Sparkles className="h-3.5 w-3.5"/> CENTRAL DE OPORTUNIDADES</div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-4xl">Encontre a carta ideal. <span className="text-[#E0CE8C]">Conquiste mais.</span></h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-200">Pesquise contempladas, compare condições e transforme suas combinações em propostas e anúncios prontos para divulgar.</p>
          <p className="mt-3 text-xs text-slate-300">Estoque em consulta: {origem}</p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Search className="h-4 w-4 text-[#E0CE8C]"/> Busca rápida ou inteligência MAX</div>
          <div className="flex gap-2">
            <input aria-label="Buscar por código, administradora ou segmento" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código, administradora ou segmento..." className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white px-3 py-3 text-sm text-[#1E293F] outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-[#E0CE8C]" />
          </div>
          <button type="button" onClick={onOpenMax} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#A11C27] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#8b1822]"><Sparkles className="h-4 w-4" /> Conversar com o MAX <span className="text-white/80">• Busca inteligente</span></button>
        </div>
      </div>
    </section>
  );
}

export function ContempladasIndicadores({ cotas }: { cotas: OfertaCota[] }) {
  const available = cotas.filter((c) => c.status === "disponivel");
  const vehicle = available.filter((c) => c.segmento === "Automóvel" || c.segmento === "Motocicletas" || c.segmento === "Pesados");
  const homes = available.filter((c) => c.segmento === "Imóvel");
  const panels = [
    { title: "Crédito disponível", value: brl(sum(available, (c) => c.credito_disponivel)), subtitle: number(available.length) + " cotas disponíveis", icon: Wallet },
    { title: "Veículos e pesados", value: brl(sum(vehicle, (c) => c.credito_disponivel)), subtitle: number(vehicle.length) + " cotas disponíveis", icon: CarFront },
    { title: "Imóveis", value: brl(sum(homes, (c) => c.credito_disponivel)), subtitle: number(homes.length) + " cotas disponíveis", icon: Home },
    { title: "Reservadas", value: number(cotas.filter((c) => c.status === "reservada").length), subtitle: "Cotas do estoque consultado", icon: Layers3 },
  ];
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {panels.map(({ title, value, subtitle, icon: Icon }) => <div key={title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</span><span className="rounded-lg bg-[#1E293F]/10 p-2 text-[#1E293F]"><Icon className="h-4 w-4" /></span></div>
      <div className="truncate text-xl font-extrabold text-[#1E293F]" title={value}>{value}</div><p className="mt-1 text-xs text-slate-500">{subtitle}</p>
    </div>)}
  </div>;
}

export function ContempladasDock({ cotas, onClear, onResumo, onGerarCard, onProposta }: {
  cotas: OfertaCota[]; onClear: () => void; onResumo: () => void; onGerarCard: () => void; onProposta: () => void;
}) {
  const data = useMemo(() => resumirOferta(cotas), [cotas]);
  if (!cotas.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-3 left-3 right-3 z-[40] sm:left-6 sm:right-24">
      <div className="pointer-events-auto mx-auto max-w-[1320px] rounded-2xl border border-[#B5A573]/40 bg-[#111b30] p-3 text-white shadow-2xl sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[90px]"><span className="block text-[10px] uppercase tracking-wide text-[#E0CE8C]">{cotas.length} {cotas.length === 1 ? "cota" : "cotas"}</span><strong className="text-sm">Sua combinação</strong></div>
          <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <div><div className="text-[10px] text-slate-300">Crédito</div><div className="whitespace-nowrap text-xs font-bold sm:text-sm">{brl(data.credito)}</div></div>
            <div><div className="text-[10px] text-slate-300">Entrada · {data.pctEntrada.toFixed(1).replace(".", ",")}%</div><div className="whitespace-nowrap text-xs font-bold sm:text-sm">{brl(data.entrada)}</div></div>
            <div><div className="text-[10px] text-slate-300">Parcela inicial</div><div className="whitespace-nowrap text-xs font-bold sm:text-sm">{brl(data.parcela)}</div></div>
            <div><div className="text-[10px] text-slate-300">Saldo nominal estimado</div><div className="whitespace-nowrap text-xs font-bold sm:text-sm">{brl(data.saldo)}</div></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={onResumo}><Calculator className="mr-1.5 h-4 w-4"/>Resumo</Button>
            <Button size="sm" className="bg-[#B5A573] text-[#1E293F] hover:bg-[#E0CE8C]" onClick={onGerarCard}><Palette className="mr-1.5 h-4 w-4" />Gerar Card</Button>
            <Button size="sm" className="bg-white text-[#1E293F] hover:bg-slate-100" onClick={onProposta}><FileText className="mr-1.5 h-4 w-4"/>Criar proposta</Button>
            <Button size="icon" variant="ghost" className="h-9 w-9 text-white hover:bg-white/15 hover:text-white" onClick={onClear} title="Limpar seleção" aria-label="Limpar seleção"><X className="h-4 w-4"/></Button>
          </div>
        </div>
        {data.faixas.length > 1 ? <p className="mt-2 border-t border-white/15 pt-2 text-[11px] text-slate-300">Parcelas variáveis: {data.faixas.map((f) => String(f.parcelas) + "× " + brl(f.valor)).join(" · ")}</p> : null}
      </div>
    </div>
  );
}

type CardTheme = "padrao" | "promocional" | "premium";
type CardFormat = "quadrado" | "feed" | "story";
const formats: Record<CardFormat, { label: string; width: number; height: number }> = {
  quadrado: { label: "Quadrado", width: 1080, height: 1080 },
  feed: { label: "Feed vertical", width: 1080, height: 1350 },
  story: { label: "Story", width: 1080, height: 1920 },
};
const themes: Array<{ id: CardTheme; label: string; className: string }> = [
  { id: "padrao", label: "Padrão", className: "bg-slate-100 border-slate-300" },
  { id: "promocional", label: "Promocional", className: "bg-[#A11C27] border-[#A11C27]" },
  { id: "premium", label: "Premium", className: "bg-[#1E293F] border-[#B5A573]" },
];
const categories = (seg: string) => seg === "Imóvel" ? ["Imóvel", "Residencial", "Comercial", "Terreno"] : seg === "Motocicletas" ? ["Moto"] : seg === "Pesados" ? ["Máquinas pesadas", "Máquinas agrícolas", "Caminhão"] : seg === "Serviços" ? ["Serviços"] : ["Carro", "Moto", "Máquinas pesadas", "Máquinas agrícolas"];

export function ContempladasCardDialog({ open, onOpenChange, cotas }: {
  open: boolean; onOpenChange: (open: boolean) => void; cotas: OfertaCota[];
}) {
  const [theme, setTheme] = useState<CardTheme>("premium");
  const [format, setFormat] = useState<CardFormat>("story");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const art = useRef<HTMLDivElement>(null);
  const data = useMemo(() => resumirOferta(cotas), [cotas]);
  const segment = cotas[0]?.segmento || "Automóvel";
  const variants = categories(segment);
  const chosenCategory = variants.includes(category) ? category : variants[0];
  const dim = formats[format];
  const displayWidth = 265;
  const previewScale = displayWidth / 540;
  const baseHeight = 540 * dim.height / dim.width;
  const isLight = theme === "padrao";
  const bg = theme === "premium" ? "linear-gradient(152deg,#1E293F 0%,#121a2c 68%,#5d1524 100%)" : theme === "promocional" ? "linear-gradient(150deg,#A11C27 0%,#55111c 65%,#1E293F 100%)" : "linear-gradient(152deg,#ffffff 0%,#f5f5f5 70%,#e5e7eb 100%)";
  const textColor = isLight ? "#1E293F" : "#ffffff";
  const goldColor = theme === "premium" ? "#E0CE8C" : theme === "promocional" ? "#ffffff" : "#A11C27";
  const shareText = (segment === "Imóvel" ? "🏠" : segment === "Pesados" ? "🚜" : segment === "Motocicletas" ? "🏍️" : "🚘") + " CARTA CONTEMPLADA | " + chosenCategory + "\n💰 Crédito: " + brl(data.credito) + "\n💵 Entrada: " + brl(data.entrada) + "\n📅 Parcelas:\n" + data.faixas.map((f) => f.parcelas + " × " + brl(f.valor)).join("\n") + "\n📌 Sujeito à disponibilidade e à análise da administradora.\nConsulmax • Maximize as suas conquistas.";
  async function makePng() {
    if (!art.current) throw new Error("Prévia ainda indisponível.");
    return toPng(art.current, { cacheBust: true, pixelRatio: dim.width / 540, backgroundColor: isLight ? "#ffffff" : "#1E293F", width: 540, height: baseHeight });
  }
  async function download() {
    setBusy(true); setError("");
    try {
      const url = await makePng();
      const a = document.createElement("a");
      a.download = "consulmax-contemplada-" + format + "-" + Date.now() + ".png";
      a.href = url; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { setError("Não foi possível gerar a imagem. Tente novamente."); console.error(e); }
    finally { setBusy(false); }
  }
  async function share() {
    setBusy(true); setError("");
    try {
      const url = await makePng();
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], "consulmax-contemplada.png", { type: "image/png" });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Carta contemplada Consulmax", text: shareText });
      } else {
        setError("Compartilhamento de imagem indisponível neste navegador. Baixe o card e envie pelo WhatsApp.");
      }
    } catch (e: any) { if (e?.name !== "AbortError") setError("Compartilhamento não concluído. Baixe o card para enviar."); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(shareText); setError("Texto comercial copiado!"); } catch { setError("Não foi possível copiar o texto."); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col overflow-y-auto p-4 sm:p-6">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-[#1E293F]"><Megaphone className="h-5 w-5 text-[#A11C27]"/> Gerar anúncio para redes sociais</DialogTitle></DialogHeader>
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <div><p className="mb-2 text-sm font-semibold">Tipo de anúncio</p><div className="grid grid-cols-3 gap-2">{themes.map((t) => <button type="button" key={t.id} aria-pressed={theme === t.id} onClick={() => setTheme(t.id)} className={"rounded-xl border-2 p-2 text-center transition " + (theme === t.id ? "border-[#A11C27] ring-2 ring-[#A11C27]/15" : "border-slate-200")}>
              <span className={"mx-auto mb-2 flex h-14 w-full max-w-[120px] items-center justify-center rounded-lg border " + t.className}><span className={"block h-6 w-16 rounded opacity-85 " + (t.id === "padrao" ? "bg-[#1E293F]" : "bg-[#E0CE8C]")}></span></span>
              <span className="text-xs font-semibold text-slate-700">{t.label}</span>
            </button>)}</div></div>
            <div><p className="mb-2 text-sm font-semibold">Categoria · {segment}</p><div className="grid grid-cols-2 gap-2">{variants.map((v) => <button type="button" key={v} onClick={() => setCategory(v)} aria-pressed={chosenCategory === v} className={"rounded-xl border px-3 py-3 text-sm transition " + (chosenCategory === v ? "border-[#A11C27] bg-[#A11C27]/10 font-semibold text-[#A11C27]" : "border-slate-200 hover:border-[#B5A573]")}>{v}</button>)}</div></div>
            <div><p className="mb-2 text-sm font-semibold">Tamanho</p><div className="grid grid-cols-3 gap-2">{(Object.entries(formats) as Array<[CardFormat, typeof dim]>).map(([key, cfg]) => <button type="button" key={key} onClick={() => setFormat(key)} aria-pressed={format === key} className={"rounded-xl border p-2 text-center " + (format === key ? "border-[#A11C27] bg-[#A11C27]/10 text-[#A11C27]" : "border-slate-200")}>
              <span className="mb-2 inline-block h-12 rounded bg-slate-200" style={{ aspectRatio: cfg.width + "/" + cfg.height }}></span><span className="block text-xs font-medium">{cfg.label}</span><span className="block text-[10px]">{cfg.width}×{cfg.height}</span>
            </button>)}</div></div>
            <div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">A arte utiliza os valores atuais das {cotas.length} {cotas.length === 1 ? "cota selecionada" : "cotas selecionadas"} e o cronograma real das parcelas. Comissão e dados internos nunca aparecem no anúncio. Confirme disponibilidade e condições antes da divulgação.</div>
            {error ? <p role="status" className="rounded-lg bg-slate-100 p-3 text-xs text-[#1E293F]">{error}</p> : null}
            <div className="flex flex-wrap gap-2"><Button type="button" onClick={download} disabled={busy || !cotas.length} className="bg-[#A11C27] hover:bg-[#8c1a23]"><Download className="mr-2 h-4 w-4"/> {busy ? "Gerando..." : "Baixar PNG"}</Button>
              <Button type="button" variant="outline" onClick={share} disabled={busy || !cotas.length}><Share2 className="mr-2 h-4 w-4"/> Compartilhar</Button>
              <Button type="button" variant="outline" onClick={copy} disabled={!cotas.length}><Copy className="mr-2 h-4 w-4"/> Copiar texto</Button></div>
          </div>
          <div className="min-w-0"><p className="mb-3 text-sm font-semibold text-slate-700">Prévia do anúncio</p>
            <div className="mx-auto overflow-hidden rounded-xl shadow-xl" style={{ width: displayWidth, height: baseHeight * previewScale }}>
              <div style={{ transform: "scale(" + previewScale + ")", transformOrigin: "top left" }}>
                <div ref={art} style={{ width: 540, height: baseHeight, background: bg, color: textColor, fontFamily: "Manrope, Arial, sans-serif" }} className="relative flex flex-col overflow-hidden p-10">
                  <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full border-[44px] border-[#B5A573]/15" />
                  <div className="absolute -bottom-40 -left-28 h-80 w-80 rounded-full bg-[#A11C27]/20 blur-3xl" />
                  <div className="relative z-10 flex items-center justify-between"><span className="text-2xl font-black tracking-[0.14em]">CONSULMAX</span><span className="text-right text-[10px] font-semibold uppercase tracking-widest">CONSÓRCIOS<br/>E INVESTIMENTOS</span></div>
                  <div className="relative z-10 mt-12"><span style={{ background: goldColor, color: theme === "premium" ? "#1E293F" : theme === "padrao" ? "#ffffff" : "#A11C27" }} className="inline-flex rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider">{cotas.length > 1 ? "COMBINAÇÃO DE CONTEMPLADAS" : "CARTA CONTEMPLADA"}</span>
                    <div className="mt-5 flex items-center gap-3">{segment === "Imóvel" ? <Home className="h-11 w-11"/> : segment === "Pesados" ? <Truck className="h-11 w-11"/> : <CarFront className="h-11 w-11"/>}<span className="text-lg font-extrabold uppercase tracking-wide">{chosenCategory}</span></div>
                  </div>
                  <div className="relative z-10 mt-9"><p className="text-sm font-bold uppercase tracking-widest opacity-75">Crédito disponível</p><p style={{ color: goldColor }} className="mt-2 whitespace-nowrap text-[43px] font-black tracking-tight">{brl(data.credito)}</p></div>
                  <div className="relative z-10 mt-7 grid gap-4 rounded-2xl border p-5" style={{ borderColor: isLight ? "#CBD5E1" : "rgba(255,255,255,.25)", background: isLight ? "rgba(255,255,255,.8)" : "rgba(255,255,255,.09)" }}>
                    <div><p className="text-sm font-semibold uppercase tracking-wide opacity-75">Entrada</p><p className="mt-1 text-3xl font-extrabold">{brl(data.entrada)}</p></div>
                    <div className="border-t pt-4" style={{ borderColor: isLight ? "#E2E8F0" : "rgba(255,255,255,.24)" }}><p className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-75">Parcelas</p>{data.faixas.slice(0, 8).map((f, i) => <p key={i} className="mt-1 text-[18px] font-bold">{f.parcelas} × {brl(f.valor)}</p>)}{data.faixas.length > 8 ? <p className="mt-2 text-xs">Demais faixas no detalhamento comercial</p> : null}</div>
                  </div>
                  <div className="relative z-10 mt-auto pt-9"><div style={{ background: goldColor, color: theme === "premium" ? "#1E293F" : theme === "padrao" ? "#ffffff" : "#A11C27" }} className="rounded-xl px-5 py-4 text-center text-base font-extrabold">REALIZE SEUS PLANOS COM A CONSULMAX</div><p className="mt-5 text-center text-sm font-semibold">Maximize as suas conquistas.</p><p className="mt-3 text-center text-[10px] leading-relaxed opacity-80">Valores sujeitos a confirmação, análise, aprovação e disponibilidade da administradora.</p></div>
                </div>
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">Exportação em {dim.width} × {dim.height} px</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ContempladasPropostaDialog({ open, onOpenChange, cotas }: {
  open: boolean; onOpenChange: (open: boolean) => void; cotas: OfertaCota[];
}) {
  const data = useMemo(() => resumirOferta(cotas), [cotas]);
  const text = "CONSULMAX | PROPOSTA COMERCIAL\n" +
    "Carta" + (cotas.length > 1 ? "s" : "") + " contemplada" + (cotas.length > 1 ? "s" : "") + "\n" +
    "Segmento: " + (cotas[0]?.segmento || "—") + "\n" +
    "Crédito: " + brl(data.credito) + "\n" +
    "Entrada: " + brl(data.entrada) + "\n" +
    "Saldo devedor nominal estimado: " + brl(data.saldo) + "\n" +
    "Parcelas:\n" + data.faixas.map((f) => f.parcelas + " × " + brl(f.valor)).join("\n") + "\n\n" +
    "Valores sujeitos a reajustes, confirmação de disponibilidade e aprovação da administradora.\n" +
    "Consulmax • Maximize as suas conquistas.";
  function exportPdf() {
    const pdf = new jsPDF();
    pdf.setFillColor(30, 41, 63); pdf.rect(0, 0, 210, 38, "F");
    pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(19); pdf.text("CONSULMAX", 18, 23);
    pdf.setFontSize(9); pdf.setFont("helvetica", "normal"); pdf.text("CONSÓRCIOS E INVESTIMENTOS", 18, 31);
    pdf.setTextColor(30, 41, 63); pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.text("Proposta comercial | Carta contemplada", 18, 53);
    let y = 69;
    const lines: Array<[string, string]> = [
      ["Segmento", cotas[0]?.segmento || "—"], ["Crédito disponível", brl(data.credito)], ["Entrada", brl(data.entrada)],
      ["Saldo nominal estimado (parcelas a vencer)", brl(data.saldo)]
    ];
    pdf.setFontSize(11);
    for (const [label, value] of lines) {
      pdf.setFont("helvetica", "normal"); pdf.text(label + ":", 18, y);
      pdf.setFont("helvetica", "bold"); pdf.text(value, 105, y);
      y += 12;
    }
    pdf.setFont("helvetica", "bold"); pdf.text("Cronograma de parcelas", 18, y + 5);
    y += 15;
    pdf.setFont("helvetica", "normal");
    for (const f of data.faixas) { if (y > 257) { pdf.addPage(); y = 25; } pdf.text(f.parcelas + " x " + brl(f.valor) + " (da parcela " + f.inicio + " a " + f.fim + ")", 18, y); y += 9; }
    if (y > 250) { pdf.addPage(); y = 25; }
    pdf.setFontSize(9); pdf.setTextColor(85, 85, 85);
    const note = pdf.splitTextToSize("Valores sujeitos a reajustes, confirmação de disponibilidade, análise e aprovação da administradora. Esta proposta é informativa e não constitui reserva.", 175);
    pdf.text(note, 18, y + 13);
    pdf.save("consulmax-proposta-contemplada-" + Date.now() + ".pdf");
  }
  async function copy() { try { await navigator.clipboard.writeText(text); } catch { window.alert("Não foi possível copiar automaticamente."); } }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
    <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-[#A11C27]"/> Proposta comercial de contempladas</DialogTitle></DialogHeader>
    <p className="text-sm text-slate-600">Proposta independente do Pró Max, com as condições reais da combinação selecionada.</p>
    <textarea readOnly value={text} rows={13} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs"/>
    <div className="flex flex-wrap gap-2">
      <Button onClick={exportPdf} disabled={!cotas.length} className="bg-[#A11C27] hover:bg-[#851723]"><Download className="mr-2 h-4 w-4"/>Baixar PDF</Button>
      <Button onClick={copy} variant="outline"><Copy className="mr-2 h-4 w-4"/>Copiar texto</Button>
      <Button variant="outline" onClick={() => window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener,noreferrer")}><Share2 className="mr-2 h-4 w-4"/>Enviar texto no WhatsApp</Button>
    </div>
  </DialogContent></Dialog>;
}
