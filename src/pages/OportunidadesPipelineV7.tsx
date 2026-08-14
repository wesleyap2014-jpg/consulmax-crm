// src/pages/OportunidadesPipelineV7.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import OportunidadesPipelineV6 from "./OportunidadesPipelineV6";

type UserRow = {
  id: string;
  auth_user_id: string;
  nome: string;
  email?: string | null;
  role?: string | null;
  user_role?: string | null;
  unit_id?: string | null;
  hierarchy_level?: string | null;
};

type LeadRow = {
  id: string;
  nome: string;
  telefone?: string | null;
  owner_id?: string | null;
};

type QualificationData = {
  objetivo: string;
  valor_parcela: string;
  prazo: string;
  lance_entrada: string;
  renda_formal: string;
  decisao_contato: string;
};

type OppRow = {
  id: string;
  lead_id: string;
  vendedor_id: string;
  owner_id?: string | null;
  segmento?: string | null;
  estagio?: string | null;
  valor_credito?: number | null;
  finalidade_recurso?: string | null;
  prazo_contemplacao?: string | null;
  qualification_data?: QualificationData | null;
  qualification_score?: number | null;
  qualification_status?: string | null;
  qualified_at?: string | null;
  leads?: LeadRow | null;
};

const C = {
  red: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
  ink: "#334155",
  slate: "#64748b",
};

const EMPTY_QUALIFICATION: QualificationData = {
  objetivo: "",
  valor_parcela: "",
  prazo: "",
  lance_entrada: "",
  renda_formal: "",
  decisao_contato: "",
};

const qualificationQuestions: Array<{
  key: keyof QualificationData;
  number: number;
  title: string;
  question: string;
  helper: string;
}> = [
  {
    key: "objetivo",
    number: 1,
    title: "Objetivo",
    question:
      "O que você quer realizar com o dinheiro do consórcio? (imóvel, carro, quitar dívidas, investir, reserva...)",
    helper: "Resolve: destino do crédito, valor aproximado e prazo.",
  },
  {
    key: "valor_parcela",
    number: 2,
    title: "Valor e parcela",
    question:
      "Quanto você precisa e qual valor de parcela cabe confortavelmente no seu orçamento hoje?",
    helper: "Junta valor aproximado + parcela em uma só.",
  },
  {
    key: "prazo",
    number: 3,
    title: "Prazo",
    question: "Você tem um prazo ideal para realizar esse objetivo?",
    helper:
      "Define urgência e se cabe consórcio ou se precisa de alternativa.",
  },
  {
    key: "lance_entrada",
    number: 4,
    title: "Lance/entrada",
    question: "Tem algum valor disponível para dar de lance ou entrada?",
    helper: "Mede força financeira e velocidade de contemplação.",
  },
  {
    key: "renda_formal",
    number: 5,
    title: "Renda formal",
    question:
      "Consegue comprovar renda de forma formal (holerite, extrato, imposto de renda)?",
    helper: "Já valida acesso a linha de crédito e aprovação.",
  },
  {
    key: "decisao_contato",
    number: 6,
    title: "Decisão e contato",
    question:
      "Quem mais participa da decisão e como prefere receber a proposta: ligação, WhatsApp, vídeo ou presencial?",
    helper: "Junta decisores + canal de contato.",
  },
];

const onlyDigits = (v?: string | null) => String(v || "").replace(/\D/g, "");
const normalizeText = (v?: string | null) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
const brl = (n?: number | null) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(n || 0));

export default function OportunidadesPipelineV7() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [opps, setOpps] = useState<OppRow[]>([]);
  const [q, setQ] = useState("");
  const [selectedOppId, setSelectedOppId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [syncLeadOwner, setSyncLeadOwner] = useState(true);

  const [qualifyingOppId, setQualifyingOppId] = useState("");
  const [qualificationDraft, setQualificationDraft] =
    useState<QualificationData>(EMPTY_QUALIFICATION);
  const [qualificationSaving, setQualificationSaving] = useState(false);
  const lastTreatOppIdRef = useRef("");

  async function loadData() {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const authId = auth?.user?.id;
    if (!authId) {
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase
      .from("users")
      .select("id,auth_user_id,nome,email,role,user_role,unit_id,hierarchy_level")
      .eq("auth_user_id", authId)
      .maybeSingle();
    if (!profile) {
      setLoading(false);
      return;
    }

    let unitType = "";
    if (profile.unit_id) {
      const { data: unit } = await supabase
        .from("units")
        .select("tipo")
        .eq("id", profile.unit_id)
        .maybeSingle();
      unitType = normalizeText(unit?.tipo);
    }

    const matrix =
      normalizeText(profile.hierarchy_level) === "matriz" ||
      (normalizeText(profile.role || profile.user_role) === "admin" &&
        unitType === "matriz");
    const branch =
      !matrix && normalizeText(profile.hierarchy_level) === "gestor_filial";

    let usersQ = supabase
      .from("users")
      .select("id,auth_user_id,nome,email,role,user_role,unit_id,hierarchy_level")
      .eq("is_active", true)
      .order("nome", { ascending: true });
    if (branch && profile.unit_id) usersQ = usersQ.eq("unit_id", profile.unit_id);
    if (!matrix && !branch) usersQ = usersQ.eq("id", profile.id);

    const u = await usersQ;
    const scopedUsers = (u.data || [profile]) as UserRow[];
    const authIds = Array.from(
      new Set(scopedUsers.map((user) => user.auth_user_id).filter(Boolean)),
    );

    let oppsQ = supabase
      .from("opportunities")
      .select(
        "id,lead_id,vendedor_id,owner_id,segmento,estagio,valor_credito,finalidade_recurso,prazo_contemplacao,qualification_data,qualification_score,qualification_status,qualified_at,leads:lead_id(id,nome,telefone,owner_id)",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (!matrix)
      oppsQ = authIds.length
        ? oppsQ.in("vendedor_id", authIds)
        : oppsQ.eq("vendedor_id", "00000000-0000-0000-0000-000000000000");

    const o = await oppsQ;
    if (!u.error) setUsers(scopedUsers);
    if (!o.error) setOpps((o.data || []) as unknown as OppRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  const userMap = useMemo(
    () => new Map(users.map((u) => [u.auth_user_id, u.nome])),
    [users],
  );

  const filteredOpps = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return opps.filter((o) => {
      const lead = o.leads;
      const hay = `${lead?.nome || ""} ${lead?.telefone || ""} ${o.segmento || ""} ${o.estagio || ""} ${userMap.get(o.vendedor_id) || ""}`.toLowerCase();
      return (
        !needle ||
        hay.includes(needle) ||
        onlyDigits(hay).includes(onlyDigits(needle))
      );
    });
  }, [opps, q, userMap]);

  const selectedOpp = useMemo(
    () => opps.find((o) => o.id === selectedOppId) || null,
    [opps, selectedOppId],
  );

  const qualifyingOpp = useMemo(
    () => opps.find((o) => o.id === qualifyingOppId) || null,
    [opps, qualifyingOppId],
  );

  function openQualification(opportunityId: string) {
    const op = opps.find((item) => item.id === opportunityId);
    if (!op) {
      alert("Não consegui localizar esta oportunidade para qualificar.");
      return;
    }
    setQualificationDraft({
      ...EMPTY_QUALIFICATION,
      ...(op.qualification_data || {}),
    });
    setQualifyingOppId(opportunityId);
  }

  useEffect(() => {
    const handleTreatClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button || normalizeText(button.textContent) !== "tratar") return;

      const card = button.closest('[draggable="true"]') as HTMLElement | null;
      if (!card) return;

      const leadName = normalizeText(card.querySelector("strong")?.textContent);
      const cardText = normalizeText(card.textContent);
      const candidates = opps.filter(
        (op) => normalizeText(op.leads?.nome) === leadName,
      );

      const matched =
        candidates.find((op) => {
          const segmentOk =
            !op.segmento || cardText.includes(normalizeText(op.segmento));
          const vendorName = userMap.get(op.vendedor_id);
          const vendorOk =
            !vendorName || cardText.includes(normalizeText(vendorName));
          return segmentOk && vendorOk;
        }) || candidates[0];

      if (matched) lastTreatOppIdRef.current = matched.id;
    };

    window.addEventListener("click", handleTreatClick, true);
    return () => window.removeEventListener("click", handleTreatClick, true);
  }, [opps, userMap]);

  useEffect(() => {
    const enhanceTreatModal = () => {
      const titles = Array.from(document.querySelectorAll("h2"));
      const treatTitle = titles.find((node) =>
        normalizeText(node.textContent).startsWith("tratar oportunidade"),
      ) as HTMLElement | undefined;
      if (!treatTitle) return;

      const modalHeaderEl = treatTitle.parentElement;
      const modalCardEl = modalHeaderEl?.parentElement as HTMLElement | null;
      if (!modalHeaderEl || !modalCardEl) return;

      const oldQualificationTitle = Array.from(
        modalCardEl.querySelectorAll("h3"),
      ).find(
        (node) => normalizeText(node.textContent) === "qualificacao e diagnostico",
      ) as HTMLElement | undefined;
      if (oldQualificationTitle?.parentElement) {
        oldQualificationTitle.parentElement.style.display = "none";
      }

      let actionRow = modalCardEl.querySelector(
        '[data-crm-qualification-action="true"]',
      ) as HTMLDivElement | null;

      if (!actionRow) {
        actionRow = document.createElement("div");
        actionRow.dataset.crmQualificationAction = "true";
        Object.assign(actionRow.style, {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "14px",
          padding: "12px 14px",
          border: "1px solid rgba(181,165,115,.35)",
          borderRadius: "16px",
          background: "rgba(224,206,140,.12)",
        });

        const text = document.createElement("div");
        text.textContent = "Roteiro de qualificação comercial";
        Object.assign(text.style, {
          color: C.navy,
          fontSize: "13px",
          fontWeight: "800",
        });

        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Qualificar";
        button.dataset.crmQualificationButton = "true";
        Object.assign(button.style, {
          border: "0",
          borderRadius: "12px",
          padding: "10px 16px",
          background: C.navy,
          color: "white",
          fontWeight: "900",
          cursor: "pointer",
        });

        actionRow.append(text, button);
        modalHeaderEl.insertAdjacentElement("afterend", actionRow);
      }

      const button = actionRow.querySelector(
        '[data-crm-qualification-button="true"]',
      ) as HTMLButtonElement | null;
      if (!button) return;

      button.onclick = () => {
        let opportunityId = lastTreatOppIdRef.current;
        if (!opportunityId) {
          const titleText = treatTitle.textContent || "";
          const leadName = titleText.split("•").slice(1).join("•").trim();
          const matches = opps.filter(
            (op) => normalizeText(op.leads?.nome) === normalizeText(leadName),
          );
          if (matches.length === 1) opportunityId = matches[0].id;
        }

        if (!opportunityId) {
          alert("Não consegui identificar a oportunidade selecionada.");
          return;
        }
        openQualification(opportunityId);
      };
    };

    enhanceTreatModal();
    const observer = new MutationObserver(enhanceTreatModal);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [opps]);

  async function saveQualification() {
    if (!qualifyingOpp) return;

    const unanswered = qualificationQuestions.filter(
      (item) => !qualificationDraft[item.key].trim(),
    );
    if (unanswered.length) {
      alert(
        `Responda as ${unanswered.length} pergunta(s) restante(s) antes de salvar a qualificação.`,
      );
      return;
    }

    setQualificationSaving(true);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("opportunities")
      .update({
        qualification_data: qualificationDraft,
        qualified_at: now,
        finalidade_recurso: qualificationDraft.objetivo,
        prazo_contemplacao: qualificationDraft.prazo,
        updated_at: now,
      })
      .eq("id", qualifyingOpp.id)
      .select(
        "id,lead_id,vendedor_id,owner_id,segmento,estagio,valor_credito,finalidade_recurso,prazo_contemplacao,qualification_data,qualification_score,qualification_status,qualified_at,leads:lead_id(id,nome,telefone,owner_id)",
      )
      .single();

    if (error) {
      setQualificationSaving(false);
      alert(error.message);
      return;
    }

    await supabase.from("opportunity_notes").insert({
      opportunity_id: qualifyingOpp.id,
      lead_id: qualifyingOpp.lead_id,
      user_id: qualifyingOpp.vendedor_id,
      kind: "qualification",
      note: "Qualificação comercial concluída pelo roteiro de 6 perguntas.",
    });

    setOpps((current) =>
      current.map((item) =>
        item.id === qualifyingOpp.id ? (data as unknown as OppRow) : item,
      ),
    );
    setQualificationSaving(false);
    setQualifyingOppId("");
  }

  async function reassign() {
    if (!selectedOpp) return alert("Selecione uma oportunidade.");
    if (!selectedUserId) return alert("Selecione o novo responsável.");
    if (
      selectedOpp.vendedor_id === selectedUserId &&
      selectedOpp.owner_id === selectedUserId
    ) {
      return alert("Essa oportunidade já está com esse responsável.");
    }

    const newOwnerName = userMap.get(selectedUserId) || "novo responsável";
    const oldOwnerName =
      userMap.get(selectedOpp.vendedor_id) || "responsável anterior";

    setSaving(true);

    const { error: oppErr } = await supabase
      .from("opportunities")
      .update({
        vendedor_id: selectedUserId,
        owner_id: selectedUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedOpp.id);

    if (oppErr) {
      setSaving(false);
      return alert(oppErr.message);
    }

    if (syncLeadOwner) {
      const { error: leadErr } = await supabase
        .from("leads")
        .update({ owner_id: selectedUserId, updated_at: new Date().toISOString() })
        .eq("id", selectedOpp.lead_id);

      if (leadErr) {
        setSaving(false);
        return alert(
          `A oportunidade foi reatribuída, mas o lead não foi atualizado: ${leadErr.message}`,
        );
      }
    }

    await supabase.from("opportunity_notes").insert({
      opportunity_id: selectedOpp.id,
      lead_id: selectedOpp.lead_id,
      user_id: selectedUserId,
      kind: "reassign",
      note: `Oportunidade reatribuída de ${oldOwnerName} para ${newOwnerName}.`,
    });

    setSaving(false);
    setSelectedOppId("");
    setSelectedUserId("");
    await loadData();
    alert(
      "Oportunidade reatribuída com sucesso. Atualize a tela para ver a coluna/listagem refletir a mudança.",
    );
  }

  return (
    <>
      <OportunidadesPipelineV6 />

      <button
        type="button"
        onClick={() => setOpen(true)}
        style={floatingBtn}
        title="Reatribuir oportunidade"
      >
        Reatribuir
      </button>

      {open && (
        <div style={backdrop} onMouseDown={() => setOpen(false)}>
          <div style={modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <div>
                <div style={eyebrow}>Gestão comercial</div>
                <h2 style={title}>Reatribuir oportunidade</h2>
                <p style={sub}>
                  Transfira uma oportunidade/lead para outro usuário ativo.
                </p>
              </div>
              <button style={xBtn} onClick={() => setOpen(false)}>
                ×
              </button>
            </div>

            <div style={grid}>
              <div style={box}>
                <label style={label}>Buscar lead/oportunidade</label>
                <input
                  style={input}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Nome, telefone, segmento, estágio ou vendedor"
                />

                <label style={label}>Oportunidade</label>
                <select
                  style={{ ...input, minHeight: 44 }}
                  value={selectedOppId}
                  onChange={(e) => setSelectedOppId(e.target.value)}
                >
                  <option value="">Selecione a oportunidade</option>
                  {filteredOpps.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.leads?.nome || "Lead sem nome"} • {o.segmento || "—"} •{" "}
                      {o.estagio || "—"} • {userMap.get(o.vendedor_id) || "Sem vendedor"}
                    </option>
                  ))}
                </select>

                {loading && <div style={hint}>Carregando dados...</div>}
              </div>

              <div style={box}>
                <label style={label}>Novo responsável</label>
                <select
                  style={input}
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  <option value="">Selecione o usuário</option>
                  {users.map((u) => (
                    <option key={u.auth_user_id} value={u.auth_user_id}>
                      {u.nome}
                    </option>
                  ))}
                </select>

                <label style={checkLine}>
                  <input
                    type="checkbox"
                    checked={syncLeadOwner}
                    onChange={(e) => setSyncLeadOwner(e.target.checked)}
                  />
                  Atualizar também o responsável do lead
                </label>

                {selectedOpp && (
                  <div style={preview}>
                    <strong>{selectedOpp.leads?.nome || "Lead sem nome"}</strong>
                    <span>
                      {selectedOpp.segmento || "—"} • {selectedOpp.estagio || "—"}
                    </span>
                    <span>
                      {brl(selectedOpp.valor_credito)} • Atual:{" "}
                      {userMap.get(selectedOpp.vendedor_id) || "—"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div style={footer}>
              <button style={ghostBtn} onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button style={primaryBtn} disabled={saving} onClick={reassign}>
                {saving ? "Reatribuindo..." : "Confirmar reatribuição"}
              </button>
            </div>
          </div>
        </div>
      )}

      {qualifyingOpp && (
        <div
          style={qualificationBackdrop}
          onMouseDown={() => setQualifyingOppId("")}
        >
          <div
            style={qualificationModal}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={modalHeader}>
              <div>
                <div style={eyebrow}>Qualificação comercial</div>
                <h2 style={title}>
                  Qualificar • {qualifyingOpp.leads?.nome || "Lead"}
                </h2>
                <p style={qualificationOpening}>
                  Vou te fazer umas perguntas rápidas para entender qual consórcio
                  faz sentido para você. Prometo ser breve.
                </p>
              </div>
              <button style={xBtn} onClick={() => setQualifyingOppId("")}>
                ×
              </button>
            </div>

            <div style={qualificationGrid}>
              {qualificationQuestions.map((item) => (
                <section key={item.key} style={qualificationCard}>
                  <div style={qualificationNumber}>{item.number}</div>
                  <div>
                    <h3 style={qualificationTitle}>{item.title}</h3>
                    <p style={qualificationQuestion}>{item.question}</p>
                    <textarea
                      style={qualificationTextarea}
                      value={qualificationDraft[item.key]}
                      onChange={(e) =>
                        setQualificationDraft((current) => ({
                          ...current,
                          [item.key]: e.target.value,
                        }))
                      }
                      placeholder="Registre a resposta do cliente..."
                    />
                    <small style={qualificationHelper}>{item.helper}</small>
                  </div>
                </section>
              ))}
            </div>

            <div style={footer}>
              <button style={ghostBtn} onClick={() => setQualifyingOppId("")}>
                Cancelar
              </button>
              <button
                style={primaryBtn}
                disabled={qualificationSaving}
                onClick={saveQualification}
              >
                {qualificationSaving
                  ? "Salvando..."
                  : "Salvar qualificação"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const floatingBtn: React.CSSProperties = {
  position: "fixed",
  right: 22,
  bottom: 22,
  zIndex: 40,
  border: 0,
  borderRadius: 999,
  padding: "13px 18px",
  background: `linear-gradient(135deg, ${C.navy}, ${C.red})`,
  color: "white",
  fontWeight: 900,
  boxShadow: "0 18px 50px rgba(30,41,63,.28)",
  cursor: "pointer",
};
const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 70,
  background: "rgba(15,23,42,.50)",
  backdropFilter: "blur(8px)",
  display: "grid",
  placeItems: "center",
  padding: 18,
};
const qualificationBackdrop: React.CSSProperties = {
  ...backdrop,
  zIndex: 90,
};
const modal: React.CSSProperties = {
  width: "min(920px, 96vw)",
  background: "rgba(255,255,255,.97)",
  borderRadius: 28,
  padding: 20,
  boxShadow: "0 30px 90px rgba(0,0,0,.28)",
};
const qualificationModal: React.CSSProperties = {
  ...modal,
  width: "min(1080px, 96vw)",
  maxHeight: "90vh",
  overflowY: "auto",
};
const modalHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  marginBottom: 14,
};
const eyebrow: React.CSSProperties = {
  color: C.gold,
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 1.2,
  textTransform: "uppercase",
};
const title: React.CSSProperties = {
  margin: "2px 0",
  color: C.navy,
  fontSize: 24,
};
const sub: React.CSSProperties = { margin: 0, color: C.slate };
const xBtn: React.CSSProperties = {
  border: 0,
  background: "#f1f5f9",
  color: C.navy,
  borderRadius: 12,
  width: 38,
  height: 38,
  fontSize: 24,
  cursor: "pointer",
};
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.15fr .85fr",
  gap: 14,
};
const box: React.CSSProperties = {
  border: "1px solid rgba(30,41,63,.10)",
  borderRadius: 20,
  padding: 14,
  background: "#fff",
};
const label: React.CSSProperties = {
  display: "block",
  color: C.navy,
  fontWeight: 850,
  margin: "0 0 6px",
  fontSize: 13,
};
const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(30,41,63,.14)",
  borderRadius: 14,
  padding: "10px 12px",
  marginBottom: 12,
  outline: "none",
  color: C.navy,
  boxSizing: "border-box",
};
const checkLine: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: C.ink,
  fontSize: 13,
  fontWeight: 700,
};
const preview: React.CSSProperties = {
  marginTop: 14,
  borderRadius: 16,
  padding: 12,
  background: "#f8fafc",
  color: C.ink,
  display: "grid",
  gap: 3,
  fontSize: 13,
};
const hint: React.CSSProperties = { color: C.slate, fontSize: 12 };
const footer: React.CSSProperties = {
  marginTop: 16,
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  flexWrap: "wrap",
};
const ghostBtn: React.CSSProperties = {
  border: "1px solid rgba(30,41,63,.16)",
  borderRadius: 14,
  padding: "10px 14px",
  background: "white",
  color: C.navy,
  fontWeight: 850,
  cursor: "pointer",
};
const primaryBtn: React.CSSProperties = {
  border: 0,
  borderRadius: 14,
  padding: "11px 15px",
  background: `linear-gradient(135deg, ${C.red}, ${C.navy})`,
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};
const qualificationOpening: React.CSSProperties = {
  margin: "7px 0 0",
  color: C.ink,
  lineHeight: 1.45,
  maxWidth: 760,
};
const qualificationGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};
const qualificationCard: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "38px minmax(0, 1fr)",
  gap: 12,
  padding: 14,
  border: "1px solid rgba(30,41,63,.10)",
  borderRadius: 20,
  background: "white",
};
const qualificationNumber: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  background: C.navy,
  color: "white",
  fontWeight: 900,
};
const qualificationTitle: React.CSSProperties = {
  margin: 0,
  color: C.navy,
  fontSize: 15,
};
const qualificationQuestion: React.CSSProperties = {
  margin: "5px 0 9px",
  color: C.ink,
  fontSize: 13,
  lineHeight: 1.45,
};
const qualificationTextarea: React.CSSProperties = {
  width: "100%",
  minHeight: 76,
  resize: "vertical",
  border: "1px solid rgba(30,41,63,.14)",
  borderRadius: 14,
  padding: "10px 12px",
  outline: "none",
  color: C.navy,
  boxSizing: "border-box",
  fontFamily: "inherit",
};
const qualificationHelper: React.CSSProperties = {
  display: "block",
  marginTop: 7,
  color: C.slate,
  lineHeight: 1.35,
};
