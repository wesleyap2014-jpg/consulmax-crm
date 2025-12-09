// src/pages/GestaoDeGrupos.tsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Filter as FilterIcon,
  Percent,
  Pencil,
  Save,
  Settings,
  X,
  Target,
  ChevronUp,
  ChevronDown,
  Bell,
} from "lucide-react";

/* =========================================================
   TIPOS
   ========================================================= */

type Administradora = "Embracon" | "HS" | "Maggi" | string;

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
  codigo: string; // ex.: 1234/5
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

function withinLLMedianFilter(mediana: number | null | undefined, alvo: number | null): boolean {
  if (alvo == null) return true;
  if (mediana == null) return false;
  const min = Math.max(0, alvo * 0.7); // ±30%
  const max = alvo * 1.3;
  return mediana >= min && mediana <= max;
}

/** Converte qualquer coisa em 'YYYY-MM-DD'. */
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

function sameDay(a: string | Date | null | undefined, b: string | Date | null | undefined): boolean {
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
  const str = Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return `${str}%`;
}

function todayYMDLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  if (cleaned.includes("maggi")) return "Maggi";
  return (raw ?? "").toString().trim();
}
/** pega somente o número-base do grupo (antes de /, -, espaço) */
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

/* ===== stubs ===== */
function isStubId(id: string) {
  return id.startsWith("stub:");
}
function makeStubId(adm?: string | null, grp?: string | number | null) {
  return `stub:${keyDigits(adm, grp)}`;
}

/* =========================================================
   REFERÊNCIA POR BILHETES (inclui regra Maggi)
   ========================================================= */

function referenciaPorAdministradora(params: {
  administradora: Administradora;
  participantes: number | null | undefined;
  bilhetes: LoteriaFederal | null;
}): number | null {
  const { administradora, participantes, bilhetes } = params;
  if (!participantes || participantes <= 0 || !bilhetes) return null;

  const premios = [bilhetes.primeiro, bilhetes.segundo, bilhetes.terceiro, bilhetes.quarto, bilhetes.quinto];

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

    const adm = administradora.toLowerCase();

    // MAGGI — "último milhar" (4 últimos dígitos) reduzindo por participantes
    if (adm === "maggi") {
      const milhar = parseInt(p5.slice(-4));
      return reduceByCap(milhar, participantes);
    }

    if (adm === "embracon") {
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

    if (adm === "hs") {
      const quatro = parseInt(p5.slice(-4));
      return reduceByCap(quatro, participantes);
    }

    const tres = parseInt(p5.slice(-3));
    return reduceByCap(tres, participantes);
  }

  return null;
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
      const { data: d, error } = await supabase.from("lottery_draws").select("*").eq("draw_date", data).single();
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
        setForm((f) => ({ ...f, data_sorteio: data, primeiro: "", segundo: "", terceiro: "", quarto: "", quinto: "" }));
      }
    })();
  }, [data]);

  const canSave =
    Boolean(data) && Boolean(form.primeiro) && Boolean(form.segundo) && Boolean(form.terceiro) && Boolean(form.quarto) && Boolean(form.quinto);

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
          <h2 className="text-lg font-semibold inline-flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Informar resultados – Loteria Federal
          </h2>
          <Button variant="secondary" onClick={onClose} className="inline-flex items-center gap-2">
            <X className="h-4 w-4" /> Fechar
          </Button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <Label>Data do sorteio</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              ["primeiro", "Primeiro Prêmio"],
              ["segundo", "Segundo Prêmio"],
              ["terceiro", "Terceiro Prêmio"],
              ["quarto", "Quarto Prêmio"],
              ["quinto", "Quinto Prêmio"],
            ] as const).map(([key, label]) => (
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
                <span className="text-xs text-muted-foreground">5 dígitos; se digitar 6, guarda os últimos 5.</span>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button disabled={!canSave || loading} onClick={handleSave} className="inline-flex items-center gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" /> Salvar
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
      .filter((g) => sameDay(g.prox_assembleia, date) && (!adminSel || g.administradora === adminSel))
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
    setLinhas((prev) => prev.map((r) => (r.group_id === id ? { ...r, [campo]: val } : r)));
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
          <h2 className="text-xl font-semibold inline-flex items-center gap-2">
            <Settings className="h-5 w-5" /> Informar resultados da Assembleia
          </h2>
          <Button variant="secondary" onClick={onClose} className="inline-flex items-center gap-2">
            <X className="h-4 w-4" /> Fechar
          </Button>
        </div>

        {/* AQUI: área rolável */}
        <div className="p-5 space-y-5 flex-1 min-h-0 overflow-y-auto">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Data da Assembleia</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-2">
                <Label>Ocorrida em</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">Selecione para reduzir a lista (opcional).</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Informe os dados da próxima assembleia</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Próximo Vencimento</Label><Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} /></div>
              <div><Label>Próximo Sorteio</Label><Input type="date" value={nextDraw} onChange={(e) => setNextDraw(e.target.value)} /></div>
              <div><Label>Próxima Assembleia</Label><Input type="date" value={nextAsm} onChange={(e) => setNextAsm(e.target.value)} /></div>
            </CardContent>
          </Card>

          <Card className="flex-1 min-h-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Grupos dessa assembleia</CardTitle>
            </CardHeader>
            <CardContent className="h-full flex flex-col">
              {!date || linhas.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {date ? "Nenhum grupo encontrado com os filtros selecionados." : "Informe a data para listar os grupos."}
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
                          <td className="p-1 text-center"><Input type="number" min={0} value={l.fix25_entregas} onChange={(e) => upd(l.group_id, "fix25_entregas", Number(e.target.value))} /></td>
                          <td className="p-1 text-center"><Input type="number" min={0} value={l.fix25_ofertas} onChange={(e) => upd(l.group_id, "fix25_ofertas", Number(e.target.value))} /></td>
                          <td className="p-1 text-center"><Input type="number" min={0} value={l.fix50_entregas} onChange={(e) => upd(l.group_id, "fix50_entregas", Number(e.target.value))} /></td>
                          <td className="p-1 text-center"><Input type="number" min={0} value={l.fix50_ofertas} onChange={(e) => upd(l.group_id, "fix50_ofertas", Number(e.target.value))} /></td>
                          <td className="p-1 text-center"><Input type="number" min={0} value={l.ll_entregas} onChange={(e) => upd(l.group_id, "ll_entregas", Number(e.target.value))} /></td>
                          <td className="p-1 text-center"><Input type="number" min={0} value={l.ll_ofertas} onChange={(e) => upd(l.group_id, "ll_ofertas", Number(e.target.value))} /></td>
                          <td className="p-1 text-center"><Input type="number" min={0} step="0.01" value={l.ll_maior ?? ""} onChange={(e) => upd(l.group_id, "ll_maior", e.target.value === "" ? null : Number(e.target.value))} /></td>
                          <td className="p-1 text-center"><Input type="number" min={0} step="0.01" value={l.ll_menor ?? ""} onChange={(e) => upd(l.group_id, "ll_menor", e.target.value === "" ? null : Number(e.target.value))} /></td>
                          <td className="p-1 text-center"><Input type="number" min={0} value={l.prazo_enc_meses ?? ""} onChange={(e) => upd(l.group_id, "prazo_enc_meses", e.target.value === "" ? null : Number(e.target.value))} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end pt-3">
                <Button disabled={!podeSalvar || loading} onClick={handleSave} className="inline-flex items-center gap-2">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Save className="h-4 w-4" /> Salvar Resultados
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
   OVERLAY: OFERTA DE LANCE (por COTA)
   ========================================================= */

type OfertaRow = {
  administradora: string;
  grupo: string;
  cota: string | null;
  referencia: number | null;
  participantes: number | null;
  mediana: number | null;
  contemplados: number | null;
  cliente: string | null;
  descricao: string | null;
  contemplada: boolean; // TAG no relatório
};

function OverlayOfertaLance({
  onClose,
  gruposBase,
  drawsByDate,
  lastAsmByGroup,
}: {
  onClose: () => void;
  gruposBase: Grupo[];
  drawsByDate: Record<string, LoteriaFederal>;
  lastAsmByGroup: Map<string, UltimoResultado>;
}) {
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

      const elegiveis = gruposBase.filter((g) => !isStubId(g.id) && sameDay(g.prox_assembleia, ymd));
      if (elegiveis.length === 0) {
        setLinhas([]);
        setLoading(false);
        return;
      }

      const mapByKey = new Map<string, Grupo>();
      const gruposDigits = new Set<string>();
      elegiveis.forEach((g) => {
        const k = keyDigits(g.administradora, g.codigo);
        mapByKey.set(k, g);
        gruposDigits.add(normalizeGroupDigits(g.codigo));
      });

      type VendasRow = { [key: string]: any };

      // ======= ATENÇÃO (pedido do Wesley) =======
      // Excluir cotas canceladas do relatório de oferta de lances.
      // Regra do schema: public.vendas
      // - Canceladas: codigo != '00'
      // - Ativas:     codigo = '00'
      // Portanto, buscamos SOMENTE codigo = '00'.
      const { data: vds, error } = await supabase
        .from("vendas")
        .select("*")
        .eq("status", "encarteirada")
        .eq("codigo", "00") // <- só ativas
        .in("grupo", Array.from(gruposDigits));

      if (error) throw error;

      const sample: VendasRow = (vds ?? [])[0] ?? {};
      const leadCandidates = ["lead_id", "cliente_id", "id_lead", "id_cliente", "leadId", "clienteId"];
      const descCandidates = [
        "vendas_descrecao",
        "vendas_descricao",
        "descricao",
        "descrição",
        "descricao_venda",
        "descricaoVenda",
        "venda_descricao",
        "obs",
        "observacao",
        "observação",
      ];

      const leadKey: string | null = leadCandidates.find((k) => k in sample) ?? null;
      const descKey: string | null = descCandidates.find((k) => k in sample) ?? null;

      let nomesById = new Map<string, string>();
      if (leadKey) {
        const leadIds = Array.from(
          new Set(
            (vds ?? [])
              .map((v: VendasRow) => v?.[leadKey!])
              .filter((x: any) => x !== null && x !== undefined)
          )
        );

        if (leadIds.length > 0) {
          const { data: leadsData, error: errLeads } = await supabase
            .from("leads")
            .select("id, nome")
            .in("id", leadIds);

          if (errLeads) throw errLeads;

          (leadsData ?? []).forEach((l: any) => {
            nomesById.set(String(l.id), l.nome ?? "");
          });
        }
      }

      const out: OfertaRow[] = [];
      (vds ?? []).forEach((v: VendasRow) => {
        const adm = normalizeAdmin(v.administradora);
        const grpDigits = normalizeGroupDigits(v.grupo);
        const k = keyDigits(adm, grpDigits);
        const g = mapByKey.get(k);
        if (!g) return;

        const asm = lastAsmByGroup.get(g.id);
        const med = asm?.median ?? calcMediana(asm?.ll_high ?? null, asm?.ll_low ?? null);
        const contem =
          (asm?.fixed25_deliveries || 0) +
          (asm?.fixed50_deliveries || 0) +
          (asm?.ll_deliveries || 0);

        const bilhetes = g.prox_sorteio ? drawsByDate[toYMD(g.prox_sorteio)!] ?? null : null;
        const ref = referenciaPorAdministradora({
          administradora: g.administradora,
          participantes: g.participantes,
          bilhetes,
        });

        const leadVal = leadKey ? v?.[leadKey] : null;
        const cliente = leadVal != null ? (nomesById.get(String(leadVal)) ?? null) : null;

        const descVal = descKey ? v?.[descKey] : null;
        const descricao =
          descVal ??
          v?.vendas_descrecao ??
          v?.vendas_descricao ??
          v?.descricao ??
          null;

        out.push({
          administradora: g.administradora,
          grupo: normalizeGroupDigits(g.codigo),
          cota: v.cota != null ? String(v.cota) : null,
          referencia: ref,
          participantes: g.participantes,
          mediana: med,
          contemplados: contem,
          cliente,
          descricao,
          // ======= TAG CONTEMPLADA (pedido do Wesley) =======
          // public.vendas.contemplada = TRUE -> mostrar badge
          contemplada: Boolean(v?.contemplada === true),
        });
      });

      function normName(s?: string | null) {
        return stripAccents(String(s ?? "")).toLowerCase().trim();
      }
      function cmpNumLike(a: string | number | null, b: string | number | null) {
        const sa = String(a ?? "");
        const sb = String(b ?? "");
        const na = parseInt(sa.replace(/\D+/g, ""), 10);
        const nb = parseInt(sb.replace(/\D+/g, ""), 10);
        const aIsNum = !Number.isNaN(na);
        const bIsNum = !Number.isNaN(nb);
        if (aIsNum && bIsNum && na !== nb) return na - nb;
        return sa.localeCompare(sb);
      }

      out.sort((a, b) => {
        const ca = normName(a.cliente);
        const cb = normName(b.cliente);
        if (ca && cb) {
          const c = ca.localeCompare(cb);
          if (c !== 0) return c;
        } else if (ca && !cb) return -1;
        else if (!ca && cb) return 1;

        const adm = String(a.administradora).localeCompare(String(b.administradora));
        if (adm !== 0) return adm;

        const grp = cmpNumLike(a.grupo, b.grupo);
        if (grp !== 0) return grp;

        return cmpNumLike(a.cota, b.cota);
      });

      setLinhas(out);
    } catch (e: any) {
      console.error(e);
      alert(e.message ?? "Falha ao listar oferta de lance.");
    } finally {
      setLoading(false);
    }
  };

  const exportarPDF = () => {
    const body = document.getElementById("oferta-grid-body");
    if (!body) return;

    const total = linhas.length;
    const ymd = toYMD(dataAsm);
    const dataLegivel = formatBR(ymd);
    const geradoEm = new Date().toLocaleString("pt-BR");

    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) return;

    const css = `<style>
      @page { size: A4 landscape; margin: 12mm; }
      @media print {
        html, body { height: auto; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        .footer { position: fixed; bottom: 6mm; left: 12mm; right: 12mm; font-size: 11px; color: #666; }
      }

      body{font-family: Arial, Helvetica, sans-serif; padding: 18px 24px}
      h1{margin: 0 0 6px; font-size: 22px}
      .meta{margin: 0 0 8px; font-size: 12px; color: #555}
      .brand{display:flex; align-items:center; gap:12px; margin-bottom:8px}
      .brand img{height:28px}

      table{width:100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed}
      th,td{border:1px solid #e6e6e6; padding: 7px 8px; font-size: 12px; vertical-align: top; word-wrap: break-word}
      th{text-align:left; background:#f6f8fb; border-color:#e1e1e1}

      tbody tr:nth-child(4n+1),
      tbody tr:nth-child(4n+3) { background:#fbfbfb; }

      th:nth-child(1), td:nth-child(1) { width: 15%; }
      th:nth-child(2), td:nth-child(2) { width: 10%; }
      th:nth-child(3), td:nth-child(3) { width: 8%;  }
      th:nth-child(4), td:nth-child(4) { width: 20%; }
      th:nth-child(5), td:nth-child(5) { width: 10%; text-align: right; }
      th:nth-child(6), td:nth-child(6) { width: 10%; text-align: right; }
      th:nth-child(7), td:nth-child(7) { width: 10%; text-align: right; }
      th:nth-child(8), td:nth-child(8) { width: 10%; text-align: right; }

      .descricao-row td { font-size: 11px; color:#444; border-top-color:#f0f0f0; }
      .descricao-label { font-weight:600; color:#111; margin-right:6px; }

      .tag-contemplada { display:inline-block; padding:2px 6px; font-size:10px; border-radius:999px; border:1px solid #d4f1d6; background:#f0fbf1; color:#0f6b1b; margin-left:6px }
    </style>`;

    const tableHTML = `
      <table>
        <thead>
          <tr>
            <th>Administradora</th>
            <th>Grupo</th>
            <th>Cota</th>
            <th>Cliente</th>
            <th>Referência</th>
            <th>Participantes</th>
            <th>Mediana</th>
            <th>Contemplados</th>
          </tr>
        </thead>
        <tbody>${body.innerHTML}</tbody>
      </table>
    `;

    win.document.write(
      `<html>
        <head><title>Oferta de Lance</title>${css}</head>
        <body>
          <div class="brand">
            <img src="/logo-consulmax.png" alt="Consulmax" />
            <h1>Oferta de Lance</h1>
          </div>
          <div class="meta">Data da Assembleia: <b>${dataLegivel}</b> • Total de cotas: <b>${total}</b></div>
          ${tableHTML}
          <div class="footer">Gerado em ${geradoEm}</div>

          <script>
            // escondo linhas "Descrição: —"
            Array.from(document.querySelectorAll("tbody tr.descricao-row td")).forEach(function(td){
              var txt = (td.textContent || "").trim();
              if (/^Descrição:\\s*—\\s*$/.test(txt)) {
                td.parentElement.style.display = "none";
              } else {
                td.innerHTML = td.innerHTML.replace(/^\\s*Descrição:\\s*/,'<span class="descricao-label">Descrição:</span>');
              }
            });
            window.addEventListener('load', function () {
              window.print();
              setTimeout(function(){ window.close(); }, 300);
            });
          </script>
        </body>
      </html>`
    );
    win.document.close();
  };

  const total = linhas.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl rounded-2xl bg-white shadow-xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-xl font-semibold inline-flex items-center gap-2">
            <Target className="h-5 w-5" /> Oferta de Lance
          </h2>
          <Button variant="secondary" onClick={onClose} className="inline-flex items-center gap-2">
            <X className="h-4 w-4" /> Fechar
          </Button>
        </div>

        <div className="p-5 space-y-4 overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex-1">
              <Label>Data da Assembleia</Label>
              <Input type="date" value={dataAsm} onChange={(e) => setDataAsm(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={listar} disabled={!dataAsm || loading} className="inline-flex items-center gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Listar
              </Button>
              <Button variant="secondary" onClick={exportarPDF} disabled={total === 0} className="inline-flex items-center gap-2">
                Exportar PDF
              </Button>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            {dataAsm ? (
              <>
                Assembleia em {formatBR(toYMD(dataAsm))} •{" "}
                <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-foreground">
                  {total} cotas
                </span>
              </>
            ) : (
              <>Informe a data e clique em <b>Listar</b>.</>
            )}
          </div>

          <div className="rounded-xl border overflow-auto max-h-[52vh]">
            <table className="min-w-[1080px] w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr>
                  <th className="p-2 text-left">Administradora</th>
                  <th className="p-2 text-left">Grupo</th>
                  <th className="p-2 text-left">Cota</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Referência</th>
                  <th className="p-2 text-left">Participantes</th>
                  <th className="p-2 text-left">Mediana</th>
                  <th className="p-2 text-left">Contemplados</th>
                </tr>
              </thead>
              <tbody id="oferta-grid-body">
                {loading ? (
                  <tr>
                    <td className="p-4 text-muted-foreground" colSpan={8}>
                      <Loader2 className="h-4 w-4 inline animate-spin mr-2" />
                      Carregando…
                    </td>
                  </tr>
                ) : total === 0 ? (
                  <tr>
                    <td className="p-4 text-muted-foreground" colSpan={8}>
                      {dataAsm ? "Nenhuma cota encontrada para essa assembleia." : "—"}
                    </td>
                  </tr>
                ) : (
                  linhas.map((o, i) => (
                    <React.Fragment key={`${o.administradora}-${o.grupo}-${o.cota}-${i}`}>
                      <tr className="odd:bg-muted/30">
                        <td className="p-2">{o.administradora}</td>
                        <td className="p-2">{o.grupo}</td>
                        <td className="p-2">{o.cota ?? "—"}</td>
                        <td className="p-2">
                          {o.cliente ?? "—"}
                          {o.contemplada && (
                            <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-[2px] rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                              Contemplada
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right">{o.referencia ?? "—"}</td>
                        <td className="p-2 text-right">{o.participantes ?? "—"}</td>
                        <td className="p-2 text-right">{o.mediana != null ? toPct4(Number(o.mediana)) : "—"}</td>
                        <td className="p-2 text-right">{o.contemplados ?? "—"}</td>
                      </tr>
                      <tr className="odd:bg-muted/30 descricao-row">
                        <td className="p-2 text-xs text-muted-foreground" colSpan={8}>
                          <span className="font-medium text-foreground">Descrição: </span>
                          {o.descricao?.trim() ? o.descricao : "—"}
                        </td>
                      </tr>
                    </React.Fragment>
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

type LinhaUI = {
  id: string;
  administradora: Administradora;
  segmento: SegmentoUI;
  codigo: string;
  participantes: number | null;
  faixa_min: number | null;
  faixa_max: number | null;

  total_entregas: number;
  fix25_entregas: number;
  fix25_ofertas: number;
  fix50_entregas: number;
  fix50_ofertas: number;
  ll_entregas: number;
  ll_ofertas: number;
  ll_maior: number | null;
  ll_menor: number | null;
  mediana: number | null;

  apuracao_dia: string | null;
  prazo_encerramento_meses: number | null;
  prox_vencimento: string | null;
  prox_sorteio: string | null;
  prox_assembleia: string | null;

  referencia: number | null;
};

type SortKey =
  | "mediana"
  | "prox_assembleia"
  | "prox_sorteio"
  | "prox_vencimento"
  | "prazo_encerramento_meses";

export default function GestaoDeGrupos() {
  const [loading, setLoading] = useState(true);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [rows, setRows] = useState<LinhaUI[]>([]);
  const [loteria, setLoteria] = useState<LoteriaFederal | null>(null);

  const [drawsByDate, setDrawsByDate] = useState<Record<string, LoteriaFederal>>({});
  const [lastAsmByGroup, setLastAsmByGroup] = useState<Map<string, UltimoResultado>>(new Map());

  const [fAdmin, setFAdmin] = useState("");
  const [fSeg, setFSeg] = useState("");
  const [fGrupo, setFGrupo] = useState("");
  const [fFaixa, setFFaixa] = useState("");
  const [fMedianaAlvo, setFMedianaAlvo] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    participantes: number | null;
    prox_vencimento: string | null;
    prox_sorteio: string | null;
    prox_assembleia: string | null;
    faixa_min: number | null;
    faixa_max: number | null;
  } | null>(null);

  const [asmOpen, setAsmOpen] = useState<boolean>(false);
  const [lfOpen, setLfOpen] = useState<boolean>(false);
  const [ofertaOpen, setOfertaOpen] = useState<boolean>(false);

  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [editorPrefill, setEditorPrefill] = useState<Partial<Grupo> | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("prox_assembleia");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Notificações de hoje + badge discreto
  const notifiedKeys = useRef<Set<string>>(new Set());
  const [todayBadge, setTodayBadge] = useState<string>("");

  const rebuildRows = useCallback(() => {
    const linhas: LinhaUI[] = grupos.map((g) => {
      const r = lastAsmByGroup.get(g.id);
      const t25 = r?.fixed25_deliveries || 0;
      const t50 = r?.fixed50_deliveries || 0;
      const tLL = r?.ll_deliveries || 0;
      const total = t25 + t50 + tLL;
      const med = r?.median ?? calcMediana(r?.ll_high ?? null, r?.ll_low ?? null);

      const key = toYMD(g.prox_sorteio) as string | null;
      const bilhetes = key ? drawsByDate[key] ?? null : null;

      return {
        id: g.id,
        administradora: g.administradora,
        segmento: g.segmento,
        codigo: g.codigo,
        participantes: g.participantes,
        faixa_min: g.faixa_min,
        faixa_max: g.faixa_max,

        total_entregas: total,
        fix25_entregas: t25,
        fix25_ofertas: r?.fixed25_offers || 0,
        fix50_entregas: t50,
        fix50_ofertas: r?.fixed50_offers || 0,
        ll_entregas: tLL,
        ll_ofertas: r?.ll_offers || 0,
        ll_maior: r?.ll_high ?? null,
        ll_menor: r?.ll_low ?? null,
        mediana: med,

        apuracao_dia: r?.date ?? null,
        prazo_encerramento_meses: g.prazo_encerramento_meses,
        prox_vencimento: g.prox_vencimento,
        prox_sorteio: g.prox_sorteio,
        prox_assembleia: g.prox_assembleia,

        referencia: referenciaPorAdministradora({
          administradora: g.administradora,
          participantes: g.participantes,
          bilhetes,
        }),
      };
    });

    setRows(linhas);
  }, [grupos, lastAsmByGroup, drawsByDate]);

  // CARREGAR base
  const carregar = async () => {
    setLoading(true);

    const { data: g, error: gErr } = await supabase
      .from("groups")
      .select(
        "id, administradora, segmento, codigo, participantes, faixa_min, faixa_max, prox_vencimento, prox_sorteio, prox_assembleia, prazo_encerramento_meses"
      );
    if (gErr) console.error(gErr);

    const groupsAll: Grupo[] =
      (g || []).map((r: any) => ({
        id: r.id,
        administradora: r.administradora,
        segmento: r.segmento === "Imóvel Estendido" ? "Imóvel" : r.segmento,
        codigo: r.codigo,
        participantes: r.participantes,
        faixa_min: r.faixa_min,
        faixa_max: r.faixa_max,
        prox_vencimento: r.prox_vencimento,
        prox_sorteio: r.prox_sorteio,
        prox_assembleia: r.prox_assembleia,
        prazo_encerramento_meses: r.prazo_encerramento_meses,
      })) || [];

    const byKey = new Map<string, Grupo>();
    for (const gr of groupsAll) {
      byKey.set(keyDigits(gr.administradora, gr.codigo), gr);
    }

    const { data: vend, error: vErr } = await supabase
      .from("vendas")
      .select("administradora, segmento, grupo, status, contemplada")
      .or("and(status.eq.encarteirada,contemplada.eq.false),contemplada.eq.true");
    if (vErr) console.error(vErr);

    const distinct = new Map<string, { administradora: string; segmento: string; grupo: string }>();
    (vend || []).forEach((v: any) => {
      const adm = (v.administradora ?? "").toString();
      const seg = (v.segmento ?? "").toString();
      const grp = (v.grupo ?? "").toString();
      const k = keyDigits(adm, grp);
      if (!k) return;
      if (!distinct.has(k)) distinct.set(k, { administradora: normalizeAdmin(adm), segmento: seg, grupo: grp });
    });

    const gruposBase: Grupo[] = [];
    for (const { administradora, segmento, grupo } of distinct.values()) {
      const k = keyDigits(administradora, grupo);
      const hit = byKey.get(k);
      if (hit) {
        gruposBase.push(hit);
      } else {
        gruposBase.push({
          id: makeStubId(administradora, grupo),
          administradora,
          segmento: segmento === "Imóvel Estendido" ? "Imóvel" : (segmento as SegmentoUI),
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
    }

    const reais = gruposBase.filter((g) => !isStubId(g.id)).map((g) => g.id);
    let byGroup = new Map<string, UltimoResultado>();
    if (reais.length > 0) {
      const { data: ar, error: arErr } = await supabase
        .from("v_group_last_assembly")
        .select(
          "group_id, date, fixed25_offers, fixed25_deliveries, fixed50_offers, fixed50_deliveries, ll_offers, ll_deliveries, ll_high, ll_low, median"
        )
        .in("group_id", reais);
      if (arErr) console.error(arErr);
      byGroup = new Map<string, UltimoResultado>();
      (ar || []).forEach((r: any) => byGroup.set(r.group_id, r));
    }
    setLastAsmByGroup(byGroup);

    const dateSet = new Set<string>();
    for (const gRow of gruposBase) {
      const ymd = toYMD(gRow.prox_sorteio);
      if (ymd) dateSet.add(ymd);
    }
    const want = Array.from(dateSet);
    let newDraws: Record<string, LoteriaFederal> = {};
    if (want.length > 0) {
      const { data: ld, error: ldErr } = await supabase
        .from("lottery_draws")
        .select("*")
        .in("draw_date", want);
      if (ldErr) console.error(ldErr);
      (ld || []).forEach((d: any) => {
        newDraws[d.draw_date] = {
          data_sorteio: d.draw_date,
          primeiro: d.first,
          segundo: d.second,
          terceiro: d.third,
          quarto: d.fourth,
          quinto: d.fifth,
        };
      });
    }
    setDrawsByDate(newDraws);

    setGrupos(gruposBase);
    setLoading(false);
  };

  useEffect(() => {
    rebuildRows();
  }, [rebuildRows]);

  useEffect(() => {
    carregar();
  }, []);

  // ===== Filtros
  const filtered = useMemo(() => {
    const alvo = fMedianaAlvo ? Number(fMedianaAlvo) : null;
    return rows.filter((r) => {
      const faixaStr = `${r.faixa_min ?? ""}-${r.faixa_max ?? ""}`;
      return (
        (!fAdmin || r.administradora.toLowerCase().includes(fAdmin.toLowerCase())) &&
        (!fSeg || r.segmento.toLowerCase().includes(fSeg.toLowerCase())) &&
        (!fGrupo || r.codigo.toLowerCase().includes(fGrupo.toLowerCase())) &&
        (!fFaixa || faixaStr.includes(fFaixa)) &&
        withinLLMedianFilter(r.mediana, alvo)
      );
    });
  }, [rows, fAdmin, fSeg, fGrupo, fFaixa, fMedianaAlvo]);

  const totalEntregas = useMemo(() => filtered.reduce((acc, r) => acc + r.total_entregas, 0), [filtered]);

  // ===== Ordenação — regra especial para "próxima assembleia mais perto de hoje"
  function cmpDateNearestToToday(a?: string | null, b?: string | null): number {
    const today = new Date(todayYMDLocal() + "T00:00:00");
    const pa = a ? Date.parse(a) : NaN;
    const pb = b ? Date.parse(b) : NaN;

    const isFutureA = !isNaN(pa) && pa >= today.getTime();
    const isFutureB = !isNaN(pb) && pb >= today.getTime();

    if (isFutureA && !isFutureB) return -1;
    if (!isFutureA && isFutureB) return 1;

    const diffA = isNaN(pa) ? Number.POSITIVE_INFINITY : Math.abs(pa - today.getTime());
    const diffB = isNaN(pb) ? Number.POSITIVE_INFINITY : Math.abs(pb - today.getTime());
    return diffA - diffB;
  }

  const sorted = useMemo(() => {
    const copy = [...filtered];

    copy.sort((a, b) => {
      if (sortKey === "prox_assembleia") {
        return cmpDateNearestToToday(toYMD(a.prox_assembleia), toYMD(b.prox_assembleia));
      }

      const dir = sortDir === "asc" ? 1 : -1;

      if (sortKey === "mediana") {
        const va = a.mediana ?? -9999;
        const vb = b.mediana ?? -9999;
        return (va - vb) * dir;
      }

      if (sortKey === "prazo_encerramento_meses") {
        const va = a.prazo_encerramento_meses ?? -9999;
        const vb = b.prazo_encerramento_meses ?? -9999;
        return (va - vb) * dir;
      }

      const da = toYMD(
        sortKey === "prox_sorteio"
          ? a.prox_sorteio
          : a.prox_vencimento
      );
      const db = toYMD(
        sortKey === "prox_sorteio"
          ? b.prox_sorteio
          : b.prox_vencimento
      );
      const na = da ? Date.parse(da) : -1;
      const nb = db ? Date.parse(db) : -1;
      return (na - nb) * dir;
    });

    return copy;
  }, [filtered, sortKey, sortDir]);

  // ===== Notificações + Badge “Hoje: …”
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  function pushBrowser(title: string, body: string) {
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification(title, { body, icon: "/logo-consulmax.png" }); } catch {}
    }
  }

  function codesByAdm(items: LinhaUI[]) {
    const map = new Map<string, string[]>();
    items.forEach((r) => {
      const adm = r.administradora;
      const code = normalizeGroupDigits(r.codigo);
      if (!code) return;
      if (!map.has(adm)) map.set(adm, []);
      map.get(adm)!.push(code);
    });
    const parts: string[] = [];
    map.forEach((codes, adm) => parts.push(`${adm} ${codes.join("; ")}`));
    return parts.join("; ");
  }

  useEffect(() => {
    const today = todayYMDLocal();
    const isToday = (d?: string | null) => !!d && toYMD(d) === today;

    const venc = sorted.filter((r) => isToday(r.prox_vencimento));
    const sort = sorted.filter((r) => isToday(r.prox_sorteio));
    const asm  = sorted.filter((r) => isToday(r.prox_assembleia));

    const keyV = `venc-${today}`;
    const keyS = `sorteio-${today}`;
    const keyA = `asm-${today}`;

    if (venc.length > 0 && !notifiedKeys.current.has(keyV)) {
      notifiedKeys.current.add(keyV);
      pushBrowser("Vencimento hoje", `Vencimento ${codesByAdm(venc)}.`);
    }
    if (sort.length > 0 && !notifiedKeys.current.has(keyS)) {
      notifiedKeys.current.add(keyS);
      pushBrowser("Sorteio hoje", `Sorteio ${codesByAdm(sort)}.`);
    }
    if (asm.length > 0 && !notifiedKeys.current.has(keyA)) {
      notifiedKeys.current.add(keyA);
      pushBrowser("Assembleia hoje", `Assembleia ${codesByAdm(asm)}.`);
    }

    const parts: string[] = [];
    if (sort.length > 0) parts.push(`Sorteio ${codesByAdm(sort)}`);
    if (venc.length > 0) parts.push(`Vencimento ${codesByAdm(venc)}`);
    if (asm.length > 0) parts.push(`Assembleia ${codesByAdm(asm)}`);

    setTodayBadge(parts.length > 0 ? `Hoje: ${parts.join(" • ")}` : "");
  }, [sorted]);

  // UI helpers sort
  function headerSort(label: string, key: SortKey) {
    const active = sortKey === key;
    const dirIcon =
      active ? (sortDir === "asc" ? <ChevronUp className="h-4 w-4 inline" /> : <ChevronDown className="h-4 w-4 inline" />) : null;

    return (
      <button
        type="button"
        className={`inline-flex items-center gap-1 ${active ? "text-foreground" : "text-muted-foreground"} hover:text-foreground`}
        onClick={() => {
          if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          else {
            setSortKey(key);
            setSortDir("asc");
          }
        }}
        title="Ordenar"
      >
        {label} {dirIcon}
      </button>
    );
  }

  async function salvarLinha(id: string) {
    if (!editDraft) return;
    const { error } = await supabase
      .from("groups")
      .update({
        participantes: editDraft.participantes,
        prox_vencimento: editDraft.prox_vencimento,
        prox_sorteio: editDraft.prox_sorteio,
        prox_assembleia: editDraft.prox_assembleia,
        faixa_min: editDraft.faixa_min,
        faixa_max: editDraft.faixa_max,
      })
      .eq("id", id);
    if (error) {
      console.error(error);
      alert("Erro ao salvar.");
      return;
    }
    setEditingId(null);
    setEditDraft(null);
    await carregar();
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Badge discreto de alertas do dia */}
      {todayBadge && (
        <div className="flex">
          <div className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700">
            <Bell className="h-3 w-3" />
            <span className="font-medium">🔔 {todayBadge}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-9 gap-4 items-start">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2 flex items-center justify-between">
            <CardTitle className="text-base">LOTERIA FEDERAL</CardTitle>
            <Button variant="secondary" className="inline-flex items-center gap-2" onClick={() => setLfOpen(true)}>
              <Percent className="h-4 w-4" />
              Informar resultados
            </Button>
          </CardHeader>
          <CardContent className="text-sm grid grid-cols-5 gap-2 items-center">
            <div className="col-span-5 text-xs text-muted-foreground">
              {loteria?.data_sorteio ? `Sorteio: ${formatBR(toYMD(loteria.data_sorteio))}` : "Sem resultado selecionado"}
            </div>
            {([loteria?.primeiro, loteria?.segundo, loteria?.terceiro, loteria?.quarto, loteria?.quinto].filter(Boolean) as string[]).map((v, i) => (
              <div key={i} className="px-2 py-1 rounded bg-muted text-center font-mono">{v}</div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2 flex items-center justify-between">
            <CardTitle className="text-base">ASSEMBLEIAS</CardTitle>
            <Button variant="secondary" className="inline-flex items-center gap-2" onClick={() => setAsmOpen(true)}>
              <Settings className="h-4 w-4" /> Informar resultados
            </Button>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Informe resultados por data. Atualizaremos próximas datas.
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2 flex items-center justify-between">
            <CardTitle className="text-base">OFERTA DE LANCE</CardTitle>
            <div className="flex gap-2">
              <Button variant="secondary" className="inline-flex items-center gap-2" onClick={() => setOfertaOpen(true)}>
                <Target className="h-4 w-4" />
                Abrir
              </Button>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Lista <b>cotas</b> encarteiradas (ativas) para os grupos com assembleia na data informada, com referência calculada.
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="inline-flex items-center gap-2 text-base">
            <FilterIcon className="h-4 w-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div><Label>Administradora</Label><Input value={fAdmin} onChange={(e) => setFAdmin(e.target.value)} placeholder="Filtrar Administradora" /></div>
          <div><Label>Segmento</Label><Input value={fSeg} onChange={(e) => setFSeg(e.target.value)} placeholder="Filtrar Segmento" /></div>
          <div><Label>Grupo</Label><Input value={fGrupo} onChange={(e) => setFGrupo(e.target.value)} placeholder="Filtrar Grupo" /></div>
          <div><Label>Faixa de Crédito</Label><Input value={fFaixa} onChange={(e) => setFFaixa(e.target.value)} placeholder="ex.: 80000-120000" /></div>
          <div>
            <Label>% Lance Livre (mediana ±30%)</Label>
            <Input type="number" step="0.01" value={fMedianaAlvo} onChange={(e) => setFMedianaAlvo(e.target.value)} placeholder="ex.: 45" />
          </div>
          <div className="self-end text-xs text-muted-foreground">Ex.: 45 → mostra grupos com mediana entre 31,5% e 58,5%.</div>
        </CardContent>
      </Card>

      {/* Relação de Grupos */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Relação de Grupos</h3>
      </div>

      {/* Tabela principal */}
      <div className="rounded-2xl border overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/60 sticky top-0 backdrop-blur">
            <tr>
              <th className="p-2 text-left">ADMINISTRADORA</th>
              <th className="p-2 text-left">SEGMENTO</th>
              <th className="p-2 text-left">GRUPO</th>
              <th className="p-2 text-right">PARTIC.</th>
              <th className="p-2 text-center">FAIXA DE CRÉDITO</th>

              <th className="p-2 text-right">Tot. Entr.</th>
              <th className="p-2 text-right">25% Entregas</th>
              <th className="p-2 text-right">25% Ofertas</th>
              <th className="p-2 text-right">50% Entregas</th>
              <th className="p-2 text-right">50% Ofertas</th>

              <th className="p-2 text-right">LL Entregas</th>
              <th className="p-2 text-right">LL Ofertas</th>
              <th className="p-2 text-right">Maior %</th>
              <th className="p-2 text-right">Menor %</th>
              <th className="p-2 text-right">{headerSort("LL Mediana", "mediana")}</th>

              {/* Ordem correta */}
              <th className="p-2 text-center">Apuração</th>
              <th className="p-2 text-center">{headerSort("Pz Enc", "prazo_encerramento_meses")}</th>
              <th className="p-2 text-center">{headerSort("Vencimento", "prox_vencimento")}</th>
              <th className="p-2 text-center">{headerSort("Sorteio", "prox_sorteio")}</th>
              <th className="p-2 text-center">{headerSort("Assembleia", "prox_assembleia")}</th>
              <th className="p-2 text-right">Ref</th>
              <th className="p-2 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={22} className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 inline animate-spin mr-2" /> Carregando…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={22} className="p-6 text-center text-muted-foreground">Sem registros para os filtros aplicados.</td></tr>
            ) : (
              sorted.map((r) => {
                const isEditing = editingId === r.id;
                return (
                  <tr key={r.id} className="odd:bg-muted/30">
                    <td className="p-2">{r.administradora}</td>
                    <td className="p-2">{r.segmento}</td>
                    <td className="p-2 font-medium">{r.codigo}</td>

                    {/* PARTICIPANTES */}
                    <td className="p-2 text-right">
                      {isEditing ? (
                        <Input
                          className="h-8 w-28 ml-auto text-right"
                          type="number"
                          min={0}
                          value={editDraft?.participantes ?? ""}
                          onChange={(e) =>
                            setEditDraft((d) => ({ ...(d as any), participantes: e.target.value === "" ? null : Number(e.target.value) }))
                          }
                        />
                      ) : (
                        r.participantes ?? "—"
                      )}
                    </td>

                    {/* FAIXA DE CRÉDITO */}
                    <td className="p-2 text-center">
                      {isEditing ? (
                        <div className="flex items-center gap-2 justify-center">
                          <Input
                            className="h-8 w-28"
                            type="number"
                            step="0.01"
                            value={editDraft?.faixa_min ?? ""}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...(d as any), faixa_min: e.target.value === "" ? null : Number(e.target.value) }))
                            }
                            placeholder="mín"
                          />
                          <span className="text-muted-foreground">—</span>
                          <Input
                            className="h-8 w-28"
                            type="number"
                            step="0.01"
                            value={editDraft?.faixa_max ?? ""}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...(d as any), faixa_max: e.target.value === "" ? null : Number(e.target.value) }))
                            }
                            placeholder="máx"
                          />
                        </div>
                      ) : r.faixa_min != null && r.faixa_max != null ? (
                        r.faixa_min.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) +
                        " — " +
                        r.faixa_max.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="p-2 text-right font-semibold">{r.total_entregas}</td>
                    <td className="p-2 text-right">{r.fix25_entregas}</td>
                    <td className="p-2 text-right">{r.fix25_ofertas}</td>
                    <td className="p-2 text-right">{r.fix50_entregas}</td>
                    <td className="p-2 text-right">{r.fix50_ofertas}</td>
                    <td className="p-2 text-right">{r.ll_entregas}</td>
                    <td className="p-2 text-right">{r.ll_ofertas}</td>
                    <td className="p-2 text-right">{r.ll_maior != null ? toPct4(r.ll_maior) : "—"}</td>
                    <td className="p-2 text-right">{r.ll_menor != null ? toPct4(r.ll_menor) : "—"}</td>
                    <td className="p-2 text-right">{r.mediana != null ? toPct4(r.mediana) : "—"}</td>

                    {/* Apuração / Pz Enc / Venc / Sorteio / Assembleia */}
                    <td className="p-2 text-center">{formatBR(toYMD(r.apuracao_dia))}</td>
                    <td className="p-2 text-center">{r.prazo_encerramento_meses ?? "—"}</td>
                    <td className="p-2 text-center">{formatBR(toYMD(r.prox_vencimento))}</td>
                    <td className="p-2 text-center">{formatBR(toYMD(r.prox_sorteio))}</td>
                    <td className="p-2 text-center">{formatBR(toYMD(r.prox_assembleia))}</td>

                    {/* Ref */}
                    <td className="p-2 text-right font-semibold">{r.referencia ?? "—"}</td>

                    {/* AÇÕES */}
                    <td className="p-2 text-center">
                      {isStubId(r.id) ? (
                        <Button
                          variant="secondary"
                          className="inline-flex items-center gap-2"
                          onClick={() => {
                            setEditorPrefill({
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
                            });
                            setEditorOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" /> Cadastrar
                        </Button>
                      ) : editingId === r.id ? (
                        <div className="flex items-center justify-center gap-2">
                          <Button variant="secondary" className="inline-flex items-center gap-2" onClick={() => { setEditingId(null); setEditDraft(null); }}>
                            <X className="h-4 w-4" /> Cancelar
                          </Button>
                          <Button className="inline-flex items-center gap-2" onClick={() => salvarLinha(r.id)}>
                            <Save className="h-4 w-4" /> Salvar
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="secondary"
                          className="inline-flex items-center gap-2"
                          onClick={() => {
                            const g = grupos.find((x) => x.id === r.id);
                            if (!g) return;
                            setEditingId(r.id);
                            setEditDraft({
                              participantes: g.participantes,
                              prox_vencimento: g.prox_vencimento,
                              prox_sorteio: g.prox_sorteio,
                              prox_assembleia: g.prox_assembleia,
                              faixa_min: g.faixa_min,
                              faixa_max: g.faixa_max,
                            });
                          }}
                        >
                          <Pencil className="h-4 w-4" /> Editar
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-sm text-muted-foreground">
        Total de entregas (linhas filtradas): <span className="font-semibold text-foreground">{totalEntregas}</span>
      </div>

      {asmOpen && <OverlayAssembleias gruposBase={grupos} onClose={() => setAsmOpen(false)} onSaved={async () => await carregar()} />}
      {lfOpen && (
        <OverlayLoteria
          onClose={() => setLfOpen(false)}
          onSaved={(lf) => {
            setLoteria(lf);
            setDrawsByDate((prev) => ({ ...prev, [lf.data_sorteio]: lf }));
          }}
        />
      )}
      {ofertaOpen && (
        <OverlayOfertaLance
          onClose={() => setOfertaOpen(false)}
          gruposBase={grupos}
          drawsByDate={drawsByDate}
          lastAsmByGroup={lastAsmByGroup}
        />
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl p-4">
            <EditorGrupo
              group={null}
              prefill={editorPrefill ?? {}}
              onClose={() => { setEditorOpen(false); setEditorPrefill(null); }}
              onSaved={async () => { await carregar(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   EDITOR DE GRUPO
   ========================================================= */

type EditorGrupoProps = {
  group?: Grupo | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  prefill?: Partial<Grupo>;
};

function EditorGrupo(props: EditorGrupoProps) {
  const { group, onClose, onSaved, prefill } = props;

  const [form, setForm] = useState<Partial<Grupo>>(
    group || {
      administradora: (prefill?.administradora as Administradora) ?? ("" as Administradora),
      segmento: (prefill?.segmento as SegmentoUI) ?? ("" as SegmentoUI),
      codigo: prefill?.codigo ?? "",
      participantes: prefill?.participantes ?? null,
      faixa_min: prefill?.faixa_min ?? null,
      faixa_max: prefill?.faixa_max ?? null,
      prox_vencimento: prefill?.prox_vencimento ?? null,
      prox_sorteio: prefill?.prox_sorteio ?? null,
      prox_assembleia: prefill?.prox_assembleia ?? null,
      prazo_encerramento_meses: prefill?.prazo_encerramento_meses ?? null,
    }
  );

  const isNew = !group?.id;

  const handleSave = async () => {
    if (!form.codigo || !form.administradora || !form.segmento) {
      alert("Preencha Administradora, Segmento e Código do Grupo.");
      return;
    }
    if (isNew) {
      const { error } = await supabase.from("groups").insert({
        administradora: form.administradora,
        segmento: form.segmento,
        codigo: form.codigo,
        participantes: form.participantes,
        faixa_min: form.faixa_min,
        faixa_max: form.faixa_max,
        prox_vencimento: form.prox_vencimento,
        prox_sorteio: form.prox_sorteio,
        prox_assembleia: form.prox_assembleia,
        prazo_encerramento_meses: form.prazo_encerramento_meses,
      });
      if (error) {
        console.error(error);
        alert("Erro ao inserir grupo.");
        return;
      }
    } else {
      const { error } = await supabase
        .from("groups")
        .update({
          administradora: form.administradora,
          segmento: form.segmento,
          codigo: form.codigo,
          participantes: form.participantes,
          faixa_min: form.faixa_min,
          faixa_max: form.faixa_max,
          prox_vencimento: form.prox_vencimento,
          prox_sorteio: form.prox_sorteio,
          prox_assembleia: form.prox_assembleia,
          prazo_encerramento_meses: form.prazo_encerramento_meses,
        })
        .eq("id", group!.id);
      if (error) {
        console.error(error);
        alert("Erro ao atualizar grupo.");
        return;
      }
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
            onChange={(e) => setForm((f) => ({ ...f, administradora: e.target.value as Administradora }))}
            placeholder="Ex.: Embracon"
          />
        </div>
        <div>
          <Label>Segmento</Label>
          <Input
            value={form.segmento ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, segmento: e.target.value as SegmentoUI }))}
            placeholder="Ex.: Imóvel"
          />
        </div>
        <div>
          <Label>Código do Grupo</Label>
          <Input
            value={form.codigo ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
            placeholder="Ex.: 1234/5"
          />
        </div>

        <div>
          <Label>Participantes</Label>
          <Input
            type="number"
            min={1}
            value={form.participantes ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, participantes: Number(e.target.value) || null }))}
          />
        </div>
        <div>
          <Label>Faixa Mínima</Label>
          <Input
            type="number"
            step="0.01"
            value={form.faixa_min ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, faixa_min: Number(e.target.value) || null }))}
          />
        </div>
        <div>
          <Label>Faixa Máxima</Label>
          <Input
            type="number"
            step="0.01"
            value={form.faixa_max ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, faixa_max: Number(e.target.value) || null }))}
          />
        </div>

        <div>
          <Label>Próx. Vencimento</Label>
          <Input
            type="date"
            value={form.prox_vencimento ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, prox_vencimento: e.target.value || null }))}
          />
        </div>
        <div>
          <Label>Próx. Sorteio</Label>
          <Input
            type="date"
            value={form.prox_sorteio ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, prox_sorteio: e.target.value || null }))}
          />
        </div>
        <div>
          <Label>Próx. Assembleia</Label>
          <Input
            type="date"
            value={form.prox_assembleia ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, prox_assembleia: e.target.value || null }))}
          />
        </div>
        <div>
          <Label>Prazo Enc. (meses)</Label>
          <Input
            type="number"
            min={0}
            value={form.prazo_encerramento_meses ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, prazo_encerramento_meses: Number(e.target.value) || null }))}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} className="inline-flex items-center gap-2"><X className="h-4 w-4" /> Cancelar</Button>
        <Button onClick={handleSave} className="inline-flex items-center gap-2"><Save className="h-4 w-4" /> Salvar Grupo</Button>
      </div>
    </div>
  );
}
