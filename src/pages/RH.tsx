import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  BarChart3,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Plus,
  RefreshCcw,
  Save,
  Target,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
};

type TabKey = "painel" | "colaboradores" | "ponto" | "banco" | "ajustes" | "pdi" | "feedbacks" | "candidatos";

type UserProfile = {
  id: string;
  auth_user_id: string | null;
  nome: string | null;
  email: string | null;
  role: string | null;
  user_role: string | null;
};

type Employee = {
  id: string;
  user_id: string | null;
  auth_user_id: string | null;
  nome: string;
  cpf_digits: string;
  email: string | null;
  telefone: string | null;
  cargo: string | null;
  setor: string | null;
  jornada_diaria_minutos: number;
  intervalo_minutos: number;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
};

type TimeEntry = {
  id: string;
  employee_id: string;
  entry_type: "entrada" | "saida";
  entry_at: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  status: string;
  source: string;
  observacao: string | null;
  hr_employees?: {
    nome: string;
    cargo: string | null;
    setor: string | null;
  } | null;
};

type TimeAdjustment = {
  id: string;
  employee_id: string;
  date_ref: string;
  requested_entry_type: "entrada" | "saida";
  requested_entry_at: string;
  reason: string;
  status: "pendente" | "aprovado" | "recusado";
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

type PDI = {
  id: string;
  employee_id: string;
  manager_id: string | null;
  title: string;
  main_goal: string | null;
  competencies: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type Feedback = {
  id: string;
  employee_id: string;
  manager_id: string | null;
  feedback_type: string;
  situation: string | null;
  behavior: string | null;
  impact: string | null;
  orientation: string | null;
  action_plan: string | null;
  followup_date: string | null;
  employee_acknowledged: boolean;
  status: string;
  created_at: string;
};

type Candidate = {
  id: string;
  auth_user_id: string | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  cpf: string | null;
  cidade: string | null;
  uf: string | null;
  area_interesse: string | null;
  pretensao_salarial: number | null;
  status: string | null;
  created_at: string;
};

type EmployeeForm = {
  id?: string;
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  cargo: string;
  setor: string;
  jornada_diaria_minutos: string;
  intervalo_minutos: string;
  auth_user_id: string;
  ativo: boolean;
};

type PDIForm = {
  employee_id: string;
  title: string;
  main_goal: string;
  competencies: string;
  start_date: string;
  end_date: string;
  status: string;
};

type FeedbackForm = {
  employee_id: string;
  feedback_type: string;
  situation: string;
  behavior: string;
  impact: string;
  orientation: string;
  action_plan: string;
  followup_date: string;
  status: string;
};

type AdjustmentForm = {
  employee_id: string;
  date_ref: string;
  requested_entry_type: "entrada" | "saida";
  requested_entry_at: string;
  reason: string;
};

type WorkDay = {
  employee_id: string;
  employee_name: string;
  date_ref: string;
  first_entry?: string;
  last_exit?: string;
  worked_minutes: number;
  expected_minutes: number;
  balance_minutes: number;
  pairs: number;
  status: "em_jornada" | "em_intervalo" | "fora_jornada" | "sem_registro";
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "");
}

function maskCPF(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

function formatDateTimeBR(value?: string) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Porto_Velho",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatDateBR(value?: string) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Porto_Velho" }).format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

function formatMinutes(total: number) {
  const sign = total < 0 ? "-" : "";
  const abs = Math.abs(Math.round(total));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h${String(m).padStart(2, "0")}`;
}

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateKey(value: string) {
  const d = new Date(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function mapUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function emptyEmployeeForm(): EmployeeForm {
  return {
    nome: "",
    cpf: "",
    email: "",
    telefone: "",
    cargo: "",
    setor: "",
    jornada_diaria_minutos: "480",
    intervalo_minutos: "60",
    auth_user_id: "",
    ativo: true,
  };
}

function buildWorkDays(entries: TimeEntry[], employees: Employee[]): WorkDay[] {
  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const grouped = new Map<string, TimeEntry[]>();

  entries.forEach((entry) => {
    const key = `${entry.employee_id}|${dateKey(entry.entry_at)}`;
    const arr = grouped.get(key) || [];
    arr.push(entry);
    grouped.set(key, arr);
  });

  const rows: WorkDay[] = [];

  grouped.forEach((dayEntries, key) => {
    const [employee_id, date_ref] = key.split("|");
    const employee = employeeMap.get(employee_id);
    const sorted = [...dayEntries].sort((a, b) => new Date(a.entry_at).getTime() - new Date(b.entry_at).getTime());

    let openedAt: string | null = null;
    let worked = 0;
    let pairs = 0;

    for (const entry of sorted) {
      if (entry.entry_type === "entrada") {
        openedAt = entry.entry_at;
      } else if (entry.entry_type === "saida" && openedAt) {
        worked += Math.max(0, Math.round((new Date(entry.entry_at).getTime() - new Date(openedAt).getTime()) / 60000));
        openedAt = null;
        pairs += 1;
      }
    }

    if (openedAt) {
      worked += Math.max(0, Math.round((Date.now() - new Date(openedAt).getTime()) / 60000));
    }

    const last = sorted[sorted.length - 1];
    const expected = employee?.jornada_diaria_minutos ?? 480;
    const status: WorkDay["status"] = !last
      ? "sem_registro"
      : last.entry_type === "entrada"
        ? "em_jornada"
        : "fora_jornada";

    rows.push({
      employee_id,
      employee_name: employee?.nome || sorted[0]?.hr_employees?.nome || "—",
      date_ref,
      first_entry: sorted.find((e) => e.entry_type === "entrada")?.entry_at,
      last_exit: [...sorted].reverse().find((e) => e.entry_type === "saida")?.entry_at,
      worked_minutes: worked,
      expected_minutes: expected,
      balance_minutes: worked - expected,
      pairs,
      status,
    });
  });

  return rows.sort((a, b) => b.date_ref.localeCompare(a.date_ref) || a.employee_name.localeCompare(b.employee_name));
}

function StatusBadge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "good" | "warn" | "bad" | "navy" }) {
  const styles: Record<string, React.CSSProperties> = {
    default: { background: "#f1f5f9", color: "#334155" },
    good: { background: "#dcfce7", color: "#166534" },
    warn: { background: "#fef3c7", color: "#92400e" },
    bad: { background: "#fee2e2", color: "#991b1b" },
    navy: { background: C.navy, color: "#fff" },
  };

  return <Badge className="rounded-full" style={styles[tone]}>{children}</Badge>;
}

export default function RH() {
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabKey>("painel");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [adjustments, setAdjustments] = useState<TimeAdjustment[]>([]);
  const [pdis, setPdis] = useState<PDI[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>(emptyEmployeeForm());
  const [pdiForm, setPdiForm] = useState<PDIForm>({ employee_id: "", title: "", main_goal: "", competencies: "", start_date: todayYMD(), end_date: "", status: "em_andamento" });
  const [feedbackForm, setFeedbackForm] = useState<FeedbackForm>({ employee_id: "", feedback_type: "desenvolvimento", situation: "", behavior: "", impact: "", orientation: "", action_plan: "", followup_date: "", status: "aberto" });
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentForm>({ employee_id: "", date_ref: todayYMD(), requested_entry_type: "entrada", requested_entry_at: `${todayYMD()}T08:00`, reason: "" });

  const selectedEmployee = useMemo(() => {
    if (selectedEmployeeId === "all") return null;
    return employees.find((e) => e.id === selectedEmployeeId) || null;
  }, [employees, selectedEmployeeId]);

  const filteredEntries = useMemo(() => {
    if (selectedEmployeeId === "all") return entries;
    return entries.filter((e) => e.employee_id === selectedEmployeeId);
  }, [entries, selectedEmployeeId]);

  const workDays = useMemo(() => buildWorkDays(filteredEntries, employees), [filteredEntries, employees]);
  const todayRows = useMemo(() => workDays.filter((r) => r.date_ref === todayYMD()), [workDays]);
  const monthBalance = useMemo(() => {
    const month = todayYMD().slice(0, 7);
    return workDays.filter((r) => r.date_ref.startsWith(month)).reduce((acc, r) => acc + r.balance_minutes, 0);
  }, [workDays]);

  const entradaCount = filteredEntries.filter((e) => e.entry_type === "entrada").length;
  const saidaCount = filteredEntries.filter((e) => e.entry_type === "saida").length;
  const activeEmployees = employees.filter((e) => e.ativo).length;
  const pendingAdjustments = adjustments.filter((a) => a.status === "pendente").length;

  async function safeSelect<T>(table: string, query: (q: any) => any, fallback: T[] = []) {
    try {
      const { data, error } = await query(supabase.from(table));
      if (error) {
        console.warn(`Tabela ${table}:`, error.message);
        return fallback;
      }
      return (data || fallback) as T[];
    } catch (err) {
      console.warn(`Falha ao carregar ${table}:`, err);
      return fallback;
    }
  }

  async function load() {
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id ?? null;
      setAuthUserId(uid);

      if (!uid) {
        setProfile(null);
        setIsAdmin(false);
        setEmployees([]);
        setEntries([]);
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("id, auth_user_id, nome, email, role, user_role")
        .eq("auth_user_id", uid)
        .maybeSingle();

      const userProfile = userData as UserProfile | null;
      const admin = userProfile?.role === "admin" || userProfile?.user_role === "admin";
      setProfile(userProfile);
      setIsAdmin(admin);

      const usersData = await safeSelect<UserProfile>(
        "users",
        (q) => q.select("id, auth_user_id, nome, email, role, user_role").order("nome", { ascending: true }),
      );
      setUsers(usersData);

      let employeesQuery = supabase.from("hr_employees").select("*").order("nome", { ascending: true });
      if (!admin) employeesQuery = employeesQuery.eq("auth_user_id", uid);
      const { data: empData, error: empError } = await employeesQuery;
      if (empError) throw empError;
      const empList = (empData || []) as Employee[];
      setEmployees(empList);

      const allowedEmployeeIds = empList.map((e) => e.id);
      let entriesQuery = supabase
        .from("hr_time_entries")
        .select("*, hr_employees (nome, cargo, setor)")
        .order("entry_at", { ascending: false })
        .limit(500);
      if (!admin && allowedEmployeeIds.length) entriesQuery = entriesQuery.in("employee_id", allowedEmployeeIds);
      if (admin && selectedEmployeeId !== "all") entriesQuery = entriesQuery.eq("employee_id", selectedEmployeeId);
      const { data: entriesData, error: entriesError } = await entriesQuery;
      if (entriesError) throw entriesError;
      setEntries((entriesData || []) as TimeEntry[]);

      const loadedAdjustments = await safeSelect<TimeAdjustment>(
        "hr_time_adjustments",
        (q) => {
          let base = q.select("*").order("created_at", { ascending: false }).limit(300);
          if (!admin && allowedEmployeeIds.length) base = base.in("employee_id", allowedEmployeeIds);
          return base;
        },
      );
      setAdjustments(loadedAdjustments);

      const loadedPdis = await safeSelect<PDI>(
        "hr_pdis",
        (q) => {
          let base = q.select("*").order("created_at", { ascending: false }).limit(300);
          if (!admin && allowedEmployeeIds.length) base = base.in("employee_id", allowedEmployeeIds);
          return base;
        },
      );
      setPdis(loadedPdis);

      const loadedFeedbacks = await safeSelect<Feedback>(
        "hr_feedbacks",
        (q) => {
          let base = q.select("*").order("created_at", { ascending: false }).limit(300);
          if (!admin && allowedEmployeeIds.length) base = base.in("employee_id", allowedEmployeeIds);
          return base;
        },
      );
      setFeedbacks(loadedFeedbacks);

      const loadedCandidates = await safeSelect<Candidate>(
        "hr_candidates",
        (q) => q.select("*").order("created_at", { ascending: false }).limit(300),
      );
      setCandidates(admin ? loadedCandidates : []);

      if (!admin && empList[0]?.id) {
        setAdjustmentForm((prev) => ({ ...prev, employee_id: empList[0].id }));
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Erro ao carregar RH.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployeeId]);

  function employeeName(id: string | null | undefined) {
    if (!id) return "—";
    return employees.find((e) => e.id === id)?.nome || "—";
  }

  function editEmployee(employee: Employee) {
    setEmployeeForm({
      id: employee.id,
      nome: employee.nome || "",
      cpf: maskCPF(employee.cpf_digits || ""),
      email: employee.email || "",
      telefone: employee.telefone || "",
      cargo: employee.cargo || "",
      setor: employee.setor || "",
      jornada_diaria_minutos: String(employee.jornada_diaria_minutos || 480),
      intervalo_minutos: String(employee.intervalo_minutos || 60),
      auth_user_id: employee.auth_user_id || "",
      ativo: !!employee.ativo,
    });
    setTab("colaboradores");
  }

  async function saveEmployee() {
    if (!isAdmin) return alert("Somente admin pode cadastrar ou editar colaboradores.");
    const cpfDigits = onlyDigits(employeeForm.cpf);
    if (!employeeForm.nome.trim()) return alert("Informe o nome do colaborador.");
    if (cpfDigits.length !== 11) return alert("Informe um CPF válido com 11 dígitos.");

    setSaving(true);
    try {
      const payload = {
        nome: employeeForm.nome.trim(),
        cpf_digits: cpfDigits,
        email: employeeForm.email.trim() || null,
        telefone: employeeForm.telefone.trim() || null,
        cargo: employeeForm.cargo.trim() || null,
        setor: employeeForm.setor.trim() || null,
        jornada_diaria_minutos: Number(employeeForm.jornada_diaria_minutos || 480),
        intervalo_minutos: Number(employeeForm.intervalo_minutos || 60),
        auth_user_id: employeeForm.auth_user_id || null,
        ativo: employeeForm.ativo,
        updated_at: new Date().toISOString(),
      };

      if (employeeForm.id) {
        const { error } = await supabase.from("hr_employees").update(payload).eq("id", employeeForm.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hr_employees").insert(payload);
        if (error) throw error;
      }

      setEmployeeForm(emptyEmployeeForm());
      await load();
      alert("Colaborador salvo com sucesso.");
    } catch (err: any) {
      alert(err?.message || "Erro ao salvar colaborador.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAdjustment() {
    if (!adjustmentForm.employee_id) return alert("Selecione o colaborador.");
    if (!adjustmentForm.reason.trim()) return alert("Informe a justificativa.");
    setSaving(true);
    try {
      const { error } = await supabase.from("hr_time_adjustments").insert({
        employee_id: adjustmentForm.employee_id,
        date_ref: adjustmentForm.date_ref,
        requested_entry_type: adjustmentForm.requested_entry_type,
        requested_entry_at: new Date(adjustmentForm.requested_entry_at).toISOString(),
        reason: adjustmentForm.reason.trim(),
        status: "pendente",
      });
      if (error) throw error;
      setAdjustmentForm({ employee_id: isAdmin ? "" : adjustmentForm.employee_id, date_ref: todayYMD(), requested_entry_type: "entrada", requested_entry_at: `${todayYMD()}T08:00`, reason: "" });
      await load();
      alert("Solicitação de ajuste enviada.");
    } catch (err: any) {
      alert(err?.message || "Erro ao solicitar ajuste.");
    } finally {
      setSaving(false);
    }
  }

  async function updateAdjustmentStatus(id: string, status: "aprovado" | "recusado") {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("hr_time_adjustments")
        .update({ status, approved_by: authUserId, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      await load();
    } catch (err: any) {
      alert(err?.message || "Erro ao atualizar ajuste.");
    } finally {
      setSaving(false);
    }
  }

  async function savePDI() {
    if (!isAdmin) return alert("Somente admin pode criar PDI por enquanto.");
    if (!pdiForm.employee_id || !pdiForm.title.trim()) return alert("Informe colaborador e título do PDI.");
    setSaving(true);
    try {
      const { error } = await supabase.from("hr_pdis").insert({
        employee_id: pdiForm.employee_id,
        manager_id: profile?.id || null,
        title: pdiForm.title.trim(),
        main_goal: pdiForm.main_goal.trim() || null,
        competencies: pdiForm.competencies.trim() || null,
        start_date: pdiForm.start_date || null,
        end_date: pdiForm.end_date || null,
        status: pdiForm.status,
      });
      if (error) throw error;
      setPdiForm({ employee_id: "", title: "", main_goal: "", competencies: "", start_date: todayYMD(), end_date: "", status: "em_andamento" });
      await load();
      alert("PDI criado com sucesso.");
    } catch (err: any) {
      alert(err?.message || "Erro ao criar PDI. Verifique se a migration de RH foi aplicada.");
    } finally {
      setSaving(false);
    }
  }

  async function saveFeedback() {
    if (!isAdmin) return alert("Somente admin pode criar feedback por enquanto.");
    if (!feedbackForm.employee_id || !feedbackForm.situation.trim()) return alert("Informe colaborador e situação observada.");
    setSaving(true);
    try {
      const { error } = await supabase.from("hr_feedbacks").insert({
        employee_id: feedbackForm.employee_id,
        manager_id: profile?.id || null,
        feedback_type: feedbackForm.feedback_type,
        situation: feedbackForm.situation.trim(),
        behavior: feedbackForm.behavior.trim() || null,
        impact: feedbackForm.impact.trim() || null,
        orientation: feedbackForm.orientation.trim() || null,
        action_plan: feedbackForm.action_plan.trim() || null,
        followup_date: feedbackForm.followup_date || null,
        status: feedbackForm.status,
        employee_acknowledged: false,
      });
      if (error) throw error;
      setFeedbackForm({ employee_id: "", feedback_type: "desenvolvimento", situation: "", behavior: "", impact: "", orientation: "", action_plan: "", followup_date: "", status: "aberto" });
      await load();
      alert("Feedback registrado com sucesso.");
    } catch (err: any) {
      alert(err?.message || "Erro ao registrar feedback. Verifique se a migration de RH foi aplicada.");
    } finally {
      setSaving(false);
    }
  }

  const tabs: Array<{ key: TabKey; label: string; icon: React.ElementType }> = [
    { key: "painel", label: "Painel", icon: BarIcon },
    { key: "colaboradores", label: "Colaboradores", icon: Users },
    { key: "ponto", label: "Ponto", icon: Clock },
    { key: "banco", label: "Banco de Horas", icon: CalendarDays },
    { key: "ajustes", label: "Ajustes", icon: AlertCircle },
    { key: "pdi", label: "PDI", icon: Target },
    { key: "feedbacks", label: "Feedbacks", icon: UserCheck },
    { key: "candidatos", label: "Candidatos", icon: Briefcase },
  ];

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-5 bg-slate-50">
      <div className="rounded-3xl p-5 md:p-6 text-white shadow-xl" style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})` }}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">RH</h1>
            <p className="text-white/80 mt-1">Ponto, banco de horas, colaboradores, PDI, feedbacks e candidatos.</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="rounded-xl" onClick={() => window.open("/ponto", "_blank")}>Abrir /ponto</Button>
            <Button type="button" onClick={load} variant="secondary" className="rounded-xl" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
              Atualizar
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Kpi icon={Users} label="Colaboradores ativos" value={activeEmployees} />
        <Kpi icon={Clock} label="Registros filtrados" value={filteredEntries.length} />
        <Kpi icon={CheckCircle2} label="Entradas" value={entradaCount} />
        <Kpi icon={XCircle} label="Saídas" value={saidaCount} />
        <Kpi icon={AlertCircle} label="Ajustes pendentes" value={pendingAdjustments} />
      </div>

      <Card className="rounded-3xl">
        <CardContent className="p-3 flex flex-wrap gap-2">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-2 rounded-2xl text-sm flex items-center gap-2 border transition ${tab === key ? "text-white" : "bg-white hover:bg-slate-50"}`}
              style={tab === key ? { background: C.ruby, borderColor: C.ruby } : { borderColor: "#e2e8f0" }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </CardContent>
      </Card>

      {tab === "painel" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="rounded-3xl">
            <CardHeader><CardTitle>Status de Hoje</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {loading ? <Loading /> : todayRows.length === 0 ? <Empty text="Nenhum ponto registrado hoje." /> : todayRows.map((row) => (
                <div key={`${row.employee_id}-${row.date_ref}`} className="rounded-2xl border bg-white p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="font-semibold">{row.employee_name}</div>
                    <div className="text-sm text-slate-500">Entrada: {formatDateTimeBR(row.first_entry)} • Saída: {formatDateTimeBR(row.last_exit)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <StatusBadge tone={row.status === "em_jornada" ? "good" : "default"}>{row.status === "em_jornada" ? "Em jornada" : "Fora de jornada"}</StatusBadge>
                    <StatusBadge tone={row.balance_minutes >= 0 ? "navy" : "warn"}>Saldo {formatMinutes(row.balance_minutes)}</StatusBadge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader><CardTitle>Resumo do mês filtrado</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border bg-slate-50 p-5">
                <div className="text-sm text-slate-500">Saldo calculado em tela</div>
                <div className="text-3xl font-bold" style={{ color: monthBalance >= 0 ? C.navy : C.ruby }}>{formatMinutes(monthBalance)}</div>
                <p className="text-xs text-slate-500 mt-2">Cálculo baseado nos registros carregados. Depois podemos persistir o fechamento oficial em banco.</p>
              </div>
              <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
                Próximos passos naturais: fechamento mensal, exportação, regras de tolerância, feriados, escala e aprovação de compensação.
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "colaboradores" && (
        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
          <Card className="rounded-3xl">
            <CardHeader><CardTitle>{employeeForm.id ? "Editar colaborador" : "Novo colaborador"}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!isAdmin && <AlertBox text="Somente administradores podem cadastrar ou editar colaboradores." />}
              <Field label="Nome"><Input value={employeeForm.nome} onChange={(e) => setEmployeeForm({ ...employeeForm, nome: e.target.value })} disabled={!isAdmin} /></Field>
              <Field label="CPF"><Input value={employeeForm.cpf} onChange={(e) => setEmployeeForm({ ...employeeForm, cpf: maskCPF(e.target.value) })} disabled={!isAdmin} /></Field>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="E-mail"><Input value={employeeForm.email} onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })} disabled={!isAdmin} /></Field>
                <Field label="Telefone"><Input value={employeeForm.telefone} onChange={(e) => setEmployeeForm({ ...employeeForm, telefone: e.target.value })} disabled={!isAdmin} /></Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Cargo"><Input value={employeeForm.cargo} onChange={(e) => setEmployeeForm({ ...employeeForm, cargo: e.target.value })} disabled={!isAdmin} /></Field>
                <Field label="Setor"><Input value={employeeForm.setor} onChange={(e) => setEmployeeForm({ ...employeeForm, setor: e.target.value })} disabled={!isAdmin} /></Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Jornada diária/min"><Input type="number" value={employeeForm.jornada_diaria_minutos} onChange={(e) => setEmployeeForm({ ...employeeForm, jornada_diaria_minutos: e.target.value })} disabled={!isAdmin} /></Field>
                <Field label="Intervalo mínimo/min"><Input type="number" value={employeeForm.intervalo_minutos} onChange={(e) => setEmployeeForm({ ...employeeForm, intervalo_minutos: e.target.value })} disabled={!isAdmin} /></Field>
              </div>
              <Field label="Vincular usuário do CRM">
                <Select value={employeeForm.auth_user_id || "none"} onValueChange={(v) => setEmployeeForm({ ...employeeForm, auth_user_id: v === "none" ? "" : v })} disabled={!isAdmin}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem vínculo</SelectItem>
                    {users.filter((u) => u.auth_user_id).map((u) => <SelectItem key={u.id} value={u.auth_user_id!}>{u.nome || u.email || u.auth_user_id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-center justify-between rounded-2xl border p-3">
                <span className="text-sm">Colaborador ativo</span>
                <Button variant="outline" type="button" disabled={!isAdmin} onClick={() => setEmployeeForm({ ...employeeForm, ativo: !employeeForm.ativo })}>{employeeForm.ativo ? "Ativo" : "Inativo"}</Button>
              </div>
              <div className="flex gap-2">
                <Button disabled={!isAdmin || saving} onClick={saveEmployee} className="text-white" style={{ background: C.ruby }}><Save className="h-4 w-4 mr-2" />Salvar</Button>
                <Button variant="outline" onClick={() => setEmployeeForm(emptyEmployeeForm())}>Limpar</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader><CardTitle>Colaboradores</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Loading /> : employees.length === 0 ? <Empty text="Nenhum colaborador cadastrado." /> : (
                <div className="overflow-x-auto rounded-2xl border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-slate-600"><tr><th className="p-3 text-left">Nome</th><th className="p-3 text-left">CPF</th><th className="p-3 text-left">Cargo/Setor</th><th className="p-3 text-left">Jornada</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Ação</th></tr></thead>
                    <tbody>{employees.map((e) => <tr key={e.id} className="border-t bg-white"><td className="p-3 font-medium">{e.nome}<div className="text-xs text-slate-500">{e.email || "—"}</div></td><td className="p-3">{maskCPF(e.cpf_digits)}</td><td className="p-3">{e.cargo || "—"}<div className="text-xs text-slate-500">{e.setor || "—"}</div></td><td className="p-3">{formatMinutes(e.jornada_diaria_minutos)}<div className="text-xs text-slate-500">Intervalo {formatMinutes(e.intervalo_minutos)}</div></td><td className="p-3"><StatusBadge tone={e.ativo ? "good" : "bad"}>{e.ativo ? "Ativo" : "Inativo"}</StatusBadge></td><td className="p-3"><Button size="sm" variant="outline" onClick={() => editEmployee(e)}>Editar</Button></td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "ponto" && (
        <Card className="rounded-3xl">
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div><CardTitle>Registros de Ponto</CardTitle><p className="text-sm text-slate-500 mt-1">Registros captados pelo link externo com geolocalização obrigatória.</p></div>
            {isAdmin && <EmployeeFilter employees={employees} value={selectedEmployeeId} onChange={setSelectedEmployeeId} />}
          </CardHeader>
          <CardContent>
            {selectedEmployee && <div className="mb-4 rounded-2xl bg-slate-50 border p-4 text-sm"><b>{selectedEmployee.nome}</b><div className="text-slate-600">CPF: {maskCPF(selectedEmployee.cpf_digits)} • Cargo: {selectedEmployee.cargo || "—"} • Setor: {selectedEmployee.setor || "—"}</div></div>}
            {loading ? <Loading /> : filteredEntries.length === 0 ? <Empty text="Nenhum registro encontrado." /> : <EntriesTable entries={filteredEntries} isAdmin={isAdmin} />}
          </CardContent>
        </Card>
      )}

      {tab === "banco" && (
        <Card className="rounded-3xl">
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div><CardTitle>Banco de Horas</CardTitle><p className="text-sm text-slate-500 mt-1">Cálculo automático a partir dos pares Entrada/Saída.</p></div>
            {isAdmin && <EmployeeFilter employees={employees} value={selectedEmployeeId} onChange={setSelectedEmployeeId} />}
          </CardHeader>
          <CardContent>{loading ? <Loading /> : workDays.length === 0 ? <Empty text="Sem registros para calcular banco de horas." /> : <WorkDaysTable rows={workDays} />}</CardContent>
        </Card>
      )}

      {tab === "ajustes" && (
        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
          <Card className="rounded-3xl"><CardHeader><CardTitle>Solicitar ajuste</CardTitle></CardHeader><CardContent className="space-y-3">
            <Field label="Colaborador"><EmployeeSelect employees={employees} value={adjustmentForm.employee_id} onChange={(v) => setAdjustmentForm({ ...adjustmentForm, employee_id: v })} disabled={!isAdmin && employees.length <= 1} /></Field>
            <Field label="Data"><Input type="date" value={adjustmentForm.date_ref} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, date_ref: e.target.value })} /></Field>
            <Field label="Tipo"><Select value={adjustmentForm.requested_entry_type} onValueChange={(v) => setAdjustmentForm({ ...adjustmentForm, requested_entry_type: v as any })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="entrada">Entrada</SelectItem><SelectItem value="saida">Saída</SelectItem></SelectContent></Select></Field>
            <Field label="Data/Hora solicitada"><Input type="datetime-local" value={adjustmentForm.requested_entry_at} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, requested_entry_at: e.target.value })} /></Field>
            <Field label="Justificativa"><Textarea value={adjustmentForm.reason} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })} /></Field>
            <Button disabled={saving} onClick={saveAdjustment} className="text-white" style={{ background: C.ruby }}><Plus className="h-4 w-4 mr-2" />Enviar ajuste</Button>
          </CardContent></Card>
          <Card className="rounded-3xl"><CardHeader><CardTitle>Ajustes de Ponto</CardTitle></CardHeader><CardContent>{loading ? <Loading /> : adjustments.length === 0 ? <Empty text="Nenhum ajuste solicitado." /> : <AdjustmentsList adjustments={adjustments} employeeName={employeeName} isAdmin={isAdmin} onStatus={updateAdjustmentStatus} />}</CardContent></Card>
        </div>
      )}

      {tab === "pdi" && (
        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
          <Card className="rounded-3xl"><CardHeader><CardTitle>Novo PDI</CardTitle></CardHeader><CardContent className="space-y-3">
            {!isAdmin && <AlertBox text="Por enquanto, o cadastro de PDI fica liberado apenas para admin/gestor." />}
            <Field label="Colaborador"><EmployeeSelect employees={employees} value={pdiForm.employee_id} onChange={(v) => setPdiForm({ ...pdiForm, employee_id: v })} disabled={!isAdmin} /></Field>
            <Field label="Título"><Input value={pdiForm.title} onChange={(e) => setPdiForm({ ...pdiForm, title: e.target.value })} disabled={!isAdmin} /></Field>
            <Field label="Objetivo principal"><Textarea value={pdiForm.main_goal} onChange={(e) => setPdiForm({ ...pdiForm, main_goal: e.target.value })} disabled={!isAdmin} /></Field>
            <Field label="Competências"><Textarea value={pdiForm.competencies} onChange={(e) => setPdiForm({ ...pdiForm, competencies: e.target.value })} disabled={!isAdmin} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Início"><Input type="date" value={pdiForm.start_date} onChange={(e) => setPdiForm({ ...pdiForm, start_date: e.target.value })} disabled={!isAdmin} /></Field><Field label="Prazo"><Input type="date" value={pdiForm.end_date} onChange={(e) => setPdiForm({ ...pdiForm, end_date: e.target.value })} disabled={!isAdmin} /></Field></div>
            <Button disabled={!isAdmin || saving} onClick={savePDI} className="text-white" style={{ background: C.ruby }}><Target className="h-4 w-4 mr-2" />Criar PDI</Button>
          </CardContent></Card>
          <Card className="rounded-3xl"><CardHeader><CardTitle>PDIs</CardTitle></CardHeader><CardContent>{loading ? <Loading /> : pdis.length === 0 ? <Empty text="Nenhum PDI cadastrado." /> : <SimpleCards items={pdis.map((p) => ({ id: p.id, title: p.title, subtitle: employeeName(p.employee_id), meta: `${formatDateBR(p.start_date || "")} até ${formatDateBR(p.end_date || "")}`, body: p.main_goal || "—", status: p.status }))} />}</CardContent></Card>
        </div>
      )}

      {tab === "feedbacks" && (
        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
          <Card className="rounded-3xl"><CardHeader><CardTitle>Novo feedback</CardTitle></CardHeader><CardContent className="space-y-3">
            {!isAdmin && <AlertBox text="Por enquanto, o cadastro de feedback fica liberado apenas para admin/gestor." />}
            <Field label="Colaborador"><EmployeeSelect employees={employees} value={feedbackForm.employee_id} onChange={(v) => setFeedbackForm({ ...feedbackForm, employee_id: v })} disabled={!isAdmin} /></Field>
            <Field label="Tipo"><Select value={feedbackForm.feedback_type} onValueChange={(v) => setFeedbackForm({ ...feedbackForm, feedback_type: v })} disabled={!isAdmin}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="reconhecimento">Reconhecimento</SelectItem><SelectItem value="correcao">Correção</SelectItem><SelectItem value="alinhamento">Alinhamento</SelectItem><SelectItem value="desenvolvimento">Desenvolvimento</SelectItem></SelectContent></Select></Field>
            <Field label="Situação observada"><Textarea value={feedbackForm.situation} onChange={(e) => setFeedbackForm({ ...feedbackForm, situation: e.target.value })} disabled={!isAdmin} /></Field>
            <Field label="Comportamento"><Textarea value={feedbackForm.behavior} onChange={(e) => setFeedbackForm({ ...feedbackForm, behavior: e.target.value })} disabled={!isAdmin} /></Field>
            <Field label="Impacto"><Textarea value={feedbackForm.impact} onChange={(e) => setFeedbackForm({ ...feedbackForm, impact: e.target.value })} disabled={!isAdmin} /></Field>
            <Field label="Orientação / plano de ação"><Textarea value={feedbackForm.action_plan} onChange={(e) => setFeedbackForm({ ...feedbackForm, action_plan: e.target.value })} disabled={!isAdmin} /></Field>
            <Field label="Acompanhar em"><Input type="date" value={feedbackForm.followup_date} onChange={(e) => setFeedbackForm({ ...feedbackForm, followup_date: e.target.value })} disabled={!isAdmin} /></Field>
            <Button disabled={!isAdmin || saving} onClick={saveFeedback} className="text-white" style={{ background: C.ruby }}><UserCheck className="h-4 w-4 mr-2" />Registrar feedback</Button>
          </CardContent></Card>
          <Card className="rounded-3xl"><CardHeader><CardTitle>Feedbacks</CardTitle></CardHeader><CardContent>{loading ? <Loading /> : feedbacks.length === 0 ? <Empty text="Nenhum feedback registrado." /> : <SimpleCards items={feedbacks.map((f) => ({ id: f.id, title: f.feedback_type, subtitle: employeeName(f.employee_id), meta: `Acompanhamento: ${formatDateBR(f.followup_date || "")}`, body: f.situation || "—", status: f.status }))} />}</CardContent></Card>
        </div>
      )}

      {tab === "candidatos" && (
        <Card className="rounded-3xl"><CardHeader><CardTitle>Candidatos</CardTitle><p className="text-sm text-slate-500">Base preparada para futura área externa /trabalhe-conosco e login do candidato.</p></CardHeader><CardContent>{!isAdmin ? <AlertBox text="A visualização de candidatos fica restrita ao admin." /> : loading ? <Loading /> : candidates.length === 0 ? <Empty text="Nenhum candidato encontrado. Após aplicar a migration, criaremos a área externa de candidatura." /> : <CandidatesTable candidates={candidates} />}</CardContent></Card>
      )}
    </div>
  );
}

function BarIcon(props: any) { return <BarChart3 {...props} />; }

function Kpi({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return <Card className="rounded-2xl"><CardContent className="p-5"><div className="flex items-center gap-3"><Icon className="h-5 w-5" style={{ color: C.ruby }} /><div><div className="text-sm text-slate-500">{label}</div><div className="text-2xl font-bold">{value}</div></div></div></CardContent></Card>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function Loading() { return <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>; }
function Empty({ text }: { text: string }) { return <div className="py-12 text-center text-slate-500">{text}</div>; }
function AlertBox({ text }: { text: string }) { return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2"><AlertCircle className="h-4 w-4 mt-0.5" />{text}</div>; }

function EmployeeFilter({ employees, value, onChange }: { employees: Employee[]; value: string; onChange: (v: string) => void }) {
  return <div className="w-full md:w-72"><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder="Filtrar colaborador" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os colaboradores</SelectItem>{employees.map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.nome}</SelectItem>)}</SelectContent></Select></div>;
}

function EmployeeSelect({ employees, value, onChange, disabled }: { employees: Employee[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)} disabled={disabled}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="none">Selecione</SelectItem>{employees.map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.nome}</SelectItem>)}</SelectContent></Select>;
}

function EntriesTable({ entries, isAdmin }: { entries: TimeEntry[]; isAdmin: boolean }) {
  return <div className="overflow-x-auto rounded-2xl border"><table className="min-w-full text-sm"><thead className="bg-slate-100 text-slate-600"><tr>{isAdmin && <th className="text-left p-3">Colaborador</th>}<th className="text-left p-3">Tipo</th><th className="text-left p-3">Data/Hora</th><th className="text-left p-3">Status</th><th className="text-left p-3">Localização</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="border-t bg-white">{isAdmin && <td className="p-3"><div className="font-medium">{entry.hr_employees?.nome || "—"}</div><div className="text-xs text-slate-500">{entry.hr_employees?.cargo || "—"}</div></td>}<td className="p-3"><Badge className="rounded-full" style={{ backgroundColor: entry.entry_type === "entrada" ? C.navy : C.ruby, color: "#fff" }}>{entry.entry_type === "entrada" ? "Entrada" : "Saída"}</Badge></td><td className="p-3">{formatDateTimeBR(entry.entry_at)}</td><td className="p-3"><Badge variant="outline" className="rounded-full">{entry.status}</Badge></td><td className="p-3"><a href={mapUrl(Number(entry.latitude), Number(entry.longitude))} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline" style={{ color: C.ruby }}><MapPin className="h-4 w-4" />Ver mapa</a>{entry.accuracy != null && <div className="text-xs text-slate-500 mt-1">Precisão: {Math.round(Number(entry.accuracy))}m</div>}</td></tr>)}</tbody></table></div>;
}

function WorkDaysTable({ rows }: { rows: WorkDay[] }) {
  return <div className="overflow-x-auto rounded-2xl border"><table className="min-w-full text-sm"><thead className="bg-slate-100 text-slate-600"><tr><th className="text-left p-3">Data</th><th className="text-left p-3">Colaborador</th><th className="text-left p-3">Entrada</th><th className="text-left p-3">Saída</th><th className="text-left p-3">Previsto</th><th className="text-left p-3">Trabalhado</th><th className="text-left p-3">Saldo</th><th className="text-left p-3">Status</th></tr></thead><tbody>{rows.map((r) => <tr key={`${r.employee_id}-${r.date_ref}`} className="border-t bg-white"><td className="p-3">{formatDateBR(r.date_ref)}</td><td className="p-3 font-medium">{r.employee_name}</td><td className="p-3">{formatDateTimeBR(r.first_entry)}</td><td className="p-3">{formatDateTimeBR(r.last_exit)}</td><td className="p-3">{formatMinutes(r.expected_minutes)}</td><td className="p-3">{formatMinutes(r.worked_minutes)}</td><td className="p-3"><StatusBadge tone={r.balance_minutes >= 0 ? "good" : "bad"}>{formatMinutes(r.balance_minutes)}</StatusBadge></td><td className="p-3"><StatusBadge tone={r.status === "em_jornada" ? "good" : "default"}>{r.status === "em_jornada" ? "Em jornada" : "Fora"}</StatusBadge></td></tr>)}</tbody></table></div>;
}

function AdjustmentsList({ adjustments, employeeName, isAdmin, onStatus }: { adjustments: TimeAdjustment[]; employeeName: (id: string) => string; isAdmin: boolean; onStatus: (id: string, status: "aprovado" | "recusado") => void }) {
  return <div className="space-y-3">{adjustments.map((a) => <div key={a.id} className="rounded-2xl border bg-white p-4"><div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2"><div><div className="font-semibold">{employeeName(a.employee_id)}</div><div className="text-sm text-slate-500">{a.requested_entry_type === "entrada" ? "Entrada" : "Saída"} em {formatDateTimeBR(a.requested_entry_at)}</div></div><StatusBadge tone={a.status === "aprovado" ? "good" : a.status === "recusado" ? "bad" : "warn"}>{a.status}</StatusBadge></div><p className="text-sm text-slate-700 mt-3">{a.reason}</p>{isAdmin && a.status === "pendente" && <div className="flex gap-2 mt-3"><Button size="sm" onClick={() => onStatus(a.id, "aprovado")} className="text-white" style={{ background: C.navy }}>Aprovar</Button><Button size="sm" variant="outline" onClick={() => onStatus(a.id, "recusado")}>Recusar</Button></div>}</div>)}</div>;
}

function SimpleCards({ items }: { items: Array<{ id: string; title: string; subtitle: string; meta: string; body: string; status: string }> }) {
  return <div className="space-y-3">{items.map((item) => <div key={item.id} className="rounded-2xl border bg-white p-4"><div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2"><div><div className="font-semibold capitalize">{item.title}</div><div className="text-sm text-slate-500">{item.subtitle} • {item.meta}</div></div><StatusBadge tone="navy">{item.status}</StatusBadge></div><p className="text-sm text-slate-700 mt-3 whitespace-pre-wrap">{item.body}</p></div>)}</div>;
}

function CandidatesTable({ candidates }: { candidates: Candidate[] }) {
  return <div className="overflow-x-auto rounded-2xl border"><table className="min-w-full text-sm"><thead className="bg-slate-100 text-slate-600"><tr><th className="text-left p-3">Nome</th><th className="text-left p-3">Contato</th><th className="text-left p-3">Cidade</th><th className="text-left p-3">Área</th><th className="text-left p-3">Status</th></tr></thead><tbody>{candidates.map((c) => <tr key={c.id} className="border-t bg-white"><td className="p-3 font-medium">{c.nome || "—"}<div className="text-xs text-slate-500">{c.cpf ? maskCPF(c.cpf) : "CPF não informado"}</div></td><td className="p-3">{c.email || "—"}<div className="text-xs text-slate-500">{c.telefone || "—"}</div></td><td className="p-3">{c.cidade || "—"}/{c.uf || "—"}</td><td className="p-3">{c.area_interesse || "—"}</td><td className="p-3"><StatusBadge>{c.status || "novo"}</StatusBadge></td></tr>)}</tbody></table></div>;
}
