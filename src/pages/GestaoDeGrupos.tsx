// src/pages/GestaoDeGrupos.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  RefreshCw,
  Plus,
  Filter as FilterIcon,
  Save,
} from "lucide-react";

/* =========================================================
   TIPOS (flexíveis para não “quebrar” com seu schema atual)
   ========================================================= */
type GrupoDB = {
  id: string;
  administradora?: string | null;
  segmento?: string | null;
  grupo?: string | null;
  faixa_credito?: string | null;
  vencimento_dia?: number | null;
  sorteio_referencia?: string | null; // ex: "Concurso 5841"
  assembleia_data?: string | null;    // ISO string
  // ...demais colunas da sua tabela `groups`
};

type VendaMin = {
  administradora: string | null;
  grupo: string | null;
};

type GrupoRow = GrupoDB & {
  _isStub?: boolean; // vindo de `vendas` e ainda não existe em `groups`
};

const COLS = [
  { key: "administradora", label: "Administradora" },
  { key: "segmento", label: "Segmento" },
  { key: "grupo", label: "Grupo" },
  { key: "faixa_credito", label: "Faixa de Crédito" },
  { key: "vencimento_dia", label: "Vencimento" },
  { key: "sorteio_referencia", label: "Sorteio" },
  { key: "assembleia_data", label: "Assembleia" },
] as const;

export default function GestaoDeGruposPage() {
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [rows, setRows] = useState<GrupoRow[]>([]);
  const [filtroBusca, setFiltroBusca] = useState("");
  const [filtroAdmin, setFiltroAdmin] = useState<string>("");

  // Form para "Adicionar" rápido (opcional)
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
     CARREGAMENTO
     - Mantém TODOS os grupos de `groups`
     - Traz "novos grupos" como stubs a partir de `vendas`
     ========================================================= */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1) Tabela groups (todos)
      const { data: groups, error: errGroups } = await supabase
        .from("groups")
        .select("*")
        .order("administradora", { ascending: true })
        .order("grupo", { ascending: true });

      if (errGroups) throw errGroups;

      const groupsSafe: GrupoDB[] = (groups || []) as GrupoDB[];

      // 2) Buscar possíveis grupos (novos) a partir de vendas
      const { data: vendas, error: errVendas } = await supabase
        .from("vendas")
        .select("administradora, grupo");

      if (errVendas) throw errVendas;

      const stubs: GrupoRow[] = (vendas || [])
        .map((v: any) => ({
          id: `stub:${v.administradora || ""}:${v.grupo || ""}`,
          administradora: v.administradora || null,
          grupo: v.grupo || null,
          segmento: null,
          faixa_credito: null,
          vencimento_dia: null,
          sorteio_referencia: null,
          assembleia_data: null,
          _isStub: true,
        }))
        // filtra inválidos
        .filter((s) => (s.administradora || "").trim() && (s.grupo || "").trim());

      // 3) Mesclar evitando duplicatas (preferir registro real do `groups`)
      const map = new Map<string, GrupoRow>();
      for (const g of groupsSafe) {
        const key = `${(g.administradora || "").toLowerCase()}|${(g.grupo || "").toLowerCase()}`;
        map.set(key, { ...g, _isStub: false });
      }
      for (const s of stubs) {
        const key = `${(s.administradora || "").toLowerCase()}|${(s.grupo || "").toLowerCase()}`;
        if (!map.has(key)) {
          map.set(key, s);
        }
      }

      const merged = Array.from(map.values()).sort((a, b) => {
        const aA = (a.administradora || "").localeCompare(b.administradora || "");
        if (aA !== 0) return aA;
        return (a.grupo || "").localeCompare(b.grupo || "");
      });

      setRows(merged);
    } catch (e) {
      console.error("[GestaoDeGrupos] loadData error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* =========================================================
     FILTROS / KPIs Simples
     ========================================================= */
  const admins = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.administradora && set.add(r.administradora));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filtroBusca.trim().toLowerCase();
    return rows.filter((r) => {
      const okAdmin = !filtroAdmin || (r.administradora || "") === filtroAdmin;
      const blob =
        `${r.administradora || ""} ${r.segmento || ""} ${r.grupo || ""} ${r.faixa_credito || ""}`
          .toLowerCase();
      const okBusca = !q || blob.includes(q);
      return okAdmin && okBusca;
    });
  }, [rows, filtroAdmin, filtroBusca]);

  const kpi = useMemo(() => {
    const total = filtered.length;
    const stubs = filtered.filter((r) => r._isStub).length;
    const reais = total - stubs;
    return { total, stubs, reais };
  }, [filtered]);

  /* =========================================================
     SALVAR (update/insert por linha)
     ========================================================= */
  const onChangeCell = (id: string, patch: Partial<GrupoDB>) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const saveRow = async (row: GrupoRow) => {
    setSavingId(row.id);
    try {
      if (row._isStub) {
        // INSERT
        const payload: Partial<GrupoDB> = {
          administradora: row.administradora || "",
          segmento: row.segmento || null,
          grupo: row.grupo || "",
          faixa_credito: row.faixa_credito || null,
          vencimento_dia: row.vencimento_dia ?? null,
          sorteio_referencia: row.sorteio_referencia || null,
          assembleia_data: row.assembleia_data || null,
        };
        const { data, error } = await supabase.from("groups").insert(payload).select("*").single();
        if (error) throw error;

        // substituir stub pelo registro real
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id ? ({ ...(data as GrupoDB), _isStub: false } as GrupoRow) : r
          )
        );
      } else {
        // UPDATE
        const payload: Partial<GrupoDB> = {
          faixa_credito: row.faixa_credito ?? null,
          vencimento_dia: row.vencimento_dia ?? null,
          sorteio_referencia: row.sorteio_referencia ?? null,
          assembleia_data: row.assembleia_data ?? null,
          segmento: row.segmento ?? null,
        };
        const { error } = await supabase.from("groups").update(payload).eq("id", row.id);
        if (error) throw error;
      }
    } catch (e) {
      console.error("[GestaoDeGrupos] saveRow error:", e);
      // opcional: toast de erro
    } finally {
      setSavingId(null);
    }
  };

  /* =========================================================
     ADICIONAR RÁPIDO
     ========================================================= */
  const addNow = async () => {
    try {
      const payload: Partial<GrupoDB> = {
        administradora: (novo.administradora || "").trim(),
        segmento: (novo.segmento || "").trim() || null,
        grupo: (novo.grupo || "").trim(),
        faixa_credito: (novo.faixa_credito || "").trim() || null,
        vencimento_dia:
          typeof novo.vencimento_dia === "number" ? novo.vencimento_dia : null,
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
  };

  /* =========================================================
     RENDER
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

      {/* Filtros + KPIs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <FilterIcon className="h-5 w-5" />
            Filtros & Visão Consolidada
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Busca</Label>
            <Input
              placeholder="Pesquisar por administradora, segmento ou grupo…"
              value={filtroBusca}
              onChange={(e) => setFiltroBusca(e.target.value)}
            />
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
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
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
        <CardHeader>
          <CardTitle>Loteria Federal</CardTitle>
        </CardHeader>
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
        <CardHeader>
          <CardTitle>Assembleias</CardTitle>
        </CardHeader>
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
        <CardHeader>
          <CardTitle>Oferta de Lance</CardTitle>
        </CardHeader>
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
            <table className="min-w-[920px] w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} className="text-left font-medium px-3 py-2">
                      {c.label}
                    </th>
                  ))}
                  <th className="text-right font-medium px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {/* Linhas de AGRUPAMENTO VISUAL - sem mudar estrutura */}
                <tr>
                  <td
                    colSpan={COLS.length + 1}
                    className="bg-amber-50 text-amber-800 px-3 py-2 font-semibold"
                  >
                    25% Entregas + 25% Ofertas (referência visual)
                  </td>
                </tr>
                <tr>
                  <td
                    colSpan={COLS.length + 1}
                    className="bg-blue-50 text-blue-800 px-3 py-2 font-semibold"
                  >
                    50% Entregas + 50% Ofertas (referência visual)
                  </td>
                </tr>
                <tr>
                  <td
                    colSpan={COLS.length + 1}
                    className="bg-emerald-50 text-emerald-800 px-3 py-2 font-semibold"
                  >
                    Lance Livre (referência visual)
                  </td>
                </tr>

                {filtered.map((r) => {
                  const isSaving = savingId === r.id;
                  return (
                    <tr key={r.id} className="border-t">
                      {/* Administradora */}
                      <td className="px-3 py-2 align-middle">
                        <Input
                          value={r.administradora || ""}
                          onChange={(e) =>
                            onChangeCell(r.id, { administradora: e.target.value })
                          }
                          placeholder="Administradora"
                        />
                      </td>
                      {/* Segmento */}
                      <td className="px-3 py-2 align-middle">
                        <Input
                          value={r.segmento || ""}
                          onChange={(e) =>
                            onChangeCell(r.id, { segmento: e.target.value })
                          }
                          placeholder="Segmento"
                        />
                      </td>
                      {/* Grupo */}
                      <td className="px-3 py-2 align-middle">
                        <Input
                          value={r.grupo || ""}
                          onChange={(e) =>
                            onChangeCell(r.id, { grupo: e.target.value })
                          }
                          placeholder="Grupo"
                        />
                      </td>
                      {/* Faixa de Crédito */}
                      <td className="px-3 py-2 align-middle">
                        <Input
                          value={r.faixa_credito || ""}
                          onChange={(e) =>
                            onChangeCell(r.id, { faixa_credito: e.target.value })
                          }
                          placeholder="Ex.: R$ 100.000"
                        />
                      </td>
                      {/* Vencimento */}
                      <td className="px-3 py-2 align-middle">
                        <Input
                          type="number"
                          value={r.vencimento_dia ?? ""}
                          onChange={(e) =>
                            onChangeCell(r.id, {
                              vencimento_dia: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                          placeholder="Dia"
                        />
                      </td>
                      {/* Sorteio */}
                      <td className="px-3 py-2 align-middle">
                        <Input
                          value={r.sorteio_referencia || ""}
                          onChange={(e) =>
                            onChangeCell(r.id, {
                              sorteio_referencia: e.target.value,
                            })
                          }
                          placeholder="Concurso/Referência"
                        />
                      </td>
                      {/* Assembleia */}
                      <td className="px-3 py-2 align-middle">
                        <Input
                          type="date"
                          value={r.assembleia_data || ""}
                          onChange={(e) =>
                            onChangeCell(r.id, {
                              assembleia_data: e.target.value || null,
                            })
                          }
                        />
                      </td>
                      {/* Ações */}
                      <td className="px-3 py-2 align-middle text-right">
                        <Button
                          size="sm"
                          onClick={() => saveRow(r)}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          Salvar
                        </Button>
                      </td>
                    </tr>
                  );
                })}

                {/* vazio */}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={COLS.length + 1}
                      className="text-center text-muted-foreground px-3 py-6"
                    >
                      Nenhum grupo encontrado com os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Drawer/inline para adicionar novo */}
      {addOpen && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Adicionar Grupo</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Administradora *</Label>
              <Input
                value={novo.administradora || ""}
                onChange={(e) => setNovo((s) => ({ ...s, administradora: e.target.value }))}
                placeholder="Ex.: Embracon"
              />
            </div>
            <div className="space-y-2">
              <Label>Segmento</Label>
              <Input
                value={novo.segmento || ""}
                onChange={(e) => setNovo((s) => ({ ...s, segmento: e.target.value }))}
                placeholder="Ex.: Automóvel"
              />
            </div>
            <div className="space-y-2">
              <Label>Grupo *</Label>
              <Input
                value={novo.grupo || ""}
                onChange={(e) => setNovo((s) => ({ ...s, grupo: e.target.value }))}
                placeholder="Ex.: 1234"
              />
            </div>
            <div className="space-y-2">
              <Label>Faixa de Crédito</Label>
              <Input
                value={novo.faixa_credito || ""}
                onChange={(e) => setNovo((s) => ({ ...s, faixa_credito: e.target.value }))}
                placeholder="Ex.: R$ 100.000"
              />
            </div>
            <div className="space-y-2">
              <Label>Vencimento (dia)</Label>
              <Input
                type="number"
                value={novo.vencimento_dia ?? ""}
                onChange={(e) =>
                  setNovo((s) => ({
                    ...s,
                    vencimento_dia: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
                placeholder="Ex.: 10"
              />
            </div>
            <div className="space-y-2">
              <Label>Referência do Sorteio</Label>
              <Input
                value={novo.sorteio_referencia || ""}
                onChange={(e) =>
                  setNovo((s) => ({ ...s, sorteio_referencia: e.target.value }))
                }
                placeholder="Ex.: Concurso 5841"
              />
            </div>
            <div className="space-y-2">
              <Label>Assembleia</Label>
              <Input
                type="date"
                value={novo.assembleia_data || ""}
                onChange={(e) =>
                  setNovo((s) => ({ ...s, assembleia_data: e.target.value }))
                }
              />
            </div>
            <div className="col-span-full flex items-center gap-2">
              <Button onClick={addNow}>
                <Plus className="mr-2 h-4 w-4" />
                Salvar Novo Grupo
              </Button>
              <Button variant="ghost" onClick={() => setAddOpen(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
