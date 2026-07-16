// src/pages/OportunidadesPipelineV7.tsx
import React, { useEffect, useMemo, useState } from "react";
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

type OppRow = {
  id: string;
  lead_id: string;
  vendedor_id: string;
  owner_id?: string | null;
  segmento?: string | null;
  estagio?: string | null;
  valor_credito?: number | null;
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

const onlyDigits = (v?: string | null) => String(v || "").replace(/\D/g, "");
const normalizeText = (v?: string | null) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
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

  async function loadData() {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const authId = auth?.user?.id;
    if (!authId) { setLoading(false); return; }
    const { data: profile } = await supabase.from("users").select("id,auth_user_id,nome,email,role,user_role,unit_id,hierarchy_level").eq("auth_user_id", authId).maybeSingle();
    if (!profile) { setLoading(false); return; }
    let unitType = "";
    if (profile.unit_id) { const { data: unit } = await supabase.from("units").select("tipo").eq("id", profile.unit_id).maybeSingle(); unitType = normalizeText(unit?.tipo); }
    const matrix = normalizeText(profile.hierarchy_level) === "matriz" || (normalizeText(profile.role || profile.user_role) === "admin" && unitType === "matriz");
    const branch = !matrix && normalizeText(profile.hierarchy_level) === "gestor_filial";
    let usersQ = supabase.from("users").select("id,auth_user_id,nome,email,role,user_role,unit_id,hierarchy_level").eq("is_active", true).order("nome", { ascending: true });
    if (branch && profile.unit_id) usersQ = usersQ.eq("unit_id", profile.unit_id);
    if (!matrix && !branch) usersQ = usersQ.eq("id", profile.id);
    const u = await usersQ;
    const scopedUsers = (u.data || [profile]) as UserRow[];
    const authIds = Array.from(new Set(scopedUsers.map((user) => user.auth_user_id).filter(Boolean)));
    let oppsQ = supabase.from("opportunities").select("id,lead_id,vendedor_id,owner_id,segmento,estagio,valor_credito,leads:lead_id(id,nome,telefone,owner_id)").order("created_at", { ascending: false }).limit(500);
    if (!matrix) oppsQ = authIds.length ? oppsQ.in("vendedor_id", authIds) : oppsQ.eq("vendedor_id", "00000000-0000-0000-0000-000000000000");
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

  const userMap = useMemo(() => new Map(users.map((u) => [u.auth_user_id, u.nome])), [users]);

  const filteredOpps = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return opps.filter((o) => {
      const lead = o.leads;
      const hay = `${lead?.nome || ""} ${lead?.telefone || ""} ${o.segmento || ""} ${o.estagio || ""} ${userMap.get(o.vendedor_id) || ""}`.toLowerCase();
      return !needle || hay.includes(needle) || onlyDigits(hay).includes(onlyDigits(needle));
    });
  }, [opps, q, userMap]);

  const selectedOpp = useMemo(
    () => opps.find((o) => o.id === selectedOppId) || null,
    [opps, selectedOppId]
  );

  async function reassign() {
    if (!selectedOpp) return alert("Selecione uma oportunidade.");
    if (!selectedUserId) return alert("Selecione o novo responsável.");
    if (selectedOpp.vendedor_id === selectedUserId && selectedOpp.owner_id === selectedUserId) {
      return alert("Essa oportunidade já está com esse responsável.");
    }

    const newOwnerName = userMap.get(selectedUserId) || "novo responsável";
    const oldOwnerName = userMap.get(selectedOpp.vendedor_id) || "responsável anterior";

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
        return alert(`A oportunidade foi reatribuída, mas o lead não foi atualizado: ${leadErr.message}`);
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
    alert("Oportunidade reatribuída com sucesso. Atualize a tela para ver a coluna/listagem refletir a mudança.");
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
                <p style={sub}>Transfira uma oportunidade/lead para outro usuário ativo.</p>
              </div>
              <button style={xBtn} onClick={() => setOpen(false)}>×</button>
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
                      {(o.leads?.nome || "Lead sem nome")} • {o.segmento || "—"} • {o.estagio || "—"} • {userMap.get(o.vendedor_id) || "Sem vendedor"}
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
                    <option key={u.auth_user_id} value={u.auth_user_id}>{u.nome}</option>
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
                    <span>{selectedOpp.segmento || "—"} • {selectedOpp.estagio || "—"}</span>
                    <span>{brl(selectedOpp.valor_credito)} • Atual: {userMap.get(selectedOpp.vendedor_id) || "—"}</span>
                  </div>
                )}
              </div>
            </div>

            <div style={footer}>
              <button style={ghostBtn} onClick={() => setOpen(false)}>Cancelar</button>
              <button style={primaryBtn} disabled={saving} onClick={reassign}>
                {saving ? "Reatribuindo..." : "Confirmar reatribuição"}
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
const modal: React.CSSProperties = {
  width: "min(920px, 96vw)",
  background: "rgba(255,255,255,.97)",
  borderRadius: 28,
  padding: 20,
  boxShadow: "0 30px 90px rgba(0,0,0,.28)",
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
const title: React.CSSProperties = { margin: "2px 0", color: C.navy, fontSize: 24 };
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
