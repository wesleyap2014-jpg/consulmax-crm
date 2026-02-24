// src/pages/Processos.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import {
  Loader2,
  Plus,
  Settings2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Wrench,
} from "lucide-react";

/** =========================
 * Types
 * ========================= */
type ProcessType = "faturamento" | "transferencia_cota";
type OwnerKind = "administradora" | "corretora" | "cliente";

type Phase = {
  id: string;
  process_type: ProcessType;
  name: string;
  sla_kind: "days" | "hours";
  sla_days: number | null;
  sla_minutes: number | null;
  sort_order: number;
  is_active: boolean;
  is_final: boolean;
};

type ProcessRow = {
  id: string;
  type: ProcessType;
  status: "open" | "closed";
  start_date: string; // YYYY-MM-DD
  administradora: string | null;
  proposta: string | null;

  grupo: string | null;
  cota: string | null;
  segmento: string | null;

  cliente_nome: string | null;
  credito_disponivel: number | null;

  current_phase_id: string | null;
  current_phase_started_at: string;
  current_owner_kind: OwnerKind;

  phase_name?: string | null;
  deadline?: string | null;
  sla_status?: "Atrasado" | "No dia" | "Em dia";
};

/** =========================
 * Helpers
 * ========================= */
function onlyDigits(s: string) {
  return (s || "").replace(/\D+/g, "");
}

function formatBRDateFromISO(isoDate: string | null | undefined) {
  if (!isoDate) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function parseBRDateToISO(br: string) {
  // dd/mm/aaaa -> yyyy-mm-dd (retorna null se inválido)
  const t = (br || "").trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (yyyy < 1900 || yyyy > 2200) return null;
  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;
  const iso = `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  return iso;
}

function formatMoneyBR(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function slaChip(s: ProcessRow["sla_status"]) {
  if (s === "Atrasado") return { label: "Atrasado", icon: AlertTriangle };
  if (s === "No dia") return { label: "No dia", icon: Clock };
  return { label: "Em dia", icon: CheckCircle2 };
}

async function getBearer() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? `Bearer ${token}` : null;
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const bearer = await getBearer();
  const headers: any = {
    "Content-Type": "application/json",
    ...(opts?.headers || {}),
  };
  if (bearer) headers.Authorization = bearer;

  const res = await fetch(url, { ...opts, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    const msg = json?.message || `Erro HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

/** =========================
 * UI
 * ========================= */
export default function Processos() {
  const [tab, setTab] = useState<ProcessType>("faturamento");

  // phases
  const [phases, setPhases] = useState<Phase[]>([]);
  const phasesById = useMemo(() => Object.fromEntries(phases.map((p) => [p.id, p])), [phases]);

  // list
  const [rows, setRows] = useState<ProcessRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // pagination
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [total, setTotal] = useState(0);

  // dialogs
  const [openNew, setOpenNew] = useState(false);
  const [openPhases, setOpenPhases] = useState(false);

  const [treating, setTreating] = useState<ProcessRow | null>(null);
  const [openTreat, setOpenTreat] = useState(false);

  const [finalizing, setFinalizing] = useState<ProcessRow | null>(null);
  const [openFinalize, setOpenFinalize] = useState(false);

  // New form
  const [nfStartBR, setNfStartBR] = useState(() => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  });
  const [nfAdmin, setNfAdmin] = useState<string>("__none__");
  const [nfProposta, setNfProposta] = useState("");
  const [nfGrupo, setNfGrupo] = useState("");
  const [nfCota, setNfCota] = useState("");
  const [nfCliente, setNfCliente] = useState("");
  const [nfSegmento, setNfSegmento] = useState("");
  const [nfCredito, setNfCredito] = useState<string>("");
  const [nfPhaseId, setNfPhaseId] = useState<string>("__none__");
  const [nfOwner, setNfOwner] = useState<OwnerKind>("corretora");
  const [nfSaving, setNfSaving] = useState(false);
  const propostaBusyRef = useRef(false);

  // Treat form
  const [tfPhaseId, setTfPhaseId] = useState<string>("__none__");
  const [tfOwner, setTfOwner] = useState<OwnerKind>("corretora");
  const [tfNote, setTfNote] = useState("");
  const [tfSaving, setTfSaving] = useState(false);

  // Finalize form
  const [ffUserSat, setFfUserSat] = useState(80);
  const [ffClientSat, setFfClientSat] = useState(70);
  const [ffImprove, setFfImprove] = useState("");
  const [ffSaving, setFfSaving] = useState(false);
  const [finalStatsText, setFinalStatsText] = useState<string | null>(null);

  // Phase management form
  const [pmEditing, setPmEditing] = useState<Phase | null>(null);
  const [pmName, setPmName] = useState("");
  const [pmSlaKind, setPmSlaKind] = useState<"days" | "hours">("days");
  const [pmDays, setPmDays] = useState("1");
  const [pmHoursHHMM, setPmHoursHHMM] = useState("08:00");
  const [pmOrder, setPmOrder] = useState("100");
  const [pmFinal, setPmFinal] = useState(false);
  const [pmSaving, setPmSaving] = useState(false);

  /** -------- Load phases (direct from DB via supabase client) --------
   * (A etapa 2 não criou endpoints de fases; aqui vamos direto no Supabase,
   * mantendo simples e rápido. Se você preferir, depois criamos endpoints.)
   */
  async function loadPhasesFor(type: ProcessType) {
    const { data, error } = await supabase
      .from("process_phases")
      .select("id, process_type, name, sla_kind, sla_days, sla_minutes, sort_order, is_active, is_final")
      .eq("process_type", type)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw new Error(error.message);
    setPhases((data || []) as any);
  }

  /** -------- Load list -------- */
  async function loadList(type: ProcessType, p: number, silent = false) {
    if (!silent) setLoading(true);
    try {
      const resp = await apiFetch<{
        ok: true;
        page: number;
        pageSize: number;
        total: number;
        rows: ProcessRow[];
      }>(`/api/processes?type=${type}&status=open&page=${p}&pageSize=${pageSize}`);

      setRows(resp.rows || []);
      setTotal(resp.total || 0);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function refreshAll() {
    setRefreshing(true);
    try {
      await Promise.all([loadPhasesFor(tab), loadList(tab, page, true)]);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    // ao trocar a aba, volta pra pg 1 e carrega tudo
    setPage(1);
    setRows([]);
    setTotal(0);
    setFinalStatsText(null);

    (async () => {
      setLoading(true);
      try {
        await loadPhasesFor(tab);
        await loadList(tab, 1, true);
      } catch {
        // sem toast aqui (você já tem um padrão no projeto; se quiser eu adapto)
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    // ao mudar página
    (async () => {
      await loadList(tab, page, false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  /** -------- New process: lookup proposta -------- */
  async function lookupPropostaIfNeeded(propostaRaw: string) {
    const proposta = (propostaRaw || "").trim();
    if (!proposta) return;

    if (propostaBusyRef.current) return;
    propostaBusyRef.current = true;

    try {
      const resp = await apiFetch<any>("/api/processes/lookup-proposta", {
        method: "POST",
        body: JSON.stringify({ proposta }),
      });

      if (resp?.found && resp?.data) {
        const d = resp.data;
        if (d.administradora && (nfAdmin === "__none__" || !nfAdmin)) setNfAdmin(String(d.administradora));
        if (d.grupo) setNfGrupo(String(d.grupo));
        if (d.cota) setNfCota(String(d.cota));
        if (d.cliente_nome) setNfCliente(String(d.cliente_nome));
        if (d.segmento) setNfSegmento(String(d.segmento));
      }
    } catch {
      // silencioso (você pediu sem ficar testando/enchendo)
    } finally {
      propostaBusyRef.current = false;
    }
  }

  /** -------- New process: submit -------- */
  async function submitNew() {
    const startISO = parseBRDateToISO(nfStartBR);
    if (!startISO) return;

    const credito = nfCredito ? Number(String(nfCredito).replace(/\./g, "").replace(",", ".")) : null;

    setNfSaving(true);
    try {
      await apiFetch<any>("/api/processes", {
        method: "POST",
        body: JSON.stringify({
          type: tab,
          start_date: startISO,
          administradora: nfAdmin === "__none__" ? null : nfAdmin,
          proposta: nfProposta || null,
          grupo: nfGrupo || null,
          cota: nfCota || null,
          cliente_nome: nfCliente || null,
          segmento: nfSegmento || null,
          credito_disponivel: credito,
          phase_id: nfPhaseId === "__none__" ? null : nfPhaseId,
          owner_kind: nfOwner,
          note: "Processo criado",
        }),
      });

      setOpenNew(false);
      // reset básico
      setNfProposta("");
      setNfGrupo("");
      setNfCota("");
      setNfCliente("");
      setNfSegmento("");
      setNfCredito("");
      setNfPhaseId("__none__");
      setNfOwner("corretora");

      await loadList(tab, 1, true);
      setPage(1);
    } catch {
      // sem toast aqui
    } finally {
      setNfSaving(false);
    }
  }

  /** -------- Treat: open -------- */
  function openTreatDialog(row: ProcessRow) {
    setTreating(row);
    setTfPhaseId(row.current_phase_id || "__none__");
    setTfOwner(row.current_owner_kind || "corretora");
    setTfNote("");
    setOpenTreat(true);
  }

  /** -------- Treat: submit -------- */
  async function submitTreat() {
    if (!treating) return;

    const phaseId = tfPhaseId === "__none__" ? null : tfPhaseId;
    const selectedPhase = phaseId ? phasesById[phaseId] : null;

    // se escolheu fase final -> abre finalização ao invés de patch simples
    if (selectedPhase?.is_final) {
      setOpenTreat(false);
      setFinalizing(treating);
      setFinalStatsText(null);
      setOpenFinalize(true);
      return;
    }

    setTfSaving(true);
    try {
      await apiFetch<any>(`/api/processes/${treating.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          phase_id: phaseId,
          owner_kind: tfOwner,
          note: tfNote || null,
        }),
      });

      setOpenTreat(false);
      setTreating(null);
      await loadList(tab, page, true);
    } catch {
      // sem toast
    } finally {
      setTfSaving(false);
    }
  }

  /** -------- Finalize: submit -------- */
  async function submitFinalize() {
    if (!finalizing) return;

    setFfSaving(true);
    try {
      const resp = await apiFetch<any>(`/api/processes/${finalizing.id}/finalize`, {
        method: "POST",
        body: JSON.stringify({
          user_satisfaction: ffUserSat,
          client_satisfaction: ffClientSat,
          improvement_text: ffImprove || null,
        }),
      });

      // feedback visual simples (texto)
      if (resp?.stats?.total) {
        const t = resp.stats.total;
        const a = resp.stats.by_owner?.administradora;
        const c = resp.stats.by_owner?.corretora;
        const l = resp.stats.by_owner?.cliente;

        const totalDays = t.days ?? 0;
        setFinalStatsText(
          `Esse processo levou aproximadamente ${totalDays} dia(s). ` +
            `Administradora: ${a?.days ?? 0} dia(s) | Corretora: ${c?.days ?? 0} dia(s) | Cliente: ${l?.days ?? 0} dia(s).`
        );
      } else {
        setFinalStatsText("Processo finalizado com sucesso.");
      }

      // remove da lista (está closed)
      setRows((prev) => prev.filter((r) => r.id !== finalizing.id));
      setTotal((prev) => Math.max(0, prev - 1));
      setOpenFinalize(false);
      setFinalizing(null);
      setFfImprove("");
    } catch {
      // sem toast
    } finally {
      setFfSaving(false);
    }
  }

  /** -------- Phase mgmt: open -------- */
  function openNewPhase() {
    setPmEditing(null);
    setPmName("");
    setPmSlaKind("days");
    setPmDays("1");
    setPmHoursHHMM("08:00");
    setPmOrder("100");
    setPmFinal(false);
  }

  function openEditPhase(p: Phase) {
    setPmEditing(p);
    setPmName(p.name || "");
    setPmSlaKind(p.sla_kind || "days");
    setPmDays(String(p.sla_days ?? "1"));
    const minutes = Number(p.sla_minutes ?? 480);
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    setPmHoursHHMM(`${hh}:${mm}`);
    setPmOrder(String(p.sort_order ?? 100));
    setPmFinal(!!p.is_final);
  }

  async function savePhase() {
    const name = pmName.trim();
    if (!name) return;

    const sort_order = Number(pmOrder || 100) || 100;

    let sla_days: number | null = null;
    let sla_minutes: number | null = null;

    if (pmSlaKind === "days") {
      sla_days = Math.max(0, Number(pmDays || 0) || 0);
      sla_minutes = null;
    } else {
      const m = /^(\d{2}):(\d{2})$/.exec(pmHoursHHMM.trim());
      const hh = m ? Number(m[1]) : 8;
      const mm = m ? Number(m[2]) : 0;
      sla_minutes = Math.max(0, hh * 60 + mm);
      sla_days = null;
    }

    setPmSaving(true);
    try {
      if (!pmEditing) {
        const { error } = await supabase.from("process_phases").insert({
          process_type: tab,
          name,
          sla_kind: pmSlaKind,
          sla_days,
          sla_minutes,
          sort_order,
          is_active: true,
          is_final: pmFinal,
        });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("process_phases")
          .update({
            name,
            sla_kind: pmSlaKind,
            sla_days,
            sla_minutes,
            sort_order,
            is_final: pmFinal,
          })
          .eq("id", pmEditing.id);
        if (error) throw new Error(error.message);
      }

      await loadPhasesFor(tab);
      openNewPhase();
    } catch {
      // sem toast
    } finally {
      setPmSaving(false);
    }
  }

  async function disablePhase(id: string) {
    try {
      const { error } = await supabase.from("process_phases").update({ is_active: false }).eq("id", id);
      if (error) throw new Error(error.message);
      await loadPhasesFor(tab);
    } catch {
      // sem toast
    }
  }

  /** -------- Render -------- */
  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));

  // administradoras (por enquanto texto livre + presets)
  const adminOptions = useMemo(() => {
    const set = new Set<string>();
    ["EMBRACON", "MAGGI", "HS CONSÓRCIOS"].forEach((s) => set.add(s));
    phases.forEach(() => null);
    return Array.from(set);
  }, [phases]);

  const activePhases = useMemo(() => phases.filter((p) => p.is_active), [phases]);

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-slate-900">Processos</CardTitle>
            <div className="text-slate-600 text-sm mt-1">
              Acompanhe prazos, SLAs e tratativas em andamento.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setOpenPhases(true)}
              title="Gestão de Fases"
            >
              <Settings2 className="h-4 w-4" />
              Gestão de Fases
            </Button>

            <Button className="gap-2" onClick={() => setOpenNew(true)}>
              <Plus className="h-4 w-4" />
              Novo
            </Button>

            <Button variant="outline" className="gap-2" onClick={refreshAll} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <Tabs value={tab} onValueChange={(v) => setTab(v as ProcessType)}>
            <TabsList className="w-full justify-start">
              <TabsTrigger value="faturamento">Faturamento</TabsTrigger>
              <TabsTrigger value="transferencia_cota">Transferência de Cota</TabsTrigger>
            </TabsList>

            <TabsContent value="faturamento" className="mt-4">
              <ProcessTable
                rows={rows}
                loading={loading}
                onTreat={openTreatDialog}
                page={page}
                totalPages={totalPages}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
              />
            </TabsContent>

            <TabsContent value="transferencia_cota" className="mt-4">
              <ProcessTable
                rows={rows}
                loading={loading}
                onTreat={openTreatDialog}
                page={page}
                totalPages={totalPages}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ============ DIALOG: NOVO ============ */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo processo • {tab === "faturamento" ? "Faturamento" : "Transferência de Cota"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Data de início (dd/mm/aaaa)</Label>
              <Input value={nfStartBR} onChange={(e) => setNfStartBR(e.target.value)} placeholder="24/02/2026" />
            </div>

            <div>
              <Label>Administradora</Label>
              <Select value={nfAdmin} onValueChange={setNfAdmin}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {adminOptions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-slate-500 mt-1">Você pode ajustar depois.</div>
            </div>

            <div>
              <Label>Proposta</Label>
              <Input
                value={nfProposta}
                onChange={(e) => setNfProposta(e.target.value)}
                onBlur={() => lookupPropostaIfNeeded(nfProposta)}
                onKeyDown={(e) => {
                  if (e.key === "Tab") lookupPropostaIfNeeded(nfProposta);
                }}
                placeholder="0009535214"
              />
              <div className="text-xs text-slate-500 mt-1">Ao sair do campo (ou TAB), tenta preencher grupo/cota/cliente/segmento.</div>
            </div>

            <div>
              <Label>Crédito disponível (R$)</Label>
              <Input
                value={nfCredito}
                onChange={(e) => setNfCredito(e.target.value)}
                placeholder="60000"
              />
            </div>

            <div>
              <Label>Grupo</Label>
              <Input value={nfGrupo} onChange={(e) => setNfGrupo(e.target.value)} placeholder="9672" />
            </div>

            <div>
              <Label>Cota</Label>
              <Input value={nfCota} onChange={(e) => setNfCota(e.target.value)} placeholder="113" />
            </div>

            <div className="md:col-span-2">
              <Label>Nome (cliente)</Label>
              <Input value={nfCliente} onChange={(e) => setNfCliente(e.target.value)} placeholder="Nome do cliente" />
            </div>

            <div>
              <Label>Segmento</Label>
              <Input value={nfSegmento} onChange={(e) => setNfSegmento(e.target.value)} placeholder="Automóvel / Imóvel / ..." />
            </div>

            <div>
              <Label>Fase</Label>
              <Select value={nfPhaseId} onValueChange={setNfPhaseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Automático (primeira fase)</SelectItem>
                  {activePhases.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="text-xs text-slate-500 mt-1">
                {nfPhaseId !== "__none__" && phasesById[nfPhaseId]
                  ? `SLA: ${
                      phasesById[nfPhaseId].sla_kind === "days"
                        ? `${phasesById[nfPhaseId].sla_days ?? 0} dia(s)`
                        : `${String(Math.floor((phasesById[nfPhaseId].sla_minutes ?? 0) / 60)).padStart(2, "0")}:${String(
                            (phasesById[nfPhaseId].sla_minutes ?? 0) % 60
                          ).padStart(2, "0")} h`
                    }`
                  : "SLA: conforme fase inicial"}
              </div>
            </div>

            <div>
              <Label>Responsável pela fase</Label>
              <Select value={nfOwner} onValueChange={(v) => setNfOwner(v as OwnerKind)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="administradora">Administradora</SelectItem>
                  <SelectItem value="corretora">Corretora</SelectItem>
                  <SelectItem value="cliente">Cliente</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-slate-500 mt-1">Usuário responsável: capturado automaticamente (logado).</div>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setOpenNew(false)} disabled={nfSaving}>
              Cancelar
            </Button>
            <Button onClick={submitNew} disabled={nfSaving || !parseBRDateToISO(nfStartBR)}>
              {nfSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DIALOG: TRATAR ============ */}
      <Dialog open={openTreat} onOpenChange={setOpenTreat}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Tratar processo
            </DialogTitle>
          </DialogHeader>

          {treating ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-700">
                <div className="font-medium text-slate-900">{treating.cliente_nome || "—"}</div>
                <div className="text-slate-600">
                  Proposta: {treating.proposta || "—"} • Grupo: {treating.grupo || "—"} • Cota: {treating.cota || "—"}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label>Fase</Label>
                  <Select value={tfPhaseId} onValueChange={setTfPhaseId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {activePhases.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.is_final ? " (Final)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-slate-500 mt-1">
                    {tfPhaseId !== "__none__" && phasesById[tfPhaseId]
                      ? `SLA: ${
                          phasesById[tfPhaseId].sla_kind === "days"
                            ? `${phasesById[tfPhaseId].sla_days ?? 0} dia(s)`
                            : `${String(Math.floor((phasesById[tfPhaseId].sla_minutes ?? 0) / 60)).padStart(2, "0")}:${String(
                                (phasesById[tfPhaseId].sla_minutes ?? 0) % 60
                              ).padStart(2, "0")} h`
                        }`
                      : "—"}
                  </div>
                </div>

                <div>
                  <Label>Responsável pela fase</Label>
                  <Select value={tfOwner} onValueChange={(v) => setTfOwner(v as OwnerKind)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="administradora">Administradora</SelectItem>
                      <SelectItem value="corretora">Corretora</SelectItem>
                      <SelectItem value="cliente">Cliente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Nota / Tratativa</Label>
                  <Input value={tfNote} onChange={(e) => setTfNote(e.target.value)} placeholder="Ex.: Enviei docs / aguardando retorno..." />
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setOpenTreat(false)} disabled={tfSaving}>
              Cancelar
            </Button>
            <Button onClick={submitTreat} disabled={tfSaving || !treating}>
              {tfSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DIALOG: FINALIZAR ============ */}
      <Dialog open={openFinalize} onOpenChange={setOpenFinalize}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Finalizar processo</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {finalizing ? (
              <div className="text-sm text-slate-700">
                <div className="font-medium text-slate-900">{finalizing.cliente_nome || "—"}</div>
                <div className="text-slate-600">
                  Proposta: {finalizing.proposta || "—"} • Grupo: {finalizing.grupo || "—"} • Cota: {finalizing.cota || "—"}
                </div>
              </div>
            ) : null}

            {finalStatsText ? (
              <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-md p-3">
                {finalStatsText}
              </div>
            ) : (
              <>
                <SatisfactionSlider
                  label="Pela sua percepção: qual seu nível de satisfação com o processo?"
                  value={ffUserSat}
                  onChange={setFfUserSat}
                />
                <SatisfactionSlider
                  label="Como você considera que o cliente se sentiu durante o processo?"
                  value={ffClientSat}
                  onChange={setFfClientSat}
                />
                <div>
                  <Label>O que poderia melhorar a experiência do cliente?</Label>
                  <Input value={ffImprove} onChange={(e) => setFfImprove(e.target.value)} placeholder="Escreva aqui..." />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setOpenFinalize(false)} disabled={ffSaving}>
              Fechar
            </Button>

            {!finalStatsText ? (
              <Button onClick={submitFinalize} disabled={ffSaving || !finalizing}>
                {ffSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar e Finalizar
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DIALOG: GESTÃO DE FASES ============ */}
      <Dialog open={openPhases} onOpenChange={setOpenPhases}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Gestão de Fases • {tab === "faturamento" ? "Faturamento" : "Transferência de Cota"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Lista */}
            <div className="border border-slate-200 rounded-md p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium text-slate-900">Fases ativas</div>
                <Button variant="outline" size="sm" onClick={openNewPhase} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Nova
                </Button>
              </div>

              <div className="mt-3 space-y-2 max-h-[360px] overflow-auto pr-1">
                {activePhases.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-md border border-slate-200 p-2 hover:bg-slate-50 cursor-pointer"
                    onClick={() => openEditPhase(p)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-slate-900">
                        {p.name} {p.is_final ? <span className="text-xs text-slate-500">(Final)</span> : null}
                      </div>
                      <div className="text-xs text-slate-600">
                        {p.sla_kind === "days"
                          ? `${p.sla_days ?? 0} dia(s)`
                          : `${String(Math.floor((p.sla_minutes ?? 0) / 60)).padStart(2, "0")}:${String((p.sla_minutes ?? 0) % 60).padStart(
                              2,
                              "0"
                            )} h`}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Ordem: {p.sort_order}</div>
                  </div>
                ))}
                {!activePhases.length ? <div className="text-sm text-slate-600">Nenhuma fase ativa.</div> : null}
              </div>
            </div>

            {/* Editor */}
            <div className="border border-slate-200 rounded-md p-3">
              <div className="font-medium text-slate-900">{pmEditing ? "Editar fase" : "Nova fase"}</div>

              <div className="mt-3 space-y-3">
                <div>
                  <Label>Nome da fase</Label>
                  <Input value={pmName} onChange={(e) => setPmName(e.target.value)} placeholder="Ex.: Aguardando Administradora" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tipo SLA</Label>
                    <Select value={pmSlaKind} onValueChange={(v) => setPmSlaKind(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="days">Dias</SelectItem>
                        <SelectItem value="hours">Horas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Ordem</Label>
                    <Input value={pmOrder} onChange={(e) => setPmOrder(e.target.value)} placeholder="100" />
                  </div>
                </div>

                {pmSlaKind === "days" ? (
                  <div>
                    <Label>SLA (dias)</Label>
                    <Input value={pmDays} onChange={(e) => setPmDays(e.target.value)} placeholder="2" />
                  </div>
                ) : (
                  <div>
                    <Label>SLA (hh:mm)</Label>
                    <Input value={pmHoursHHMM} onChange={(e) => setPmHoursHHMM(e.target.value)} placeholder="08:00" />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={pmFinal}
                    onChange={(e) => setPmFinal(e.target.checked)}
                  />
                  <div className="text-sm text-slate-700">Marcar como “Processo Finalizado”</div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex gap-2">
                    {pmEditing ? (
                      <Button
                        variant="outline"
                        onClick={() => disablePhase(pmEditing.id)}
                        disabled={pmSaving}
                        className="gap-2"
                        title="Desativar fase (não apaga)"
                      >
                        Desativar
                      </Button>
                    ) : null}
                  </div>

                  <Button onClick={savePhase} disabled={pmSaving || !pmName.trim()}>
                    {pmSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Salvar
                  </Button>
                </div>

                <div className="text-xs text-slate-500">
                  Dica: só deve existir **uma** fase final por tipo. Se marcar outra como final, depois a gente ajusta a regra.
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setOpenPhases(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** =========================
 * Table component
 * ========================= */
function ProcessTable(props: {
  rows: ProcessRow[];
  loading: boolean;
  onTreat: (row: ProcessRow) => void;
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { rows, loading, onTreat, page, totalPages, onPrev, onNext } = props;

  return (
    <div className="space-y-3">
      <div className="overflow-auto border border-slate-200 rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="text-left p-3 whitespace-nowrap">Início</th>
              <th className="text-left p-3 whitespace-nowrap">Grupo</th>
              <th className="text-left p-3 whitespace-nowrap">Cota</th>
              <th className="text-left p-3 whitespace-nowrap">Nome</th>
              <th className="text-left p-3 whitespace-nowrap">Segmento</th>
              <th className="text-left p-3 whitespace-nowrap">Status</th>
              <th className="text-left p-3 whitespace-nowrap">Tratar</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-600">
                  <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                  Carregando...
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((r) => {
                const chip = slaChip(r.sla_status);
                const Icon = chip.icon;

                return (
                  <tr key={r.id} className="border-t border-slate-200">
                    <td className="p-3 whitespace-nowrap">{formatBRDateFromISO(r.start_date)}</td>
                    <td className="p-3 whitespace-nowrap">{r.grupo || "—"}</td>
                    <td className="p-3 whitespace-nowrap">{r.cota || "—"}</td>
                    <td className="p-3">
                      <div className="font-medium text-slate-900">{r.cliente_nome || "—"}</div>
                      <div className="text-xs text-slate-500">
                        {r.proposta ? `Proposta ${r.proposta}` : "—"}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">{r.segmento || "—"}</td>
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className="inline-flex items-center gap-2 px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-800"
                        title={r.deadline ? `Prazo: ${new Date(r.deadline).toLocaleString("pt-BR")}` : ""}
                      >
                        <Icon className="h-4 w-4" />
                        {chip.label}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => onTreat(r)}>
                        <Wrench className="h-4 w-4" />
                        Tratar
                      </Button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-600">
                  Nenhum processo em andamento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">
          Página <span className="font-medium text-slate-900">{page}</span> de{" "}
          <span className="font-medium text-slate-900">{totalPages}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPrev} disabled={page <= 1} className="gap-2">
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <Button variant="outline" size="sm" onClick={onNext} disabled={page >= totalPages} className="gap-2">
            Próxima
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** =========================
 * Slider with emojis
 * ========================= */
function SatisfactionSlider(props: { label: string; value: number; onChange: (v: number) => void }) {
  const { label, value, onChange } = props;

  const emoji = useMemo(() => {
    if (value <= 20) return "😠";
    if (value <= 40) return "😕";
    if (value <= 60) return "😐";
    if (value <= 80) return "🙂";
    return "😄";
  }, [value]);

  const caption = useMemo(() => {
    if (value <= 20) return "Muito insatisfeito";
    if (value <= 40) return "Insatisfeito";
    if (value <= 60) return "Neutro";
    if (value <= 80) return "Satisfeito";
    return "Muito satisfeito";
  }, [value]);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <div className="text-2xl">{emoji}</div>
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full"
        />
        <div className="text-sm text-slate-700 w-[140px] text-right">{caption}</div>
      </div>
      <div className="text-xs text-slate-500">Valor: {value}/100</div>
    </div>
  );
}
