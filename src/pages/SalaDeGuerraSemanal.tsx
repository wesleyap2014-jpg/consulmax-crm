// Sala de Guerra Semanal: segunda planeja, sexta revisa.
// Reaproveita weekly_plans e weekly_plan_items; históricos e playbooks anteriores são preservados no banco.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAccess } from "@/access/AccessContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  CalendarDays, ChevronLeft, ChevronRight, CheckCircle2, Circle,
  ClipboardCheck, ClipboardList, Copy, History, Loader2, Pencil,
  Plus, RefreshCw, RotateCcw, Save, Target, Trash2, UsersRound, X,
} from "lucide-react";

type Person = { id: string; nome: string | null; email: string | null; user_role: string | null };
type WeekPlan = {
  id: string; user_id: string; role: string; date_start: string; date_end: string;
  theme: string | null; main_goal: string | null; review_closed_at: string | null;
};
type Outcome = "realizado" | "parcial" | "nao_realizado";
type WeekAction = {
  id: string; plan_id: string; date_start: string; date_end: string;
  what: string | null; why: string | null; where_: string | null;
  when_: string | null; who: string | null; how: string | null;
  how_much: string | null; status: string | null; review_outcome: Outcome | null;
  review_notes: string | null; reviewed_at: string | null;
  carried_from_item_id: string | null;
};
type DraftAction = Pick<WeekAction, "what" | "why" | "where_" | "when_" | "who" | "how" | "how_much">;
type ReviewDraft = { outcome: Outcome | ""; notes: string };
type View = "planejamento" | "revisao";
type HistoryRow = WeekPlan & { total: number; realizados: number; revisados: number };

function isoLocal(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}
function fromISO(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12);
}
function shift(date: string, days: number) {
  const d = fromISO(date);
  d.setDate(d.getDate() + days);
  return isoLocal(d);
}
function mondayOf(date: string) {
  const d = fromISO(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return isoLocal(d);
}
function labelDate(date: string | null | undefined) {
  if (!date) return "—";
  const [year, month, day] = date.slice(0, 10).split("-");
  return year && month && day ? day + "/" + month + "/" + year : date;
}
function weekLabel(start: string, end: string) {
  return labelDate(start) + " — " + labelDate(end);
}
function emptyDraft(personName: string): DraftAction {
  return { what: "", why: "", where_: "", when_: "", who: personName, how: "", how_much: "" };
}
const statuses: { key: Outcome; label: string }[] = [
  { key: "realizado", label: "Realizado" },
  { key: "parcial", label: "Parcial" },
  { key: "nao_realizado", label: "Não realizado" },
];
function outcomeLabel(value: Outcome | null) {
  return statuses.find(s => s.key === value)?.label || "Sem revisão";
}
function outlineTone(value: Outcome | null) {
  if (value === "realizado") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (value === "parcial") return "border-amber-200 bg-amber-50 text-amber-800";
  if (value === "nao_realizado") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function SalaDeGuerraSemanal() {
  const today = useMemo(() => isoLocal(new Date()), []);
  const { canAction, canInfo } = useAccess();
  const canEditPlan = canAction("sala_guerra", "edit_plan");
  const canReadTeamPlans = canInfo("sala_guerra", "team_plan");
  const [weekStart, setWeekStart] = useState(() => mondayOf(isoLocal(new Date())));
  const [view, setView] = useState<View>(() => {
    const day = new Date().getDay();
    return day === 5 || day === 6 || day === 0 ? "revisao" : "planejamento";
  });
  const [meId, setMeId] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [personId, setPersonId] = useState("");
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [actions, setActions] = useState<WeekAction[]>([]);
  const [reviews, setReviews] = useState<Record<string, ReviewDraft>>({});
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftAction>(() => emptyDraft(""));
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const latestLoad = useRef(0);

  const person = people.find(p => p.id === personId);
  const myOwnWeek = Boolean(meId) && meId === personId;
  const weekEnd = plan?.date_end || shift(weekStart, 4);
  const closed = Boolean(plan?.review_closed_at);
  const plannedTotal = actions.length;
  const reviewedTotal = actions.filter(a => reviews[a.id]?.outcome).length;
  const doneTotal = actions.filter(a => reviews[a.id]?.outcome === "realizado").length;
  const partiallyDone = actions.filter(a => reviews[a.id]?.outcome === "parcial").length;
  const executionPct = plannedTotal ? Math.round(doneTotal * 100 / plannedTotal) : 0;
  const nextWeek = shift(mondayOf(weekStart), 7);
  const isHistorical = weekStart < mondayOf(today);
  const selectedName = person?.nome?.trim() || person?.email || "Colaborador";

  const showError = (error: unknown, fallback: string) => {
    console.error(fallback, error);
    setMessage({ kind: "error", text: error instanceof Error ? error.message : fallback });
  };

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingUser(true);
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth?.user) throw authError || new Error("Sessão expirada.");
        const { data: own, error: ownError } = await supabase.from("users")
          .select("id,nome,email,user_role,hierarchy_level,unit_id,is_active")
          .eq("auth_user_id", auth.user.id).single();
        if (ownError || !own) throw ownError || new Error("Usuário não localizado.");
        if (own.is_active !== true) throw new Error("Usuário inativo: acesso ao planejamento indisponível.");

        let team: Person[] = [own as Person];
        if (canReadTeamPlans && own.user_role === "admin") {
          // O perfil master pode estar cadastrado como 'gestor_filial' no legado,
          // mas a unidade Matriz determina a visibilidade de toda a empresa.
          let isMatriz = false;
          if (own.unit_id) {
            const { data: unit, error: unitError } = await supabase.from("units")
              .select("tipo").eq("id", own.unit_id).single();
            if (unitError) throw unitError;
            isMatriz = String(unit?.tipo || "").toLowerCase() === "matriz";
          }

          let userQuery = supabase.from("users")
            .select("id,nome,email,user_role")
            .eq("is_active", true)
            .order("nome", { ascending: true });
          if (own.hierarchy_level === "gestor_filial" && !isMatriz) {
            // Gestor de filial não herda a visibilidade da matriz.
            userQuery = own.unit_id
              ? userQuery.eq("unit_id", own.unit_id)
              : userQuery.eq("id", own.id);
          }
          const { data: visible, error: teamError } = await userQuery;
          if (teamError) throw teamError;
          team = (visible || []) as Person[];
        } else if (canReadTeamPlans && own.hierarchy_level === "gestor_filial") {
          // Mantém a cascata de gestores não-admin suportada pela função existente.
          const { data: visible, error: teamError } = await supabase.rpc("sala_guerra_equipe");
          if (teamError) throw teamError;
          team = (visible || []) as Person[];
        }

        if (!active) return;
        const list = team.some(p => p.id === own.id) ? team : [own as Person, ...team];
        setMeId(own.id);
        setPeople(list);
        setPersonId(own.id);
      } catch (e) {
        if (active) showError(e, "Não foi possível carregar o perfil de acesso.");
      } finally {
        if (active) setLoadingUser(false);
      }
    })();
    return () => { active = false; };
  }, [canReadTeamPlans]);

  const loadWeek = useCallback(async (userId: string, firstDate: string) => {
    if (!userId) return;
    const ticket = ++latestLoad.current;
    setLoadingWeek(true);
    setMessage(null);
    try {
      const { data: plans, error: planError } = await supabase.from("weekly_plans").select("*")
        .eq("user_id", userId).eq("date_start", firstDate)
        .order("created_at", { ascending: true }).limit(1);
      if (planError) throw planError;
      const current = (plans?.[0] || null) as WeekPlan | null;
      let savedActions: WeekAction[] = [];
      if (current) {
        const { data, error } = await supabase.from("weekly_plan_items").select("*")
          .eq("plan_id", current.id).order("created_at", { ascending: true });
        if (error) throw error;
        savedActions = (data || []) as WeekAction[];
      }
      if (ticket !== latestLoad.current) return;
      setPlan(current);
      setActions(savedActions);
      setReviews(Object.fromEntries(savedActions.map(a => [
        a.id, { outcome: a.review_outcome || "", notes: a.review_notes || "" },
      ])));
    } catch (e) {
      if (ticket === latestLoad.current) {
        setPlan(null);
        setActions([]);
        setReviews({});
        showError(e, "Não foi possível abrir a semana.");
      }
    } finally {
      if (ticket === latestLoad.current) setLoadingWeek(false);
    }
  }, []);

  useEffect(() => { if (personId) void loadWeek(personId, weekStart); }, [personId, weekStart, loadWeek]);

  const loadHistory = useCallback(async (userId: string) => {
    if (!userId) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase.from("weekly_plans").select("*")
        .eq("user_id", userId).order("date_start", { ascending: false }).limit(52);
      if (error) throw error;
      const plans = (data || []) as WeekPlan[];
      const ids = plans.map(p => p.id);
      const actionsByPlan = new Map<string, WeekAction[]>();
      if (ids.length) {
        const { data: all, error: itemError } = await supabase.from("weekly_plan_items")
          .select("id,plan_id,review_outcome").in("plan_id", ids);
        if (itemError) throw itemError;
        for (const item of ((all || []) as WeekAction[])) {
          const group = actionsByPlan.get(item.plan_id) || [];
          group.push(item);
          actionsByPlan.set(item.plan_id, group);
        }
      }
      setHistory(plans.map(p => {
        const its = actionsByPlan.get(p.id) || [];
        return {
          ...p, total: its.length,
          realizados: its.filter(i => i.review_outcome === "realizado").length,
          revisados: its.filter(i => Boolean(i.review_outcome)).length,
        };
      }));
    } catch (e) {
      showError(e, "Não foi possível carregar o histórico.");
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { if (personId && showHistory) void loadHistory(personId); }, [personId, showHistory, loadHistory]);

  const createWeek = async (start = weekStart): Promise<WeekPlan | null> => {
    if (!myOwnWeek || !canEditPlan || busy) return null;
    setBusy(true);
    try {
      // Usa semana existente antes de criar; mantém compatibilidade com planejamentos antigos.
      const { data: prev, error: findError } = await supabase.from("weekly_plans")
        .select("*").eq("user_id", meId).eq("date_start", start).limit(1);
      if (findError) throw findError;
      let current = (prev?.[0] || null) as WeekPlan | null;
      if (!current) {
        const { data, error } = await supabase.from("weekly_plans").insert({
          user_id: meId, role: person?.user_role || "vendedor",
          date_start: start, date_end: shift(start, 4),
          theme: "Planejamento semanal", main_goal: "",
        }).select("*").single();
        if (error) throw error;
        current = data as WeekPlan;
      }
      if (start === weekStart) await loadWeek(meId, start);
      setMessage({ kind: "ok", text: "Semana aberta. Agora adicione seus compromissos." });
      return current;
    } catch (e) {
      showError(e, "Não foi possível abrir a semana.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const openEditor = (item?: WeekAction) => {
    if (!myOwnWeek || !canEditPlan || !plan || closed) return;
    setEditId(item?.id || null);
    setDraft(item
      ? { what: item.what || "", why: item.why || "", where_: item.where_ || "",
          when_: item.when_ || "", who: item.who || selectedName, how: item.how || "",
          how_much: item.how_much || "" }
      : emptyDraft(selectedName));
    setDialogOpen(true);
  };

  const saveAction = async () => {
    if (!plan || !myOwnWeek || !canEditPlan || !draft.what?.trim() || busy || closed) return;
    setBusy(true);
    try {
      const data = {
        what: draft.what?.trim(), why: draft.why?.trim() || null,
        where_: draft.where_?.trim() || null, when_: draft.when_?.trim() || null,
        who: draft.who?.trim() || selectedName, how: draft.how?.trim() || null,
        how_much: draft.how_much?.trim() || null,
      };
      if (editId) {
        const { error } = await supabase.from("weekly_plan_items").update(data)
          .eq("id", editId).eq("plan_id", plan.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("weekly_plan_items").insert({
          ...data, plan_id: plan.id, date_start: plan.date_start,
          date_end: plan.date_end, status: "planejado",
        });
        if (error) throw error;
      }
      setDialogOpen(false);
      await loadWeek(personId, weekStart);
      setMessage({ kind: "ok", text: editId ? "Compromisso atualizado." : "Compromisso adicionado." });
    } catch (e) {
      showError(e, "Não foi possível salvar o compromisso.");
    } finally {
      setBusy(false);
    }
  };

  const deleteAction = async (item: WeekAction) => {
    if (!plan || !myOwnWeek || !canEditPlan || busy || closed) return;
    if (!window.confirm("Excluir este compromisso da semana?")) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("weekly_plan_items").delete()
        .eq("id", item.id).eq("plan_id", plan.id);
      if (error) throw error;
      await loadWeek(personId, weekStart);
      setMessage({ kind: "ok", text: "Compromisso excluído." });
    } catch (e) {
      showError(e, "Não foi possível excluir o compromisso.");
    } finally { setBusy(false); }
  };

  const setReview = (id: string, patch: Partial<ReviewDraft>) =>
    setReviews(current => ({ ...current, [id]: { ...current[id], ...patch } }));

  const saveReviews = async (finish: boolean) => {
    if (!plan || !myOwnWeek || !canEditPlan || busy || closed) return;
    if (finish && (!actions.length || actions.some(a => !reviews[a.id]?.outcome))) {
      setMessage({ kind: "error", text: "Marque o resultado de todas as ações antes de concluir a semana." });
      return;
    }
    setBusy(true);
    try {
      const changed = actions.filter(a => {
        const edit = reviews[a.id] || { outcome: "", notes: "" };
        return (a.review_outcome || "") !== edit.outcome
          || (a.review_notes || "") !== edit.notes.trim();
      });
      for (const item of changed) {
        const edit = reviews[item.id] || { outcome: "", notes: "" };
        const { error } = await supabase.from("weekly_plan_items").update({
          review_outcome: edit.outcome || null,
          review_notes: edit.notes.trim() || null,
          reviewed_at: edit.outcome ? new Date().toISOString() : null,
        }).eq("id", item.id).eq("plan_id", plan.id);
        if (error) throw error;
      }
      if (finish) {
        const { error } = await supabase.from("weekly_plans").update({
          review_closed_at: new Date().toISOString(),
        }).eq("id", plan.id);
        if (error) throw error;
      }
      await loadWeek(personId, weekStart);
      if (showHistory) await loadHistory(personId);
      setMessage({ kind: "ok", text: finish ? "Semana revisada e arquivada!" : "Revisão salva. Você pode continuar depois." });
    } catch (e) { showError(e, "Não foi possível salvar a revisão."); }
    finally { setBusy(false); }
  };

  const reopenWeek = async () => {
    if (!plan || !myOwnWeek || !canEditPlan || busy || !closed) return;
    if (!window.confirm("Reabrir a revisão desta semana para correções?")) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("weekly_plans").update({
        review_closed_at: null,
      }).eq("id", plan.id);
      if (error) throw error;
      await loadWeek(personId, weekStart);
      setMessage({ kind: "ok", text: "Semana reaberta para correções." });
    } catch (e) { showError(e, "Não foi possível reabrir a semana."); }
    finally { setBusy(false); }
  };

  const carryPending = async () => {
    if (!plan || !myOwnWeek || !canEditPlan || busy || !closed) return;
    const pending = actions.filter(a => a.review_outcome !== "realizado");
    if (!pending.length) {
      setMessage({ kind: "ok", text: "Todas as ações foram realizadas. Nada para transferir." });
      return;
    }
    setBusy(true);
    try {
      const { data: existing, error: existingError } = await supabase.from("weekly_plans")
        .select("*").eq("user_id", meId).eq("date_start", nextWeek).limit(1);
      if (existingError) throw existingError;
      let destination = (existing?.[0] || null) as WeekPlan | null;
      if (!destination) {
        const { data, error } = await supabase.from("weekly_plans").insert({
          user_id: meId, role: person?.user_role || "vendedor", date_start: nextWeek,
          date_end: shift(nextWeek, 4), theme: "Planejamento semanal", main_goal: "",
        }).select("*").single();
        if (error) throw error;
        destination = data as WeekPlan;
      }
      const { data: copied, error: copyError } = await supabase.from("weekly_plan_items")
        .select("carried_from_item_id").eq("plan_id", destination.id)
        .not("carried_from_item_id", "is", null);
      if (copyError) throw copyError;
      const already = new Set((copied || []).map((row: any) => row.carried_from_item_id));
      const newItems = pending.filter(a => !already.has(a.id)).map(a => ({
        plan_id: destination!.id, date_start: destination!.date_start,
        date_end: destination!.date_end, what: a.what, why: a.why,
        where_: a.where_, when_: a.when_, who: a.who, how: a.how,
        how_much: a.how_much, status: "planejado", carried_from_item_id: a.id,
      }));
      if (newItems.length) {
        const { error } = await supabase.from("weekly_plan_items").insert(newItems);
        if (error) throw error;
      }
      setWeekStart(nextWeek);
      setView("planejamento");
      setMessage({ kind: "ok", text: newItems.length
        ? newItems.length + " ação(ões) copiadas para a próxima semana."
        : "Essas ações já estavam copiadas. Abrindo a próxima semana." });
    } catch (e) { showError(e, "Não foi possível copiar as ações."); }
    finally { setBusy(false); }
  };

  const switchWeek = (date: string) => { if (!busy) { setWeekStart(date); setMessage(null); } };
  const subtleButton = "h-9 rounded-lg border-slate-200 text-slate-700 hover:bg-slate-100";
  const canEdit = myOwnWeek && canEditPlan && !closed && !loadingWeek;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-3 pb-10 sm:p-5 lg:p-6">
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-[#1E293F] text-white shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10">
              <Target className="h-5 w-5 text-[#E0CE8C]" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">Consulmax · Planejamento comercial</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Sala de Guerra</h1>
              <p className="mt-1 text-sm text-slate-200">Segunda a gente planeja. Sexta a gente revisa. Simples assim.</p>
            </div>
          </div>
          <Button type="button" variant="secondary" onClick={() => setShowHistory(v => !v)}
            className="h-10 shrink-0 gap-2 rounded-xl bg-white/10 text-white hover:bg-white/20">
            <History className="h-4 w-4" /> {showHistory ? "Ocultar histórico" : "Histórico de semanas"}
          </Button>
        </div>
      </header>

      {message && (
        <div role={message.kind === "error" ? "alert" : "status"}
          className={"flex items-start gap-2 rounded-xl border px-4 py-3 text-sm " +
            (message.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>
          {message.kind === "error" ? <Circle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{message.text}</span>
          <button type="button" aria-label="Dispensar aviso" onClick={() => setMessage(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="sg-colaborador" className="mb-2 block text-xs font-bold text-slate-700">
              {people.length > 1 ? "Planejamento de" : "Responsável"}
            </Label>
            {loadingUser ? <p className="py-2 text-sm text-slate-500">Carregando perfil…</p> :
              <select id="sg-colaborador" value={personId} disabled={people.length <= 1 || busy}
                onChange={e => { setPersonId(e.target.value); setMessage(null); }}
                className="h-11 w-full max-w-sm rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800">
                {people.map(p => <option key={p.id} value={p.id}>{p.nome || p.email || "Usuário"}</option>)}
              </select>}
          </div>
          <div>
            <Label className="mb-2 block text-xs font-bold text-slate-700">Semana</Label>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" className={subtleButton + " px-2.5"} aria-label="Semana anterior"
                disabled={busy} onClick={() => switchWeek(shift(mondayOf(weekStart), -7))}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="min-w-[174px] text-center text-sm font-extrabold tabular-nums text-[#1E293F]">{weekLabel(weekStart, weekEnd)}</span>
              <Button variant="outline" className={subtleButton + " px-2.5"} aria-label="Próxima semana"
                disabled={busy} onClick={() => switchWeek(nextWeek)}><ChevronRight className="h-4 w-4" /></Button>
              <Button variant="outline" className={subtleButton + " hidden sm:inline-flex"} disabled={busy}
                onClick={() => switchWeek(mondayOf(today))}>Hoje</Button>
            </div>
          </div>
        </div>
        {!myOwnWeek && personId && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <UsersRound className="mr-1 inline h-3.5 w-3.5" /> Acompanhamento da equipe: somente leitura. O próprio colaborador registra e revisa suas ações.
        </p>}
      </section>

      {showHistory && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-[#1E293F]"><History className="h-4 w-4" /> Histórico</h2>
            <Button variant="outline" size="sm" className="gap-2" disabled={loadingHistory} onClick={() => void loadHistory(personId)}>
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
          </div>
          {loadingHistory ? <p className="text-sm text-slate-500">Carregando semanas anteriores…</p> :
            history.length ? (
              <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {history.map(h => (
                  <button type="button" key={h.id} onClick={() => { switchWeek(h.date_start); setShowHistory(false); }}
                    className={"rounded-xl border px-3 py-3 text-left transition hover:border-[#B5A573] hover:bg-slate-50 " +
                      (h.date_start === weekStart ? "border-[#A11C27] bg-rose-50/40" : "border-slate-200")}>
                    <div className="flex justify-between gap-2">
                      <span className="text-sm font-extrabold text-[#1E293F]">{weekLabel(h.date_start, h.date_end)}</span>
                      <span className={"text-[10px] font-semibold " + (h.review_closed_at ? "text-emerald-700" : "text-slate-500")}>
                        {h.review_closed_at ? "Revisada" : "Aberta"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{h.total} ações · {h.realizados} realizadas · {h.revisados} revisadas</p>
                  </button>
                ))}
              </div>
            ) : <p className="text-sm text-slate-500">Nenhuma semana cadastrada neste histórico.</p>}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-2 sm:max-w-md">
          <button type="button" onClick={() => setView("planejamento")}
            className={"flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-extrabold transition " +
              (view === "planejamento" ? "bg-[#1E293F] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100")}>
            <CalendarDays className="h-4 w-4" /> Planejar
          </button>
          <button type="button" onClick={() => setView("revisao")}
            className={"flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-extrabold transition " +
              (view === "revisao" ? "bg-[#1E293F] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100")}>
            <ClipboardCheck className="h-4 w-4" /> Revisar
          </button>
        </div>

        <div className="space-y-5 p-4 sm:p-6">
          {loadingWeek ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Abrindo planejamento…
            </div>
          ) : !plan ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-[#1E293F]"><ClipboardList className="h-7 w-7" /></span>
              <h2 className="text-lg font-extrabold text-[#1E293F]">Semana ainda não planejada</h2>
              <p className="max-w-md text-sm text-slate-500">
                {myOwnWeek ? "Comece com 3 a 5 compromissos importantes. Leva poucos minutos."
                  : "Este colaborador ainda não cadastrou o planejamento desta semana."}
              </p>
              {myOwnWeek && canEditPlan && <Button disabled={busy} onClick={() => void createWeek()}
                className="mt-1 gap-2 rounded-xl bg-[#A11C27] text-white hover:bg-[#831622]">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Começar minha semana
              </Button>}
            </div>
          ) : view === "planejamento" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold text-[#1E293F]">O que vou fazer nesta semana?</h2>
                  <p className="mt-1 text-xs text-slate-500">Ações simples em 5W2H. Prefira 3 a 5 compromissos realmente importantes.</p>
                </div>
                {canEdit && <Button onClick={() => openEditor()} disabled={busy}
                  className="gap-2 rounded-xl bg-[#A11C27] text-white hover:bg-[#831622]">
                  <Plus className="h-4 w-4" /> Nova ação
                </Button>}
              </div>
              {!actions.length ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-12 text-center text-sm text-slate-500">
                  Nenhum compromisso ainda. {canEdit ? "Clique em Nova ação para começar." : ""}
                </div>
              ) : (
                <div className="space-y-3">
                  {actions.map((a, index) => (
                    <article key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Ação {String(index + 1).padStart(2, "0")}</p>
                          <h3 className="text-base font-extrabold leading-snug text-[#1E293F]">{a.what || "Ação sem descrição"}</h3>
                          {a.why && <p className="mt-1 text-sm text-slate-600">{a.why}</p>}
                        </div>
                        <span className={"shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold " +
                          (a.review_outcome ? outlineTone(a.review_outcome) : "border-slate-200 bg-slate-50 text-slate-600")}>
                          {a.review_outcome ? outcomeLabel(a.review_outcome) : "Planejada"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-600">
                        {a.when_ && <span><b>Quando:</b> {a.when_}</span>}
                        {a.where_ && <span><b>Onde:</b> {a.where_}</span>}
                        {a.how && <span><b>Como:</b> {a.how}</span>}
                        {a.who && <span><b>Responsável:</b> {a.who}</span>}
                        {a.how_much && <span><b>Recurso/custo:</b> {a.how_much}</span>}
                      </div>
                      {canEdit && <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
                        <Button size="sm" variant="ghost" className="gap-1.5 text-slate-600" onClick={() => openEditor(a)}>
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </Button>
                        <Button size="sm" variant="ghost" className="gap-1.5 text-rose-700" onClick={() => void deleteAction(a)}>
                          <Trash2 className="h-3.5 w-3.5" /> Excluir
                        </Button>
                      </div>}
                    </article>
                  ))}
                </div>
              )}
              {closed && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <CheckCircle2 className="mr-2 inline h-4 w-4" /> Semana revisada e encerrada. Use a aba Revisar para consultar ou reabrir.
              </p>}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold text-[#1E293F]">O que realmente foi feito?</h2>
                  <p className="mt-1 text-xs text-slate-500">Na sexta, marque o resultado de cada compromisso e registre o que aconteceu.</p>
                </div>
                {closed && <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" /> Semana encerrada
                </span>}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { value: plannedTotal, label: "Planejadas" },
                  { value: doneTotal, label: "Realizadas" },
                  { value: executionPct + "%", label: "Execução" },
                ].map(k => (
                  <div key={k.label} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-center">
                    <p className="text-xl font-black tabular-nums text-[#1E293F] sm:text-2xl">{k.value}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">{k.label}</p>
                  </div>
                ))}
              </div>
              {partiallyDone > 0 && <p className="text-xs text-slate-500">{partiallyDone} ação(ões) parcialmente realizadas, contadas à parte dos 100% concluídos.</p>}

              {!actions.length ? <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                Ainda não existem ações para revisar nesta semana.
              </p> : (
                <div className="space-y-3">
                  {actions.map((a, index) => {
                    const rev = reviews[a.id] || { outcome: "", notes: "" };
                    return (
                      <article key={a.id} className="rounded-xl border border-slate-200 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Compromisso {index + 1}</p>
                        <h3 className="mt-1 text-sm font-extrabold text-[#1E293F] sm:text-base">{a.what || "Ação sem descrição"}</h3>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {statuses.map(status => (
                            <button type="button" key={status.key} disabled={!canEdit || busy}
                              aria-pressed={rev.outcome === status.key}
                              onClick={() => setReview(a.id, { outcome: status.key })}
                              className={"rounded-lg border px-3 py-2 text-xs font-semibold transition " +
                                (rev.outcome === status.key
                                  ? (status.key === "realizado" ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                                    : status.key === "parcial" ? "border-amber-500 bg-amber-50 text-amber-900"
                                    : "border-rose-500 bg-rose-50 text-rose-900")
                                  : "border-slate-200 text-slate-600 hover:border-slate-400") +
                                ((!canEdit || busy) ? " cursor-default opacity-80" : "")}>
                              {status.label}
                            </button>
                          ))}
                        </div>
                        {(rev.outcome || rev.notes) && <div className="mt-3">
                          <Label htmlFor={"sg-notes-" + a.id} className="mb-1.5 block text-xs text-slate-600">
                            {rev.outcome === "nao_realizado" ? "Por que não foi realizado?" :
                              rev.outcome === "parcial" ? "O que conseguiu fazer? O que faltou?" : "O que foi realizado? (opcional)"}
                          </Label>
                          <Textarea id={"sg-notes-" + a.id} rows={2} maxLength={1500}
                            disabled={!canEdit || busy} value={rev.notes} onChange={e => setReview(a.id, { notes: e.target.value })}
                            placeholder="Descreva brevemente o resultado..." className="resize-y rounded-lg border-slate-200 text-sm" />
                        </div>}
                      </article>
                    );
                  })}
                </div>
              )}
              {myOwnWeek && canEditPlan && !closed && actions.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                  <p className="text-xs text-slate-600">{reviewedTotal} de {actions.length} compromissos avaliados</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={busy} onClick={() => void saveReviews(false)} className="gap-2 rounded-xl">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar revisão
                    </Button>
                    <Button disabled={busy || reviewedTotal !== actions.length}
                      onClick={() => void saveReviews(true)}
                      className="gap-2 rounded-xl bg-[#A11C27] text-white hover:bg-[#831622]">
                      <CheckCircle2 className="h-4 w-4" /> Concluir semana
                    </Button>
                  </div>
                </div>
              )}
              {closed && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <div>
                    <p className="font-bold text-emerald-900">Revisão concluída</p>
                    <p className="text-xs text-emerald-800">Registrada em {plan.review_closed_at ? new Date(plan.review_closed_at).toLocaleString("pt-BR") : "—"}.</p>
                  </div>
                  {myOwnWeek && canEditPlan && <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={busy} onClick={() => void reopenWeek()} className="gap-1.5 rounded-xl">
                      <RotateCcw className="h-4 w-4" /> Reabrir
                    </Button>
                    {actions.some(a => a.review_outcome !== "realizado") &&
                      <Button disabled={busy} onClick={() => void carryPending()} className="gap-1.5 rounded-xl bg-[#1E293F] text-white hover:bg-[#273955]">
                        <Copy className="h-4 w-4" /> Levar pendentes para próxima semana
                      </Button>}
                  </div>}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <p className="text-center text-xs text-slate-500">
        Um planejamento por semana. Sem tarefas diárias obrigatórias. Seu histórico fica guardado para acompanhamento.
      </p>

      <Dialog open={dialogOpen} onOpenChange={value => { if (!busy) setDialogOpen(value); }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#1E293F]">
              <Target className="h-5 w-5 text-[#A11C27]" />
              {editId ? "Editar compromisso" : "Nova ação da semana"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">5W2H sem complicação. Apenas “O que vou fazer?” é obrigatório.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="sg-what" className="mb-1.5 block text-xs font-bold">O que vou fazer? *</Label>
              <Input id="sg-what" autoFocus maxLength={300} value={draft.what || ""}
                onChange={e => setDraft(d => ({ ...d, what: e.target.value }))}
                placeholder="Ex.: Prospectar 20 empresários de transportes" className="h-11 rounded-xl" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="sg-why" className="mb-1.5 block text-xs font-bold">Por quê?</Label>
              <Input id="sg-why" maxLength={500} value={draft.why || ""}
                onChange={e => setDraft(d => ({ ...d, why: e.target.value }))} placeholder="Ex.: Gerar novas oportunidades" />
            </div>
            <div>
              <Label htmlFor="sg-when" className="mb-1.5 block text-xs font-bold">Quando?</Label>
              <Input id="sg-when" maxLength={150} value={draft.when_ || ""}
                onChange={e => setDraft(d => ({ ...d, when_: e.target.value }))} placeholder="Ex.: Terça e quarta" />
            </div>
            <div>
              <Label htmlFor="sg-where" className="mb-1.5 block text-xs font-bold">Onde?</Label>
              <Input id="sg-where" maxLength={150} value={draft.where_ || ""}
                onChange={e => setDraft(d => ({ ...d, where_: e.target.value }))} placeholder="Ex.: WhatsApp e ligação" />
            </div>
            <div>
              <Label htmlFor="sg-how" className="mb-1.5 block text-xs font-bold">Como?</Label>
              <Input id="sg-how" maxLength={500} value={draft.how || ""}
                onChange={e => setDraft(d => ({ ...d, how: e.target.value }))} placeholder="Ex.: Contato ativo com lista segmentada" />
            </div>
            <div>
              <Label htmlFor="sg-who" className="mb-1.5 block text-xs font-bold">Quem?</Label>
              <Input id="sg-who" value={draft.who || selectedName} readOnly
                className="bg-slate-50 text-slate-600" title="Preenchido automaticamente com o responsável" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="sg-cost" className="mb-1.5 block text-xs font-bold">Quanto custa / quais recursos? (opcional)</Label>
              <Input id="sg-cost" maxLength={250} value={draft.how_much || ""}
                onChange={e => setDraft(d => ({ ...d, how_much: e.target.value }))} placeholder="Ex.: Sem custo adicional" />
            </div>
          </div>
          <DialogFooter className="flex flex-wrap gap-2 pt-3">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>Cancelar</Button>
            <Button disabled={busy || !draft.what?.trim()} onClick={() => void saveAction()}
              className="gap-2 bg-[#A11C27] text-white hover:bg-[#831622]">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar ação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
