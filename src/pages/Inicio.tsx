// src/pages/Inicio.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Calendar, AlertTriangle, ArrowRight, RefreshCcw, ListChecks } from "lucide-react";

type UserRow = {
  id: string;
  auth_user_id: string;
  nome: string;
  role: string;
  user_role?: string | null;
  is_active?: boolean | null;
};

type AgendaRow = {
  id: string;
  tipo: string;
  titulo: string;
  inicio_at: string;
  fim_at: string;
  user_id: string | null;
  cliente_nome?: string | null;
  lead_nome?: string | null;
  telefone?: string | null;
  videocall_url?: string | null;
};

type OppRow = {
  id: string;
  valor_credito: number | null;
  stage: string;
  expected_close_at: string | null; // date (YYYY-MM-DD)
  vendedor_id: string;
  lead_id: string;
};

type LeadRow = { id: string; nome: string; telefone?: string | null };

const ALL = "__all__";
const TZ_RO = "America/Porto_Velho";

/** --------- Date helpers (fixos para RO) ---------- */
function ymdInTZ(date: Date, timeZone = TZ_RO) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`; // YYYY-MM-DD
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function brDateFromYMD(ymd?: string | null) {
  if (!ymd) return "—";
  // ymd = YYYY-MM-DD
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function fmtDTInTZ(iso: string, timeZone = TZ_RO) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function isAdmin(u?: UserRow | null) {
  const r = (u?.role || u?.user_role || "").toLowerCase();
  return r === "admin";
}

/** Converte YMD local (RO) para range ISO (UTC) usando o relógio do browser.
 *  Como você está em RO, isso evita “deslizar data”.
 */
function rangeISOFromLocalYMD(ymd: string) {
  // isso cria em horário local do navegador
  const startLocal = new Date(`${ymd}T00:00:00`);
  const endLocal = new Date(`${ymd}T23:59:59.999`);
  return { startISO: startLocal.toISOString(), endISO: endLocal.toISOString() };
}

function rangeISOFromLocalYMDSpan(startYMD: string, endYMDExclusive: string) {
  // start inclusive, end exclusive (00:00 do dia seguinte)
  const startLocal = new Date(`${startYMD}T00:00:00`);
  const endLocal = new Date(`${endYMDExclusive}T00:00:00`);
  return { startISO: startLocal.toISOString(), endISO: endLocal.toISOString() };
}

export default function Inicio() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [me, setMe] = useState<UserRow | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const admin = useMemo(() => isAdmin(me), [me]);

  const [vendorScope, setVendorScope] = useState<string>(ALL);
  const scopedUser = useMemo(
    () => (vendorScope === ALL ? null : usersById.get(vendorScope) || null),
    [vendorScope, usersById]
  );

  const now = useMemo(() => new Date(), []);
  const todayYMD = useMemo(() => ymdInTZ(new Date(), TZ_RO), []);
  const tomorrowYMD = useMemo(() => ymdInTZ(addDays(new Date(), 1), TZ_RO), []);
  const weekStartYMD = todayYMD;
  const weekEndExclusiveYMD = useMemo(() => ymdInTZ(addDays(new Date(), 8), TZ_RO), []); // próximos 7 dias (hoje + 7)

  const [eventsToday, setEventsToday] = useState<AgendaRow[]>([]);
  const [eventsTomorrow, setEventsTomorrow] = useState<AgendaRow[]>([]);
  const [eventsWeek, setEventsWeek] = useState<AgendaRow[]>([]);

  const [overdueOpps, setOverdueOpps] = useState<(OppRow & { lead_nome?: string; lead_tel?: string | null })[]>([]);
  const [overdueTotals, setOverdueTotals] = useState({ count: 0, total: 0 });

  const lightCard =
    "bg-white/85 border-slate-200/70 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.08)]";

  const loadMeAndUsers = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const authId = auth.user?.id;
    if (!authId) {
      nav("/login", { replace: true });
      return;
    }

    const { data: meRow } = await supabase
      .from("users")
      .select("id,auth_user_id,nome,role,user_role,is_active")
      .eq("auth_user_id", authId)
      .maybeSingle();

    const { data: usersRows } = await supabase
      .from("users")
      .select("id,auth_user_id,nome,role,user_role,is_active")
      .eq("is_active", true)
      .order("nome", { ascending: true });

    setMe((meRow as any) || null);
    setUsers((usersRows as any) || []);

    const adm = isAdmin((meRow as any) || null);
    setVendorScope(adm ? ALL : ((meRow as any)?.id || ALL));
  }, [nav]);

  const loadAgendaRange = useCallback(
    async (scopeUserId: string, range: { startISO: string; endISO: string }) => {
      let q = supabase
        .from("v_agenda_eventos_enriquecida")
        .select("id,tipo,titulo,inicio_at,fim_at,user_id,cliente_nome,lead_nome,telefone,videocall_url")
        .gte("inicio_at", range.startISO)
        .lt("inicio_at", range.endISO)
        .order("inicio_at", { ascending: true })
        .limit(50);

      // vendedor vê só dele; admin pode filtrar vendedor específico
      if (!admin) q = q.eq("user_id", scopeUserId);
      if (admin && scopeUserId !== ALL) q = q.eq("user_id", scopeUserId);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any as AgendaRow[];
    },
    [admin]
  );

  const loadOverdueOpps = useCallback(
    async (scopeUserId: string) => {
      // Oportunidades atrasadas: expected_close_at < hoje (RO)
      let q = supabase
        .from("opportunities")
        .select("id,valor_credito,stage,expected_close_at,vendedor_id,lead_id")
        .lt("expected_close_at", todayYMD)
        .not("stage", "in", '("fechado_ganho","fechado_perdido")')
        .order("expected_close_at", { ascending: true })
        .limit(20);

      if (!admin) q = q.eq("vendedor_id", scopeUserId);
      if (admin && scopeUserId !== ALL) q = q.eq("vendedor_id", scopeUserId);

      const { data: oppRows, error } = await q;
      if (error) throw error;

      const rows = (oppRows || []) as any as OppRow[];
      const count = rows.length;
      const total = rows.reduce((acc, r) => acc + (Number(r.valor_credito || 0) || 0), 0);

      // Enriquecer com lead (nome/telefone)
      const leadIds = Array.from(new Set(rows.map((o) => o.lead_id).filter(Boolean)));
      let leadsMap = new Map<string, LeadRow>();
      if (leadIds.length) {
        const { data: lds, error: lErr } = await supabase.from("leads").select("id,nome,telefone").in("id", leadIds);
        if (lErr) throw lErr;
        leadsMap = new Map((lds || []).map((l: any) => [l.id, l]));
      }

      const enriched = rows.map((o) => {
        const ld = leadsMap.get(o.lead_id);
        return { ...o, lead_nome: ld?.nome, lead_tel: ld?.telefone || null };
      });

      setOverdueOpps(enriched);
      setOverdueTotals({ count, total });
    },
    [admin, todayYMD]
  );

  const reload = useCallback(
    async (hard = false) => {
      if (!me) return;
      if (hard) setRefreshing(true);

      try {
        const scopeUserId = admin && vendorScope !== ALL ? vendorScope : !admin ? me.id : ALL;

        // HOJE
        const todayRange = rangeISOFromLocalYMD(todayYMD);
        // AMANHÃ
        const tomorrowRange = rangeISOFromLocalYMD(tomorrowYMD);
        // ESTA SEMANA (hoje + próximos 7 dias)
        const weekRange = rangeISOFromLocalYMDSpan(weekStartYMD, weekEndExclusiveYMD);

        const [t, a, w] = await Promise.all([
          loadAgendaRange(scopeUserId, { startISO: todayRange.startISO, endISO: new Date(todayRange.endISO).toISOString() }),
          loadAgendaRange(scopeUserId, { startISO: tomorrowRange.startISO, endISO: new Date(tomorrowRange.endISO).toISOString() }),
          loadAgendaRange(scopeUserId, { startISO: weekRange.startISO, endISO: weekRange.endISO }),
        ]);

        setEventsToday(t.slice(0, 12));
        setEventsTomorrow(a.slice(0, 12));
        setEventsWeek(w.slice(0, 16));

        await loadOverdueOpps(scopeUserId);
      } finally {
        if (hard) setRefreshing(false);
      }
    },
    [me, admin, vendorScope, todayYMD, tomorrowYMD, weekStartYMD, weekEndExclusiveYMD, loadAgendaRange, loadOverdueOpps]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await loadMeAndUsers();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadMeAndUsers]);

  useEffect(() => {
    if (!me) return;
    reload(false);
  }, [me?.id, vendorScope]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-slate-600 text-sm">Carregando Início…</div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] p-6 text-slate-900">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-2xl font-semibold">
            Início • <span className="text-slate-900">{me?.nome?.split(" ")?.[0] || "Max"}</span>
          </div>
          <div className="text-slate-600 text-sm">
            Fuso: <span className="font-medium">RO (Porto Velho)</span> • Hoje:{" "}
            <span className="font-medium">{brDateFromYMD(todayYMD)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {admin && (
            <div className="min-w-[260px]">
              <Select value={vendorScope} onValueChange={setVendorScope}>
                <SelectTrigger className="bg-white border border-slate-200 text-slate-900">
                  <SelectValue placeholder="Vendedor: Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos (Admin)</SelectItem>
                  {users
                    .filter((u) => (u.role || u.user_role || "").toLowerCase() !== "viewer")
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            variant="secondary"
            className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200"
            onClick={() => reload(true)}
            disabled={refreshing}
            title="Atualizar"
          >
            <RefreshCcw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Oportunidades atrasadas (sem “drift”) */}
      <div className="mt-6">
        <Card className={lightCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Oportunidades atrasadas
              <Badge className="ml-2 bg-slate-100 border border-slate-200 text-slate-800">
                {overdueTotals.count}
              </Badge>
              <span className="ml-auto text-slate-600 font-normal">
                Total: <span className="font-semibold text-slate-900">{fmtBRL(overdueTotals.total)}</span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdueOpps.length === 0 ? (
              <div className="text-slate-500 text-sm">Sem oportunidades atrasadas. 👏</div>
            ) : (
              <>
                {overdueOpps.slice(0, 8).map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {o.lead_nome || "Lead"} <span className="text-slate-500">• {o.stage}</span>
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        Previsto: <span className="font-medium">{brDateFromYMD(o.expected_close_at)}</span>
                        {o.lead_tel ? ` • Tel: ${o.lead_tel}` : ""}
                      </div>
                    </div>
                    <div className="text-sm font-semibold">{fmtBRL(Number(o.valor_credito || 0) || 0)}</div>
                  </div>
                ))}
                <div className="pt-2">
                  <Button
                    className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200"
                    onClick={() => nav("/oportunidades")}
                  >
                    Abrir Oportunidades <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline linear: Hoje / Amanhã / Esta Semana */}
      <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* HOJE */}
        <Card className={lightCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Hoje
              <Badge className="ml-2 bg-slate-100 border border-slate-200 text-slate-800">
                {eventsToday.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {eventsToday.length === 0 ? (
              <div className="text-slate-500 text-sm">Nada agendado hoje.</div>
            ) : (
              eventsToday.map((e) => (
                <div key={e.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="text-sm font-medium truncate">{e.titulo}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {fmtDTInTZ(e.inicio_at)} • {e.cliente_nome || e.lead_nome || "—"}
                  </div>
                </div>
              ))
            )}

            <div className="pt-2">
              <Button
                className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 w-full"
                onClick={() => nav("/agenda")}
              >
                Ver Agenda <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* AMANHÃ */}
        <Card className={lightCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Amanhã
              <Badge className="ml-2 bg-slate-100 border border-slate-200 text-slate-800">
                {eventsTomorrow.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {eventsTomorrow.length === 0 ? (
              <div className="text-slate-500 text-sm">Nada agendado para amanhã.</div>
            ) : (
              eventsTomorrow.map((e) => (
                <div key={e.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="text-sm font-medium truncate">{e.titulo}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {fmtDTInTZ(e.inicio_at)} • {e.cliente_nome || e.lead_nome || "—"}
                  </div>
                </div>
              ))
            )}

            <div className="pt-2">
              <Button
                className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 w-full"
                onClick={() => nav("/agenda")}
              >
                Ver Agenda <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ESTA SEMANA */}
        <Card className={lightCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <ListChecks className="h-4 w-4" /> Esta semana
              <Badge className="ml-2 bg-slate-100 border border-slate-200 text-slate-800">
                {eventsWeek.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xs text-slate-500">
              Período: <span className="font-medium">{brDateFromYMD(weekStartYMD)}</span> até{" "}
              <span className="font-medium">{brDateFromYMD(ymdInTZ(addDays(new Date(), 7), TZ_RO))}</span>
            </div>

            {eventsWeek.length === 0 ? (
              <div className="text-slate-500 text-sm">Sem eventos na semana.</div>
            ) : (
              eventsWeek.map((e) => (
                <div key={e.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="text-sm font-medium truncate">{e.titulo}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {fmtDTInTZ(e.inicio_at)} • {e.cliente_nome || e.lead_nome || "—"}
                  </div>
                </div>
              ))
            )}

            <div className="pt-2">
              <Button
                className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 w-full"
                onClick={() => nav("/agenda")}
              >
                Ver Agenda <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Atalhos simples (sem poluir) */}
      <div className="mt-6">
        <Card className={lightCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700">Ações rápidas</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 justify-between" onClick={() => nav("/oportunidades")}>
              Oportunidades <ArrowRight className="h-4 w-4" />
            </Button>
            <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 justify-between" onClick={() => nav("/clientes")}>
              Clientes <ArrowRight className="h-4 w-4" />
            </Button>
            <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 justify-between" onClick={() => nav("/carteira")}>
              Carteira <ArrowRight className="h-4 w-4" />
            </Button>
            <Button className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 justify-between" onClick={() => nav("/planejamento")}>
              Maximize-se <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
