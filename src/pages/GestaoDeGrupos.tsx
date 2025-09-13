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

/** Converte qualquer coisa em 'YYYY-MM-DD' (UTC). */
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
/** pega somente o número-base do grupo (antes de /, -, espaço) */
function normalizeGroupDigits(g?: string | number | null): string {
  const s = String(g ?? "").trim();
  const first = s.split(/[\/\-\s]/)[0] || s;
  const m = first.match(/\d+/);
  if (m) return m[0];
  return s.replace(/\D/g, "");
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
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
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
                <span className="text-xs text-muted-foreground">5 dígitos; se digitar 6, guarda os últimos 5.</span>
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
                <Button disabled={!podeSalvar || loading} onClick={handleSave}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
   OVERLAY: ATUALIZAR GRUPOS (somente faltantes)
   ========================================================= */

type AtualizaRow = {
  id: string;
  administradora: string;
  codigo: string;
  participantes: number | null;
  faixa_min: number | null;
  faixa_max: number | null;
  prox_vencimento: string | null;
  prox_sorteio: string | null;
  prox_assembleia: string | null;
};

function faltaInfo(g: Grupo) {
  return (
    g.participantes == null ||
    g.faixa_min == null ||
    g.faixa_max == null ||
    !g.prox_vencimento ||
    !g.prox_sorteio ||
    !g.prox_assembleia
  );
}

function OverlayAtualizarGrupos({
  rows,
  onClose,
  onSaved,
}: {
  rows: AtualizaRow[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [busca, setBusca] = useState("");
  const [dados, setDados] = useState<AtualizaRow[]>(rows);
  const [saving, setSaving] = useState(false);

  const upd = (id: string, campo: keyof AtualizaRow, val: any) => {
    setDados((prev) => prev.map((r) => (r.id === id ? { ...r, [campo]: val } : r)));
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return dados;
    return dados.filter(
      (r) =>
        r.administradora.toLowerCase().includes(q) ||
        r.codigo.toLowerCase().includes(q)
    );
  }, [busca, dados]);

  const canSave = filtrados.length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      setSaving(true);
      await Promise.all(
        filtrados.map((r) =>
          supabase
            .from("groups")
            .update({
              participantes: r.participantes ?? null,
              faixa_min: r.faixa_min ?? null,
              faixa_max: r.faixa_max ?? null,
              prox_vencimento: r.prox_vencimento ?? null,
              prox_sorteio: r.prox_sorteio ?? null,
              prox_assembleia: r.prox_assembleia ?? null,
            })
            .eq("id", r.id)
        )
      );
      await onSaved();
      alert("Grupos atualizados com sucesso!");
      onClose();
    } catch (e: any) {
      console.error(e);
      alert(e.message ?? "Erro ao salvar atualizações.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl rounded-2xl bg-white shadow-xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-xl font-semibold">Atualizar Grupos</h2>
          <Button variant="secondary" onClick={onClose} className="gap-2">
            <X className="h-4 w-4" /> Fechar
          </Button>
        </div>

        <div className="p-5 space-y-4 overflow-hidden">
          <div>
            <Label>Buscar (administradora ou grupo)</Label>
            <Input
              placeholder="Ex.: Embracon ou 9955"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <div className="rounded-xl border overflow-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr>
                  <th className="p-2 text-left">Administradora</th>
                  <th className="p-2 text-left">Grupo</th>
                  <th className="p-2 text-left">Participantes</th>
                  <th className="p-2 text-center">Faixa de Crédito</th>
                  <th className="p-2 text-left">Vencimento</th>
                  <th className="p-2 text-left">Sorteio</th>
                  <th className="p-2 text-left">Assembleia</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr>
                    <td className="p-4 text-muted-foreground" colSpan={7}>
                      Nenhum grupo com informações em falta.
                    </td>
                  </tr>
                ) : (
                  filtrados.map((r) => (
                    <tr key={r.id} className="odd:bg-muted/30">
                      <td className="p-2">{r.administradora}</td>
                      <td className="p-2 font-medium">{r.codigo}</td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min={0}
                          value={r.participantes ?? ""}
                          onChange={(e) => upd(r.id, "participantes", e.target.value === "" ? null : Number(e.target.value))}
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="mín"
                            value={r.faixa_min ?? ""}
                            onChange={(e) => upd(r.id, "faixa_min", e.target.value === "" ? null : Number(e.target.value))}
                          />
                          <span className="text-muted-foreground">—</span>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="máx"
                            value={r.faixa_max ?? ""}
                            onChange={(e) => upd(r.id, "faixa_max", e.target.value === "" ? null : Number(e.target.value))}
                          />
                        </div>
                      </td>
                      <td className="p-2">
                        <Input
                          type="date"
                          value={r.prox_vencimento ?? ""}
                          onChange={(e) => upd(r.id, "prox_vencimento", e.target.value || null)}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="date"
                          value={r.prox_sorteio ?? ""}
                          onChange={(e) => upd(r.id, "prox_sorteio", e.target.value || null)}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="date"
                          value={r.prox_assembleia ?? ""}
                          onChange={(e) => upd(r.id, "prox_assembleia", e.target.value || null)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />
              Salvar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   OVERLAY: OFERTA DE LANCE (usa view oferta_lance_all)
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
    .select("administradora,grupo,cota,referencia,participantes,mediana,contemplados")
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
    const win = window.open("", "_blank", "width=1024,height=768");
    if (!win) return;
    const css = `<style>
      body{font-family:Arial,sans-serif;padding:24px}
      h1{margin:0 0 12px}
      .meta{margin-bottom:8px;font-size:12px;color:#666}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #e5e7eb;padding:8px;font-size:12px;vertical-align:top}
    </style>`;
    win.document.write(
      `<html><head><title>Oferta de Lance</title>${css}</head><body>
        <h1>Oferta de Lance</h1>
        <div class="meta">Data da Assembleia: ${dataLegivel} • Total de cotas: ${total}</div>
        <table>
          <thead>
            <tr>
              <th>Administradora</th><th>Grupo</th><th>Cota</th><th>Referência</th><th>Participantes</th><th>Mediana</th><th>Contemplados</th>
            </tr>
          </thead>
          <tbody>${body.innerHTML}</tbody>
        </table>
        <script>window.print();setTimeout(()=>window.close(),300);</script>
      </body></html>`
    );
    win.document.close();
  };

  const total = linhas.length;

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
              <Input type="date" value={dataAsm} onChange={(e) => setDataAsm(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={listar} disabled={!dataAsm || loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Listar
              </Button>
              <Button variant="secondary" onClick={exportarPDF} disabled={total === 0}>
                Exportar PDF
              </Button>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            {dataAsm ? (
              <>Assembleia em {formatBR(toYMD(dataAsm))} •{" "}
                <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-foreground">{total} cotas</span>
              </>
            ) : (
              <>Informe a data e clique em <b>Listar</b>.</>
            )}
          </div>

          <div className="rounded-xl border overflow-auto">
            <table className="min-w-[920px] w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
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
              <tbody id="oferta-grid-body">
                {loading ? (
                  <tr>
                    <td className="p-4 text-muted-foreground" colSpan={7}>
                      <Loader2 className="h-4 w-4 inline animate-spin mr-2" />
                      Carregando…
                    </td>
                  </tr>
                ) : total === 0 ? (
                  <tr>
                    <td className="p-4 text-muted-foreground" colSpan={7}>
                      {dataAsm ? "Nenhum grupo com assembleia nesta data." : "—"}
                    </td>
                  </tr>
                ) : (
                  linhas.map((o, i) => (
                    <tr key={`${o.administradora}-${o.grupo}-${o.cota}-${i}`} className="odd:bg-muted/30">
                      <td className="p-2">{o.administradora}</td>
                      <td className="p-2">{o.grupo}</td>
                      <td className="p-2">{o.cota ?? "—"}</td>
                      <td className="p-2">{o.referencia ?? "—"}</td>
                      <td className="p-2">{o.participantes ?? "—"}</td>
                      <td className="p-2">{o.mediana != null ? toPct4(Number(o.mediana)) : "—"}</td>
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

  prazo_encerramento_meses: number | null;
  prox_vencimento: string | null;
  prox_sorteio: string | null;
  prox_assembleia: string | null;

  referencia: number | null;
};

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

  const [asmOpen, setAsmOpen] = useState<boolean>(false);
  const [lfOpen, setLfOpen] = useState<boolean>(false);
  const [ofertaOpen, setOfertaOpen] = useState<boolean>(false);

  const [updOpen, setUpdOpen] = useState(false);
  const [updRows, setUpdRows] = useState<AtualizaRow[]>([]);

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

  const carregar = async () => {
    setLoading(true);

    const { data: g, error: gErr } = await supabase
      .from("groups")
      .select(
        "id, administradora, segmento, codigo, participantes, faixa_min, faixa_max, prox_vencimento, prox_sorteio, prox_assembleia, prazo_encerramento_meses"
      );
    if (gErr) console.error(gErr);

    const gruposFetched: Grupo[] =
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

    setGrupos(gruposFetched);

    const { data: ar, error: arErr } = await supabase
      .from("v_group_last_assembly")
      .select(
        "group_id, date, fixed25_offers, fixed25_deliveries, fixed50_offers, fixed50_deliveries, ll_offers, ll_deliveries, ll_high, ll_low, median"
      );
    if (arErr) console.error(arErr);

    const byGroup = new Map<string, UltimoResultado>();
    (ar || []).forEach((r: any) => byGroup.set(r.group_id, r));
    setLastAsmByGroup(byGroup);

    // carregar resultados de loteria
    const dateSet = new Set<string>();
    for (const gRow of gruposFetched) {
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

    setLoading(false);

    // retorna grupos para quem chamar (útil no Atualizar)
    return gruposFetched;
  };

  useEffect(() => {
    rebuildRows();
  }, [rebuildRows]);

  useEffect(() => {
    carregar();
  }, []);

  // Atualizar: sincroniza e abre overlay com faltantes (usando dados frescos)
  const handleAtualizar = async () => {
    try {
      await supabase.rpc("sync_groups_from_carteira_safe").catch(() => {});
      await supabase.rpc("refresh_gestao_mv").catch(() => {});
      const gruposFrescos = await carregar(); // retorna os grupos atualizados

      const faltantes = (gruposFrescos || [])
        .filter((g) => faltaInfo(g))
        .map<AtualizaRow>((g) => ({
          id: g.id,
          administradora: g.administradora,
          codigo: g.codigo,
          participantes: g.participantes,
          faixa_min: g.faixa_min,
          faixa_max: g.faixa_max,
          prox_vencimento: g.prox_vencimento,
          prox_sorteio: g.prox_sorteio,
          prox_assembleia: g.prox_assembleia,
        }));

      setUpdRows(faltantes);
      setUpdOpen(true);
    } catch (e) {
      console.error(e);
      setUpdRows([]);
      setUpdOpen(true);
    }
  };

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

  // Resumos para cards de modalidades
  const resumo25 = useMemo(() => {
    const ent = filtered.reduce((a, r) => a + r.fix25_entregas, 0);
    const of = filtered.reduce((a, r) => a + r.fix25_ofertas, 0);
    return { ent, of };
  }, [filtered]);
  const resumo50 = useMemo(() => {
    const ent = filtered.reduce((a, r) => a + r.fix50_entregas, 0);
    const of = filtered.reduce((a, r) => a + r.fix50_ofertas, 0);
    return { ent, of };
  }, [filtered]);
  const resumoLL = useMemo(() => {
    const ent = filtered.reduce((a, r) => a + r.ll_entregas, 0);
    const of = filtered.reduce((a, r) => a + r.ll_ofertas, 0);
    const meds = filtered.map((r) => r.mediana).filter((x): x is number => x != null);
    const medMediana = meds.length ? meds.reduce((a, b) => a + b, 0) / meds.length : null;
    return { ent, of, medMediana };
  }, [filtered]);

  const SectionCard = ({
    title,
    description,
    actions,
  }: {
    title: string;
    description: React.ReactNode;
    actions: React.ReactNode;
  }) => (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg">{title}</CardTitle>
          <div className="flex gap-2">{actions}</div>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{description}</CardContent>
    </Card>
  );

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* Topo - cards padronizados */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        <SectionCard
          title="GESTÃO DE GRUPOS"
          actions={
            <>
              <Button onClick={handleAtualizar} className="min-w-[140px] justify-center">
                <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
              </Button>
              <Button onClick={() => alert('Em breve: modal de criação.')} variant="secondary" className="min-w-[140px] justify-center">
                <Plus className="h-4 w-4 mr-2" /> Adicionar
              </Button>
            </>
          }
          description={<>Visão consolidada por grupo: resultados de assembleias, filtros e referência do sorteio.</>}
        />

        <SectionCard
          title="LOTERIA FEDERAL"
          actions={
            <Button variant="secondary" className="min-w-[140px] justify-center" onClick={() => setLfOpen(true)}>
              <Percent className="h-4 w-4 mr-2" />
              Informar
            </Button>
          }
          description={<>{loteria?.data_sorteio ? `Sorteio: ${formatBR(toYMD(loteria.data_sorteio))}` : "Sem resultado selecionado"}</>}
        />

        <SectionCard
          title="ASSEMBLEIAS"
          actions={
            <Button variant="secondary" className="min-w-[140px] justify-center" onClick={() => setAsmOpen(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Informar
            </Button>
          }
          description={<>Informe resultados por data. Atualizaremos próximas datas.</>}
        />

        <SectionCard
          title="OFERTA DE LANCE"
          actions={
            <Button variant="secondary" className="min-w-[140px] justify-center" onClick={() => setOfertaOpen(true)}>
              <Target className="h-4 w-4 mr-2" />
              Abrir
            </Button>
          }
          description={<>Lista cotas encarteiradas para os grupos com assembleia na data informada.</>}
        />
      </div>

      {/* Cards de destaque das modalidades */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border p-3 bg-emerald-50/40">
          <div className="text-xs font-medium text-emerald-800 mb-1">25%</div>
          <div className="text-sm">Entregas: <b>{resumo25.ent}</b></div>
          <div className="text-sm">Ofertas: <b>{resumo25.of}</b></div>
        </div>
        <div className="rounded-xl border p-3 bg-sky-50/50">
          <div className="text-xs font-medium text-sky-800 mb-1">50%</div>
          <div className="text-sm">Entregas: <b>{resumo50.ent}</b></div>
          <div className="text-sm">Ofertas: <b>{resumo50.of}</b></div>
        </div>
        <div className="rounded-xl border p-3 bg-amber-50/60">
          <div className="text-xs font-medium text-amber-800 mb-1">Lance Livre</div>
          <div className="text-sm">Entregas: <b>{resumoLL.ent}</b> • Ofertas: <b>{resumoLL.of}</b></div>
          <div className="text-sm">Mediana: <b>{resumoLL.medMediana != null ? toPct4(resumoLL.medMediana) : "—"}</b></div>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FilterIcon className="h-4 w-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div><Label>Administradora</Label><Input value={fAdmin} onChange={(e) => setFAdmin(e.target.value)} placeholder="Filtrar Administradora" /></div>
          <div><Label>Segmento</Label><Input value={fSeg} onChange={(e) => setFSeg(e.target.value)} placeholder="Filtrar Segmento" /></div>
          <div><Label>Grupo</Label><Input value={fGrupo} onChange={(e) => setFGrupo(e.target.value)} placeholder="Filtrar Grupo" /></div>
          <div><Label>Faixa de Crédito</Label><Input value={fFaixa} onChange={(e) => setFFaixa(e.target.value)} placeholder="ex.: 80000-120000" /></div>
          <div>
            <Label>% Lance Livre (mediana ±15%)</Label>
            <Input type="number" step="0.01" value={fMedianaAlvo} onChange={(e) => setFMedianaAlvo(e.target.value)} placeholder="ex.: 45" />
          </div>
          <div className="self-end text-xs text-muted-foreground">Ex.: 45 → mostra grupos com mediana entre 30% e 60%.</div>
        </CardContent>
      </Card>

      {/* Relação de Grupos */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Relação de Grupos</h3>
      </div>

      {/* Tabela principal — blocos 25/50/LL com “faixas” visuais */}
      <div className="rounded-2xl border overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/60 sticky top-0 backdrop-blur">
            <tr className="text-xs">
              <th className="p-2 text-left align-bottom" colSpan={5}></th>
              <th className="p-2 text-center bg-muted/40" colSpan={1}></th>
              <th className="p-2 text-center bg-emerald-50/60 border-x" colSpan={2}>25%</th>
              <th className="p-2 text-center bg-sky-50/60 border-x" colSpan={2}>50%</th>
              <th className="p-2 text-center bg-amber-50/70 border-x" colSpan={5}>LL</th>
              <th className="p-2 text-center" colSpan={5}></th>
            </tr>
            <tr>
              <th className="p-2 text-left">ADMINISTRADORA</th>
              <th className="p-2 text-left">SEGMENTO</th>
              <th className="p-2 text-left">GRUPO</th>
              <th className="p-2 text-right">PARTICIPANTES</th>
              <th className="p-2 text-center">FAIXA DE CRÉDITO</th>
              <th className="p-2 text-right">Total Entregas</th>

              <th className="p-2 text-right bg-emerald-50/60 border-l rounded-l-lg">25% Entregas</th>
              <th className="p-2 text-right bg-emerald-50/60 border-r rounded-r-lg">25% Ofertas</th>

              <th className="p-2 text-right bg-sky-50/60 border-l rounded-l-lg">50% Entregas</th>
              <th className="p-2 text-right bg-sky-50/60 border-r rounded-r-lg">50% Ofertas</th>

              <th className="p-2 text-right bg-amber-50/70 border-l rounded-l-lg">LL Entregas</th>
              <th className="p-2 text-right bg-amber-50/70">LL Ofertas</th>
              <th className="p-2 text-right bg-amber-50/70">Maior %</th>
              <th className="p-2 text-right bg-amber-50/70">Menor %</th>
              <th className="p-2 text-right bg-amber-50/70 border-r rounded-r-lg">Mediana</th>

              <th className="p-2 text-center">Pz Enc</th>
              <th className="p-2 text-center">Vencimento</th>
              <th className="p-2 text-center">Sorteio</th>
              <th className="p-2 text-center">Assembleia</th>
              <th className="p-2 text-right">Referência</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={21} className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 inline animate-spin mr-2" /> Carregando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={21} className="p-6 text-center text-muted-foreground">Sem registros para os filtros aplicados.</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="odd:bg-muted/30">
                  <td className="p-2">{r.administradora}</td>
                  <td className="p-2">{r.segmento}</td>
                  <td className="p-2 font-medium">{r.codigo}</td>
                  <td className="p-2 text-right">{r.participantes ?? "—"}</td>
                  <td className="p-2 text-center">
                    {r.faixa_min != null && r.faixa_max != null
                      ? r.faixa_min.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) + " — " +
                        r.faixa_max.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : "—"}
                  </td>

                  <td className="p-2 text-right font-semibold">{r.total_entregas}</td>

                  <td className="p-2 text-right bg-emerald-50/40 border-l">{r.fix25_entregas}</td>
                  <td className="p-2 text-right bg-emerald-50/40 border-r">{r.fix25_ofertas}</td>

                  <td className="p-2 text-right bg-sky-50/40 border-l">{r.fix50_entregas}</td>
                  <td className="p-2 text-right bg-sky-50/40 border-r">{r.fix50_ofertas}</td>

                  <td className="p-2 text-right bg-amber-50/50 border-l">{r.ll_entregas}</td>
                  <td className="p-2 text-right bg-amber-50/50">{r.ll_ofertas}</td>
                  <td className="p-2 text-right bg-amber-50/50">{r.ll_maior != null ? toPct4(r.ll_maior) : "—"}</td>
                  <td className="p-2 text-right bg-amber-50/50">{r.ll_menor != null ? toPct4(r.ll_menor) : "—"}</td>
                  <td className="p-2 text-right bg-amber-50/50 border-r">{r.mediana != null ? toPct4(r.mediana) : "—"}</td>

                  <td className="p-2 text-center">{r.prazo_encerramento_meses ?? "—"}</td>
                  <td className="p-2 text-center">{formatBR(toYMD(r.prox_vencimento))}</td>
                  <td className="p-2 text-center">{formatBR(toYMD(r.prox_sorteio))}</td>
                  <td className="p-2 text-center">{formatBR(toYMD(r.prox_assembleia))}</td>
                  <td className="p-2 text-right font-semibold">{r.referencia ?? "—"}</td>
                </tr>
              ))
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
      {ofertaOpen && <OverlayOfertaLance onClose={() => setOfertaOpen(false)} />}
      {updOpen && <OverlayAtualizarGrupos rows={updRows} onClose={() => setUpdOpen(false)} onSaved={async () => await carregar()} />}
    </div>
  );
}
