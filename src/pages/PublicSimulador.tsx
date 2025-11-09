// src/pages/PublicSimulador.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  Loader2,
  MessageCircle,
  MousePointerClick,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Car,
  Bike,
  Home,
  Wrench,
  Truck,
} from "lucide-react";

/** =========================
 *  IDs padrão (AUTH USER ID)
 *  =========================
 *  Atenção: a RPC v2 usa auth_user_id nas FKs de opportunities (vendedor_id/owner_id).
 *  O padrão que você pediu é o do Wesley: 524f9d55-...-7e6115e7cb0b
 */
const DEFAULT_VENDEDOR_AUTH_ID = "524f9d55-48c0-4c56-9ab8-7e6115e7cb0b";
const DEFAULT_OWNER_AUTH_ID = "524f9d55-48c0-4c56-9ab8-7e6115e7cb0b";

/** WhatsApp oficial Consulmax (E.164) */
const CONSULMAX_WA = "5569993917465";

/* ========= Helpers ========= */
function ts() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}

function formatPhoneBR(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function currencyMask(v: string) {
  const digits = v.replace(/\D/g, "");
  const n = Number(digits || "0");
  return (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function waLink(userPhoneDigits: string, text: string) {
  const to = userPhoneDigits.length >= 10 ? `55${userPhoneDigits}` : CONSULMAX_WA;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

/* ========= Ícone Home com “+” (Imóvel Estendido) ========= */
function HomeWithPlus(props: React.ComponentProps<typeof Home>) {
  return (
    <span className="relative inline-block">
      <Home {...props} />
      <span className="absolute -top-1 -right-1 text-[10px] leading-none font-bold">+</span>
    </span>
  );
}

/* ========= UI: Segmentos ========= */
const SEGMENTOS: Array<{ id: string; rotulo: string; rotuloRPC: string; Icon: React.ComponentType<any> }> = [
  { id: "automovel", rotulo: "AUTOMÓVEIS", rotuloRPC: "Automóvel", Icon: Car },
  { id: "motocicleta", rotulo: "MOTOCICLETAS", rotuloRPC: "Motocicleta", Icon: Bike },
  { id: "imovel", rotulo: "IMÓVEIS", rotuloRPC: "Imóvel", Icon: Home },
  { id: "servicos", rotulo: "SERVIÇOS", rotuloRPC: "Serviços", Icon: Wrench },
  { id: "pesados", rotulo: "PESADOS", rotuloRPC: "Pesados", Icon: Truck },
  { id: "imovel_estendido", rotulo: "IMÓVEL ESTENDIDO", rotuloRPC: "Imóvel Estendido", Icon: HomeWithPlus },
];

function segmentLabelFromId(id: string): string {
  return SEGMENTOS.find((s) => s.id === id)?.rotuloRPC ?? id;
}

/* ========= RPCs ========= */
/** Cria a oportunidade e (se lead_id = null) cria o lead internamente – via SECURITY DEFINER */
async function createOpportunityV2({
  nome,
  email,
  telefone,
  segmentoRPC,
  vendedorAuthId = DEFAULT_VENDEDOR_AUTH_ID,
  ownerAuthId = DEFAULT_OWNER_AUTH_ID,
}: {
  nome: string;
  email: string;
  telefone: string;
  segmentoRPC: string;
  vendedorAuthId?: string;
  ownerAuthId?: string;
}) {
  const tel = telefone.replace(/\D/g, "");
  const { data, error } = await supabase.rpc("public_create_opportunity_v2", {
    p_lead_id: null,
    p_nome: nome,
    p_email: email,
    p_telefone: tel,
    p_segmento: segmentoRPC,
    p_vendedor_auth_id: vendedorAuthId,
    p_owner_auth_id: ownerAuthId,
  });
  if (error) throw error;
  return data as string; // new_opportunity_id
}

/** Acrescenta nota via RPC (SECURITY DEFINER) em public.opportunities.observacao */
async function safeAppendNote(opportunityId: string, note: string) {
  const { error } = await supabase.rpc("public_append_op_note", {
    p_op_id: opportunityId,
    p_note: `[${ts()}] ${note}`,
  });
  if (error) throw error;
}

/* ========= Página ========= */
export default function PublicSimulador() {
  // Etapa 1
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [segmento, setSegmento] = useState<string>("");

  // Etapas
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);

  // IDs
  const [opId, setOpId] = useState<string | null>(null);

  // Etapa 2
  const [tipoSimulacao, setTipoSimulacao] = useState<"credito" | "parcela">("credito");
  const [credito, setCredito] = useState<string>("");
  const [parcela, setParcela] = useState<string>("");
  const [prazo, setPrazo] = useState<string>("");
  const [admin, setAdmin] = useState<string>("Embracon");
  const [mensagem, setMensagem] = useState<string>("");

  const [finalMsg, setFinalMsg] = useState<string>("");

  useEffect(() => {
    setTelefone((t) => formatPhoneBR(t));
  }, []);

  const canContinue =
    nome.trim().length >= 3 &&
    /@/.test(email) &&
    telefone.replace(/\D/g, "").length >= 10 &&
    !!segmento;

  /* ===== Pré-cadastro → cria Oportunidade (Novo) + Lead via RPC v2 ===== */
  async function handlePreCadastro() {
    try {
      setSaving(true);

      const segmentoRPC = segmentLabelFromId(segmento);

      const newOpId = await createOpportunityV2({
        nome: nome.trim(),
        email: email.trim(),
        telefone,
        segmentoRPC,
        vendedorAuthId: DEFAULT_VENDEDOR_AUTH_ID,
        ownerAuthId: DEFAULT_OWNER_AUTH_ID,
      });

      setOpId(newOpId);
      await safeAppendNote(newOpId, `Lead confirmado no pré-cadastro. Segmento: ${segmentoRPC}.`);

      setStep(2);
    } catch (e: any) {
      console.error(e);
      alert(
        "Não foi possível concluir o pré-cadastro/criar a oportunidade.\nVerifique as policies/RPCs no Supabase e tente novamente."
      );
    } finally {
      setSaving(false);
    }
  }

  /* ===== Registra preferências da simulação como anotação ===== */
  async function handleSimular() {
    if (!opId) return;
    try {
      setSaving(true);
      const anot =
        `Preferências → tipo: ${tipoSimulacao}; ` +
        (tipoSimulacao === "credito" ? `crédito: ${credito}` : `parcela: ${parcela}`) +
        (prazo ? `; prazo: ${prazo}` : "") +
        `; administradora: ${admin}` +
        (mensagem ? `; obs: ${mensagem}` : "");
      await safeAppendNote(opId, anot);
      setStep(3);
    } catch (e) {
      console.error(e);
      alert("Não foi possível registrar a simulação. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleContratar() {
    if (!opId) return;
    setFinalMsg(
      "Recebemos a sua solicitação, em breve um dos nossos especialistas irá entrar em contato com você para concluir o seu atendimento."
    );
    // best-effort: se RLS bloquear, a anotação já garante o evento
    try {
      await supabase.from("opportunities").update({ estagio: "Contratar – solicitado" }).eq("id", opId);
    } catch {}
    await safeAppendNote(opId, "Usuário clicou em CONTRATAR");

    const segRotulo = SEGMENTOS.find((s) => s.id === segmento)?.rotulo || segmento;
    const text = `Olá! Quero contratar meu consórcio. Segmento: ${segRotulo}. ${
      tipoSimulacao === "credito" ? `Crédito: ${credito}` : `Parcela: ${parcela}`
    }. Prazo: ${prazo || "—"}. Administradora: ${admin}.`;
    window.open(waLink(telefone.replace(/\D/g, ""), text), "_blank");
  }

  async function handleFalarComEspecialista() {
    if (!opId) return;
    setFinalMsg(
      "Recebemos a sua solicitação, em breve um dos nossos especialistas irá entrar em contato com você para concluir o seu atendimento."
    );
    try {
      await supabase.from("opportunities").update({ estagio: "Aguardando contato" }).eq("id", opId);
    } catch {}
    await safeAppendNote(opId, "Usuário clicou em FALAR COM UM ESPECIALISTA");

    const segRotulo = SEGMENTOS.find((s) => s.id === segmento)?.rotulo || segmento;
    const text = `Olá! Preciso falar com um especialista. Segmento: ${segRotulo}. ${
      tipoSimulacao === "credito" ? `Crédito: ${credito}` : `Parcela: ${parcela}`
    }. Prazo: ${prazo || "—"}. Administradora: ${admin}.`;
    window.open(waLink(telefone.replace(/\D/g, ""), text), "_blank");
  }

  /* ===== UI ===== */
  function StepBadge({ n, active, done }: { n: number; active?: boolean; done?: boolean }) {
    return (
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border ${
          active
            ? "bg-[#1E293F] text-white border-[#1E293F]"
            : done
            ? "bg-[#B5A573] text-white border-[#B5A573]"
            : "bg-white text-[#1E293F] border-[#1E293F]"
        }`}
      >
        {done ? <CheckCircle2 className="w-5 h-5" /> : n}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <img src="/logo-consulmax.png" alt="Consulmax" className="h-10" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[#1E293F]">Simule seu Consórcio</h1>
            <p className="text-sm text-[#1E293F]/70">Sem juros. Sem complicação. Resposta rápida.</p>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-4 mb-6">
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
            <CardHeader>
              <CardTitle className="text-[#1E293F]">Comece pelo pré-cadastro</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div>
                <Label>Nome completo</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>E-mail</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="voce@exemplo.com" />
                </div>
                <div>
                  <Label>WhatsApp</Label>
                  <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(69) 9 9999-9999" />
                </div>
              </div>

              {/* Segmentos */}
              <div className="mt-2">
                <Label className="mb-2 block">Bem desejado</Label>
                <div className="flex flex-wrap gap-4">
                  {SEGMENTOS.map(({ id, rotulo, Icon }) => (
                    <SegmentCard key={id} Icon={Icon} active={segmento === id} onClick={() => setSegmento(id)}>
                      {rotulo}
                    </SegmentCard>
                  ))}
                </div>
              </div>

              <Button disabled={!canContinue || saving} onClick={handlePreCadastro} className="bg-[#A11C27] hover:bg-[#8c1822]">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MousePointerClick className="w-4 h-4 mr-2" />}
                Continuar para simulação
              </Button>
              <p className="text-xs text-[#1E293F]/60 leading-relaxed">
                Ao continuar, você concorda em ser contatado pela Consulmax para apresentação de propostas. Seus dados são
                protegidos.
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
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label>Segmento</Label>
                  <Input
                    readOnly
                    value={SEGMENTOS.find((s) => s.id === segmento)?.rotulo || ""}
                  />
                </div>
                <div>
                  <Label>Administradora</Label>
                  <select
                    value={admin}
                    onChange={(e) => setAdmin(e.target.value)}
                    className="w-full rounded-md border border-[#1E293F]/20 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#A11C27]/30"
                  >
                    <option value="Embracon">Embracon</option>
                    <option value="Outras">Outras</option>
                  </select>
                </div>
                <div>
                  <Label>Prazo (meses)</Label>
                  <Input value={prazo} onChange={(e) => setPrazo(e.target.value.replace(/\D/g, ""))} placeholder="120" />
                </div>
              </div>

              <div>
                <Label>Tipo de simulação</Label>
                <div className="flex gap-6 mt-1">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="tipo"
                      value="credito"
                      checked={tipoSimulacao === "credito"}
                      onChange={() => setTipoSimulacao("credito")}
                      className="accent-[#A11C27]"
                    />
                    <span>Por crédito</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="tipo"
                      value="parcela"
                      checked={tipoSimulacao === "parcela"}
                      onChange={() => setTipoSimulacao("parcela")}
                      className="accent-[#A11C27]"
                    />
                    <span>Por parcela</span>
                  </label>
                </div>
              </div>

              {tipoSimulacao === "credito" ? (
                <div>
                  <Label>Valor do crédito desejado</Label>
                  <Input value={credito} onChange={(e) => setCredito(currencyMask(e.target.value))} placeholder="R$ 150.000,00" />
                </div>
              ) : (
                <div>
                  <Label>Valor da parcela desejada</Label>
                  <Input value={parcela} onChange={(e) => setParcela(currencyMask(e.target.value))} placeholder="R$ 1.500,00" />
                </div>
              )}

              <div>
                <Label>Deixe um comentário (opcional)</Label>
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-[#1E293F]/20 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#A11C27]/30"
                  placeholder="Ex.: Quero usar lance, posso antecipar parcelas, etc."
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button disabled={saving} onClick={handleSimular} className="bg-[#A11C27] hover:bg-[#8c1822]">
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Simular agora
                </Button>
                <Button variant="outline" onClick={() => setStep(1)}>
                  Voltar
                </Button>
              </div>

              <p className="text-xs text-[#1E293F]/60">
                Ao clicar em “Simular agora”, registramos as preferências na sua oportunidade <strong>(Novo)</strong> e seguimos
                com o atendimento.
              </p>
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
                  Sua simulação foi registrada. Um especialista pode te contatar para refinar a proposta ideal. Enquanto isso,
                  escolha uma opção abaixo:
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Button onClick={handleContratar} className="h-12 bg-[#A11C27] hover:bg-[#8c1822] text-base">
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Contratar
                </Button>
                <Button onClick={handleFalarComEspecialista} variant="outline" className="h-12 text-base">
                  <MessageCircle className="w-5 h-5 mr-2" />
                  Falar com um Especialista
                </Button>
              </div>

              {finalMsg && (
                <div className="flex items-start gap-2 rounded-xl p-4 bg-[#E0CE8C]/20 border border-[#E0CE8C]">
                  <ShieldCheck className="w-5 h-5 mt-0.5" />
                  <p className="text-sm text-[#1E293F]">{finalMsg}</p>
                </div>
              )}

              <div className="text-xs text-[#1E293F]/60">
                Dica: deixe seu WhatsApp disponível. Nós não pedimos senha para usar esta página.
              </div>
            </CardContent>
          </Card>
        )}

        <footer className="text-center text-xs text-[#1E293F]/50 mt-8">Consulmax • Maximize as suas conquistas.</footer>
      </div>
    </div>
  );
}

/* ====== Components locais ====== */
function SegmentCard({
  active,
  onClick,
  children,
  Icon,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  Icon: React.ComponentType<any>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-5 min-w-[130px] transition
        ${active ? "border-[#A11C27] text-[#A11C27] bg-white shadow" : "border-[#A11C27] text-[#A11C27] bg-white/0 hover:bg-white"}`}
      style={{ boxShadow: active ? "0 2px 10px rgba(161,28,39,0.12)" : undefined }}
    >
      <Icon className="w-10 h-10" />
      <span className="text-xs font-semibold text-center">{children}</span>
    </button>
  );
}
