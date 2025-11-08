// src/pages/PublicSimulador.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2, MessageCircle, MousePointerClick, ShieldCheck, ShoppingCart, Sparkles } from "lucide-react";

/**
 * Fluxo público:
 *  Etapa 1  -> upsert LEAD e cria OPORTUNIDADE (Novo) via RPC public_create_opportunity
 *  Etapa 2  -> registra a simulação anexando NOTA via RPC public_update_opportunity_stage
 *  Botões   -> trocam estágio e também anexam NOTA via RPC
 */

// -------- Helpers --------
function ts() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatPhoneBR(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
}

function currencyMask(v: string) {
  const digits = v.replace(/\D/g, "");
  const n = Number(digits || "0");
  return (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function upsertLead({ nome, email, telefone }: { nome: string; email: string; telefone: string }) {
  let leadId: string | null = null;

  if (email) {
    const { data } = await supabase.from("leads").select("id").ilike("email", email).maybeSingle();
    if (data?.id) leadId = data.id;
  }
  if (!leadId && telefone) {
    const { data } = await supabase.from("leads").select("id").eq("telefone", telefone.replace(/\D/g, "")).maybeSingle();
    if (data?.id) leadId = data.id;
  }

  if (!leadId) {
    const { data, error } = await supabase
      .from("leads")
      .insert({ nome, email, telefone: telefone.replace(/\D/g, ""), origem: "site_public_simulator" })
      .select("id")
      .single();
    if (error) throw error;
    leadId = data.id;
  } else {
    await supabase.from("leads").update({ nome, email }).eq("id", leadId);
  }
  return leadId;
}

// -------- UI data --------
const modalidades = [
  { id: "imovel", label: "Imóvel" },
  { id: "veiculo", label: "Veículo" },
  { id: "pesados", label: "Pesados" },
  { id: "servicos", label: "Serviços" },
  { id: "investimento", label: "Investimento" },
];

export default function PublicSimulador() {
  // Etapa 1: Pré-cadastro
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);

  // Lead/Oportunidade
  const [leadId, setLeadId] = useState<string | null>(null);
  const [opId, setOpId] = useState<string | null>(null);

  // Etapa 2: Simulação
  const [modalidade, setModalidade] = useState<string>("imovel");
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

  const canGoSimular = nome.trim().length >= 3 && /@/.test(email) && telefone.replace(/\D/g, "").length >= 10;

  // === Etapa 1: upsert LEAD e cria OPORTUNIDADE (Novo) ===
  async function handlePreCadastro() {
    try {
      setSaving(true);
      const lid = await upsertLead({ nome: nome.trim(), email: email.trim(), telefone });
      setLeadId(lid);

      // cria a oportunidade AQUI (já aparece no CRM como "Novo")
      const { data, error } = await supabase.rpc("public_create_opportunity", {
        p_nome: nome.trim(),
        p_email: email.trim(),
        p_telefone: telefone,
        p_segmento: null,
        p_tipo_simulacao: null,
        p_valor_credito: null,
        p_parcela_desejada: null,
        p_prazo_meses: null,
        p_administradora: null,
        p_anotacoes: `[${ts()}] Pré-cadastro concluído (site_public_simulator).`,
      });
      if (error) throw error;

      setOpId(data as string);
      setStep(2);
    } catch (e: any) {
      const msg = e?.message || e?.hint || e?.error?.message || "Não foi possível concluir o pré-cadastro.";
      alert(`${msg}\n\nDica: verifique RLS/Policies de public.leads e se a RPC public_create_opportunity existe (SECURITY DEFINER).`);
    } finally {
      setSaving(false);
    }
  }

  // === Etapa 2: registra simulação (só anota) ===
  async function handleSimular() {
    if (!opId) return;
    try {
      setSaving(true);
      const anot =
        `Simulação preenchida → modalidade: ${modalidade}; tipo: ${tipoSimulacao}; ` +
        (tipoSimulacao === "credito" ? `crédito desejado: ${credito}` : `parcela desejada: ${parcela}`) +
        (prazo ? `; prazo: ${prazo}` : "") + `; administradora: ${admin}` +
        (mensagem ? `; obs: ${mensagem}` : "");

      const { error } = await supabase.rpc("public_update_opportunity_stage", {
        p_op_id: opId,
        p_new_stage: null, // mantém "Novo"
        p_append_note: `[${ts()}] ${anot}`,
      });
      if (error) throw error;

      setStep(3);
    } catch (e: any) {
      const msg = e?.message || e?.hint || e?.error?.message || "Não foi possível registrar a simulação.";
      alert(msg);
    } finally {
      setSaving(false);
    }
  }

  // WhatsApp – usa o do usuário quando disponível; senão o oficial
  function waLink(text: string) {
    const fone = telefone.replace(/\D/g, "");
    const target = fone.length >= 10 ? `55${fone}` : "";
    const defaultNumber = "5569993917465"; // ✅ oficial Consulmax
    const to = target || defaultNumber;
    return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
  }

  // === Botões finais ===
  async function handleContratar() {
    if (!opId) return;
    setFinalMsg("Recebemos a sua solicitação, em breve um dos nossos especialistas irá entrar em contato com você para concluir o seu atendimento.");
    await supabase.rpc("public_update_opportunity_stage", {
      p_op_id: opId,
      p_new_stage: "Contratar – solicitado",
      p_append_note: "[web] Usuário clicou em CONTRATAR",
    });
    const text = `Olá! Quero contratar meu consórcio. Modalidade: ${modalidade}. ${tipoSimulacao === "credito" ? `Crédito: ${credito}` : `Parcela: ${parcela}`}. Prazo: ${prazo || "—"}. Administradora: ${admin}.`;
    window.open(waLink(text), "_blank");
  }

  async function handleFalarComEspecialista() {
    if (!opId) return;
    setFinalMsg("Recebemos a sua solicitação, em breve um dos nossos especialistas irá entrar em contato com você para concluir o seu atendimento.");
    await supabase.rpc("public_update_opportunity_stage", {
      p_op_id: opId,
      p_new_stage: "Aguardando contato",
      p_append_note: "[web] Usuário clicou em FALAR COM UM ESPECIALISTA",
    });
    const text = `Olá! Preciso falar com um especialista sobre minha simulação. Modalidade: ${modalidade}. ${tipoSimulacao === "credito" ? `Crédito: ${credito}` : `Parcela: ${parcela}`}. Prazo: ${prazo || "—"}. Administradora: ${admin}.`;
    window.open(waLink(text), "_blank");
  }

  // ---------- UI ----------
  function StepBadge({ n, active, done }: { n: number; active?: boolean; done?: boolean }) {
    return (
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border ${
        active ? "bg-[#1E293F] text-white border-[#1E293F]" :
        done ? "bg-[#B5A573] text-white border-[#B5A573]" :
        "bg-white text-[#1E293F] border-[#1E293F]"
      }`}>
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
              <Button disabled={!canGoSimular || saving} onClick={handlePreCadastro} className="bg-[#A11C27] hover:bg-[#8c1822]">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MousePointerClick className="w-4 h-4 mr-2" />}
                Continuar para simulação
              </Button>
              <p className="text-xs text-[#1E293F]/60 leading-relaxed">
                Ao continuar, você concorda em ser contatado pela Consulmax para apresentação de propostas. Seus dados são protegidos.
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
                  <Label>Modalidade</Label>
                  <select
                    value={modalidade}
                    onChange={(e) => setModalidade(e.target.value)}
                    className="w-full rounded-md border border-[#1E293F]/20 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#A11C27]/30"
                  >
                    {modalidades.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
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
                  placeholder="Ex.: Quero usar lance, posso antecipar parcelas, etc."
                  className="w-full rounded-md border border-[#1E293F]/20 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#A11C27]/30"
                  rows={3}
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
                Ao clicar em “Simular agora”, a sua oportunidade já criada permanece como <strong>Novo</strong> e a simulação é registrada nas anotações.
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
                  Sua simulação foi registrada. Um especialista pode te contatar para refinar a proposta ideal para você. Enquanto isso, escolha uma opção abaixo:
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

        <footer className="text-center text-xs text-[#1E293F]/50 mt-8">
          Consulmax • Maximize as suas conquistas.
        </footer>
      </div>
    </div>
  );
}
