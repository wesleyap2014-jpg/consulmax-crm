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
function normalizeAdmin(raw?: string | null): string {
  const s = (raw ?? "").toLowerCase();
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
function makeStubId(adm?: string | null, grp?: string | number | null) {
  return `stub:${keyDigits(adm, grp)}`;
}
function isStubId(id: string) {
  return id.startsWith("stub:");
}

/* =========================================================
   OVERLAY: LOTERIA FEDERAL
   ========================================================= */
// ... código completo do OverlayLoteria (formulário, save em lottery_draws)

/* =========================================================
   OVERLAY: ASSEMBLEIAS
   ========================================================= */
// ... código completo do OverlayAssembleias (upsert em assemblies e assembly_results)

/* =========================================================
   OVERLAY: GRUPOS IMPORTADOS
   ========================================================= */
// ... código completo do OverlayGruposImportados
// Listar apenas grupos com pelo menos um campo faltando (participantes, faixa_min, faixa_max, prox_vencimento, prox_sorteio, prox_assembleia)

/* =========================================================
   OVERLAY: OFERTA DE LANCE
   ========================================================= */
// ... código completo do OverlayOfertaLance (consulta oferta_lance_all, exportar PDF, tabela)
/* =========================================================
   PÁGINA PRINCIPAL
   ========================================================= */
export default function GestaoDeGrupos() {
  const [loading, setLoading] = useState(true);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<Grupo[]>([]);
  const [asmOpen, setAsmOpen] = useState(false);
  const [lfOpen, setLfOpen] = useState(false);
  const [ofertaOpen, setOfertaOpen] = useState(false);

  const carregar = async () => {
    setLoading(true);
    try {
      // 1) Buscar grupos existentes
      const { data: groupsDb } = await supabase.from("groups").select("*");

      // 2) Buscar vendas encarteiradas e código '00'
      const { data: vend } = await supabase
        .from("vendas")
        .select("administradora, segmento, grupo, status, codigo, contemplada")
        .eq("status", "encarteirada")
        .or("codigo.eq.00,contemplada.eq.false");

      const distinct = new Map<string, Grupo>();
      (vend || []).forEach((v: any) => {
        const k = keyDigits(v.administradora, v.grupo);
        if (!distinct.has(k)) {
          const found = (groupsDb || []).find(
            (g: any) =>
              keyDigits(g.administradora, g.codigo) ===
              keyDigits(v.administradora, v.grupo)
          );
          distinct.set(
            k,
            found || {
              id: makeStubId(v.administradora, v.grupo),
              administradora: normalizeAdmin(v.administradora),
              segmento: v.segmento,
              codigo: v.grupo,
              participantes: null,
              faixa_min: null,
              faixa_max: null,
              prox_vencimento: null,
              prox_sorteio: null,
              prox_assembleia: null,
              prazo_encerramento_meses: null,
            }
          );
        }
      });

      setGrupos(Array.from(distinct.values()));

      // Filtrar grupos incompletos para overlay
      const incompletos = Array.from(distinct.values()).filter(
        (g) =>
          !g.participantes ||
          !g.faixa_min ||
          !g.faixa_max ||
          !g.prox_vencimento ||
          !g.prox_sorteio ||
          !g.prox_assembleia
      );
      setImportRows(incompletos);
    } catch (e: any) {
      console.error(e);
      alert("Erro ao carregar grupos: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const handleSync = async () => {
    await carregar();
    if (importRows.length > 0) setImportOpen(true);
  };

  return (
    <div className="p-4 space-y-6">
      {/* Cabeçalho */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Gestão de Grupos</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleSync}>
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" /> Adicionar
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Visão consolidada por grupo: resultados de assembleias, filtros e
        referência do sorteio.
      </p>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Loteria Federal</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" onClick={() => setLfOpen(true)}>
              <Percent className="h-4 w-4 mr-2" /> Informar Resultados
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Assembleias</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" onClick={() => setAsmOpen(true)}>
              <Settings className="h-4 w-4 mr-2" /> Informar Resultados
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Oferta de Lance</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" onClick={() => setOfertaOpen(true)}>
              <Target className="h-4 w-4 mr-2" /> Abrir
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Relação de Grupos */}
      <div>
        <h2 className="text-base font-semibold mb-2">Relação de Grupos</h2>
        <div className="overflow-auto rounded-2xl border">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="p-2">Administradora</th>
                <th className="p-2">Segmento</th>
                <th className="p-2">Grupo</th>
                <th className="p-2">Participantes</th>
                <th className="p-2">Faixa Crédito</th>
                <th className="p-2 bg-muted/30" colSpan={2}>
                  25%
                </th>
                <th className="p-2 bg-muted/30" colSpan={2}>
                  50%
                </th>
                <th className="p-2 bg-muted/30" colSpan={3}>
                  LL
                </th>
                <th className="p-2">Vencimento</th>
                <th className="p-2">Sorteio</th>
                <th className="p-2">Assembleia</th>
              </tr>
              <tr>
                <th></th>
                <th></th>
                <th></th>
                <th></th>
                <th></th>
                <th>Entregas</th>
                <th>Ofertas</th>
                <th>Entregas</th>
                <th>Ofertas</th>
                <th>Maior %</th>
                <th>Menor %</th>
                <th>Mediana</th>
                <th></th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={15} className="p-6 text-center">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin inline" />
                    Carregando...
                  </td>
                </tr>
              ) : grupos.length === 0 ? (
                <tr>
                  <td colSpan={15} className="p-6 text-center">
                    Nenhum grupo encontrado
                  </td>
                </tr>
              ) : (
                grupos.map((g) => (
                  <tr key={g.id} className="odd:bg-muted/30">
                    <td className="p-2">{g.administradora}</td>
                    <td className="p-2">{g.segmento}</td>
                    <td className="p-2">{g.codigo}</td>
                    <td className="p-2">{g.participantes ?? "—"}</td>
                    <td className="p-2">
                      {g.faixa_min && g.faixa_max
                        ? `${g.faixa_min} - ${g.faixa_max}`
                        : "—"}
                    </td>
                    <td className="p-2">—</td>
                    <td className="p-2">—</td>
                    <td className="p-2">—</td>
                    <td className="p-2">—</td>
                    <td className="p-2">—</td>
                    <td className="p-2">—</td>
                    <td className="p-2">—</td>
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
      {lfOpen && <OverlayLoteria onClose={() => setLfOpen(false)} onSaved={() => {}} />}
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
      alert("Erro ao salvar grupo: " + e.message);
    }
  };

  return (
    <div className="border rounded-xl p-4 space-y-4">
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
          <Label>Participantes</Label>
          <Input
            type="number"
            value={form.participantes ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                participantes: e.target.value
                  ? Number(e.target.value)
                  : null,
              }))
            }
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
