// src/pages/Comissoes.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Download, Plus } from "lucide-react";

/* ========================= Helpers seguros ========================= */
const asNumber = (x: any) => (typeof x === "number" && isFinite(x) ? x : 0);

const BRL = (v?: number | null) =>
  asNumber(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pct100 = (v?: number | null) =>
  `${(asNumber(v) * 100).toFixed(2).replace(".", ",")}%`;

const fmtDate = (d?: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR") : "—";

/* ============================== Tipos ============================== */
type UUID = string;

type VendaRow = {
  id: UUID;
  data_venda: string;                // date
  vendedor_id: UUID;
  cliente_lead_id: UUID | null;
  numero_proposta: string | null;
  administradora: string | null;
  segmento: string | null;
  tabela: string | null;
  valor_venda: number | null;
};

type CommissionRow = {
  id: UUID;
  venda_id: UUID;
  vendedor_id: UUID;
  sim_table_id: UUID | null;
  data_venda: string | null;         // date
  segmento: string | null;
  tabela: string | null;
  administradora: string | null;
  valor_venda: number | null;
  base_calculo: number | null;
  percent_aplicado: number | null;   // fração (0.0225)
  valor_total: number | null;
  status: string | null;
  data_pagamento: string | null;     // date
  created_at: string | null;         // timestamptz
};

type KPI = {
  bruto: number;
  liquida: number;
  paga: number;
  pendente: number;
};

/* ============================ Página ============================== */
export default function ComissoesPage() {
  // Filtros simples (intervalo)
  const [dtIni, setDtIni] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dtFim, setDtFim] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });

  // Listas
  const [loading, setLoading] = useState(true);
  const [vendasSemCom, setVendasSemCom] = useState<VendaRow[]>([]);
  const [comissoes, setComissoes] = useState<CommissionRow[]>([]);

  // Mapas de nomes
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [clientMap, setClientMap] = useState<Record<string, string>>({});

  const userName = (id?: string | null) => (id ? userMap[id] || id : "—");
  const clientName = (id?: string | null) => (id ? clientMap[id] || "—" : "—");

  // KPIs
  const kpis: KPI = useMemo(() => {
    const bruto = comissoes.reduce((a, c) => a + asNumber(c.valor_total), 0);
    const paga = comissoes
      .filter((c) => (c.status || "").toLowerCase() === "pago" || (c.status || "").toLowerCase() === "paga")
      .reduce((a, c) => a + asNumber(c.valor_total), 0);
    const pendente = bruto - paga;
    // (exemplo) líquida = bruto (ou ajuste se tiver taxas)
    const liquida = bruto;
    return { bruto, liquida, paga, pendente };
  }, [comissoes]);

  /* ====================== Carregar dados ====================== */
  useEffect(() => {
    (async () => {
      setLoading(true);

      // 1) Vendas sem comissão (LEFT JOIN commissions)
      // PostgREST: embed left e filtra NULL
      const { data: vendasData, error: errV } = await supabase
        .from("vendas")
        .select(
          "id, data_venda, vendedor_id, cliente_lead_id, numero_proposta, administradora, segmento, tabela, valor_venda, commissions!left(venda_id)"
        )
        .gte("data_venda", dtIni)
        .lte("data_venda", dtFim)
        .order("data_venda", { ascending: false });

      if (errV) {
        console.error(errV);
        alert("Erro ao buscar vendas: " + errV.message);
      }

      const semCom = (vendasData || [])
        .filter((row: any) => row.commissions == null || row.commissions.length === 0)
        .map((r: any) => ({
          id: r.id,
          data_venda: r.data_venda,
          vendedor_id: r.vendedor_id,
          cliente_lead_id: r.cliente_lead_id ?? null,
          numero_proposta: r.numero_proposta ?? null,
          administradora: r.administradora ?? null,
          segmento: r.segmento ?? null,
          tabela: r.tabela ?? null,
          valor_venda: r.valor_venda ?? null,
        })) as VendaRow[];

      setVendasSemCom(semCom);

      // 2) Comissões do período
      const { data: comData, error: errC } = await supabase
        .from("commissions")
        .select(
          "id, venda_id, vendedor_id, sim_table_id, data_venda, segmento, tabela, administradora, valor_venda, base_calculo, percent_aplicado, valor_total, status, data_pagamento, created_at"
        )
        .gte("data_venda", dtIni)
        .lte("data_venda", dtFim)
        .order("data_venda", { ascending: false });

      if (errC) {
        console.error(errC);
        alert("Erro ao buscar comissões: " + errC.message);
      }

      setComissoes((comData || []) as CommissionRow[]);
      setLoading(false);
    })();
  }, [dtIni, dtFim]);

  /* ====== Enriquecer: mapear usuários (vendedores) e clientes ====== */
  useEffect(() => {
    const vendedorIds = new Set<string>();
    vendasSemCom.forEach((v) => v.vendedor_id && vendedorIds.add(v.vendedor_id));
    comissoes.forEach((c) => c.vendedor_id && vendedorIds.add(c.vendedor_id));

    const clienteIds = new Set<string>();
    vendasSemCom.forEach((v) => v.cliente_lead_id && clienteIds.add(v.cliente_lead_id));

    (async () => {
      if (vendedorIds.size) {
        const { data: usersData } = await supabase
          .from("users")
          .select("id, nome, email")
          .in("id", Array.from(vendedorIds));
        const umap: Record<string, string> = {};
        (usersData || []).forEach((u: any) => {
          umap[u.id] = u.nome?.trim() || u.email?.trim() || u.id;
        });
        setUserMap(umap);
      } else {
        setUserMap({});
      }

      if (clienteIds.size) {
        const { data: cliData } = await supabase
          .from("clientes")
          .select("id, nome")
          .in("id", Array.from(clienteIds));
        const cmap: Record<string, string> = {};
        (cliData || []).forEach((c: any) => {
          cmap[c.id] = c.nome || c.id;
        });
        setClientMap(cmap);
      } else {
        setClientMap({});
      }
    })();
  }, [vendasSemCom, comissoes]);

  /* ===================== Ações ===================== */
  async function gerarComissao(venda: VendaRow) {
    // sanity check
    const { data: check } = await supabase
      .from("vendas")
      .select("id,vendedor_id,data_venda,segmento,tabela,administradora,valor_venda")
      .eq("id", venda.id)
      .maybeSingle();
    if (!check) {
      alert("Venda não encontrada no banco.");
      return;
    }

    // Insert mínimo: o trigger BEFORE INSERT faz snapshot/cálculo
    const { error } = await supabase
      .from("commissions")
      .insert({
        venda_id: venda.id,
        vendedor_id: venda.vendedor_id, // ajuda em RLS; o trigger pode sobrescrever
      });

    if (error) {
      alert("Erro ao criar a comissão: " + error.message);
      return;
    }

    // refresh leve
    const { data: comData } = await supabase
      .from("commissions")
      .select(
        "id, venda_id, vendedor_id, sim_table_id, data_venda, segmento, tabela, administradora, valor_venda, base_calculo, percent_aplicado, valor_total, status, data_pagamento, created_at"
      )
      .gte("data_venda", dtIni)
      .lte("data_venda", dtFim)
      .order("data_venda", { ascending: false });

    setComissoes((comData || []) as CommissionRow[]);

    // atualiza a tabela de “sem comissão”
    setVendasSemCom((prev) => prev.filter((v) => v.id !== venda.id));
  }

  function exportCSVComissoes() {
    const header = [
      "data_venda",
      "vendedor",
      "segmento",
      "tabela",
      "administradora",
      "valor_venda_BR",
      "base_calculo_BR",
      "percent_aplicado_%",
      "valor_total_BR",
      "status",
      "data_pagamento",
    ];
    const lines = comissoes.map((r) =>
      [
        fmtDate(r.data_venda || undefined),
        userName(r.vendedor_id),
        r.segmento || "",
        r.tabela || "",
        r.administradora || "",
        BRL(r.valor_venda),
        BRL(r.base_calculo),
        pct100(r.percent_aplicado),
        BRL(r.valor_total),
        r.status || "",
        fmtDate(r.data_pagamento),
      ]
        .map((v) =>
          typeof v === "string" && v.includes(",") ? `"${v}"` : String(v)
        )
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comissoes_${dtIni}_${dtFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSVVendasSemCom() {
    const header = [
      "data_venda",
      "vendedor",
      "cliente",
      "numero_proposta",
      "administradora",
      "segmento",
      "tabela",
      "valor_venda_BR",
    ];
    const lines = vendasSemCom.map((v) =>
      [
        fmtDate(v.data_venda),
        userName(v.vendedor_id),
        clientName(v.cliente_lead_id),
        v.numero_proposta || "",
        v.administradora || "",
        v.segmento || "",
        v.tabela || "",
        BRL(v.valor_venda),
      ]
        .map((x) =>
          typeof x === "string" && x.includes(",") ? `"${x}"` : String(x)
        )
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendas_sem_comissao_${dtIni}_${dtFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ============================ UI ============================ */
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>De</Label>
          <Input
            type="date"
            value={dtIni}
            onChange={(e) => setDtIni(e.target.value)}
            className="w-[180px]"
          />
        </div>
        <div>
          <Label>Até</Label>
          <Input
            type="date"
            value={dtFim}
            onChange={(e) => setDtFim(e.target.value)}
            className="w-[180px]"
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 md:col-span-2">
          <CardHeader><CardTitle>Vendas no Período</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">
            {vendasSemCom.length.toLocaleString("pt-BR")}
          </CardContent>
        </Card>

        <Card className="col-span-12 md:col-span-2">
          <CardHeader><CardTitle>Comissão Bruta</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{BRL(kpis.bruto)}</CardContent>
        </Card>

        <Card className="col-span-12 md:col-span-2">
          <CardHeader><CardTitle>Comissão Líquida</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{BRL(kpis.liquida)}</CardContent>
        </Card>

        <Card className="col-span-12 md:col-span-2">
          <CardHeader><CardTitle>Comissão Paga</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{BRL(kpis.paga)}</CardContent>
        </Card>

        <Card className="col-span-12 md:col-span-2">
          <CardHeader><CardTitle>Comissão Pendente</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{BRL(kpis.pendente)}</CardContent>
        </Card>
      </div>

      {/* Vendas sem comissão */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Vendas sem comissão (período & filtros)</CardTitle>
          <Button variant="secondary" size="sm" onClick={exportCSVVendasSemCom}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : vendasSemCom.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem pendências 🎉</div>
          ) : (
            <div className="overflow-auto rounded-md border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-2">Data</th>
                    <th className="text-left p-2">Vendedor</th>
                    <th className="text-left p-2">Cliente</th>
                    <th className="text-left p-2">Nº Proposta</th>
                    <th className="text-left p-2">Administradora</th>
                    <th className="text-left p-2">Segmento</th>
                    <th className="text-left p-2">Tabela</th>
                    <th className="text-right p-2">Crédito</th>
                    <th className="text-right p-2">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {vendasSemCom.map((v) => (
                    <tr key={v.id} className="border-t">
                      <td className="p-2">{fmtDate(v.data_venda)}</td>
                      <td className="p-2">{userName(v.vendedor_id)}</td>
                      <td className="p-2">{clientName(v.cliente_lead_id)}</td>
                      <td className="p-2">{v.numero_proposta || "—"}</td>
                      <td className="p-2">{v.administradora || "—"}</td>
                      <td className="p-2">{v.segmento || "—"}</td>
                      <td className="p-2">{v.tabela || "—"}</td>
                      <td className="p-2 text-right">{BRL(v.valor_venda)}</td>
                      <td className="p-2 text-right">
                        <Button
                          size="sm"
                          onClick={() => gerarComissao(v)}
                          className="h-9 rounded-xl px-3"
                        >
                          <Plus className="h-4 w-4 mr-1" /> Gerar Comissão
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalhamento de comissões */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Detalhamento de Comissões</CardTitle>
          <Button variant="secondary" size="sm" onClick={exportCSVComissoes}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : comissoes.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem registros.</div>
          ) : (
            <div className="overflow-auto rounded-md border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-2">Data</th>
                    <th className="text-left p-2">Vendedor</th>
                    <th className="text-left p-2">Segmento</th>
                    <th className="text-left p-2">Tabela</th>
                    <th className="text-left p-2">Administradora</th>
                    <th className="text-right p-2">Crédito</th>
                    <th className="text-right p-2">% Comissão</th>
                    <th className="text-right p-2">Valor Comissão</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Pagamento</th>
                  </tr>
                </thead>
                <tbody>
                  {comissoes.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{fmtDate(r.data_venda)}</td>
                      <td className="p-2">{userName(r.vendedor_id)}</td>
                      <td className="p-2">{r.segmento || "—"}</td>
                      <td className="p-2">{r.tabela || "—"}</td>
                      <td className="p-2">{r.administradora || "—"}</td>
                      <td className="p-2 text-right">
                        {BRL(r.valor_venda ?? r.base_calculo)}
                      </td>
                      <td className="p-2 text-right">{pct100(r.percent_aplicado)}</td>
                      <td className="p-2 text-right">{BRL(r.valor_total)}</td>
                      <td className="p-2">{r.status || "—"}</td>
                      <td className="p-2">{fmtDate(r.data_pagamento)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
