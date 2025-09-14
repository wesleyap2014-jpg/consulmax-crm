// src/pages/GestaoDeGrupos.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw, Plus, Filter as FilterIcon, Save, Pencil } from "lucide-react";

/* =========================================================
   TIPOS – tolerantes ao seu schema atual
   ========================================================= */
type GrupoDB = {
  id: string;
  administradora?: string | null;
  segmento?: string | null;
  grupo?: string | null;

  // campos de apresentação/parametrização
  participantes?: number | null;

  faixa_credito?: string | null;        // pode já vir pronto como "R$ X — R$ Y"
  faixa_credito_min?: number | null;    // ou faixa em min/max
  faixa_credito_max?: number | null;

  // métricas (se existirem na sua view)
  total_entregas?: number | null;
  p25_entregas?: number | null;
  p25_ofertas?: number | null;
  p50_entregas?: number | null;
  p50_ofertas?: number | null;
  ll_entregas?: number | null;
  ll_ofertas?: number | null;
  minimo_1?: number | null;
  minimo_5?: number | null;
  mediana?: number | null;
  aprox_dia?: number | null;
  px_exc?: number | null;

  // prazos/refs
  vencimento_dia?: number | null;
  sorteio_referencia?: string | null;
  assembleia_data?: string | null; // ISO 8601

  // [fallbacks] aceitar qualquer outra chave sem quebrar TS
  [k: string]: any;
};

type GrupoRow = GrupoDB & { _isStub?: boolean };

const MONEY = (v?: number | null) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

const NUM = (v?: number | null) => (v ?? 0);

const toInputDate = (iso?: string | null) => {
  if (!iso) return "";
  // aceita 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH:mm:ssZ'
  const d = iso.split("T")[0];
  return d || "";
};

const fmtFaixa = (r: GrupoDB) => {
  if (r.faixa_credito && r.faixa_credito.trim()) return r.faixa_credito;
  if (r.faixa_credito_min || r.faixa_credito_max) {
    return `${MONEY(r.faixa_credito_min)} — ${MONEY(r.faixa_credito_max)}`;
  }
  // fallback para algum outro campo textual que você já tenha
  if (r.faixa || r.credito_faixa) return String(r.faixa || r.credito_faixa);
  return "—";
};

export default function GestaoDeGruposPage() {
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [rows, setRows] = useState<GrupoRow[]>([]);
  const [filtroBusca, setFiltroBusca] = useState("");
  const [filtroAdmin, setFiltroAdmin] = useState<string>("");
  const [filtroSegmento, setFiltroSegmento] = useState<string>("");
  const [filtroGrupo, setFiltroGrupo] = useState<string>("");

  const [addOpen, setAddOpen] = useState(false);
  const [novo, setNovo] = useState<Partial<GrupoDB>>({
    administradora: "",
    segmento: "",
    grupo: "",
    faixa_credito: "",
    vencimento_dia: undefined,
    sorteio_referencia: "",
    assembleia_data: "",
  });

  /* =========================================================
     LOAD – mantém TODOS os grupos + adiciona STUBS de vendas
     ========================================================= */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1) groups (sem limitar por status)
      const { data: groups, error: errGroups } = await supabase
        .from("groups")
        .select("*")
        .order("administradora", { ascending: true })
        .order("grupo", { ascending: true });

      if (errGroups) throw errGroups;

      const groupsSafe: GrupoDB[] = (groups || []) as GrupoDB[];

      // 2) stubs a partir de vendas (novos grupos ainda não cadastrados)
      const { data: vendas, error: errVendas } = await supabase
        .from("vendas")
        .select("administradora, grupo");
      if (errVendas) throw errVendas;

      const stubs: GrupoRow[] = (vendas || [])
        .map((v: any) => ({
          id: `stub:${(v.administradora || "").trim()}:${(v.grupo || "").trim()}`,
          administradora: (v.administradora || "").trim(),
          grupo: (v.grupo || "").trim(),
          segmento: null,
          participantes: null,
          faixa_credito: null,
          faixa_credito_min: null,
          faixa_credito_max: null,
          total_entregas: null,
          p25_entregas: null,
          p25_ofertas: null,
          p50_entregas: null,
          p50_ofertas: null,
          ll_entregas: null,
          ll_ofertas: null,
          minimo_1: null,
          minimo_5: null,
          mediana: null,
          aprox_dia: null,
          px_exc: null,
          vencimento_dia: null,
          sorteio_referencia: null,
          assembleia_data: null,
          _isStub: true,
        }))
        .filter((s) => s.administradora && s.grupo);

      // 3) merge preferindo registro real
      const map = new Map<string, GrupoRow>();
      for (const g of groupsSafe) {
        const key = `${(g.administradora || "").toLowerCase()}|${(g.grupo || "").toLowerCase()}`;
        map.set(key, { ...g, _isStub: false });
      }
      for (const s of stubs) {
        const key = `${(s.administradora || "").toLowerCase()}|${(s.grupo || "").toLowerCase()}`;
        if (!map.has(key)) map.set(key, s);
      }

      const merged = Array.from(map.values()).sort((a, b) => {
        const aA = (a.administradora || "").localeCompare(b.administradora || "");
        if (aA !== 0) return aA;
        return (a.grupo || "").localeCompare(b.grupo || "");
      });

      setRows(merged);
    } catch (e) {
      console.error("[GestaoDeGrupos] loadData error:", e);
      // ainda assim mantém o que der (ex.: apenas stubs, se groups falhar)
      setRows((prev) => prev);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* =========================================================
     FILTROS & KPIs
     ========================================================= */
  const admins = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.administradora && set.add(r.administradora));
    return Array.from(set).sort();
  }, [rows]);

  const segmentos = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.segmento && set.add(r.segmento));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filtroBusca.trim().toLowerCase();
    return rows.filter((r) => {
      const okAdmin = !filtroAdmin || (r.administradora || "") === filtroAdmin;
      const okSeg = !filtroSegmento || (r.segmento || "") === filtroSegmento;
      const okGrupo = !filtroGrupo || (r.grupo || "").toLowerCase().includes(filtroGrupo.toLowerCase());
      const blob = `${r.administradora || ""} ${r.segmento || ""} ${r.grupo || ""} ${fmtFaixa(r)}`.toLowerCase();
      const okBusca = !q || blob.includes(q);
      return okAdmin && okSeg && okGrupo && okBusca;
    });
  }, [rows, filtroAdmin, filtroSegmento, filtroGrupo, filtroBusca]);

  const kpi = useMemo(() => {
    const total = filtered.length;
    const stubs = filtered.filter((r) => r._isStub).length;
    const reais = total - stubs;
    return { total, stubs, reais };
  }, [filtered]);

  /* =========================================================
     EDIT / SAVE – salva por linha (insere se stub)
     ========================================================= */
  const patchRow = (id: string, patch: Partial<GrupoDB>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const saveRow = async (row: GrupoRow) => {
    setSavingId(row.id);
    try {
      if (row._isStub) {
        const payload: Partial<GrupoDB> = {
          administradora: row.administradora || "",
          segmento: row.segmento || null,
          grupo: row.grupo || "",
          faixa_credito: row.faixa_credito || null,
          faixa_credito_min: row.faixa_credito_min ?? null,
          faixa_credito_max: row.faixa_credito_max ?? null,
          vencimento_dia: row.vencimento_dia ?? null,
          sorteio_referencia: row.sorteio_referencia || null,
          assembleia_data: row.assembleia_data || null,
          participantes: row.participantes ?? null,
        };
        const { data, error } = await supabase.from("groups").insert(payload).select("*").single();
        if (error) throw error;
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? ({ ...(data as GrupoDB), _isStub: false } as GrupoRow) : r))
        );
      } else {
        const payload: Partial<GrupoDB> = {
          segmento: row.segmento ?? null,
          faixa_credito: row.faixa_credito ?? null,
          faixa_credito_min: row.faixa_credito_min ?? null,
          faixa_credito_max: row.faixa_credito_max ?? null,
          vencimento_dia: row.vencimento_dia ?? null,
          sorteio_referencia: row.sorteio_referencia ?? null,
          assembleia_data: row.assembleia_data ?? null,
          participantes: row.participantes ?? null,
        };
        const { error } = await supabase.from("groups").update(payload).eq("id", row.id);
        if (error) throw error;
      }
    } catch (e) {
      console.error("[GestaoDeGrupos] saveRow error:", e);
    } finally {
      setSavingId(null);
    }
  };

  /* =========================================================
     UI
     ========================================================= */
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gestão de Grupos</h1>
          <p className="text-sm text-muted-foreground">
            Visão consolidada por grupo: resultados de assembleias, filtros e referência do sorteio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar
          </Button>
          <Button onClick={() => setAddOpen((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar
          </Button>
        </div>
      </div>

      {/* Filtros & KPIs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <FilterIcon className="h-5 w-5" />
            Filtros & Visão Consolidada
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-5">
          <div className="space-y-2 md:col-span-2">
            <Label>Busca</Label>
            <Input placeholder="Pesquisar por administradora, segmento ou grupo…" value={filtroBusca} onChange={(e) => setFiltroBusca(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Administradora</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={filtroAdmin}
              onChange={(e) => setFiltroAdmin(e.target.value)}
            >
              <option value="">Todas</option>
              {admins.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Segmento</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={filtroSegmento}
              onChange={(e) => setFiltroSegmento(e.target.value)}
            >
              <option value="">Todos</option>
              {segmentos.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Grupo</Label>
            <Input placeholder="Ex.: 7241" value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3 md:col-span-5">
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-xl font-semibold">{kpi.total}</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">Ativos (DB)</div>
              <div className="text-xl font-semibold">{kpi.reais}</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">Novos (stubs)</div>
              <div className="text-xl font-semibold">{kpi.stubs}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loteria Federal */}
      <Card>
        <CardHeader><CardTitle>Loteria Federal</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Referência do Sorteio</Label>
            <Input placeholder="Ex.: Concurso 5841" />
          </div>
          <div className="space-y-2">
            <Label>Data do Sorteio</Label>
            <Input type="date" />
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Input placeholder="Notas rápidas..." />
          </div>
        </CardContent>
      </Card>

      {/* Assembleias */}
      <Card>
        <CardHeader><CardTitle>Assembleias</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Próxima Data</Label>
            <Input type="date" />
          </div>
          <div className="space-y-2">
            <Label>Janela de Vencimento (dia)</Label>
            <Input type="number" placeholder="Ex.: 10" />
          </div>
          <div className="space-y-2">
            <Label>Resultados (link/ID)</Label>
            <Input placeholder="URL/ID do resultado" />
          </div>
        </CardContent>
      </Card>

      {/* Oferta de Lance */}
      <Card>
        <CardHeader><CardTitle>Oferta de Lance</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Lance 25% (referência)</Label>
            <Input placeholder="Ex.: 25% de R$ 100.000 = R$ 25.000" />
          </div>
          <div className="space-y-2">
            <Label>Lance 50% (referência)</Label>
            <Input placeholder="Ex.: 50% de R$ 100.000 = R$ 50.000" />
          </div>
          <div className="space-y-2">
            <Label>Lance Livre (nota)</Label>
            <Input placeholder="Ex.: média do último mês" />
          </div>
        </CardContent>
      </Card>

      {/* Relação de Grupos */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Relação de Grupos</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="w-full overflow-auto rounded-xl border">
            <table className="min-w-[1400px] w-full text-sm">
              <thead>
                {/* Linha de agrupamento visual (NÃO altera estrutura do corpo) */}
                <tr className="text-xs">
                  {/* colSpan para cobrir as colunas até a faixa */}
                  <th className="bg-muted/30 px-3 py-2 text-left font-medium" colSpan={5}>
                    {/* espaço antes dos blocos de 25/50/LL */}
                    &nbsp;
                  </th>
                  {/* 25% */}
                  <th className="bg-amber-50 text-amber-800 px-3 py-2 text-center font-semibold" colSpan={2}>
                    25%
                  </th>
                  {/* 50% */}
                  <th className="bg-blue-50 text-blue-800 px-3 py-2 text-center font-semibold" colSpan={2}>
                    50%
                  </th>
                  {/* LL */}
                  <th className="bg-emerald-50 text-emerald-800 px-3 py-2 text-center font-semibold" colSpan={2}>
                    Lance Livre
                  </th>
                  {/* Demais colunas avulsas até Ação */}
                  <th className="bg-muted/30 px-3 py-2" colSpan={6}></th>
                </tr>

                {/* Cabeçalho real (sem mudar nomes/ordem padrão) */}
                <tr className="bg-muted/50">
                  <th className="text-left font-medium px-3 py-2">Administradora</th>
                  <th className="text-left font-medium px-3 py-2">Segmento</th>
                  <th className="text-left font-medium px-3 py-2">Grupo</th>
                  <th className="text-left font-medium px-3 py-2">Participantes</th>
                  <th className="text-left font-medium px-3 py-2">Faixa de Crédito</th>

                  <th className="text-center font-medium px-3 py-2">Total Entrega</th>
                  <th className="text-center font-medium px-3 py-2">25% Ofertas</th>

                  <th className="text-center font-medium px-3 py-2">50% Entrega</th>
                  <th className="text-center font-medium px-3 py-2">50% Ofertas</th>

                  <th className="text-center font-medium px-3 py-2">LL Entrega</th>
                  <th className="text-center font-medium px-3 py-2">LL Ofertas</th>

                  <th className="text-center font-medium px-3 py-2">Mínimo 1</th>
                  <th className="text-center font-medium px-3 py-2">Mínimo 5</th>
                  <th className="text-center font-medium px-3 py-2">Mediana</th>
                  <th className="text-center font-medium px-3 py-2">Aproxim. Dia</th>
                  <th className="text-center font-medium px-3 py-2">Px Esc</th>
                  <th className="text-center font-medium px-3 py-2">Vencimento</th>
                  <th className="text-center font-medium px-3 py-2">Sorteio</th>
                  <th className="text-center font-medium px-3 py-2">Assembleia</th>
                  <th className="text-center font-medium px-3 py-2">Referência</th>
                  <th className="text-right font-medium px-3 py-2">Ação</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((r) => {
                  const isSaving = savingId === r.id;
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">{r.administradora || "—"}</td>
                      <td className="px-3 py-2">{r.segmento || "—"}</td>
                      <td className="px-3 py-2">{r.grupo || "—"}</td>

                      {/* Participantes (editável) */}
                      <td className="px-3 py-2">
                        <Input
                          value={r.participantes ?? ""}
                          onChange={(e) => patchRow(r.id, { participantes: e.target.value ? Number(e.target.value) : null })}
                          type="number"
                          placeholder="0"
                        />
                      </td>

                      {/* Faixa de crédito (texto direto OU min/max) */}
                      <td className="px-3 py-2">
                        {r.faixa_credito_min !== null || r.faixa_credito_max !== null ? (
                          <div className="flex gap-2">
                            <Input
                              value={r.faixa_credito_min ?? ""}
                              onChange={(e) =>
                                patchRow(r.id, {
                                  faixa_credito_min: e.target.value ? Number(e.target.value) : null,
                                  faixa_credito: null,
                                })
                              }
                              placeholder="min"
                              type="number"
                            />
                            <Input
                              value={r.faixa_credito_max ?? ""}
                              onChange={(e) =>
                                patchRow(r.id, {
                                  faixa_credito_max: e.target.value ? Number(e.target.value) : null,
                                  faixa_credito: null,
                                })
                              }
                              placeholder="max"
                              type="number"
                            />
                          </div>
                        ) : (
                          <Input
                            value={r.faixa_credito || ""}
                            onChange={(e) => patchRow(r.id, { faixa_credito: e.target.value })}
                            placeholder="R$ 60.000 — R$ 90.000"
                          />
                        )}
                      </td>

                      {/* Métricas 25/50/LL + totais */}
                      <td className="px-3 py-2 text-center">{NUM(r.total_entregas)}</td>
                      <td className="px-3 py-2 text-center">{NUM(r.p25_ofertas)}</td>
                      <td className="px-3 py-2 text-center">{NUM(r.p50_entregas)}</td>
                      <td className="px-3 py-2 text-center">{NUM(r.p50_ofertas)}</td>
                      <td className="px-3 py-2 text-center">{NUM(r.ll_entregas)}</td>
                      <td className="px-3 py-2 text-center">{NUM(r.ll_ofertas)}</td>

                      <td className="px-3 py-2 text-center">{NUM(r.minimo_1)}</td>
                      <td className="px-3 py-2 text-center">{NUM(r.minimo_5)}</td>
                      <td className="px-3 py-2 text-center">{NUM(r.mediana)}</td>
                      <td className="px-3 py-2 text-center">{NUM(r.aprox_dia)}</td>
                      <td className="px-3 py-2 text-center">{NUM(r.px_exc)}</td>

                      {/* Vencimento */}
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          value={r.vencimento_dia ?? ""}
                          onChange={(e) =>
                            patchRow(r.id, { vencimento_dia: e.target.value ? Number(e.target.value) : null })
                          }
                          placeholder="Dia"
                        />
                      </td>

                      {/* Sorteio (texto livre) */}
                      <td className="px-3 py-2">
                        <Input
                          value={r.sorteio_referencia || ""}
                          onChange={(e) => patchRow(r.id, { sorteio_referencia: e.target.value })}
                          placeholder="Concurso/Ref."
                        />
                      </td>

                      {/* Assembleia (data) */}
                      <td className="px-3 py-2">
                        <Input
                          type="date"
                          value={toInputDate(r.assembleia_data)}
                          onChange={(e) =>
                            patchRow(r.id, { assembleia_data: e.target.value || null })
                          }
                        />
                      </td>

                      {/* Referência (texto livre extra) */}
                      <td className="px-3 py-2">
                        <Input
                          value={r.referencia || r.referencia_texto || ""}
                          onChange={(e) => patchRow(r.id, { referencia: e.target.value })}
                          placeholder="Obs/Referência"
                        />
                      </td>

                      {/* Ação */}
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" onClick={() => saveRow(r)} disabled={isSaving}>
                          {isSaving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : r._isStub ? (
                            <Plus className="mr-2 h-4 w-4" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          {r._isStub ? "Cadastrar" : "Salvar"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={21} className="text-center text-muted-foreground px-3 py-6">
                      Nenhum grupo encontrado com os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Adicionar novo */}
      {addOpen && (
        <Card className="border-dashed">
          <CardHeader><CardTitle>Adicionar Grupo</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Administradora *</Label>
              <Input value={novo.administradora || ""} onChange={(e) => setNovo((s) => ({ ...s, administradora: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Segmento</Label>
              <Input value={novo.segmento || ""} onChange={(e) => setNovo((s) => ({ ...s, segmento: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Grupo *</Label>
              <Input value={novo.grupo || ""} onChange={(e) => setNovo((s) => ({ ...s, grupo: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Faixa de Crédito (texto pronto)</Label>
              <Input value={novo.faixa_credito || ""} onChange={(e) => setNovo((s) => ({ ...s, faixa_credito: e.target.value }))} placeholder="R$ 60.000 — R$ 90.000" />
            </div>
            <div className="space-y-2">
              <Label>Vencimento (dia)</Label>
              <Input type="number" value={novo.vencimento_dia ?? ""} onChange={(e) => setNovo((s) => ({ ...s, vencimento_dia: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
            <div className="space-y-2">
              <Label>Referência do Sorteio</Label>
              <Input value={novo.sorteio_referencia || ""} onChange={(e) => setNovo((s) => ({ ...s, sorteio_referencia: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Assembleia</Label>
              <Input type="date" value={novo.assembleia_data || ""} onChange={(e) => setNovo((s) => ({ ...s, assembleia_data: e.target.value }))} />
            </div>
            <div className="col-span-full flex items-center gap-2">
              <Button
                onClick={async () => {
                  try {
                    const payload: Partial<GrupoDB> = {
                      administradora: (novo.administradora || "").trim(),
                      segmento: (novo.segmento || "").trim() || null,
                      grupo: (novo.grupo || "").trim(),
                      faixa_credito: (novo.faixa_credito || "").trim() || null,
                      vencimento_dia: typeof novo.vencimento_dia === "number" ? novo.vencimento_dia : null,
                      sorteio_referencia: (novo.sorteio_referencia || "").trim() || null,
                      assembleia_data: (novo.assembleia_data || "").trim() || null,
                    };
                    if (!payload.administradora || !payload.grupo) return;
                    const { error } = await supabase.from("groups").insert(payload);
                    if (error) throw error;
                    setAddOpen(false);
                    setNovo({
                      administradora: "",
                      segmento: "",
                      grupo: "",
                      faixa_credito: "",
                      vencimento_dia: undefined,
                      sorteio_referencia: "",
                      assembleia_data: "",
                    });
                    await loadData();
                  } catch (e) {
                    console.error("[GestaoDeGrupos] addNow error:", e);
                  }
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Salvar Novo Grupo
              </Button>
              <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
