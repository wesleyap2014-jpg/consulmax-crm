// src/pages/Oportunidades.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Role = "admin" | "vendedor" | "operacoes" | "viewer";

type Lead = {
  id: string;
  nome: string;
  origem?: string | null;
  owner_id?: string | null;
};

type Vendedor = {
  auth_user_id: string; // id do auth.users
  nome: string;
  role: Role;
};

type Estagio = "Novo" | "Qualificação" | "Proposta" | "Negociação" | "Convertido" | "Perdido";

type Oportunidade = {
  id: string;
  lead_id: string;
  vendedor_id: string;
  segmento: string;
  valor_credito: number;
  observacao?: string | null;
  score: number;
  estagio: Estagio;
  created_at: string;
};

const SEGMENTOS = [
  "Automóvel",
  "Imóvel",
  "Motocicleta",
  "Serviços",
  "Pesados",
  "Imóvel Estendido",
] as const;

const ESTAGIOS: Estagio[] = ["Novo", "Qualificação", "Proposta", "Negociação", "Convertido", "Perdido"];

const BRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

export default function Oportunidades() {
  const [me, setMe] = useState<{ uid: string; role: Role }>({ uid: "", role: "viewer" });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [list, setList] = useState<Oportunidade[]>([]);
  const [loading, setLoading] = useState(false);

  // filtros (admin)
  const [filtroVendedor, setFiltroVendedor] = useState<string>("");

  // form
  const [leadId, setLeadId] = useState("");
  const [vendId, setVendId] = useState("");
  const [segmento, setSegmento] = useState<(typeof SEGMENTOS)[number]>("Automóvel");
  const [valor, setValor] = useState<string>("");
  const [obs, setObs] = useState("");
  const [score, setScore] = useState<number>(3);
  const [estagio, setEstagio] = useState<Estagio>("Novo");

  // carregar quem sou eu + role (do token)
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id || "";
      const roleFromToken =
        ((auth.user?.app_metadata as any)?.role ||
          (auth.user?.user_metadata as any)?.role ||
          "viewer") as Role;

      setMe({ uid, role: roleFromToken });
    })();
  }, []);

  // carregar leads acessíveis (RLS já filtra)
  async function loadLeads() {
    const { data, error } = await supabase
      .from("leads")
      .select("id, nome, origem, owner_id")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      alert("Erro ao carregar leads");
      return;
    }
    setLeads(data || []);
  }

  // vendedores: buscamos na tabela de perfis (users) e usamos o auth_user_id
  async function loadVendedores() {
    const { data, error } = await supabase
      .from("users")
      .select("auth_user_id, nome, role")
      .in("role", ["admin", "vendedor", "operacoes"]);
    if (error) {
      console.error(error);
      alert("Erro ao carregar vendedores");
      return;
    }
    setVendedores((data || []) as any);
  }

  async function loadOpps() {
    const { data, error } = await supabase
      .from("opportunities")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      alert("Erro ao carregar oportunidades");
      return;
    }
    setList((data || []) as any);
  }

  useEffect(() => {
    if (!me.uid) return;
    loadLeads();
    loadVendedores();
    loadOpps();
  }, [me.uid]);

  const listFiltrada = useMemo(() => {
    if (me.role !== "admin" || !filtroVendedor) return list;
    return list.filter((o) => o.vendedor_id === filtroVendedor);
  }, [list, filtroVendedor, me.role]);

  async function criar() {
    const v = Number(String(valor).replace(/[^\d]/g, "")) / 100;

    if (!leadId) {
      alert("Selecione um lead.");
      return;
    }
    if (!vendId) {
      alert("Selecione um vendedor.");
      return;
    }
    if (!v || v <= 0) {
      alert("Informe o valor do crédito.");
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.from("opportunities").insert({
        lead_id: leadId,
        vendedor_id: vendId,
        segmento,
        valor_credito: v,
        observacao: obs || null,
        score,
        estagio,
      } as any);
      if (error) throw error;

      alert("Oportunidade criada!");
      // limpa form
      setLeadId("");
      setVendId("");
      setSegmento("Automóvel");
      setValor("");
      setObs("");
      setScore(3);
      setEstagio("Novo");
      // recarrega
      loadOpps();
    } catch (e: any) {
      alert(`Erro ao criar: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  async function atualizarEstagio(id: string, novo: Estagio) {
    try {
      const { error } = await supabase
        .from("opportunities")
        .update({ estagio: novo })
        .eq("id", id);
      if (error) throw error;
      loadOpps();
    } catch (e: any) {
      alert(`Erro ao atualizar estágio: ${e?.message || e}`);
    }
  }

  async function reatribuir(id: string, novoVend: string) {
    try {
      // RLS permite troca de vendedor_id apenas para admin (política já criada)
      const { error } = await supabase
        .from("opportunities")
        .update({ vendedor_id: novoVend })
        .eq("id", id);
      if (error) throw error;
      loadOpps();
    } catch (e: any) {
      alert(`Erro ao reatribuir: ${e?.message || e}`);
    }
  }

  function nomeLead(lead_id: string) {
    return leads.find((l) => l.id === lead_id)?.nome || "—";
  }
  function nomeVend(uid: string) {
    return vendedores.find((v) => v.auth_user_id === uid)?.nome || "—";
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1 style={{ marginBottom: 16 }}>Oportunidades</h1>

      {/* Filtro (apenas admin) */}
      {me.role === "admin" && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #eee",
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            display: "flex",
            gap: 8,
          }}
        >
          <select
            value={filtroVendedor}
            onChange={(e) => setFiltroVendedor(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="">Todos os vendedores</option>
            {vendedores.map((v) => (
              <option key={v.auth_user_id} value={v.auth_user_id}>
                {v.nome} ({v.role})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Form */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 12,
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: "0 0 12px 0" }}>Nova oportunidade</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
          }}
        >
          <select
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="">Selecione um Lead</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>

          <select
            value={vendId}
            onChange={(e) => setVendId(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="">Selecione um Vendedor</option>
            {vendedores
              .filter((v) => v.role === "vendedor" || v.role === "admin" || v.role === "operacoes")
              .map((v) => (
                <option key={v.auth_user_id} value={v.auth_user_id}>
                  {v.nome} ({v.role})
                </option>
              ))}
          </select>

          <select
            value={segmento}
            onChange={(e) => setSegmento(e.target.value as any)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            {SEGMENTOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <input
            placeholder="Valor do crédito (R$)"
            value={valor}
            onChange={(e) => {
              // máscara simples de moeda
              const only = e.target.value.replace(/[^\d]/g, "");
              const n = (Number(only || "0") / 100).toFixed(2);
              setValor(
                new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                  Number(n)
                )
              );
            }}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          />

          <input
            placeholder="Observação"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          />

          <select
            value={String(score)}
            onChange={(e) => setScore(Number(e.target.value))}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)}
              </option>
            ))}
          </select>

          <select
            value={estagio}
            onChange={(e) => setEstagio(e.target.value as Estagio)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            {ESTAGIOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button
            onClick={criar}
            disabled={loading}
            style={{
              gridColumn: "1 / span 3",
              padding: "12px 16px",
              borderRadius: 12,
              background: "#A11C27",
              color: "#fff",
              border: 0,
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {loading ? "Salvando..." : "Criar oportunidade"}
          </button>
        </div>
      </div>

      {/* Lista */}
      <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
        <h3 style={{ margin: "0 0 12px 0" }}>Oportunidades</h3>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={th}>Lead</th>
                <th style={th}>Vendedor</th>
                <th style={th}>Segmento</th>
                <th style={th}>Valor</th>
                <th style={th}>Score</th>
                <th style={th}>Estágio</th>
                {me.role === "admin" && <th style={th}>Reatribuir</th>}
              </tr>
            </thead>
            <tbody>
              {listFiltrada.map((o) => (
                <tr key={o.id}>
                  <td style={td}>{nomeLead(o.lead_id)}</td>
                  <td style={td}>{nomeVend(o.vendedor_id)}</td>
                  <td style={td}>{o.segmento}</td>
                  <td style={td}>{BRL(o.valor_credito)}</td>
                  <td style={td}>{"★".repeat(o.score)}</td>
                  <td style={td}>
                    <select
                      value={o.estagio}
                      onChange={(e) => atualizarEstagio(o.id, e.target.value as Estagio)}
                      style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    >
                      {ESTAGIOS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>

                  {me.role === "admin" && (
                    <td style={td}>
                      <select
                        value={o.vendedor_id}
                        onChange={(e) => reatribuir(o.id, e.target.value)}
                        style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                      >
                        {vendedores.map((v) => (
                          <option key={v.auth_user_id} value={v.auth_user_id}>
                            {v.nome} ({v.role})
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                </tr>
              ))}
              {!listFiltrada.length && (
                <tr>
                  <td style={{ ...td, color: "#64748b" }} colSpan={me.role === "admin" ? 7 : 6}>
                    Nenhuma oportunidade encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", fontSize: 12, color: "#475569", padding: 8 };
const td: React.CSSProperties = { padding: 8, borderTop: "1px solid #eee" };
