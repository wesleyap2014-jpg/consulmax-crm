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

function withinLLMedianFilter(
  mediana: number | null | undefined,
  alvo: number | null
): boolean {
  if (alvo == null) return true;
  if (mediana == null) return false;
  const min = Math.max(0, alvo * 0.7); // ±30%
  const max = alvo * 1.3;
  return mediana >= min && mediana <= max;
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

function sameDay(
  a: string | Date | null | undefined,
  b: string | Date | null | undefined
): boolean {
  const A = toYMD(a);
  const B = toYMD(b);
  return !!A && !!B && A === B;
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
  const cleaned = s
    .replace(/consorcios?|consorcio|holding|sa|s\/a|s\.a\.?/g, "")
    .replace(/[^\w]/g, "")
    .trim();
  if (cleaned.includes("embracon")) return "Embracon";
  if (cleaned.includes("hs")) return "HS";
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
function keyRaw(adm?: string | null, grp?: string | number | null) {
  return `${normalizeAdmin(adm)}::${String(grp ?? "").trim()}`;
}

/* ===== stubs (grupos vindos de vendas sem cadastro em groups) ===== */

function isStubId(id: string) {
  return id.startsWith("stub:");
}
function makeStubId(adm?: string | null, grp?: string | number | null) {
  return `stub:${keyDigits(adm, grp)}`;
}
/* =========================================================
   REFERÊNCIA POR BILHETES (para grade principal)
   ========================================================= */
function referenciaPorAdministradora(params: {
  administradora: Administradora;
  participantes: number | null | undefined;
  bilhetes: LoteriaFederal | null;
}): number | null {
  const { administradora, participantes, bilhetes } = params;
  if (!participantes || participantes <= 0 || !bilhetes) return null;

  const premios = [
    bilhetes.primeiro,
    bilhetes.segundo,
    bilhetes.terceiro,
    bilhetes.quarto,
    bilhetes.quinto,
  ];

  function reduceByCap(n: number, cap: number): number {
    if (cap <= 0) return 0;
    let v = n;
    while (v > cap) v -= cap;
    if (v === 0) v = cap;
    return v;
  }

  function tryTresUltimosOuInicio(num5: string, cap: number): number | null {
    const ult3 = parseInt(num5.slice(-3));
    if (ult3 >= 1 && ult3 <= cap) return ult3;
    const alt = parseInt(num5.slice(0, 3));
    if (alt >= 1 && alt <= cap) return alt;
    return null;
  }

  for (const premio of premios) {
    const p5 = sanitizeBilhete5(premio);

    if (administradora.toLowerCase() === "embracon") {
      if (participantes <= 1000) {
        const tentativa = tryTresUltimosOuInicio(p5, participantes);
        if (tentativa != null) return tentativa;
        continue;
      } else if (participantes >= 5000) {
        const quatro = parseInt(p5.slice(-4));
        const ajustado = reduceByCap(quatro, 5000);
        if (ajustado >= 1 && ajustado <= 5000) return ajustado;
        continue;
      } else {
        const quatro = parseInt(p5.slice(-4));
        return reduceByCap(quatro, participantes);
      }
    }

    if (administradora.toLowerCase() === "hs") {
      const quatro = parseInt(p5.slice(-4));
      return reduceByCap(quatro, participantes);
    }

    const tres = parseInt(p5.slice(-3));
    return reduceByCap(tres, participantes);
  }

  return null;
}

/* =========================================================
   OVERLAY: ATUALIZAR (só grupos com campos faltantes)
   ========================================================= */
function OverlayAtualizar({
  rows,
  onClose,
  onSaved,
}: {
  rows: Grupo[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [dados, setDados] = useState<Grupo[]>(rows);
  const [saving, setSaving] = useState(false);

  const upd = (id: string, campo: keyof Grupo, val: any) => {
    setDados((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [campo]: val } : r))
    );
  };

  const canSave = dados.length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      setSaving(true);
      await Promise.all(
        dados.map((r) =>
          supabase.from("groups").upsert({
            id: isStubId(r.id) ? undefined : r.id,
            administradora: r.administradora,
            segmento: r.segmento,
            codigo: r.codigo,
            participantes: r.participantes,
            faixa_min: r.faixa_min,
            faixa_max: r.faixa_max,
            prox_vencimento: r.prox_vencimento,
            prox_sorteio: r.prox_sorteio,
            prox_assembleia: r.prox_assembleia,
            prazo_encerramento_meses: r.prazo_encerramento_meses,
          })
        )
      );
      await supabase.rpc("refresh_gestao_mv");
      await onSaved();
      alert("Grupos atualizados com sucesso!");
      onClose();
    } catch (e: any) {
      alert(e.message ?? "Erro ao salvar grupos.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-white shadow-xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Atualizar Grupos
          </h2>
          <Button variant="secondary" onClick={onClose}>
            <X className="h-4 w-4" /> Fechar
          </Button>
        </div>
        <div className="p-5 flex-1 overflow-auto">
          {dados.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Nenhum grupo com dados faltantes.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/70">
                <tr>
                  <th className="p-2 text-left">Administradora</th>
                  <th className="p-2 text-left">Grupo</th>
                  <th className="p-2 text-center">Participantes</th>
                  <th className="p-2 text-center">Faixa</th>
                  <th className="p-2 text-center">Vencimento</th>
                  <th className="p-2 text-center">Sorteio</th>
                  <th className="p-2 text-center">Assembleia</th>
                </tr>
              </thead>
              <tbody>
                {dados.map((r) => (
                  <tr key={r.id} className="odd:bg-muted/30">
                    <td className="p-2">{r.administradora}</td>
                    <td className="p-2 font-medium">{r.codigo}</td>
                    <td className="p-2 text-center">
                      <Input
                        type="number"
                        value={r.participantes ?? ""}
                        onChange={(e) =>
                          upd(
                            r.id,
                            "participantes",
                            e.target.value === "" ? null : Number(e.target.value)
                          )
                        }
                      />
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex gap-1">
                        <Input
                          type="number"
                          placeholder="mín"
                          value={r.faixa_min ?? ""}
                          onChange={(e) =>
                            upd(
                              r.id,
                              "faixa_min",
                              e.target.value === ""
                                ? null
                                : Number(e.target.value)
                            )
                          }
                        />
                        <Input
                          type="number"
                          placeholder="máx"
                          value={r.faixa_max ?? ""}
                          onChange={(e) =>
                            upd(
                              r.id,
                              "faixa_max",
                              e.target.value === ""
                                ? null
                                : Number(e.target.value)
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
          )}
        </div>
        <div className="px-5 pb-4 flex justify-end">
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Save className="h-4 w-4 mr-2" /> Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   OVERLAY: LOTERIA FEDERAL
   ========================================================= */
function OverlayLoteria({
  onClose,
  onSaved,
  initialDate,
}: {
  onClose: () => void;
  onSaved: (lf: LoteriaFederal) => void;
  initialDate?: string;
}) {
  const [data, setData] = useState<string>(initialDate || "");
  const [form, setForm] = useState<LoteriaFederal>({
    data_sorteio: initialDate || "",
    primeiro: "",
    segundo: "",
    terceiro: "",
    quarto: "",
    quinto: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!data) return;
      const { data: d, error } = await supabase
        .from("lottery_draws")
        .select("*")
        .eq("draw_date", data)
        .single();
      if (error && error.code !== "PGRST116") console.error(error);
      if (d) {
        setForm({
          data_sorteio: data,
          primeiro: d.first,
          segundo: d.second,
          terceiro: d.third,
          quarto: d.fourth,
          quinto: d.fifth,
        });
      } else {
        setForm((f) => ({
          ...f,
          data_sorteio: data,
          primeiro: "",
          segundo: "",
          terceiro: "",
          quarto: "",
          quinto: "",
        }));
      }
    })();
  }, [data]);

  const canSave =
    Boolean(data) &&
    Boolean(form.primeiro) &&
    Boolean(form.segundo) &&
    Boolean(form.terceiro) &&
    Boolean(form.quarto) &&
    Boolean(form.quinto);

  const handleSave = async () => {
    if (!canSave) return;
    try {
      setLoading(true);
      await supabase.from("lottery_draws").upsert({
        draw_date: data,
        first: form.primeiro,
        second: form.segundo,
        third: form.terceiro,
        fourth: form.quarto,
        fifth: form.quinto,
      });
      onSaved({ ...form, data_sorteio: data });
      onClose();
    } catch {
      alert("Erro ao salvar o resultado da Loteria.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Informar resultados – Loteria Federal
          </h2>
          <Button variant="secondary" onClick={onClose} className="gap-2">
            <X className="h-4 w-4" /> Fechar
          </Button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <Label>Data do sorteio</Label>
            <Input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              ["primeiro", "Primeiro Prêmio"],
              ["segundo", "Segundo Prêmio"],
              ["terceiro", "Terceiro Prêmio"],
              ["quarto", "Quarto Prêmio"],
              ["quinto", "Quinto Prêmio"],
            ].map(([key, label]) => (
              <div key={key} className="flex flex-col gap-1">
                <Label>{label}</Label>
                <Input
                  maxLength={6}
                  inputMode="numeric"
                  pattern="\d*"
                  placeholder="00000"
                  value={(form as any)[key]}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      [key]: sanitizeBilhete5(e.target.value),
                    }))
                  }
                />
                <span className="text-xs text-muted-foreground">
                  5 dígitos; se digitar 6, guarda os últimos 5.
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button disabled={!canSave || loading} onClick={handleSave}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
/* =========================================================
   OVERLAY: ASSEMBLEIAS
   ========================================================= */
type LinhaAsm = {
  group_id: string;
  codigo: string;
  fix25_entregas: number;
  fix25_ofertas: number;
  fix50_entregas: number;
  fix50_ofertas: number;
  ll_entregas: number;
  ll_ofertas: number;
  ll_maior: number | null;
  ll_menor: number | null;
  prazo_enc_meses: number | null;
};

function OverlayAssembleias({
  gruposBase,
  onClose,
  onSaved,
}: {
  gruposBase: Grupo[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [date, setDate] = useState<string>("");
  const [adminSel, setAdminSel] = useState<string>("");
  const [nextDue, setNextDue] = useState<string>("");
  const [nextDraw, setNextDraw] = useState<string>("");
  const [nextAsm, setNextAsm] = useState<string>("");

  const [linhas, setLinhas] = useState<LinhaAsm[]>([]);
  const [loading, setLoading] = useState(false);

  const administradoras = useMemo(
    () => Array.from(new Set(gruposBase.map((g) => g.administradora))).sort(),
    [gruposBase]
  );

  useEffect(() => {
    if (!date) {
      setLinhas([]);
      return;
    }
    const subset = gruposBase
      .filter((g) => !isStubId(g.id))
      .filter(
        (g) =>
          sameDay(g.prox_assembleia, date) &&
          (!adminSel || g.administradora === adminSel)
      )
      .map<LinhaAsm>((g) => ({
        group_id: g.id,
        codigo: g.codigo,
        fix25_entregas: 0,
        fix25_ofertas: 0,
        fix50_entregas: 0,
        fix50_ofertas: 0,
        ll_entregas: 0,
        ll_ofertas: 0,
        ll_maior: null,
        ll_menor: null,
        prazo_enc_meses: g.prazo_encerramento_meses ?? null,
      }));
    setLinhas(subset);
  }, [date, adminSel, gruposBase]);

  const upd = (id: string, campo: keyof LinhaAsm, val: number | null) => {
    setLinhas((prev) =>
      prev.map((r) => (r.group_id === id ? { ...r, [campo]: val } : r))
    );
  };

  const podeSalvar = Boolean(date) && linhas.length > 0;

  const handleSave = async () => {
    if (!podeSalvar) {
      alert("Verifique data, administradora e os grupos listados.");
      return;
    }
    try {
      setLoading(true);

      const { data: assem, error: errAsm } = await supabase
        .from("assemblies")
        .upsert(
          {
            date,
            next_due_date: nextDue || null,
            next_draw_date: nextDraw || null,
            next_assembly_date: nextAsm || null,
            remaining_meetings: null,
          },
          { onConflict: "date" }
        )
        .select()
        .single();

      if (errAsm) throw errAsm;

      const payload = linhas.map((r) => ({
        assembly_id: assem!.id,
        group_id: r.group_id,
        date,
        fixed25_offers: r.fix25_ofertas ?? 0,
        fixed25_deliveries: r.fix25_entregas ?? 0,
        fixed50_offers: r.fix50_ofertas ?? 0,
        fixed50_deliveries: r.fix50_entregas ?? 0,
        ll_offers: r.ll_ofertas ?? 0,
        ll_deliveries: r.ll_entregas ?? 0,
        ll_high: r.ll_maior,
        ll_low: r.ll_menor,
        median: calcMediana(r.ll_maior, r.ll_menor),
      }));

      const { error: errRes } = await supabase
        .from("assembly_results")
        .upsert(payload, { onConflict: "assembly_id,group_id" });
      if (errRes) throw errRes;

      await Promise.all(
        linhas.map((l) =>
          supabase
            .from("groups")
            .update({
              prox_vencimento: nextDue || null,
              prox_sorteio: nextDraw || null,
              prox_assembleia: nextAsm || null,
              prazo_encerramento_meses: l.prazo_enc_meses ?? null,
            })
            .eq("id", l.group_id)
        )
      );

      try {
        await supabase.rpc("refresh_gestao_mv");
      } catch {}

      await onSaved();
      alert("Resultados salvos com sucesso!");
      onClose();
    } catch (e: any) {
      console.error(e);
      alert(e.message ?? "Erro ao salvar os resultados.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl rounded-2xl bg-white shadow-xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Settings className="h-5 w-5" /> Informar resultados da Assembleia
          </h2>
          <Button variant="secondary" onClick={onClose} className="gap-2">
            <X className="h-4 w-4" /> Fechar
          </Button>
        </div>

        <div className="p-5 space-y-5 overflow-hidden">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Data da Assembleia</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-2">
                <Label>Ocorrida em</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="md:col-span-3">
                <Label>Administradora (opcional)</Label>
                <select
                  value={adminSel}
                  onChange={(e) => setAdminSel(e.target.value)}
                  className="w-full h-10 rounded-md border px-3 text-sm"
                >
                  <option value="">Todas</option>
                  {administradoras.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Informe os dados da próxima assembleia
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Próximo Vencimento</Label>
                <Input
                  type="date"
                  value={nextDue}
                  onChange={(e) => setNextDue(e.target.value)}
                />
              </div>
              <div>
                <Label>Próximo Sorteio</Label>
                <Input
                  type="date"
                  value={nextDraw}
                  onChange={(e) => setNextDraw(e.target.value)}
                />
              </div>
              <div>
                <Label>Próxima Assembleia</Label>
                <Input
                  type="date"
                  value={nextAsm}
                  onChange={(e) => setNextAsm(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="flex-1 min-h-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Grupos dessa assembleia</CardTitle>
            </CardHeader>
            <CardContent className="h-full flex flex-col">
              {!date || linhas.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {date
                    ? "Nenhum grupo encontrado com os filtros selecionados."
                    : "Informe a data para listar os grupos."}
                </div>
              ) : (
                <div className="flex-1 min-h-0 rounded-xl border overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                      <tr>
                        <th className="p-2 text-left">Grupo</th>
                        <th className="p-2 text-center">25% Entregas</th>
                        <th className="p-2 text-center">25% Ofertas</th>
                        <th className="p-2 text-center">50% Entregas</th>
                        <th className="p-2 text-center">50% Ofertas</th>
                        <th className="p-2 text-center">LL Entregas</th>
                        <th className="p-2 text-center">LL Ofertas</th>
                        <th className="p-2 text-center">LL Maior %</th>
                        <th className="p-2 text-center">LL Menor %</th>
                        <th className="p-2 text-center">Pz Enc (meses)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((l) => (
                        <tr key={l.group_id} className="odd:bg-muted/30">
                          <td className="p-2 font-medium">{l.codigo}</td>
                          <td className="p-1 text-center">
                            <Input
                              type="number"
                              min={0}
                              value={l.fix25_entregas}
                              onChange={(e) =>
                                upd(l.group_id, "fix25_entregas", Number(e.target.value))
                              }
                            />
                          </td>
                          <td className="p-1 text-center">
                            <Input
                              type="number"
                              min={0}
                              value={l.fix25_ofertas}
                              onChange={(e) =>
                                upd(l.group_id, "fix25_ofertas", Number(e.target.value))
                              }
                            />
                          </td>
                          <td className="p-1 text-center">
                            <Input
                              type="number"
                              min={0}
                              value={l.fix50_entregas}
                              onChange={(e) =>
                                upd(l.group_id, "fix50_entregas", Number(e.target.value))
                              }
                            />
                          </td>
                          <td className="p-1 text-center">
                            <Input
                              type="number"
                              min={0}
                              value={l.fix50_ofertas}
                              onChange={(e) =>
                                upd(l.group_id, "fix50_ofertas", Number(e.target.value))
                              }
                            />
                          </td>
                          <td className="p-1 text-center">
                            <Input
                              type="number"
                              min={0}
                              value={l.ll_entregas}
                              onChange={(e) =>
                                upd(l.group_id, "ll_entregas", Number(e.target.value))
                              }
                            />
                          </td>
                          <td className="p-1 text-center">
                            <Input
                              type="number"
                              min={0}
                              value={l.ll_ofertas}
                              onChange={(e) =>
                                upd(l.group_id, "ll_ofertas", Number(e.target.value))
                              }
                            />
                          </td>
                          <td className="p-1 text-center">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={l.ll_maior ?? ""}
                              onChange={(e) =>
                                upd(
                                  l.group_id,
                                  "ll_maior",
                                  e.target.value === "" ? null : Number(e.target.value)
                                )
                              }
                            />
                          </td>
                          <td className="p-1 text-center">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={l.ll_menor ?? ""}
                              onChange={(e) =>
                                upd(
                                  l.group_id,
                                  "ll_menor",
                                  e.target.value === "" ? null : Number(e.target.value)
                                )
                              }
                            />
                          </td>
                          <td className="p-1 text-center">
                            <Input
                              type="number"
                              min={0}
                              value={l.prazo_enc_meses ?? ""}
                              onChange={(e) =>
                                upd(
                                  l.group_id,
                                  "prazo_enc_meses",
                                  e.target.value === "" ? null : Number(e.target.value)
                                )
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end pt-3">
                <Button disabled={!podeSalvar || loading} onClick={handleSave}>
                  {loading && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  <Save className="h-4 w-4 mr-2" /> Salvar Resultados
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   OVERLAY: OFERTA DE LANCE (usa a view oferta_lance_all)
   ========================================================= */
type OfertaRow = {
  administradora: string;
  grupo: string;
  cota: string | null;
  referencia: string | null;
  participantes: number | null;
  mediana: number | null;
  contemplados: number | null;
};

async function fetchVendasForOferta(dateYMD: string): Promise<OfertaRow[]> {
  const { data, error } = await supabase
    .from("oferta_lance_all")
    .select(
      "administradora,grupo,cota,referencia,participantes,mediana,contemplados"
    )
    .eq("assembleia", dateYMD)
    .order("administradora", { ascending: true })
    .order("grupo", { ascending: true })
    .order("cota", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    administradora: r.administradora,
    grupo: String(r.grupo),
    cota: r.cota != null ? String(r.cota) : null,
    referencia: r.referencia,
    participantes: r.participantes,
    mediana: r.mediana,
    contemplados: r.contemplados,
  }));
}
function OverlayOfertaLance({ onClose }: { onClose: () => void }) {
  const [dataAsm, setDataAsm] = useState<string>("");
  const [linhas, setLinhas] = useState<OfertaRow[]>([]);
  const [loading, setLoading] = useState(false);

  const listar = async () => {
    const ymd = toYMD(dataAsm);
    if (!ymd) {
      setLinhas([]);
      return;
    }
    try {
      setLoading(true);
      const items = await fetchVendasForOferta(ymd);
      setLinhas(items);
    } catch (e: any) {
      alert(e.message ?? "Falha ao listar oferta de lance.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl rounded-2xl bg-white shadow-xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Target className="h-5 w-5" /> Oferta de Lance
          </h2>
          <Button variant="secondary" onClick={onClose} className="gap-2">
            <X className="h-4 w-4" /> Fechar
          </Button>
        </div>

        <div className="p-5 space-y-4 overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex-1">
              <Label>Data da Assembleia</Label>
              <Input
                type="date"
                value={dataAsm}
                onChange={(e) => setDataAsm(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={listar} disabled={!dataAsm || loading}>
                {loading && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Listar
              </Button>
            </div>
          </div>

          <div className="rounded-xl border overflow-auto">
            <table className="min-w-[920px] w-full text-sm">
              <thead className="sticky top-0 bg-muted/60">
                <tr>
                  <th className="p-2 text-left">Administradora</th>
                  <th className="p-2 text-left">Grupo</th>
                  <th className="p-2 text-left">Cota</th>
                  <th className="p-2 text-left">Referência</th>
                  <th className="p-2 text-left">Participantes</th>
                  <th className="p-2 text-left">Mediana</th>
                  <th className="p-2 text-left">Contemplados</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                      Carregando…
                    </td>
                  </tr>
                ) : linhas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                ) : (
                  linhas.map((o, i) => (
                    <tr
                      key={`${o.administradora}-${o.grupo}-${o.cota}-${i}`}
                      className="odd:bg-muted/30"
                    >
                      <td className="p-2">{o.administradora}</td>
                      <td className="p-2">{o.grupo}</td>
                      <td className="p-2">{o.cota ?? "—"}</td>
                      <td className="p-2">{o.referencia ?? "—"}</td>
                      <td className="p-2">{o.participantes ?? "—"}</td>
                      <td className="p-2">
                        {o.mediana != null ? toPct4(o.mediana) : "—"}
                      </td>
                      <td className="p-2">{o.contemplados ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   PÁGINA PRINCIPAL
   ========================================================= */
export default function GestaoDeGrupos() {
  const [loading, setLoading] = useState(true);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [lfOpen, setLfOpen] = useState(false);
  const [asmOpen, setAsmOpen] = useState(false);
  const [ofertaOpen, setOfertaOpen] = useState(false);

  const carregar = async () => {
    setLoading(true);

    // grupos cadastrados
    const { data: g } = await supabase.from("groups").select("*");
    const groupsAll: Grupo[] =
      g?.map((r: any) => ({
        id: r.id,
        administradora: r.administradora,
        segmento: r.segmento,
        codigo: r.codigo,
        participantes: r.participantes,
        faixa_min: r.faixa_min,
        faixa_max: r.faixa_max,
        prox_vencimento: r.prox_vencimento,
        prox_sorteio: r.prox_sorteio,
        prox_assembleia: r.prox_assembleia,
        prazo_encerramento_meses: r.prazo_encerramento_meses,
      })) ?? [];

    // novos grupos de vendas (encarteiradas e codigo=00)
    const { data: vend } = await supabase
      .from("vendas")
      .select("administradora, segmento, grupo, status, codigo, contemplada")
      .eq("status", "encarteirada")
      .eq("codigo", "00")
      .eq("contemplada", false);

    const distinct = new Map<
      string,
      { administradora: string; segmento: string; grupo: string }
    >();
    (vend || []).forEach((v: any) => {
      const k = keyDigits(v.administradora, v.grupo);
      if (!distinct.has(k))
        distinct.set(k, {
          administradora: normalizeAdmin(v.administradora),
          segmento: v.segmento,
          grupo: v.grupo,
        });
    });

    const base: Grupo[] = [];
    for (const { administradora, segmento, grupo } of distinct.values()) {
      const k = keyDigits(administradora, grupo);
      const hit = groupsAll.find(
        (gr) => keyDigits(gr.administradora, gr.codigo) === k
      );
      if (hit) base.push(hit);
      else
        base.push({
          id: makeStubId(administradora, grupo),
          administradora,
          segmento,
          codigo: String(grupo),
          participantes: null,
          faixa_min: null,
          faixa_max: null,
          prox_vencimento: null,
          prox_sorteio: null,
          prox_assembleia: null,
          prazo_encerramento_meses: null,
        });
    }

    setGrupos(base);
    setLoading(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const handleSync = () => {
    setImportOpen(true);
  };
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Cabeçalho com cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <Card className="lg:col-span-3">
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-xl">Gestão de Grupos</CardTitle>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleSync}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Adicionar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Visão consolidada por grupo: resultados de assembleias, filtros e
            referência do sorteio.
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Loteria Federal</CardTitle>
            <Button variant="secondary" onClick={() => setLfOpen(true)}>
              <Percent className="h-4 w-4 mr-1" /> Informar resultados
            </Button>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Cadastro de resultados da Loteria Federal.
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Assembleias</CardTitle>
            <Button variant="secondary" onClick={() => setAsmOpen(true)}>
              <Settings className="h-4 w-4 mr-1" /> Informar resultados
            </Button>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Cadastro dos resultados das assembleias.
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Oferta de Lance</CardTitle>
            <Button variant="secondary" onClick={() => setOfertaOpen(true)}>
              <Target className="h-4 w-4 mr-1" /> Abrir
            </Button>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Consulta consolidada das ofertas de lance.
          </CardContent>
        </Card>
      </div>

      {/* Tabela de grupos */}
      <div className="rounded-2xl border overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-muted/40 text-xs">
              <th className="p-2" colSpan={6}></th>
              <th className="p-2 text-center bg-muted/20" colSpan={2}>
                25%
              </th>
              <th className="p-2 text-center bg-muted/20" colSpan={2}>
                50%
              </th>
              <th className="p-2 text-center bg-muted/20" colSpan={5}>
                LL
              </th>
              <th className="p-2" colSpan={5}></th>
            </tr>
            <tr className="bg-muted/60 text-xs">
              <th className="p-2 text-left">Administradora</th>
              <th className="p-2 text-left">Segmento</th>
              <th className="p-2 text-left">Grupo</th>
              <th className="p-2 text-center">Participantes</th>
              <th className="p-2 text-center">Faixa de Crédito</th>
              <th className="p-2 text-center">Total Entregas</th>
              <th className="p-2 text-center">Entregas</th>
              <th className="p-2 text-center">Ofertas</th>
              <th className="p-2 text-center">Entregas</th>
              <th className="p-2 text-center">Ofertas</th>
              <th className="p-2 text-center">Entregas</th>
              <th className="p-2 text-center">Ofertas</th>
              <th className="p-2 text-center">Maior %</th>
              <th className="p-2 text-center">Menor %</th>
              <th className="p-2 text-center">Mediana</th>
              <th className="p-2 text-center">Prazo Enc.</th>
              <th className="p-2 text-center">Vencimento</th>
              <th className="p-2 text-center">Sorteio</th>
              <th className="p-2 text-center">Assembleia</th>
              <th className="p-2 text-center">Referência</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={20} className="p-6 text-center">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                  Carregando…
                </td>
              </tr>
            ) : grupos.length === 0 ? (
              <tr>
                <td colSpan={20} className="p-6 text-center">
                  Nenhum grupo encontrado.
                </td>
              </tr>
            ) : (
              grupos.map((g) => (
                <tr key={g.id} className="odd:bg-muted/20">
                  <td className="p-2">{g.administradora}</td>
                  <td className="p-2">{g.segmento}</td>
                  <td className="p-2 font-medium">{g.codigo}</td>
                  <td className="p-2 text-center">{g.participantes ?? "—"}</td>
                  <td className="p-2 text-center">
                    {g.faixa_min && g.faixa_max
                      ? `${g.faixa_min} — ${g.faixa_max}`
                      : "—"}
                  </td>
                  <td className="p-2 text-center">—</td>
                  <td className="p-2 text-center">—</td>
                  <td className="p-2 text-center">—</td>
                  <td className="p-2 text-center">—</td>
                  <td className="p-2 text-center">—</td>
                  <td className="p-2 text-center">—</td>
                  <td className="p-2 text-center">—</td>
                  <td className="p-2 text-center">—</td>
                  <td className="p-2 text-center">—</td>
                  <td className="p-2 text-center">—</td>
                  <td className="p-2 text-center">
                    {g.prazo_encerramento_meses ?? "—"}
                  </td>
                  <td className="p-2 text-center">{formatBR(g.prox_vencimento)}</td>
                  <td className="p-2 text-center">{formatBR(g.prox_sorteio)}</td>
                  <td className="p-2 text-center">{formatBR(g.prox_assembleia)}</td>
                  <td className="p-2 text-center">—</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Overlays */}
      {importOpen && (
        <OverlayGruposImportados
          rows={[]}
          onClose={() => setImportOpen(false)}
          onSaved={carregar}
        />
      )}
      {lfOpen && (
        <OverlayLoteria
          onClose={() => setLfOpen(false)}
          onSaved={() => carregar()}
        />
      )}
      {asmOpen && (
        <OverlayAssembleias
          gruposBase={grupos}
          onClose={() => setAsmOpen(false)}
          onSaved={carregar}
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

  const salvar = async () => {
    if (!form.codigo || !form.administradora) {
      alert("Preencha administradora e grupo.");
      return;
    }
    if (!group) {
      await supabase.from("groups").insert(form);
    } else {
      await supabase.from("groups").update(form).eq("id", group.id);
    }
    await onSaved();
    onClose();
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
          <Label>Grupo</Label>
          <Input
            value={form.codigo ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={salvar}>
          <Save className="h-4 w-4 mr-2" /> Salvar
        </Button>
      </div>
    </div>
  );
}
