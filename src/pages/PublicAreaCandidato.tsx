import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Briefcase, CheckCircle2, Loader2, Lock, LogOut, Mail, Save, Send, UserRound } from "lucide-react";

const C = { ruby: "#A11C27", navy: "#1E293F", gold: "#B5A573" };

type Mode = "login" | "signup" | "reset";

type Job = {
  id: string;
  title: string;
  area: string | null;
  description: string | null;
  requirements: string | null;
  status: string;
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
  linkedin: string | null;
  instagram: string | null;
  status: string | null;
  created_at?: string;
};

type Application = {
  id: string;
  job_id: string;
  candidate_id: string;
  status: string;
  notes: string | null;
  created_at: string;
};

type CandidateForm = {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  cidade: string;
  uf: string;
  area_interesse: string;
  pretensao_salarial: string;
  linkedin: string;
  instagram: string;
  resumo: string;
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

function maskPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

function numberToMoneyInput(v: number | null | undefined) {
  if (v == null) return "";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function moneyToNumber(v: string) {
  if (!v.trim()) return null;
  const n = Number(v.replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function formatDateBR(v?: string | null) {
  if (!v) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR").format(new Date(v));
  } catch {
    return v;
  }
}

function statusTone(status?: string | null): "default" | "good" | "warn" | "bad" | "navy" {
  if (status === "aprovado" || status === "convertido") return "good";
  if (status === "reprovado") return "bad";
  if (status === "entrevista" || status === "teste") return "warn";
  return "navy";
}

const initialForm: CandidateForm = {
  nome: "",
  email: "",
  telefone: "",
  cpf: "",
  cidade: "",
  uf: "RO",
  area_interesse: "",
  pretensao_salarial: "",
  linkedin: "",
  instagram: "",
  resumo: "",
};

export default function PublicAreaCandidato() {
  const [params, setParams] = useSearchParams();
  const requestedJobId = params.get("job") || "";

  const [mode, setMode] = useState<Mode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [userId, setUserId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedJobId, setSelectedJobId] = useState(requestedJobId || "banco");
  const [form, setForm] = useState<CandidateForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const jobMap = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  async function loadJobs() {
    const { data, error } = await supabase
      .from("hr_jobs")
      .select("id, title, area, description, requirements, status")
      .eq("status", "aberta")
      .order("created_at", { ascending: false });

    if (!error) setJobs((data || []) as Job[]);
  }

  function fillForm(c: Candidate | null, emailFallback = "") {
    setForm({
      nome: c?.nome || "",
      email: c?.email || emailFallback || "",
      telefone: maskPhone(c?.telefone || ""),
      cpf: maskCPF(c?.cpf || ""),
      cidade: c?.cidade || "",
      uf: c?.uf || "RO",
      area_interesse: c?.area_interesse || "",
      pretensao_salarial: numberToMoneyInput(c?.pretensao_salarial),
      linkedin: c?.linkedin || "",
      instagram: c?.instagram || "",
      resumo: "",
    });
  }

  async function loadCandidate(uid: string, emailFallback = "") {
    const { data, error } = await supabase
      .from("hr_candidates")
      .select("*")
      .eq("auth_user_id", uid)
      .maybeSingle();

    if (error && error.code !== "PGRST116") throw error;

    const c = (data || null) as Candidate | null;
    setCandidate(c);
    fillForm(c, emailFallback);

    if (c?.id) {
      const { data: appData } = await supabase
        .from("hr_applications")
        .select("*")
        .eq("candidate_id", c.id)
        .order("created_at", { ascending: false });
      setApplications((appData || []) as Application[]);
    } else {
      setApplications([]);
    }
  }

  async function loadAll() {
    setLoading(true);
    try {
      await loadJobs();
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user || null;
      setUserId(user?.id || null);
      setAuthEmail(user?.email || "");
      if (user?.id) await loadCandidate(user.id, user.email || "");
    } catch (err: any) {
      alert(err?.message || "Erro ao carregar área do candidato.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user || null;
      setUserId(user?.id || null);
      setAuthEmail(user?.email || "");
      if (user?.id) loadCandidate(user.id, user.email || "");
      else {
        setCandidate(null);
        setApplications([]);
        fillForm(null);
      }
    });

    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn() {
    if (!authEmail.trim()) return alert("Informe seu e-mail.");
    if (mode !== "reset" && !authPassword) return alert("Informe sua senha.");

    setSaving(true);
    setMessage("");
    try {
      if (mode === "signup") {
        if (authPassword.length < 6) return alert("A senha precisa ter pelo menos 6 caracteres.");
        if (authPassword !== confirmPassword) return alert("As senhas não conferem.");

        const { error } = await supabase.auth.signUp({
          email: authEmail.trim().toLowerCase(),
          password: authPassword,
          options: {
            emailRedirectTo: `${window.location.origin}/area-candidato`,
          },
        });
        if (error) throw error;
        setMessage("Cadastro criado. Confira seu e-mail para confirmar o acesso, se a confirmação estiver ativa.");
        setMode("login");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim().toLowerCase(), {
          redirectTo: `${window.location.origin}/area-candidato`,
        });
        if (error) throw error;
        setMessage("Enviamos o link de recuperação para seu e-mail.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim().toLowerCase(),
          password: authPassword,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      alert(err?.message || "Não foi possível concluir o acesso.");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUserId(null);
    setCandidate(null);
    setApplications([]);
  }

  async function saveCandidate() {
    if (!userId) return alert("Faça login para salvar seu currículo.");

    const cpfDigits = onlyDigits(form.cpf);
    const phoneDigits = onlyDigits(form.telefone);
    if (!form.nome.trim()) return alert("Informe seu nome completo.");
    if (!form.email.trim()) return alert("Informe seu e-mail.");
    if (phoneDigits.length < 10) return alert("Informe um telefone válido.");
    if (cpfDigits.length !== 11) return alert("Informe um CPF válido.");

    setSaving(true);
    try {
      const payload = {
        auth_user_id: userId,
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        telefone: phoneDigits,
        cpf: cpfDigits,
        cidade: form.cidade.trim() || null,
        uf: form.uf.trim().toUpperCase() || null,
        linkedin: form.linkedin.trim() || null,
        instagram: form.instagram.trim() || null,
        pretensao_salarial: moneyToNumber(form.pretensao_salarial),
        area_interesse: form.area_interesse.trim() || null,
        status: candidate?.status || "novo",
        updated_at: new Date().toISOString(),
      };

      let candidateId = candidate?.id || null;
      if (candidateId) {
        const { error } = await supabase.from("hr_candidates").update(payload).eq("id", candidateId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("hr_candidates")
          .insert(payload)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        candidateId = data?.id || null;
      }

      if (!candidateId) throw new Error("Não foi possível salvar o candidato.");
      await loadCandidate(userId, form.email);
      setMessage("Currículo salvo com sucesso.");
    } catch (err: any) {
      alert(err?.message || "Erro ao salvar currículo.");
    } finally {
      setSaving(false);
    }
  }

  async function applyToJob() {
    if (!userId) return alert("Faça login para se candidatar.");
    if (!candidate?.id) {
      await saveCandidate();
      const { data } = await supabase.from("hr_candidates").select("id").eq("auth_user_id", userId).maybeSingle();
      if (!data?.id) return alert("Salve seu currículo antes de se candidatar.");
    }

    const cId = candidate?.id || (await supabase.from("hr_candidates").select("id").eq("auth_user_id", userId).maybeSingle()).data?.id;
    if (!cId) return alert("Salve seu currículo antes de se candidatar.");
    if (!selectedJobId || selectedJobId === "banco") return alert("Selecione uma vaga aberta.");

    setSaving(true);
    try {
      const { error } = await supabase.from("hr_applications").upsert(
        {
          job_id: selectedJobId,
          candidate_id: cId,
          status: "inscrito",
          notes: form.resumo.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "job_id,candidate_id" }
      );
      if (error) throw error;
      await loadCandidate(userId, form.email);
      setMessage("Candidatura enviada com sucesso.");
    } catch (err: any) {
      alert(err?.message || "Erro ao enviar candidatura.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-3xl p-6 text-white shadow-xl" style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})` }}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm mb-3">
                <UserRound className="h-4 w-4" /> Área do Candidato
              </div>
              <h1 className="text-3xl md:text-4xl font-bold">Sua carreira na Consulmax começa aqui</h1>
              <p className="text-white/80 mt-2 max-w-2xl">
                Crie seu acesso, preencha seu currículo e acompanhe suas candidaturas.
              </p>
            </div>

            {userId && (
              <Button variant="secondary" className="rounded-2xl" onClick={signOut}>
                <LogOut className="h-4 w-4 mr-2" /> Sair
              </Button>
            )}
          </div>
        </div>

        {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{message}</div>}

        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : !userId ? (
          <AuthCard mode={mode} setMode={setMode} email={authEmail} setEmail={setAuthEmail} password={authPassword} setPassword={setAuthPassword} confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword} saving={saving} onSubmit={signIn} />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-5">
            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: C.navy }}>
                  <UserRound className="h-5 w-5" /> Meu currículo
                </CardTitle>
                <p className="text-sm text-slate-500">Essas informações ficam disponíveis para o RH avaliar seu perfil.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="Nome completo"><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="E-mail"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                  <Field label="Telefone"><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: maskPhone(e.target.value) })} /></Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="CPF"><Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCPF(e.target.value) })} /></Field>
                  <Field label="Pretensão salarial"><Input value={form.pretensao_salarial} onChange={(e) => setForm({ ...form, pretensao_salarial: e.target.value })} placeholder="Ex.: 2500,00" /></Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_90px] gap-3">
                  <Field label="Cidade"><Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></Field>
                  <Field label="UF"><Input value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase().slice(0, 2) })} /></Field>
                </div>
                <Field label="Área de interesse"><Input value={form.area_interesse} onChange={(e) => setForm({ ...form, area_interesse: e.target.value })} placeholder="Comercial, administrativo, atendimento..." /></Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="LinkedIn"><Input value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} /></Field>
                  <Field label="Instagram"><Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} /></Field>
                </div>
                <Field label="Resumo profissional"><Textarea value={form.resumo} onChange={(e) => setForm({ ...form, resumo: e.target.value })} placeholder="Fale sobre sua experiência, objetivos e principais competências." /></Field>

                <Button disabled={saving} onClick={saveCandidate} className="rounded-2xl text-white" style={{ background: C.ruby }}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Salvar currículo
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2" style={{ color: C.navy }}>
                    <Briefcase className="h-5 w-5" /> Candidatar-se
                  </CardTitle>
                  <p className="text-sm text-slate-500">Selecione uma vaga aberta e envie sua candidatura.</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Field label="Vaga aberta">
                    <Select value={selectedJobId || "banco"} onValueChange={(v) => { setSelectedJobId(v); setParams(v === "banco" ? {} : { job: v }); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="banco">Selecione uma vaga</SelectItem>
                        {jobs.map((job) => <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>

                  {selectedJobId !== "banco" && jobMap.get(selectedJobId) && (
                    <div className="rounded-2xl border bg-slate-50 p-4">
                      <div className="font-semibold" style={{ color: C.navy }}>{jobMap.get(selectedJobId)?.title}</div>
                      <div className="text-sm text-slate-500">{jobMap.get(selectedJobId)?.area || "Área não informada"}</div>
                      {jobMap.get(selectedJobId)?.description && <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{jobMap.get(selectedJobId)?.description}</p>}
                    </div>
                  )}

                  <Button disabled={saving || selectedJobId === "banco"} onClick={applyToJob} className="w-full rounded-2xl text-white" style={{ background: C.navy }}>
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Enviar candidatura
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2" style={{ color: C.navy }}>
                    <CheckCircle2 className="h-5 w-5" /> Minhas candidaturas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {applications.length === 0 ? (
                    <div className="rounded-2xl border bg-slate-50 p-4 text-sm text-slate-500">Você ainda não se candidatou a nenhuma vaga.</div>
                  ) : (
                    applications.map((app) => (
                      <div key={app.id} className="rounded-2xl border bg-white p-4">
                        <div className="font-semibold">{jobMap.get(app.job_id)?.title || "Vaga"}</div>
                        <div className="text-xs text-slate-500">Enviada em {formatDateBR(app.created_at)}</div>
                        <div className="mt-2"><StatusBadge tone={statusTone(app.status)}>{app.status}</StatusBadge></div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AuthCard(props: {
  mode: Mode;
  setMode: (m: Mode) => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  saving: boolean;
  onSubmit: () => void;
}) {
  const { mode, setMode, email, setEmail, password, setPassword, confirmPassword, setConfirmPassword, saving, onSubmit } = props;
  return (
    <Card className="rounded-3xl max-w-xl mx-auto shadow-xl">
      <CardHeader className="text-white rounded-t-3xl" style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})` }}>
        <CardTitle className="flex items-center gap-2 text-2xl">
          {mode === "reset" ? <Mail className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
          {mode === "signup" ? "Criar acesso" : mode === "reset" ? "Recuperar senha" : "Entrar na área do candidato"}
        </CardTitle>
        <p className="text-sm text-white/80">Use seu e-mail para acessar e editar seu currículo.</p>
      </CardHeader>
      <CardContent className="p-5 space-y-3">
        <Field label="E-mail"><Input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        {mode !== "reset" && <Field label="Senha"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>}
        {mode === "signup" && <Field label="Confirmar senha"><Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></Field>}

        <Button disabled={saving} onClick={onSubmit} className="w-full h-12 rounded-2xl text-white" style={{ background: C.ruby }}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {mode === "signup" ? "Criar meu acesso" : mode === "reset" ? "Enviar recuperação" : "Entrar"}
        </Button>

        <div className="flex flex-wrap justify-center gap-2 text-sm">
          {mode !== "login" && <button className="underline" style={{ color: C.navy }} onClick={() => setMode("login")}>Já tenho acesso</button>}
          {mode !== "signup" && <button className="underline" style={{ color: C.navy }} onClick={() => setMode("signup")}>Criar conta</button>}
          {mode !== "reset" && <button className="underline" style={{ color: C.navy }} onClick={() => setMode("reset")}>Esqueci minha senha</button>}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
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
