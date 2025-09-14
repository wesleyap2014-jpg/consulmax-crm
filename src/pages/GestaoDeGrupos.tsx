// src/pages/GestaoDeGrupos.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Filter as FilterIcon,
  Percent,
  Plus,
  Pencil,
  RefreshCw,
  Save,
  Settings,
  X,
  Target,
} from "lucide-react";

/* =========================================================
   TIPOS
   ========================================================= */
type Administradora = "Embracon" | "HS" | string;
type SegmentoUI =
  | "Automóvel"
  | "Imóvel"
  | "Veículo"
  | "Motocicleta"
  | "Serviços"
  | "Pesados"
  | string;

type Grupo = {
  id: string;
  administradora: Administradora;
  segmento: SegmentoUI;
  codigo: string;
  participantes: number | null;
  faixa_min: number | null;
  faixa_max: number | null;
  prox_vencimento: string | null;
  prox_sorteio: string | null;
  prox_assembleia: string | null;
  prazo_encerramento_meses: number | null;
};

type LoteriaFederal = {
  data_sorteio: string;
  primeiro: string;
  segundo: string;
  terceiro: string;
  quarto: string;
  quinto: string;
};

type UltimoResultado = {
  group_id: string;
  date: string | null;
  fixed25_offers: number;
  fixed25_deliveries: number;
  fixed50_offers: number;
  fixed50_deliveries: number;
  ll_offers: number;
  ll_deliveries: number;
  ll_high: number | null;
  ll_low: number | null;
  median: number | null;
};

/* =========================================================
   HELPERS
   ========================================================= */
function sanitizeBilhete5(value: string): string {
  const onlyDigits = (value || "").replace(/\D/g, "");
  if (onlyDigits.length <= 5) return onlyDigits.padStart(5, "0");
  return onlyDigits.slice(-5);
}
function calcMediana(maior?: number | null, menor?: number | null) {
  if (maior == null || menor == null) return null;
  return (maior + menor) / 2;
}
function toYMD(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  const s = typeof d === "string" ? d.trim() : (d as Date).toISOString();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const isoHead = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoHead) return `${isoHead[1]}-${isoHead[2]}-${isoHead[3]}`;
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return null;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function formatBR(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function toPct4(v: number | null | undefined): string {
  if (v == null) return "—";
  const str = Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
  return `${str}%`;
}

/* ===== normalizações ===== */
function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normalizeAdmin(raw?: string | null): string {
  const s = stripAccents(String(raw ?? "")).toLowerCase();
  if (s.includes("embracon")) return "Embracon";
  if (s.includes("hs")) return "HS";
  return (raw ?? "").toString().trim();
}
function normalizeGroupDigits(g?: string | number | null): string {
  const s = String(g ?? "").trim();
  const first = s.split(/[\/\-\s]/)[0] || s;
  const m = first.match(/\d+/);
  if (m) return m[0];
  return s.replace(/\D/g, "");
}
function keyDigits(adm?: string | null, grp?: string | number | null) {
  return `${normalizeAdmin(adm)}::${normalizeGroupDigits(grp)}`;
}
function isStubId(id: string) {
  return id.startsWith("stub:");
}
function makeStubId(adm?: string | null, grp?: string | number | null) {
  return `stub:${keyDigits(adm, grp)}`;
}
/* =========================================================
   OVERLAY GRUPOS IMPORTADOS
   ========================================================= */
type NovoGrupoRow = {
  id: string;
  administradora: string;
  codigo: string;
  faixa_min: number | null;
  faixa_max: number | null;
  prox_vencimento: string | null;
  prox_sorteio: string | null;
  prox_assembleia: string | null;
};

function OverlayGruposImportados({
  rows,
  onClose,
  onSaved,
}: {
  rows: NovoGrupoRow[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [dados, setDados] = useState<NovoGrupoRow[]>(rows);
  const [saving, setSaving] = useState(false);

  const upd = (id: string, campo: keyof NovoGrupoRow, val: any) => {
    setDados((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [campo]: val } : r))
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await Promise.all(
        dados.map((r) =>
          supabase
            .from("groups")
            .update({
              faixa_min: r.faixa_min,
              faixa_max: r.faixa_max,
              prox_vencimento: r.prox_vencimento,
              prox_sorteio: r.prox_sorteio,
              prox_assembleia: r.prox_assembleia,
            })
            .eq("id", r.id)
        )
      );
      await supabase.rpc("refresh_gestao_mv");
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-4 w-full max-w-5xl">
        <div className="flex justify-between items-center border-b pb-2 mb-4">
          <h2 className="text-lg font-semibold">Atualizar Grupos</h2>
          <Button variant="secondary" onClick={onClose}>
            <X className="h-4 w-4" /> Fechar
          </Button>
        </div>
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 sticky top-0">
              <tr>
                <th className="p-2 text-left">Administradora</th>
                <th className="p-2 text-left">Grupo</th>
                <th className="p-2 text-center">Faixa de Crédito</th>
                <th className="p-2 text-center">Vencimento</th>
                <th className="p-2 text-center">Sorteio</th>
                <th className="p-2 text-center">Assembleia</th>
              </tr>
            </thead>
            <tbody>
              {dados.map((r) => (
                <tr key={r.id} className="odd:bg-muted/30">
                  <td className="p-2">{r.administradora}</td>
                  <td className="p-2">{r.codigo}</td>
                  <td className="p-2">
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={r.faixa_min ?? ""}
                        placeholder="mín"
                        onChange={(e) =>
                          upd(
                            r.id,
                            "faixa_min",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                      />
                      <Input
                        type="number"
                        value={r.faixa_max ?? ""}
                        placeholder="máx"
                        onChange={(e) =>
                          upd(
                            r.id,
                            "faixa_max",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                      />
                    </div>
                  </td>
                  <td className="p-2 text-center">
                    <Input
                      type="date"
                      value={r.prox_vencimento ?? ""}
                      onChange={(e) =>
                        upd(r.id, "prox_vencimento", e.target.value || null)
                      }
                    />
                  </td>
                  <td className="p-2 text-center">
                    <Input
                      type="date"
                      value={r.prox_sorteio ?? ""}
                      onChange={(e) =>
                        upd(r.id, "prox_sorteio", e.target.value || null)
                      }
                    />
                  </td>
                  <td className="p-2 text-center">
                    <Input
                      type="date"
                      value={r.prox_assembleia ?? ""}
                      onChange={(e) =>
                        upd(r.id, "prox_assembleia", e.target.value || null)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end mt-4">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" /> Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   OVERLAY LOTERIA FEDERAL
   ========================================================= */
function OverlayLoteria({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<LoteriaFederal>({
    data_sorteio: "",
    primeiro: "",
    segundo: "",
    terceiro: "",
    quarto: "",
    quinto: "",
  });

  const salvar = async () => {
    if (!form.data_sorteio) return;
    await supabase.from("lottery_draws").upsert(form);
    await onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl p-4">
        <div className="flex items-center justify-between border-b pb-2 mb-4">
          <h2 className="text-lg font-semibold">Registrar Loteria Federal</h2>
          <Button variant="secondary" onClick={onClose}>
            <X className="h-4 w-4 mr-2" /> Fechar
          </Button>
        </div>
        <div className="space-y-3">
          <div>
            <Label>Data</Label>
            <Input
              type="date"
              value={form.data_sorteio}
              onChange={(e) =>
                setForm((f) => ({ ...f, data_sorteio: e.target.value }))
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {["primeiro", "segundo", "terceiro", "quarto", "quinto"].map(
              (pos) => (
                <div key={pos}>
                  <Label className="capitalize">{pos}</Label>
                  <Input
                    value={form[pos as keyof LoteriaFederal]}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        [pos]: sanitizeBilhete5(e.target.value),
                      }))
                    }
                  />
                </div>
              )
            )}
          </div>
        </div>
        <div className="flex justify-end mt-4 gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar}>
            <Save className="h-4 w-4 mr-2" /> Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}
/* =========================================================
   OVERLAY ASSEMBLEIAS
   ========================================================= */
function OverlayAssembleias({
  gruposBase,
  onClose,
  onSaved,
}: {
  gruposBase: Grupo[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [dataAsm, setDataAsm] = useState<string>("");
  const [linhas, setLinhas] = useState<
    {
      id: string;
      administradora: string;
      codigo: string;
      participantes: number | null;
      entregas25: number | null;
      ofertas25: number | null;
      entregas50: number | null;
      ofertas50: number | null;
      entregasLL: number | null;
      ofertasLL: number | null;
      maior: number | null;
      menor: number | null;
    }[]
  >([]);

  const salvar = async () => {
    if (!dataAsm) return;
    await Promise.all(
      linhas.map((r) =>
        supabase.from("v_group_last_assembly").insert({
          group_id: r.id,
          date: toYMD(dataAsm),
          fixed25_deliveries: r.entregas25,
          fixed25_offers: r.ofertas25,
          fixed50_deliveries: r.entregas50,
          fixed50_offers: r.ofertas50,
          ll_deliveries: r.entregasLL,
          ll_offers: r.ofertasLL,
          ll_high: r.maior,
          ll_low: r.menor,
        })
      )
    );
    await onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-4 w-full max-w-6xl">
        <div className="flex justify-between items-center border-b pb-2 mb-4">
          <h2 className="text-lg font-semibold">Resultados de Assembleias</h2>
          <Button variant="secondary" onClick={onClose}>
            <X className="h-4 w-4 mr-2" /> Fechar
          </Button>
        </div>
        <div className="flex gap-3 mb-4">
          <div>
            <Label>Data da Assembleia</Label>
            <Input
              type="date"
              value={dataAsm}
              onChange={(e) => setDataAsm(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 sticky top-0">
              <tr>
                <th className="p-2">Administradora</th>
                <th className="p-2">Grupo</th>
                <th className="p-2">Participantes</th>
                <th className="p-2">25% Entregas</th>
                <th className="p-2">25% Ofertas</th>
                <th className="p-2">50% Entregas</th>
                <th className="p-2">50% Ofertas</th>
                <th className="p-2">LL Entregas</th>
                <th className="p-2">LL Ofertas</th>
                <th className="p-2">Maior %</th>
                <th className="p-2">Menor %</th>
              </tr>
            </thead>
            <tbody>
              {gruposBase.map((g) => (
                <tr key={g.id} className="odd:bg-muted/30">
                  <td className="p-2">{g.administradora}</td>
                  <td className="p-2">{g.codigo}</td>
                  <td className="p-2">{g.participantes ?? "—"}</td>
                  <td className="p-2">
                    <Input
                      type="number"
                      onChange={(e) =>
                        setLinhas((prev) =>
                          prev.map((r) =>
                            r.id === g.id
                              ? { ...r, entregas25: Number(e.target.value) }
                              : r
                          )
                        )
                      }
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      onChange={(e) =>
                        setLinhas((prev) =>
                          prev.map((r) =>
                            r.id === g.id
                              ? { ...r, ofertas25: Number(e.target.value) }
                              : r
                          )
                        )
                      }
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      onChange={(e) =>
                        setLinhas((prev) =>
                          prev.map((r) =>
                            r.id === g.id
                              ? { ...r, entregas50: Number(e.target.value) }
                              : r
                          )
                        )
                      }
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      onChange={(e) =>
                        setLinhas((prev) =>
                          prev.map((r) =>
                            r.id === g.id
                              ? { ...r, ofertas50: Number(e.target.value) }
                              : r
                          )
                        )
                      }
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      onChange={(e) =>
                        setLinhas((prev) =>
                          prev.map((r) =>
                            r.id === g.id
                              ? { ...r, entregasLL: Number(e.target.value) }
                              : r
                          )
                        )
                      }
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      onChange={(e) =>
                        setLinhas((prev) =>
                          prev.map((r) =>
                            r.id === g.id
                              ? { ...r, ofertasLL: Number(e.target.value) }
                              : r
                          )
                        )
                      }
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      onChange={(e) =>
                        setLinhas((prev) =>
                          prev.map((r) =>
                            r.id === g.id
                              ? { ...r, maior: Number(e.target.value) }
                              : r
                          )
                        )
                      }
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      onChange={(e) =>
                        setLinhas((prev) =>
                          prev.map((r) =>
                            r.id === g.id
                              ? { ...r, menor: Number(e.target.value) }
                              : r
                          )
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end mt-4 gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar}>
            <Save className="h-4 w-4 mr-2" /> Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   OVERLAY OFERTA DE LANCE (início)
   ========================================================= */
type OfertaRow = {
  administradora: string;
  grupo: string;
  cota?: string | null;
  referencia?: string | null;
  participantes?: number | null;
  mediana?: number | null;
  contemplados?: number | null;
};

async function fetchVendasForOferta(dataAsm: string): Promise<OfertaRow[]> {
  const { data, error } = await supabase
    .from("oferta_lance_all")
    .select("*")
    .eq("data_assembleia", dataAsm);
  if (error) throw error;
  return data || [];
}
function OverlayOfertaLance({ onClose }: { onClose: () => void }) {
  const [dataAsm, setDataAsm] = useState<string>("");
  const [linhas, setLinhas] = useState<OfertaRow[]>([]);
  const [loading, setLoading] = useState(false);

  const listar = async () => {
    if (!dataAsm) return;
    setLoading(true);
    try {
      const items = await fetchVendasForOferta(toYMD(dataAsm)!);
      setLinhas(items);
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Erro ao buscar dados.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-4 w-full max-w-6xl">
        <div className="flex justify-between items-center border-b pb-2 mb-4">
          <h2 className="text-lg font-semibold">Oferta de Lance</h2>
          <Button variant="secondary" onClick={onClose}>
            <X className="h-4 w-4 mr-2" /> Fechar
          </Button>
        </div>
        <div className="flex gap-3 mb-4">
          <div>
            <Label>Data Assembleia</Label>
            <Input
              type="date"
              value={dataAsm}
              onChange={(e) => setDataAsm(e.target.value)}
            />
          </div>
          <Button onClick={listar} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Listar
          </Button>
        </div>
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 sticky top-0">
              <tr>
                <th className="p-2">Administradora</th>
                <th className="p-2">Grupo</th>
                <th className="p-2">Cota</th>
                <th className="p-2">Referência</th>
                <th className="p-2">Participantes</th>
                <th className="p-2">Mediana</th>
                <th className="p-2">Contemplados</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin inline" />{" "}
                    Carregando...
                  </td>
                </tr>
              ) : linhas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    Nenhum registro encontrado
                  </td>
                </tr>
              ) : (
                linhas.map((l, i) => (
                  <tr key={i} className="odd:bg-muted/30">
                    <td className="p-2">{l.administradora}</td>
                    <td className="p-2">{l.grupo}</td>
                    <td className="p-2">{l.cota ?? "—"}</td>
                    <td className="p-2">{l.referencia ?? "—"}</td>
                    <td className="p-2">{l.participantes ?? "—"}</td>
                    <td className="p-2">
                      {l.mediana != null ? toPct4(l.mediana) : "—"}
                    </td>
                    <td className="p-2">{l.contemplados ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   PÁGINA PRINCIPAL - INÍCIO
   ========================================================= */
export default function GestaoDeGrupos() {
  const [loading, setLoading] = useState(true);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<NovoGrupoRow[]>([]);
  const [asmOpen, setAsmOpen] = useState(false);
  const [lfOpen, setLfOpen] = useState(false);
  const [ofertaOpen, setOfertaOpen] = useState(false);

  const carregar = async () => {
    setLoading(true);
    try {
      // Pega grupos da tabela groups
      const { data: gruposDb, error: gErr } = await supabase.from("groups").select("*");
      if (gErr) throw gErr;

      setGrupos(gruposDb || []);

      // Vendas encarteiradas
      const { data: vend, error: vErr } = await supabase
        .from("vendas")
        .select("administradora, segmento, grupo, status, contemplada")
        .eq("status", "encarteirada")
        .eq("contemplada", false);

      if (vErr) throw vErr;

      const distinct = new Map<string, NovoGrupoRow>();
      (vend || []).forEach((v: any) => {
        const k = keyDigits(v.administradora, v.grupo);
        if (!distinct.has(k)) {
          distinct.set(k, {
            id: makeStubId(v.administradora, v.grupo),
            administradora: normalizeAdmin(v.administradora),
            codigo: v.grupo,
            faixa_min: null,
            faixa_max: null,
            prox_vencimento: null,
            prox_sorteio: null,
            prox_assembleia: null,
          });
        }
      });

      // Define grupos que precisam ser complementados
      setImportRows(Array.from(distinct.values()));
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const handleSync = async () => {
    await carregar();
    setImportOpen(true); // Abre overlay dos grupos incompletos
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Gestão de Grupos</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleSync}>
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Loteria Federal</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <Button variant="secondary" onClick={() => setLfOpen(true)}>
              <Percent className="h-4 w-4 mr-2" /> Informar Resultados
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Assembleias</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <Button variant="secondary" onClick={() => setAsmOpen(true)}>
              <Settings className="h-4 w-4 mr-2" /> Informar Resultados
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Oferta de Lance</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <Button variant="secondary" onClick={() => setOfertaOpen(true)}>
              <Target className="h-4 w-4 mr-2" /> Abrir
            </Button>
          </CardContent>
        </Card>
      </div>
      {/* Relação de Grupos */}
      <div>
        <h2 className="text-base font-semibold mb-2">Relação de Grupos</h2>
        <div className="rounded-2xl border overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="p-2">Administradora</th>
                <th className="p-2">Segmento</th>
                <th className="p-2">Grupo</th>
                <th className="p-2">Faixa Mín</th>
                <th className="p-2">Faixa Máx</th>
                <th className="p-2">Vencimento</th>
                <th className="p-2">Sorteio</th>
                <th className="p-2">Assembleia</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin inline" /> Carregando...
                  </td>
                </tr>
              ) : grupos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    Nenhum grupo encontrado
                  </td>
                </tr>
              ) : (
                grupos.map((g) => (
                  <tr key={g.id} className="odd:bg-muted/30">
                    <td className="p-2">{g.administradora}</td>
                    <td className="p-2">{g.segmento}</td>
                    <td className="p-2">{g.codigo}</td>
                    <td className="p-2">{g.faixa_min ?? "—"}</td>
                    <td className="p-2">{g.faixa_max ?? "—"}</td>
                    <td className="p-2">{formatBR(g.prox_vencimento)}</td>
                    <td className="p-2">{formatBR(g.prox_sorteio)}</td>
                    <td className="p-2">{formatBR(g.prox_assembleia)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Overlays */}
      {importOpen && (
        <OverlayGruposImportados
          rows={importRows}
          onClose={() => setImportOpen(false)}
          onSaved={carregar}
        />
      )}
      {asmOpen && (
        <OverlayAssembleias
          gruposBase={grupos}
          onClose={() => setAsmOpen(false)}
          onSaved={carregar}
        />
      )}
      {lfOpen && (
        <OverlayLoteria
          onClose={() => setLfOpen(false)}
          onSaved={(lf) => console.log("Loteria salva", lf)}
        />
      )}
      {ofertaOpen && <OverlayOfertaLance onClose={() => setOfertaOpen(false)} />}
    </div>
  );
}

/* =========================================================
   EDITOR DE GRUPO
   ========================================================= */
function EditorGrupo({
  group,
  onClose,
  onSaved,
}: {
  group?: Grupo | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<Partial<Grupo>>(
    group || {
      administradora: "",
      segmento: "",
      codigo: "",
      participantes: null,
      faixa_min: null,
      faixa_max: null,
      prox_vencimento: null,
      prox_sorteio: null,
      prox_assembleia: null,
      prazo_encerramento_meses: null,
    }
  );

  const isNew = !group?.id;

  const handleSave = async () => {
    try {
      if (isNew) {
        await supabase.from("groups").insert(form);
      } else {
        await supabase.from("groups").update(form).eq("id", group!.id);
      }
      await onSaved();
      onClose();
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Erro ao salvar grupo.");
    }
  };

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label>Administradora</Label>
          <Input
            value={form.administradora ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, administradora: e.target.value }))
            }
          />
        </div>
        <div>
          <Label>Segmento</Label>
          <Input
            value={form.segmento ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, segmento: e.target.value }))
            }
          />
        </div>
        <div>
          <Label>Código</Label>
          <Input
            value={form.codigo ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
          />
        </div>
        <div>
          <Label>Faixa Mín</Label>
          <Input
            type="number"
            value={form.faixa_min ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                faixa_min: e.target.value ? Number(e.target.value) : null,
              }))
            }
          />
        </div>
        <div>
          <Label>Faixa Máx</Label>
          <Input
            type="number"
            value={form.faixa_max ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                faixa_max: e.target.value ? Number(e.target.value) : null,
              }))
            }
          />
        </div>
        <div>
          <Label>Próx. Vencimento</Label>
          <Input
            type="date"
            value={form.prox_vencimento ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                prox_vencimento: e.target.value || null,
              }))
            }
          />
        </div>
        <div>
          <Label>Próx. Sorteio</Label>
          <Input
            type="date"
            value={form.prox_sorteio ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                prox_sorteio: e.target.value || null,
              }))
            }
          />
        </div>
        <div>
          <Label>Próx. Assembleia</Label>
          <Input
            type="date"
            value={form.prox_assembleia ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                prox_assembleia: e.target.value || null,
              }))
            }
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" /> Salvar
        </Button>
      </div>
    </div>
  );
}
