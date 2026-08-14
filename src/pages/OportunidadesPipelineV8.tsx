import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import OportunidadesPipelineV7 from "./OportunidadesPipelineV7";

type LeadLookup = {
  id: string;
  nome: string;
  telefone?: string | null;
  created_at?: string | null;
};

type OpportunityLookup = {
  id: string;
  lead_id: string;
  vendedor_id: string;
  segmento?: string | null;
  estagio?: string | null;
  valor_credito?: number | null;
  created_at: string;
  last_follow_up_at?: string | null;
  next_follow_up_at?: string | null;
  qualification_score?: number | null;
  qualification_status?: string | null;
  qualification_ai_analysis?: {
    resumo_executivo?: string;
    aderencia_consorcio?: string;
    perfil_comercial?: string;
    abordagem_recomendada?: string;
    proximo_passo?: string;
    pontos_fortes?: string[];
    pontos_atencao?: string[];
  } | null;
  leads?: LeadLookup | null;
};

type UserLookup = {
  auth_user_id: string;
  nome: string;
  phone?: string | null;
  telefone?: string | null;
};

type SavedSimulation = {
  id: string;
  code?: number | null;
  admin_id?: string | null;
  admin_name?: string | null;
  lead_id?: string | null;
  grupo?: string | null;
  segmento?: string | null;
  credito?: number | null;
  created_at?: string | null;
  adm_tax_pct?: number | null;
  fr_tax_pct?: number | null;
  parcela_contemplacao?: number | null;
  parcela_ate_1_ou_2?: number | null;
  parcela_demais?: number | null;
  lance_proprio_valor?: number | null;
  novo_credito?: number | null;
  parcela_escolhida?: number | null;
  novo_prazo?: number | null;
  antecip_parcelas?: number | null;
};

type TreatmentContext = {
  activeCredit: number;
  simulations: SavedSimulation[];
};

const C = {
  red: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
  ink: "#334155",
  slate: "#64748b",
  ok: "#0f766e",
  warn: "#b45309",
  danger: "#991b1b",
};

const normalizeText = (value?: string | null) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const money = (value?: number | null) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const shortDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
};

const dateTime = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const daysSince = (iso?: string | null) => {
  if (!iso) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
};

const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const pct = (value?: number | null) => {
  const n = Number(value || 0) * 100;
  return `${n.toFixed(2).replace(/\.00$/, "").replace(".", ",")}%`;
};

const onlyDigits = (value?: string | null) => String(value || "").replace(/\D/g, "");

function segmentLabel(value?: string | null) {
  const n = normalizeText(value);
  if (n.includes("imovel estendido")) return "Imóvel Estendido";
  if (n.includes("imovel")) return "Imóveis";
  if (n.includes("moto")) return "Motocicletas";
  if (n.includes("serv")) return "Serviços";
  if (n.includes("pesad")) return "Pesados";
  if (n.includes("auto")) return "Automóveis";
  return value || "Consórcio";
}

function buildSimulationSummary(sim: SavedSimulation, sellerPhone?: string | null) {
  const credito = Number(sim.credito || 0);
  const parcelaContemplacao = Math.max(0, Math.round(Number(sim.parcela_contemplacao || 0)));
  const antecip = Math.max(0, Math.round(Number(sim.antecip_parcelas || 0)));
  const parcelaInicial = Number(sim.parcela_ate_1_ou_2 || sim.parcela_demais || 0);
  const parcelaNormal = Number(sim.parcela_demais || sim.parcela_ate_1_ou_2 || 0);
  const linhasAntes: string[] = [];

  if (parcelaContemplacao > 0) {
    if (antecip > 0) {
      const fimInicial = Math.min(antecip, parcelaContemplacao);
      linhasAntes.push(
        `💳 ${fimInicial === 1 ? "Parcela 1" : `Parcelas 1 a ${fimInicial}`}: ${money(parcelaInicial)} (Primeira parcela em até 3x sem juros no cartão)`,
      );
      if (parcelaContemplacao > fimInicial) {
        linhasAntes.push(
          `💵 Parcelas ${fimInicial + 1} a ${parcelaContemplacao} (Ou até a contemplação): ${money(parcelaNormal)}`,
        );
      }
    } else {
      linhasAntes.push(
        `💳 Parcelas 1 a ${parcelaContemplacao}: ${money(parcelaNormal)}`,
      );
    }
  }

  const telDigits = onlyDigits(sellerPhone);
  const telComPais = telDigits ? (telDigits.startsWith("55") ? telDigits : `55${telDigits}`) : "";
  const wa = telComPais ? `https://wa.me/${telComPais}` : "";
  const admin = sim.admin_name || "Consórcio";
  const grupo = sim.grupo ? ` - Grupo ${sim.grupo}` : "";
  const prazoRestante = Math.max(0, Math.round(Number(sim.novo_prazo || 0)));

  return `🎯 *Simulação ${admin} ${segmentLabel(sim.segmento)}${grupo}*

💰 Crédito contratado: ${money(credito)}

${linhasAntes.join("\n\n")}

📈 Após a contemplação${parcelaContemplacao ? ` (prevista em ${parcelaContemplacao} meses)` : ""}:
🏦 Lance próprio: ${money(sim.lance_proprio_valor)}

✅ Crédito líquido liberado: ${money(sim.novo_credito || credito)}

📆 Parcelas restantes:
+ ${prazoRestante} x de ${money(sim.parcela_escolhida || parcelaNormal)}

⏳ Prazo restante: ${prazoRestante} meses

Me chama aqui e eu te mostro o melhor caminho 👇${wa ? `\n${wa}` : ""}`;
}

function followUpBadge(iso?: string | null) {
  if (!iso) return { label: "Sem data", color: C.slate };
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return { label: "Sem data", color: C.slate };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(target);
  t.setHours(0, 0, 0, 0);
  const diff = Math.round((t.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d atraso`, color: C.danger };
  if (diff === 0) return { label: "Hoje", color: C.red };
  if (diff <= 3) return { label: `${diff}d`, color: C.warn };
  return { label: `${diff}d`, color: C.ok };
}

export default function OportunidadesPipelineV8() {
  const [opps, setOpps] = useState<OpportunityLookup[]>([]);
  const [users, setUsers] = useState<UserLookup[]>([]);
  const [activeOppId, setActiveOppId] = useState("");
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [context, setContext] = useState<TreatmentContext>({ activeCredit: 0, simulations: [] });
  const [contextLoading, setContextLoading] = useState(false);
  const [nextFollowUpLocal, setNextFollowUpLocal] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const currentUserId = useRef<string | null>(null);

  const userMap = useMemo(
    () => new Map(users.map((u) => [u.auth_user_id, u])),
    [users],
  );

  const activeOpp = useMemo(
    () => opps.find((op) => op.id === activeOppId) || null,
    [opps, activeOppId],
  );

  async function loadLookups() {
    const auth = await supabase.auth.getUser();
    currentUserId.current = auth.data.user?.id || null;
    const [opRes, userRes] = await Promise.all([
      supabase
        .from("opportunities")
        .select(
          "id,lead_id,vendedor_id,segmento,estagio,valor_credito,created_at,last_follow_up_at,next_follow_up_at,qualification_score,qualification_status,qualification_ai_analysis,leads:lead_id(id,nome,telefone,created_at)",
        )
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("users")
        .select("auth_user_id,nome,phone,telefone")
        .eq("is_active", true),
    ]);
    if (!opRes.error) setOpps((opRes.data || []) as unknown as OpportunityLookup[]);
    if (!userRes.error) setUsers((userRes.data || []) as UserLookup[]);
  }

  useEffect(() => {
    loadLookups();
  }, []);

  async function loadTreatmentContext(op: OpportunityLookup) {
    setContextLoading(true);
    setNextFollowUpLocal(toLocalInput(op.next_follow_up_at));
    try {
      const [simRes, vendasRes] = await Promise.all([
        supabase
          .from("sim_simulations")
          .select(
            "id,code,admin_id,lead_id,grupo,segmento,credito,created_at,adm_tax_pct,fr_tax_pct,parcela_contemplacao,parcela_ate_1_ou_2,parcela_demais,lance_proprio_valor,novo_credito,parcela_escolhida,novo_prazo,antecip_parcelas",
          )
          .eq("lead_id", op.lead_id)
          .gte("created_at", op.created_at)
          .order("created_at", { ascending: false }),
        supabase
          .from("vendas")
          .select("id,lead_id,cliente_lead_id,valor_venda,cancelada_em")
          .or(`lead_id.eq.${op.lead_id},cliente_lead_id.eq.${op.lead_id}`),
      ]);

      const simulations = ((simRes.data || []) as SavedSimulation[]).slice(0, 50);
      const adminIds = Array.from(
        new Set(simulations.map((s) => s.admin_id).filter(Boolean) as string[]),
      );
      let adminMap = new Map<string, string>();
      if (adminIds.length) {
        const adminRes = await supabase.from("sim_admins").select("id,name").in("id", adminIds);
        adminMap = new Map((adminRes.data || []).map((a: any) => [a.id, a.name]));
      }
      const enriched = simulations.map((s) => ({
        ...s,
        admin_name: s.admin_id ? adminMap.get(s.admin_id) || "Consórcio" : "Consórcio",
      }));

      let activeCredit = 0;
      const vendas = (vendasRes.data || []).filter((v: any) => !v.cancelada_em);
      const vendaIds = vendas.map((v: any) => v.id);
      if (vendaIds.length) {
        const carteiraRes = await supabase
          .from("carteira_itens")
          .select("venda_id,status")
          .in("venda_id", vendaIds);
        const activeVendaIds = new Set(
          (carteiraRes.data || [])
            .filter((item: any) => normalizeText(item.status) === "em_carteira")
            .map((item: any) => item.venda_id),
        );
        activeCredit = vendas.reduce(
          (sum: number, venda: any) =>
            sum + (activeVendaIds.has(venda.id) ? Number(venda.valor_venda || 0) : 0),
          0,
        );
      }

      setContext({ activeCredit, simulations: enriched });
    } finally {
      setContextLoading(false);
    }
  }

  useEffect(() => {
    if (activeOpp) loadTreatmentContext(activeOpp);
  }, [activeOppId]);

  function resolveOppFromCard(card: HTMLElement) {
    const leadName = normalizeText(card.querySelector("strong")?.textContent);
    const cardText = normalizeText(card.textContent);
    const candidates = opps.filter((op) => normalizeText(op.leads?.nome) === leadName);
    return (
      candidates.find((op) => {
        const segmentOk = !op.segmento || cardText.includes(normalizeText(op.segmento));
        const seller = userMap.get(op.vendedor_id)?.nome;
        const sellerOk = !seller || cardText.includes(normalizeText(seller));
        return segmentOk && sellerOk;
      }) || candidates[0] || null
    );
  }

  function patchCardFollowUps() {
    const cards = Array.from(document.querySelectorAll('[draggable="true"]')) as HTMLElement[];
    for (const card of cards) {
      const op = resolveOppFromCard(card);
      if (!op) continue;
      const line = Array.from(card.querySelectorAll("div")).find((node) => {
        const text = String(node.textContent || "");
        return text.includes("Follow Up:") && text.includes("Dias:");
      }) as HTMLElement | undefined;
      if (!line) continue;
      const badge = followUpBadge(op.next_follow_up_at);
      const signature = `${op.next_follow_up_at || "none"}|${badge.label}`;
      if (line.dataset.crmFollowUpSignature === signature) continue;
      line.dataset.crmFollowUpSignature = signature;
      line.innerHTML = "";
      Object.assign(line.style, {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        flexWrap: "wrap",
        fontSize: "12px",
      });
      const date = document.createElement("span");
      date.textContent = `Follow Up: ${shortDate(op.next_follow_up_at)}`;
      const divider = document.createElement("span");
      divider.textContent = "|";
      divider.style.opacity = ".35";
      const days = document.createElement("span");
      days.textContent = "Dias:";
      const pill = document.createElement("span");
      pill.textContent = badge.label;
      Object.assign(pill.style, {
        borderRadius: "999px",
        padding: "3px 7px",
        fontSize: "11px",
        fontWeight: "800",
        background: `${badge.color}18`,
        color: badge.color,
      });
      line.append(date, divider, days, pill);
    }
  }

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button") as HTMLButtonElement | null;
      if (!button) return;
      const text = normalizeText(button.textContent);
      if (text === "tratar") {
        const card = button.closest('[draggable="true"]') as HTMLElement | null;
        const op = card ? resolveOppFromCard(card) : null;
        if (op) setActiveOppId(op.id);
      }
      if (text === "salvar e analisar") {
        window.setTimeout(async () => {
          await loadLookups();
        }, 2500);
        window.setTimeout(async () => {
          await loadLookups();
          if (activeOppId) {
            const fresh = opps.find((op) => op.id === activeOppId);
            if (fresh) loadTreatmentContext(fresh);
          }
        }, 6000);
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [opps, userMap, activeOppId]);

  useEffect(() => {
    const enhance = () => {
      patchCardFollowUps();
      const title = Array.from(document.querySelectorAll("h2")).find((node) =>
        normalizeText(node.textContent).startsWith("tratar oportunidade"),
      ) as HTMLElement | undefined;
      if (!title) {
        if (portalHost && !document.body.contains(portalHost)) setPortalHost(null);
        return;
      }
      const header = title.parentElement;
      const modal = header?.parentElement as HTMLElement | null;
      if (!header || !modal) return;

      if (!activeOppId) {
        const leadName = String(title.textContent || "").split("•").slice(1).join("•").trim();
        const matches = opps.filter((op) => normalizeText(op.leads?.nome) === normalizeText(leadName));
        if (matches.length === 1) setActiveOppId(matches[0].id);
      }

      const h3s = Array.from(modal.querySelectorAll("h3"));
      for (const h3 of h3s) {
        const text = normalizeText(h3.textContent);
        if (text === "proposta e follow-up" || text === "fechamento e documentacao") {
          const section = h3.parentElement as HTMLElement | null;
          if (section) section.style.display = "none";
        }
      }

      const labels = Array.from(modal.querySelectorAll("label"));
      for (const label of labels) {
        const text = normalizeText(label.textContent);
        if (text === "score / temperatura" || text === "previsao de fechamento") {
          (label as HTMLElement).style.display = "none";
          const field = label.nextElementSibling as HTMLElement | null;
          if (field) field.style.display = "none";
        }
      }

      const qualificationRow = modal.querySelector(
        '[data-crm-qualification-action="true"]',
      ) as HTMLElement | null;
      if (!qualificationRow) return;

      let host = modal.querySelector('[data-crm-treatment-v8="true"]') as HTMLElement | null;
      if (!host) {
        host = document.createElement("div");
        host.dataset.crmTreatmentV8 = "true";
        qualificationRow.insertAdjacentElement("afterend", host);
      }
      if (host !== portalHost) setPortalHost(host);
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [opps, userMap, activeOppId, portalHost]);

  async function refreshUnderlyingBoard() {
    await loadLookups();
    const updateButton = Array.from(document.querySelectorAll("button")).find(
      (button) => normalizeText(button.textContent) === "atualizar",
    ) as HTMLButtonElement | undefined;
    updateButton?.click();
    window.setTimeout(patchCardFollowUps, 500);
  }

  async function registerFollowUp() {
    if (!activeOpp) return;
    if (!nextFollowUpLocal) return alert("Informe a data e hora do próximo follow-up.");
    const next = new Date(nextFollowUpLocal);
    if (Number.isNaN(next.getTime())) return alert("Informe uma data válida para o próximo follow-up.");
    if (next.getTime() <= Date.now()) return alert("O próximo follow-up deve ser agendado para uma data futura.");

    setFollowUpSaving(true);
    try {
      const now = new Date().toISOString();
      const nextIso = next.toISOString();
      const { error } = await supabase
        .from("opportunities")
        .update({
          last_follow_up_at: now,
          next_follow_up_at: nextIso,
          expected_close_at: nextIso.slice(0, 10),
          updated_at: now,
        })
        .eq("id", activeOpp.id);
      if (error) throw error;

      const detail = followUpNote.trim();
      await supabase.from("opportunity_notes").insert({
        opportunity_id: activeOpp.id,
        lead_id: activeOpp.lead_id,
        user_id: currentUserId.current,
        kind: "follow_up",
        note: `Follow-up realizado. Próximo follow-up: ${dateTime(nextIso)}.${detail ? ` ${detail}` : ""}`,
      });

      await supabase
        .from("agenda_eventos")
        .update({
          completed_at: now,
          completion_notes: detail || "Follow-up realizado pela tela de Oportunidades.",
        })
        .eq("opportunity_id", activeOpp.id)
        .eq("tipo", "contato")
        .is("completed_at", null)
        .lte("inicio_at", now);

      const end = new Date(next.getTime() + 30 * 60000).toISOString();
      const agenda = await supabase.from("agenda_eventos").insert({
        tipo: "contato",
        titulo: `Follow-up • ${activeOpp.leads?.nome || "Lead"}`,
        lead_id: activeOpp.lead_id,
        user_id: activeOpp.vendedor_id,
        inicio_at: nextIso,
        fim_at: end,
        origem: "manual",
        opportunity_id: activeOpp.id,
        descricao: detail || "Próximo follow-up da oportunidade.",
      } as any);

      setOpps((current) =>
        current.map((op) =>
          op.id === activeOpp.id
            ? { ...op, last_follow_up_at: now, next_follow_up_at: nextIso }
            : op,
        ),
      );
      setFollowUpNote("");
      await refreshUnderlyingBoard();
      if (agenda.error) {
        alert(`Follow-up registrado, mas não foi possível criar o compromisso na Agenda: ${agenda.error.message}`);
      } else {
        alert("Follow-up registrado e próximo contato criado na Agenda.");
      }
    } catch (error: any) {
      alert(error?.message || "Não foi possível registrar o follow-up.");
    } finally {
      setFollowUpSaving(false);
    }
  }

  async function copySummary(sim: SavedSimulation) {
    const seller = activeOpp ? userMap.get(activeOpp.vendedor_id) : undefined;
    const sellerPhone = seller?.phone || seller?.telefone || "";
    try {
      await navigator.clipboard.writeText(buildSimulationSummary(sim, sellerPhone));
      alert("Resumo da simulação copiado!");
    } catch {
      alert("Não foi possível copiar o resumo.");
    }
  }

  return (
    <>
      <OportunidadesPipelineV7 />
      {portalHost && activeOpp &&
        createPortal(
          <TreatmentEnhancement
            opportunity={activeOpp}
            context={context}
            loading={contextLoading}
            nextFollowUpLocal={nextFollowUpLocal}
            setNextFollowUpLocal={setNextFollowUpLocal}
            followUpNote={followUpNote}
            setFollowUpNote={setFollowUpNote}
            saving={followUpSaving}
            onRegisterFollowUp={registerFollowUp}
            onCopySummary={copySummary}
          />,
          portalHost,
        )}
    </>
  );
}

function TreatmentEnhancement(props: {
  opportunity: OpportunityLookup;
  context: TreatmentContext;
  loading: boolean;
  nextFollowUpLocal: string;
  setNextFollowUpLocal: (value: string) => void;
  followUpNote: string;
  setFollowUpNote: (value: string) => void;
  saving: boolean;
  onRegisterFollowUp: () => void;
  onCopySummary: (sim: SavedSimulation) => void;
}) {
  const {
    opportunity,
    context,
    loading,
    nextFollowUpLocal,
    setNextFollowUpLocal,
    followUpNote,
    setFollowUpNote,
    saving,
    onRegisterFollowUp,
    onCopySummary,
  } = props;
  const ai = opportunity.qualification_ai_analysis;
  const status = normalizeText(opportunity.qualification_status);
  const statusColor = status === "quente" ? C.red : status === "morno" ? C.warn : C.navy;

  return (
    <div style={enhancementWrap}>
      <div style={contextBar}>
        <span><b>Oportunidade criada há {daysSince(opportunity.created_at)} dias</b></span>
        <span style={contextDivider}>|</span>
        <span>Lead cadastrado desde <b>{shortDate(opportunity.leads?.created_at)}</b></span>
        <span style={contextDivider}>|</span>
        <span>Crédito Ativo: <b>{loading ? "Carregando..." : money(context.activeCredit)}</b></span>
      </div>

      {ai && (
        <section style={aiStrip}>
          <div style={aiStripHeader}>
            <div>
              <div style={miniEyebrow}>Direção da IA</div>
              <strong style={{ color: C.navy }}>Diagnóstico comercial</strong>
            </div>
            <span style={{ ...scorePill, color: statusColor, borderColor: `${statusColor}35`, background: `${statusColor}12` }}>
              {opportunity.qualification_score ?? 0}/25 • {opportunity.qualification_status || "Frio"}
            </span>
          </div>
          <div style={aiStripGrid}>
            <div><small style={miniLabel}>Próximo passo</small><p style={miniText}>{ai.proximo_passo || "—"}</p></div>
            <div><small style={miniLabel}>Abordagem recomendada</small><p style={miniText}>{ai.abordagem_recomendada || "—"}</p></div>
          </div>
        </section>
      )}

      <div style={twoColumns}>
        <section style={sectionCard}>
          <div style={sectionHeader}>
            <div>
              <div style={miniEyebrow}>Andamento comercial</div>
              <h3 style={sectionTitle}>Follow Up</h3>
            </div>
            <span style={lastFollowUp}>Último: {dateTime(opportunity.last_follow_up_at)}</span>
          </div>
          <label style={label}>Próximo follow-up</label>
          <input
            style={input}
            type="datetime-local"
            value={nextFollowUpLocal}
            onChange={(e) => setNextFollowUpLocal(e.target.value)}
          />
          <label style={label}>Resumo / resultado do contato (opcional)</label>
          <textarea
            style={textarea}
            value={followUpNote}
            onChange={(e) => setFollowUpNote(e.target.value)}
            placeholder="Ex.: cliente pediu nova simulação, vai validar com a esposa, pediu retorno sexta..."
          />
          <button style={primaryBtn} disabled={saving} onClick={onRegisterFollowUp}>
            {saving ? "Registrando..." : "Registrar follow-up realizado e agendar próximo"}
          </button>
        </section>

        <section style={sectionCard}>
          <div style={sectionHeader}>
            <div>
              <div style={miniEyebrow}>Simulações do período</div>
              <h3 style={sectionTitle}>Propostas</h3>
            </div>
            <span style={countPill}>{context.simulations.length}</span>
          </div>
          <p style={sectionHint}>Somente simulações salvas após a criação desta oportunidade.</p>
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Nº</th>
                  <th style={th}>Administradora</th>
                  <th style={th}>Segmento</th>
                  <th style={th}>Crédito</th>
                  <th style={th}>Adm</th>
                  <th style={th}>FR</th>
                  <th style={{ ...th, textAlign: "center" }}>Resumo</th>
                </tr>
              </thead>
              <tbody>
                {context.simulations.map((sim) => (
                  <tr key={sim.id}>
                    <td style={td}>{sim.code || "—"}</td>
                    <td style={td}>{sim.admin_name || "—"}</td>
                    <td style={td}>{sim.segmento || "—"}</td>
                    <td style={td}>{money(sim.credito)}</td>
                    <td style={td}>{pct(sim.adm_tax_pct)}</td>
                    <td style={td}>{pct(sim.fr_tax_pct)}</td>
                    <td style={{ ...td, textAlign: "center" }}>
                      <button style={copyBtn} onClick={() => onCopySummary(sim)} title="Copiar resumo da simulação" aria-label="Copiar resumo da simulação">⧉</button>
                    </td>
                  </tr>
                ))}
                {!loading && context.simulations.length === 0 && (
                  <tr><td style={emptyTd} colSpan={7}>Nenhuma simulação salva após a criação da oportunidade.</td></tr>
                )}
                {loading && (
                  <tr><td style={emptyTd} colSpan={7}>Carregando propostas...</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

const enhancementWrap: React.CSSProperties = { display: "grid", gap: 12, marginBottom: 14 };
const contextBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  padding: "10px 14px",
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid rgba(30,41,63,.09)",
  color: C.ink,
  fontSize: 12,
};
const contextDivider: React.CSSProperties = { opacity: 0.3 };
const aiStrip: React.CSSProperties = {
  border: "1px solid rgba(181,165,115,.34)",
  borderRadius: 18,
  padding: 13,
  background: "rgba(224,206,140,.10)",
};
const aiStripHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 9 };
const aiStripGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const miniEyebrow: React.CSSProperties = { color: C.gold, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, fontWeight: 900 };
const miniLabel: React.CSSProperties = { color: C.slate, fontWeight: 800, fontSize: 10, textTransform: "uppercase" };
const miniText: React.CSSProperties = { margin: "3px 0 0", color: C.ink, fontSize: 12, lineHeight: 1.4 };
const scorePill: React.CSSProperties = { border: "1px solid", borderRadius: 999, padding: "6px 9px", fontWeight: 900, fontSize: 11, whiteSpace: "nowrap" };
const twoColumns: React.CSSProperties = { display: "grid", gridTemplateColumns: ".82fr 1.18fr", gap: 12 };
const sectionCard: React.CSSProperties = { border: "1px solid rgba(30,41,63,.10)", borderRadius: 18, padding: 13, background: "white", minWidth: 0 };
const sectionHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 9 };
const sectionTitle: React.CSSProperties = { margin: "2px 0 0", color: C.navy, fontSize: 16 };
const sectionHint: React.CSSProperties = { margin: "-2px 0 9px", color: C.slate, fontSize: 11 };
const lastFollowUp: React.CSSProperties = { color: C.slate, fontSize: 10, textAlign: "right" };
const label: React.CSSProperties = { display: "block", color: C.navy, fontSize: 11, fontWeight: 850, margin: "7px 0 5px" };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid rgba(30,41,63,.14)", borderRadius: 11, padding: "9px 10px", color: C.navy, outline: "none", fontFamily: "inherit" };
const textarea: React.CSSProperties = { ...input, minHeight: 60, resize: "vertical" };
const primaryBtn: React.CSSProperties = { width: "100%", marginTop: 9, border: 0, borderRadius: 11, padding: "10px 12px", background: `linear-gradient(135deg, ${C.red}, ${C.navy})`, color: "white", fontWeight: 900, cursor: "pointer", fontSize: 11 };
const countPill: React.CSSProperties = { minWidth: 27, height: 27, display: "grid", placeItems: "center", borderRadius: 999, background: `${C.navy}0f`, color: C.navy, fontWeight: 900, fontSize: 11 };
const tableWrap: React.CSSProperties = { overflowX: "auto", border: "1px solid rgba(30,41,63,.08)", borderRadius: 12 };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 650, fontSize: 10 };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 7px", color: C.slate, background: "#f8fafc", borderBottom: "1px solid rgba(30,41,63,.08)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 7px", color: C.ink, borderBottom: "1px solid rgba(30,41,63,.06)", whiteSpace: "nowrap" };
const emptyTd: React.CSSProperties = { ...td, textAlign: "center", color: C.slate, padding: 16 };
const copyBtn: React.CSSProperties = { border: "1px solid rgba(30,41,63,.13)", background: "white", color: C.navy, borderRadius: 8, width: 28, height: 28, cursor: "pointer", fontWeight: 900 };
