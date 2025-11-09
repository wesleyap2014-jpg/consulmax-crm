// src/pages/PublicSimulador.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  Loader2,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  Car,
  Bike,
  Home,
  Wrench,
  Truck,
  Instagram,
  Facebook,
  ExternalLink,
} from "lucide-react";

/** =========================
 *  IDs padrão (AUTH USER ID)
 *  =========================
 */
const DEFAULT_VENDEDOR_AUTH_ID = "524f9d55-48c0-4c56-9ab8-7e6115e7c0b0";
const DEFAULT_OWNER_AUTH_ID = "524f9d55-48c0-4c56-9ab8-7e6115e7c0b0";

/** WhatsApp oficial Consulmax (E.164) — (69) 9 9391-7465 */
const CONSULMAX_WA = "5569993917465";

/* ========= Helpers ========= */
function ts() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}
function onlyDigits(s: string) { return s.replace(/\D/g, ""); }
function formatPhoneBR(raw: string) {
  const digits = onlyDigits(raw).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
function BRL(n: number) { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function waLink(userPhoneDigits: string, text: string) {
  const to = userPhoneDigits.length >= 10 ? `55${userPhoneDigits}` : CONSULMAX_WA;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

/* ======== Validators ======== */
function isValidEmail(email: string) {
  const e = email.trim();
  if (!e || e.endsWith("@example.com") || e.endsWith("@exemplo.com")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}
function isValidBRPhone(raw: string) {
  const d = onlyDigits(raw);
  if (d.length < 10 || d.length > 11) return false;
  const blackList = new Set(["0000000000", "00000000000", "11111111111", "1234567890", "12345678901"]);
  if (blackList.has(d)) return false;
  if (d.length === 11 && d[2] !== "9") return false;
  return true;
}

/* ======= Lightweight SEO ======= */
function useSEO() {
  useEffect(() => {
    const title = "Simulador de Consórcio | Consulmax – Sem juros, rápido e seguro";
    const desc =
      "Simule agora seu consórcio de imóveis, automóveis, pesados, motos e serviços. Sem juros, com planejamento inteligente e suporte humano. Resposta rápida.";
    const canonical = "https://crm.consulmaxconsorcios.com.br/publico/simulador";
    document.title = title;

    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta("description", desc);
    setMeta("robots", "index,follow");

    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = canonical;

    const ld = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Consulmax Consórcios",
      url: "https://consulmaxconsorcios.com.br",
      logo: "https://crm.consulmaxconsorcios.com.br/logo-consulmax.png",
      sameAs: [
        "https://www.instagram.com/consulmax.consorcios",
        "https://www.facebook.com/profile.php?id=61583481749603",
      ],
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify(ld);
    document.head.appendChild(script);
    return () => { if (script && script.parentNode) script.parentNode.removeChild(script); };
  }, []);
}

/* ========= Ícone Home com “+” ========= */
function HomeWithPlus(props: React.ComponentProps<typeof Home>) {
  return (
    <span className="relative inline-block">
      <Home {...props} />
      <span className="absolute -top-1 -right-1 text-[10px] leading-none font-bold">+</span>
    </span>
  );
}

/* ========= UI: Segmentos ========= */
type SegmentId = "automovel" | "motocicleta" | "imovel" | "servicos" | "pesados" | "imovel_estendido";
const SEGMENTOS: Array<{ id: SegmentId; rotulo: string; rotuloRPC: string; Icon: React.ComponentType<any> }> = [
  { id: "automovel", rotulo: "AUTOMÓVEIS", rotuloRPC: "Automóvel", Icon: Car },
  { id: "motocicleta", rotulo: "MOTOCICLETAS", rotuloRPC: "Motocicleta", Icon: Bike },
  { id: "imovel", rotulo: "IMÓVEIS", rotuloRPC: "Imóvel", Icon: Home },
  { id: "servicos", rotulo: "SERVIÇOS", rotuloRPC: "Serviços", Icon: Wrench },
  { id: "pesados", rotulo: "PESADOS", rotuloRPC: "Pesados", Icon: Truck },
  { id: "imovel_estendido", rotulo: "IMÓVEL ESTENDIDO", rotuloRPC: "Imóvel Estendido", Icon: HomeWithPlus },
];
function segmentLabelFromId(id: SegmentId): string {
  return SEGMENTOS.find((s) => s.id === id)?.rotuloRPC ?? id;
}

/* ========= Tipos de parcela ========= */
type ParcelKind = "cheia" | "reduzida50";

/* ========= Configurações por segmento ========= */
type OptionCfg = {
  id: string;
  prazo: number;
  admPct: number;
  frPct: number;
  antecipPct: number;
  antecipParcelas: number;
  allowReduction?: boolean;
  onlyReduction?: boolean;
  visibleIfCreditMin?: number;
};
type SegmentCfg = { min: number; max: number; step: number; options: OptionCfg[]; };

const SEGMENT_CFG: Record<SegmentId, SegmentCfg> = {
  automovel: {
    min: 45000, max: 180000, step: 5000,
    options: [
      { id: "auto1", prazo: 80, admPct: 0.14, frPct: 0.03, antecipPct: 0.02, antecipParcelas: 2, allowReduction: false },
      { id: "auto2", prazo: 80, admPct: 0.17, frPct: 0.03, antecipPct: 0.01, antecipParcelas: 2, allowReduction: false },
      { id: "auto3", prazo: 100, admPct: 0.16, frPct: 0.03, antecipPct: 0.02, antecipParcelas: 1, allowReduction: true },
      { id: "auto4", prazo: 100, admPct: 0.20, frPct: 0.03, antecipPct: 0.01, antecipParcelas: 1, allowReduction: true },
      { id: "auto5", prazo: 100, admPct: 0.22, frPct: 0.03, antecipPct: 0.012, antecipParcelas: 12, allowReduction: true },
    ],
  },
  motocicleta: {
    min: 15000, max: 30000, step: 1000,
    options: [{ id: "moto1", prazo: 70, admPct: 0.20, frPct: 0.05, antecipPct: 0, antecipParcelas: 0, allowReduction: false }],
  },
  servicos: {
    min: 15000, max: 30000, step: 1000,
    options: [{ id: "serv1", prazo: 40, admPct: 0.21, frPct: 0.05, antecipPct: 0, antecipParcelas: 0, allowReduction: false }],
  },
  pesados: {
    min: 200000, max: 700000, step: 10000,
    options: [
      { id: "pes1", prazo: 100, admPct: 0.14, frPct: 0.03, antecipPct: 0, antecipParcelas: 0, allowReduction: false },
      { id: "pes2", prazo: 100, admPct: 0.12, frPct: 0.03, antecipPct: 0.02, antecipParcelas: 2, allowReduction: false },
      { id: "pes3", prazo: 100, admPct: 0.14, frPct: 0.03, antecipPct: 0.02, antecipParcelas: 1, allowReduction: true, onlyReduction: true },
      { id: "pes4", prazo: 100, admPct: 0.18, frPct: 0.03, antecipPct: 0.012, antecipParcelas: 12, allowReduction: true, onlyReduction: true },
    ],
  },
  imovel: {
    min: 100000, max: 1200000, step: 10000,
    options: [
      { id: "imo1", prazo: 180, admPct: 0.18, frPct: 0.02, antecipPct: 0.02, antecipParcelas: 2, allowReduction: false },
      { id: "imo2", prazo: 165, admPct: 0.21, frPct: 0.02, antecipPct: 0, antecipParcelas: 0, allowReduction: false },
      { id: "imo3", prazo: 180, admPct: 0.21, frPct: 0.02, antecipPct: 0.01, antecipParcelas: 1, allowReduction: false, visibleIfCreditMin: 250000 },
    ],
  },
  imovel_estendido: {
    min: 120000, max: 2000000, step: 10000,
    options: [
      { id: "ime1", prazo: 240, admPct: 0.22, frPct: 0.02, antecipPct: 0.02, antecipParcelas: 1, allowReduction: true },
      { id: "ime2", prazo: 240, admPct: 0.26, frPct: 0.02, antecipPct: 0.01, antecipParcelas: 1, allowReduction: true },
      { id: "ime3", prazo: 240, admPct: 0.20, frPct: 0.02, antecipPct: 0.02, antecipParcelas: 1, allowReduction: true, visibleIfCreditMin: 600000 },
      { id: "ime4", prazo: 240, admPct: 0.28, frPct: 0.02, antecipPct: 0.012, antecipParcelas: 12, allowReduction: true },
    ],
  },
};

/* ========= RPCs ========= */
async function createOpportunityV2({
  nome, email, telefone, segmentoRPC,
  vendedorAuthId = DEFAULT_VENDEDOR_AUTH_ID,
  ownerAuthId = DEFAULT_OWNER_AUTH_ID,
}: {
  nome: string; email: string; telefone: string; segmentoRPC: string;
  vendedorAuthId?: string; ownerAuthId?: string;
}) {
  const tel = onlyDigits(telefone);
  const payload = {
    p_lead_id: null as any,
    p_nome: nome,
    p_email: email,
    p_telefone: tel,
    p_segmento: segmentoRPC,
    p_vendedor_auth_id: vendedorAuthId,
    p_owner_auth_id: ownerAuthId,
  };
  const { data, error } = await supabase.rpc("public_create_opportunity_v2", payload);
  if (error) { console.error("[public_create_opportunity_v2] payload:", payload); console.error(error); throw error; }
  return data as string;
}
/** Nota na oportunidade */
async function safeAppendNote(opportunityId: string, note: string) {
  const { error } = await supabase.rpc("public_append_op_note", { p_op_id: opportunityId, p_note: `[${ts()}] ${note}` });
  if (error) console.warn("[public_append_op_note] erro:", error);
}

/* ========= Cálculo ========= */
type ParcelKindInput = { credito: number; prazo: number; admPct: number; frPct: number; antecipPct: number; antecipParcelas: number; kind: ParcelKind; };
function calcularParcelas({ credito, prazo, admPct, frPct, antecipPct, antecipParcelas, kind }: ParcelKindInput) {
  const fc = credito / prazo;
  const encargos = (credito * (admPct + frPct)) / prazo;
  const parcelaBase = kind === "cheia" ? fc + encargos : fc * 0.5 + encargos;
  const antecipTotal = credito * antecipPct;
  const antecipMensal = antecipParcelas > 0 ? antecipTotal / antecipParcelas : 0;
  return { parcelaComAntecipacao: antecipParcelas > 0 ? parcelaBase + antecipMensal : parcelaBase, parcelaSemAntecipacao: parcelaBase, antecipParcelas };
}

/* ========= Página ========= */
export default function PublicSimulador() {
  useSEO();

  // Etapa 1
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [segmento, setSegmento] = useState<SegmentId>("automovel");

  // Validações visuais
  const [touchedEmail, setTouchedEmail] = useState(false);
  const [touchedPhone, setTouchedPhone] = useState(false);

  // Etapas
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);

  // Oportunidade criada
  const [opId, setOpId] = useState<string | null>(null);

  // Etapa 2
  const [parcelKind, setParcelKind] = useState<ParcelKind>("cheia");

  // slider de crédito por segmento
  const segCfg = SEGMENT_CFG[segmento];
  const [credito, setCredito] = useState<number>(segCfg.min);

  // Seleção final para etapa 3
  const [selecionado, setSelecionado] = useState<{
    optionId: string; prazo: number; admPct: number; frPct: number; antecipPct: number; antecipParcelas: number;
  } | null>(null);

  const [finalMsg, setFinalMsg] = useState<string>("");

  // Refs
  const optionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setTelefone((t) => formatPhoneBR(t)), []);
  useEffect(() => {
    const cfg = SEGMENT_CFG[segmento];
    setCredito((prev) => clampToStep(prev, cfg.min, cfg.max, cfg.step));
  }, [segmento]);

  const emailOk = isValidEmail(email);
  const phoneOk = isValidBRPhone(telefone);
  const nomeOk = nome.trim().length >= 3;
  const canContinueStep1 = nomeOk && emailOk && phoneOk && !!segmento;

  /* ======= opcoesFiltradas — declarado antes do render/uso ======= */
  const opcoesFiltradas = useMemo(() => {
    const cfg = SEGMENT_CFG[segmento];
    return cfg.options.filter((o) => {
      if (o.visibleIfCreditMin && credito < o.visibleIfCreditMin) return false;
      if (parcelKind === "reduzida50") {
        if (!o.allowReduction && !o.onlyReduction) return false;
        return true;
      } else {
        if (o.onlyReduction) return false;
        return true;
      }
    });
  }, [segmento, parcelKind, credito]);

  /* ===== Ações ===== */
  async function handlePreCadastro() {
    try {
      setSaving(true);
      const segmentoRPC = segmentLabelFromId(segmento);
      const newOpId = await createOpportunityV2({ nome: nome.trim(), email: email.trim(), telefone, segmentoRPC });
      setOpId(newOpId);
      safeAppendNote(newOpId, `Lead confirmado no pré-cadastro. Segmento: ${segmentoRPC}.`).catch(() => {});
      setStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      const msg = e?.message || e?.hint || e?.details || "Falha ao executar a RPC public_create_opportunity_v2.";
      alert(`Não foi possível concluir o pré-cadastro/criar a oportunidade.\n\nDetalhes: ${msg}\n\nVeja o console do navegador para diagnóstico completo.`);
      console.error("[handlePreCadastro] erro:", e);
    } finally { setSaving(false); }
  }

  async function handleEscolherOpcao(opt: OptionCfg) {
    if (!opId) return;
    try {
      setSaving(true);
      const { parcelaComAntecipacao, parcelaSemAntecipacao, antecipParcelas } = calcularParcelas({
        credito, prazo: opt.prazo, admPct: opt.admPct, frPct: opt.frPct, antecipPct: opt.antecipPct, antecipParcelas: opt.antecipParcelas, kind: parcelKind,
      });

      const resumo =
        `Escolha do cliente → Segmento: ${segmentLabelFromId(segmento)}; ` +
        `Crédito: ${BRL(credito)}; Parcelamento: ${parcelKind === "cheia" ? "Parcela Cheia" : "Parcela Reduzida 50%"}; ` +
        `Opção: ${opt.id} | Prazo: ${opt.prazo}m; ` +
        (antecipParcelas > 0
          ? `Parc. 1–${antecipParcelas}: ${BRL(parcelaComAntecipacao)} | Demais: ${BRL(parcelaSemAntecipacao)}`
          : `Parcela mensal: ${BRL(parcelaSemAntecipacao)}`);

      await safeAppendNote(opId, resumo);
      setSelecionado({ optionId: opt.id, prazo: opt.prazo, admPct: opt.admPct, frPct: opt.frPct, antecipPct: opt.antecipPct, antecipParcelas: opt.antecipParcelas });
      setStep(3);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      console.error("[handleEscolherOpcao] erro:", e);
      alert("Não foi possível registrar a escolha. Tente novamente.");
    } finally { setSaving(false); }
  }

  /* ===== util ===== */
  function clampToStep(v: number, min: number, max: number, step: number) {
    const clamped = Math.max(min, Math.min(max, v));
    const snapped = Math.round((clamped - min) / step) * step + min;
    return Math.min(max, Math.max(min, snapped));
  }
  function handleSlider(v: number) {
    const { min, max, step } = SEGMENT_CFG[segmento];
    setCredito(clampToStep(v, min, max, step));
  }

  /* ===== CTA flutuante por etapa ===== */
  function floatingCTALabel() { if (step === 1) return "Continuar"; if (step === 2) return "Ver opções"; return "Finalizar"; }
  const floatingCTADisabled = step === 1 ? (!canContinueStep1 || saving) : false;
  function onFloatingCTA() {
    if (step === 1) return handlePreCadastro();
    if (step === 2) { optionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    window.location.href = "https://consulmaxconsorcios.com.br/";
  }

  /* ====================== RENDER ====================== */
  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* Wizard mobile */}
      <div className="md:hidden sticky top-0 z-30 bg-[#F5F5F5]/95 backdrop-blur border-b border-[#1E293F]/10">
        <div className="mx-auto max-w-5xl px-4 py-2 flex items-center gap-4">
          <span className="text-sm font-semibold text-[#1E293F]">Etapa</span>
          <div className="flex items-center gap-3 text-xs">
            <StepDot active={step === 1} done={step > 1} label="1" />
            <div className="w-10 h-[2px] bg-[#1E293F]/20" />
            <StepDot active={step === 2} done={step > 2} label="2" />
            <div className="w-10 h-[2px] bg-[#1E293F]/20" />
            <StepDot active={step === 3} done={false} label="3" />
          </div>
          <div className="ml-auto text-[11px] text-[#1E293F]/70 flex items-center gap-1">
            <ShieldCheck className="w-4 h-4" /> Seguro
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <img src="/logo-consulmax.png" alt="Consulmax" className="h-20" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[#1E293F]">Simule seu Consórcio</h1>
            <p className="text-sm text-[#1E293F]/70">Sem juros. Sem complicação. Resposta rápida.</p>
          </div>
        </div>

        {/* Benefícios */}
        <div className="mb-6 flex flex-wrap items-center gap-3 text-xs text-[#1E293F]/80">
          <span className="px-2 py-1 rounded-full bg-white border border-[#1E293F]/15">Sem juros</span>
          <span className="px-2 py-1 rounded-full bg-white border border-[#1E293F]/15">Planejamento inteligente</span>
          <span className="px-2 py-1 rounded-full bg-white border border-[#1E293F]/15">Suporte humano</span>
          <span className="ml-auto flex items-center gap-1 text-[#1E293F]/60">
            <ShieldCheck className="w-4 h-4" /> Seus dados são protegidos
          </span>
        </div>

        {/* Stepper desktop */}
        <div className="hidden md:flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <StepBadge n={1} active={step === 1} done={step > 1} />
            <span className="text-sm font-medium text-[#1E293F]">Seus dados</span>
          </div>
          <div className="h-px bg-[#1E293F]/20 flex-1" />
          <div className="flex items-center gap-2">
            <StepBadge n={2} active={step === 2} done={step > 2} />
            <span className="text-sm font-medium text-[#1E293F]">Preferências</span>
          </div>
          <div className="h-px bg-[#1E293F]/20 flex-1" />
          <div className="flex items-center gap-2">
            <StepBadge n={3} active={step === 3} done={false} />
            <span className="text-sm font-medium text-[#1E293F]">Próximos passos</span>
          </div>
        </div>

        {/* Etapa 1 */}
        {step === 1 && (
          <Card className="rounded-2xl shadow-sm border-[#1E293F]/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-[#1E293F]">Comece pelo pré-cadastro</CardTitle>
            </CardHeader>

            {/* Chips Segmento */}
            <div className="px-6 pb-2">
              <Label className="mb-2 block">Bem desejado</Label>
              <div
                className="flex gap-3 overflow-x-auto whitespace-nowrap pb-2 justify-center [-ms-overflow-style:none] [scrollbar-width:none]"
                style={{ scrollbarWidth: "none" }}
              >
                {SEGMENTOS.map(({ id, rotulo, Icon }) => (
                  <span key={id} className="inline-block shrink-0">
                    <SegmentCard Icon={Icon} active={segmento === id} onClick={() => setSegmento(id)}>
                      {rotulo}
                    </SegmentCard>
                  </span>
                ))}
              </div>
            </div>

            <CardContent className="grid gap-4 pt-0">
              <div>
                <Label>Nome completo</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>E-mail</Label>
                  <Input
                    value={email}
                    onBlur={() => setTouchedEmail(true)}
                    onChange={(e) => setEmail(e.target.value)}
                    inputMode="email"
                    type="email"
                    placeholder="voce@seuemail.com"
                    className={!isValidEmail(email) && touchedEmail ? "border-red-400 focus:ring-red-200" : ""}
                  />
                  {!isValidEmail(email) && touchedEmail && (
                    <p className="text-xs text-red-600 mt-1">Informe um e-mail válido (evite domínios de teste).</p>
                  )}
                </div>
                <div>
                  <Label>WhatsApp</Label>
                  <Input
                    value={telefone}
                    onBlur={() => setTouchedPhone(true)}
                    onChange={(e) => setTelefone(formatPhoneBR(e.target.value))}
                    inputMode="tel"
                    placeholder="(69) 9 9391-7465"
                    className={!isValidBRPhone(telefone) && touchedPhone ? "border-red-400 focus:ring-red-200" : ""}
                  />
                  {!isValidBRPhone(telefone) && touchedPhone && (
                    <p className="text-xs text-red-600 mt-1">Informe um WhatsApp válido (10–11 dígitos; celular com 9 após o DDD).</p>
                  )}
                </div>
              </div>

              <Button
                disabled={!canContinueStep1 || saving}
                onClick={handlePreCadastro}
                className="hidden md:inline-flex bg-[#A11C27] hover:bg-[#8c1822]"
                aria-disabled={!canContinueStep1 || saving}
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MousePointerClick className="w-4 h-4 mr-2" />}
                Continuar para simulação
              </Button>

              <p className="text-xs text-[#1E293F]/60 leading-relaxed">
                Ao continuar, você concorda em ser contatado pela Consulmax para apresentação de propostas. Seus dados são
                protegidos e nunca pediremos sua senha.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Etapa 2 */}
        {step === 2 && (
          <Card className="rounded-2xl shadow-sm border-[#1E293F]/10">
            <CardHeader>
              <CardTitle className="text-[#1E293F]">Personalize sua simulação</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {/* Segmento */}
              <div>
                <Label className="mb-2 block">Segmento</Label>
                <div
                  className="flex gap-3 overflow-x-auto whitespace-nowrap pb-2 justify-center [-ms-overflow-style:none] [scrollbar-width:none]"
                  style={{ scrollbarWidth: "none" }}
                >
                  {SEGMENTOS.map(({ id, rotulo, Icon }) => (
                    <span key={id} className="inline-block shrink-0">
                      <SegmentCard Icon={Icon} active={segmento === id} onClick={() => setSegmento(id)}>
                        {rotulo}
                      </SegmentCard>
                    </span>
                  ))}
                </div>
              </div>

              {/* Tipo de parcela */}
              <div>
                <Label>Tipo de parcela</Label>
                <div className="flex gap-2 mt-2 justify-center">
                  <Chip active={parcelKind === "cheia"} onClick={() => setParcelKind("cheia")} label="Parcela Cheia" />
                  <Chip active={parcelKind === "reduzida50"} onClick={() => setParcelKind("reduzida50")} label="Parcela Reduzida" />
                </div>
                <p className="text-xs text-[#1E293F]/60 mt-1 text-center">
                  Na Parcela Reduzida, o desconto aplica-se sobre o Fundo Comum até a contemplação; os encargos permanecem integrais.
                </p>
              </div>

              {/* Slider */}
              <div>
                <div className="flex items-center justify-between">
                  <Label>Valor do crédito</Label>
                  <strong className="text-[#1E293F]">{BRL(credito)}</strong>
                </div>
                <input
                  type="range"
                  min={segCfg.min}
                  max={segCfg.max}
                  step={segCfg.step}
                  value={credito}
                  onChange={(e) => handleSlider(Number(e.target.value))}
                  className="w-full accent-[#A11C27] mt-2"
                />
                <div className="flex justify-between text-xs text-[#1E293F]/60">
                  <span>{BRL(segCfg.min)}</span>
                  <span>{BRL(segCfg.max)}</span>
                </div>
              </div>

              {/* Opções calculadas */}
              <div ref={optionsRef} className="grid gap-3">
                {opcoesFiltradas.map((opt) => {
                  const calc = calcularParcelas({
                    credito, prazo: opt.prazo, admPct: opt.admPct, frPct: opt.frPct, antecipPct: opt.antecipPct, antecipParcelas: opt.antecipParcelas, kind: parcelKind,
                  });
                  return (
                    <div key={opt.id} className="rounded-xl border border-[#1E293F]/15 bg-white p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-[#1E293F]">
                          Opção {opt.id.toUpperCase()} • Prazo {opt.prazo} meses
                        </div>
                        {opt.antecipParcelas > 0 ? (
                          <div className="text-sm text-[#1E293F]">
                            Parcelas 1–{opt.antecipParcelas}: <strong>{BRL(calc.parcelaComAntecipacao)}</strong> • Demais:{" "}
                            <strong>{BRL(calc.parcelaSemAntecipacao)}</strong>
                          </div>
                        ) : (
                          <div className="text-sm text-[#1E293F]">
                            Parcela mensal: <strong>{BRL(calc.parcelaSemAntecipacao)}</strong>
                          </div>
                        )}
                      </div>
                      <Button onClick={() => handleEscolherOpcao(opt)} className="bg-[#A11C27] hover:bg-[#8c1822]" disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                        Escolher esta opção
                      </Button>
                    </div>
                  );
                })}
                {opcoesFiltradas.length === 0 && (
                  <div className="rounded-xl border border-[#1E293F]/15 bg-white p-4 text-sm text-[#1E293F]/70">
                    Nenhuma opção disponível para os filtros atuais. Ajuste o segmento, o tipo de parcela ou o valor do crédito.
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Etapa 3 */}
        {step === 3 && (
          <Card className="rounded-2xl shadow-sm border-[#1E293F]/10">
            <CardHeader>
              <CardTitle className="text-[#1E293F]">Pronto! Vamos ao próximo passo</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="rounded-xl p-4 bg-white border border-[#1E293F]/10">
                <p className="text-sm text-[#1E293F]/80">
                  Sua simulação foi registrada com sucesso. Em breve um dos nossos especialistas irá entrar em contato para te prestar todo o apoio.
                  Enquanto isso, escolha uma opção abaixo:
                </p>
              </div>

              {/* Ícones das redes / ações */}
              <div className="rounded-xl p-4 bg-white border border-[#1E293F]/10">
                <h4 className="font-semibold text-[#1E293F] mb-3">Siga-nos</h4>
                <div className="flex items-center gap-4">
                  <a href="https://www.instagram.com/consulmax.consorcios/" target="_blank" aria-label="Instagram Consulmax"
                     className="inline-flex items-center justify-center w-12 h-12 rounded-full border border-[#1E293F]/20 hover:border-[#1E293F]/40">
                    <Instagram className="w-6 h-6" />
                  </a>
                  <a href="https://www.facebook.com/profile.php?id=61583481749603" target="_blank" aria-label="Facebook Consulmax"
                     className="inline-flex items-center justify-center w-12 h-12 rounded-full border border-[#1E293F]/20 hover:border-[#1E293F]/40">
                    <Facebook className="w-6 h-6" />
                  </a>
                  <a href={waLink("6993917465", "Olá, preciso de suporte.")} target="_blank" aria-label="WhatsApp Suporte"
                     className="inline-flex items-center justify-center px-4 h-12 rounded-full border border-[#1E293F]/20 hover:border-[#1E293F]/40 text-sm">
                    WhatsApp Suporte
                  </a>
                  <a href="https://consulmaxconsorcios.com.br/nossa-historia/" target="_blank" aria-label="Quem Somos - Consulmax"
                     className="inline-flex items-center gap-2 px-4 h-12 rounded-full border border-[#1E293F]/20 hover:border-[#1E293F]/40 text-sm">
                    <ExternalLink className="w-4 h-4" /> Quem Somos
                  </a>
                </div>

                <div className="mt-4 flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep(2);
                      setSelecionado(null);
                      setParcelKind("cheia");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Nova Simulação
                  </Button>
                  <Button className="bg-[#A11C27] hover:bg-[#8c1822]" onClick={() => { window.location.href = "https://consulmaxconsorcios.com.br/"; }}>
                    Finalizar
                  </Button>
                </div>
              </div>

              {finalMsg && (
                <div className="flex items-start gap-2 rounded-xl p-4 bg-[#E0CE8C]/20 border border-[#E0CE8C]">
                  <ShieldCheck className="w-5 h-5 mt-0.5" />
                  <p className="text-sm text-[#1E293F]">{finalMsg}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <footer className="text-center text-xs text-[#1E293F]/50 mt-8">Consulmax • Maximize as suas conquistas.</footer>
      </div>

      {/* CTA flutuante (mobile) */}
      <div className="md:hidden fixed right-4 bottom-5 z-30">
        <Button
          onClick={onFloatingCTA}
          disabled={floatingCTADisabled}
          className={`h-12 px-5 rounded-full shadow-lg ${floatingCTADisabled ? "bg-[#A11C27]/60" : "bg-[#A11C27] hover:bg-[#8c1822]"}`}
        >
          {saving && step === 1 ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {floatingCTALabel()}
        </Button>
      </div>
    </div>
  );
}

/* ====== Components locais ====== */
function StepBadge({ n, active, done }: { n: number; active?: boolean; done?: boolean }) {
  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border ${
        active ? "bg-[#1E293F] text-white border-[#1E293F]" : done ? "bg-[#B5A573] text-white border-[#B5A573]" : "bg-white text-[#1E293F] border-[#1E293F]"
      }`}
    >
      {done ? <CheckCircle2 className="w-5 h-5" /> : n}
    </div>
  );
}
function StepDot({ active, done, label }: { active?: boolean; done?: boolean; label: string }) {
  return (
    <div
      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
        active ? "bg-[#1E293F] text-white" : done ? "bg-[#B5A573] text-white" : "bg-white text-[#1E293F] border border-[#1E293F]"
      }`}
    >
      {label}
    </div>
  );
}
function SegmentCard({ active, onClick, children, Icon }: { active?: boolean; onClick: () => void; children: React.ReactNode; Icon: React.ComponentType<any>; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 flex-col items-center justify-center gap-2 rounded-xl border p-5 min-w-[130px] transition
        ${active ? "border-[#A11C27] text-[#A11C27] bg-white shadow" : "border-[#A11C27] text-[#A11C27] bg-white/0 hover:bg-white"}`}
      style={{ boxShadow: active ? "0 2px 10px rgba(161,28,39,0.12)" : undefined }}
      aria-pressed={!!active}
    >
      <Icon className="w-10 h-10" />
      <span className="text-xs font-semibold text-center">{children}</span>
    </button>
  );
}
function Chip({ active, onClick, label }: { active?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
        active ? "bg-[#A11C27] text-white border-[#A11C27]" : "bg-white text-[#1E293F] border-[#1E293F]/30 hover:border-[#1E293F]"
      }`}
      aria-pressed={!!active}
    >
      {label}
    </button>
  );
}
