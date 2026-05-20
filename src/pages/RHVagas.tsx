import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Briefcase, CheckCircle2, ExternalLink, Loader2, RefreshCcw, Save, UserPlus, Users } from "lucide-react";

const C = { ruby: "#A11C27", navy: "#1E293F", gold: "#B5A573" };

type Job = {
  id: string;
  title: string;
  area: string | null;
  description: string | null;
  requirements: string | null;
  status: string;
  public_slug: string | null;
  created_at: string;
};

type Candidate = {
  id: string;
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

type Application = {
  id: string;
  job_id: string;
  candidate_id: string;
  status: string;
  notes: string | null;
  created_at: string;
};

type JobForm = {
  id?: string;
  title: string;
  area: string;
  description: string;
  requirements: string;
  status: string;
  public_slug: string;
};

function emptyJobForm(): JobForm {
  return { title: "", area: "", description: "", requirements: "", status: "aberta", public_slug: "" };
}

function slugify(v: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "");
}

function maskCPF(v?: string | null) {
  const d = onlyDigits(v || "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4") || "—";
}

function maskPhone(v?: string | null) {
  const d = onlyDigits(v || "");
  if (!d) return "—";
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

function fmtMoney(v?: number | null) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateBR(v?: string | null) {
  if (!v) return "—";
  try { return new Intl.DateTimeFormat("pt-BR").format(new Date(v)); } catch { return v; }
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

const candidateStages = [
  "novo",
  "triagem",
  "teste",
  "entrevista",
  "aprovado",
  "reprovado",
];

export default function RHVagas() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [jobForm, setJobForm] = useState<JobForm>(emptyJobForm());
  const [selectedJobId, setSelectedJobId] = useState<string>("all");

  const candidateMap = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const jobMap = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const filteredApplications = useMemo(() => {
    if (selectedJobId === "all") return applications;
    return applications.filter((a) => a.job_id === selectedJobId);
  }, [applications, selectedJobId]);

  async function load() {
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) return;

      const { data: profile } = await supabase
        .from("users")
        .select("id, role, user_role")
        .eq("auth_user_id", uid)
        .maybeSingle();

      const admin = profile?.role === "admin" || profile?.user_role === "admin";
      setIsAdmin(admin);

      const [{ data: jobsData, error: jobsError }, { data: candData, error: candError }, { data: appData, error: appError }] = await Promise.all([
        supabase.from("hr_jobs").select("*").order("created_at", { ascending: false }),
        supabase.from("hr_candidates").select("*").order("created_at", { ascending: false }),
        supabase.from("hr_applications").select("*").order("created_at", { ascending: false }),
      ]);

      if (jobsError) throw jobsError;
      if (candError) throw candError;
      if (appError) throw appError;

      setJobs((jobsData || []) as Job[]);
      setCandidates((candData || []) as Candidate[]);
      setApplications((appData || []) as Application[]);
    } catch (err: any) {
      alert(err?.message || "Erro ao carregar vagas e candidaturas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function editJob(job: Job) {
    setJobForm({
      id: job.id,
      title: job.title || "",
      area: job.area || "",
      description: job.description || "",
      requirements: job.requirements || "",
      status: job.status || "aberta",
      public_slug: job.public_slug || slugify(job.title),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveJob() {
    if (!isAdmin) return alert("Somente admin pode gerenciar vagas.");
    if (!jobForm.title.trim()) return alert("Informe o título da vaga.");
    setSaving(true);
    try {
      const payload = {
        title: jobForm.title.trim(),
        area: jobForm.area.trim() || null,
        description: jobForm.description.trim() || null,
        requirements: jobForm.requirements.trim() || null,
        status: jobForm.status,
        public_slug: jobForm.public_slug.trim() || slugify(jobForm.title),
        updated_at: new Date().toISOString(),
      };

      const { error } = jobForm.id
        ? await supabase.from("hr_jobs").update(payload).eq("id", jobForm.id)
        : await supabase.from("hr_jobs").insert(payload);

      if (error) throw error;
      setJobForm(emptyJobForm());
      await load();
      alert("Vaga salva com sucesso.");
    } catch (err: any) {
      alert(err?.message || "Erro ao salvar vaga.");
    } finally {
      setSaving(false);
    }
  }

  async function updateApplicationStatus(application: Application, status: string) {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const { error: appError } = await supabase
        .from("hr_applications")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", application.id);
      if (appError) throw appError;

      const { error: candError } = await supabase
        .from("hr_candidates")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", application.candidate_id);
      if (candError) throw candError;

      await load();
    } catch (err: any) {
      alert(err?.message || "Erro ao atualizar etapa.");
    } finally {
      setSaving(false);
    }
  }

  async function convertCandidate(candidate: Candidate) {
    if (!isAdmin) return;
    const cpfDigits = onlyDigits(candidate.cpf || "");
    if (!candidate.nome || cpfDigits.length !== 11) return alert("Candidato sem nome ou CPF válido.");

    setSaving(true);
    try {
      const { error } = await supabase.from("hr_employees").upsert(
        {
          nome: candidate.nome,
          cpf_digits: cpfDigits,
          email: candidate.email || null,
          telefone: candidate.telefone || null,
          cargo: candidate.area_interesse || null,
          setor: "Recrutamento",
          jornada_diaria_minutos: 480,
          intervalo_minutos: 60,
          ativo: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "cpf_digits" }
      );
      if (error) throw error;

      await supabase.from("hr_candidates").update({ status: "convertido", updated_at: new Date().toISOString() }).eq("id", candidate.id);
      await load();
      alert("Candidato convertido em colaborador. Complete contrato, salário e escala na guia RH.");
    } catch (err: any) {
      alert(err?.message || "Erro ao converter candidato.");
    } finally {
      setSaving(false);
    }
  }

  const openJobs = jobs.filter((j) => j.status === "aberta").length;
  const newCandidates = candidates.filter((c) => (c.status || "novo") === "novo").length;
  const approvedCandidates = candidates.filter((c) => (c.status || "") === "aprovado").length;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 space-y-5">
      <div className="rounded-3xl p-5 md:p-6 text-white shadow-xl" style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})` }}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">RH • Vagas</h1>
            <p className="text-white/80 mt-1">Cadastre vagas, acompanhe candidaturas e converta aprovados em colaboradores.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="rounded-xl" onClick={() => window.open("/trabalhe-conosco", "_blank")}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Página pública
            </Button>
            <Button variant="secondary" className="rounded-xl" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
              Atualizar
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi icon={Briefcase} label="Vagas abertas" value={openJobs} />
        <Kpi icon={Users} label="Candidatos" value={candidates.length} />
        <Kpi icon={UserPlus} label="Novos" value={newCandidates} />
        <Kpi icon={CheckCircle2} label="Aprovados" value={approvedCandidates} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
        <Card className="rounded-3xl">
          <CardHeader><CardTitle>{jobForm.id ? "Editar vaga" : "Nova vaga"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!isAdmin && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Somente admin pode gerenciar vagas.</div>}
            <Field label="Título da vaga">
              <Input value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value, public_slug: jobForm.public_slug || slugify(e.target.value) })} disabled={!isAdmin} />
            </Field>
            <Field label="Área">
              <Input value={jobForm.area} onChange={(e) => setJobForm({ ...jobForm, area: e.target.value })} disabled={!isAdmin} placeholder="Administrativo, Comercial, Atendimento..." />
            </Field>
            <Field label="Descrição">
              <Textarea value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} disabled={!isAdmin} />
            </Field>
            <Field label="Requisitos">
              <Textarea value={jobForm.requirements} onChange={(e) => setJobForm({ ...jobForm, requirements: e.target.value })} disabled={!isAdmin} />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Status">
                <Select value={jobForm.status} onValueChange={(v) => setJobForm({ ...jobForm, status: v })} disabled={!isAdmin}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberta">Aberta</SelectItem>
                    <SelectItem value="pausada">Pausada</SelectItem>
                    <SelectItem value="fechada">Fechada</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Slug público">
                <Input value={jobForm.public_slug} onChange={(e) => setJobForm({ ...jobForm, public_slug: slugify(e.target.value) })} disabled={!isAdmin} />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button onClick={saveJob} disabled={!isAdmin || saving} className="text-white" style={{ background: C.ruby }}>
                <Save className="h-4 w-4 mr-2" />Salvar vaga
              </Button>
              <Button variant="outline" onClick={() => setJobForm(emptyJobForm())}>Limpar</Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-3xl">
            <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <CardTitle>Vagas cadastradas</CardTitle>
                <p className="text-sm text-slate-500 mt-1">Apenas vagas com status aberta aparecem no /trabalhe-conosco.</p>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <Loading /> : jobs.length === 0 ? <Empty text="Nenhuma vaga cadastrada." /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {jobs.map((job) => (
                    <div key={job.id} className="rounded-2xl border bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold" style={{ color: C.navy }}>{job.title}</div>
                          <div className="text-sm text-slate-500">{job.area || "Área não informada"}</div>
                        </div>
                        <StatusBadge tone={job.status === "aberta" ? "good" : job.status === "pausada" ? "warn" : "bad"}>{job.status}</StatusBadge>
                      </div>
                      {job.description && <p className="text-sm text-slate-600 mt-3 line-clamp-3">{job.description}</p>}
                      <div className="flex flex-wrap gap-2 mt-4">
                        <Button size="sm" variant="outline" onClick={() => editJob(job)}>Editar</Button>
                        <Button size="sm" variant="outline" onClick={() => setSelectedJobId(job.id)}>
                          Ver candidaturas ({applications.filter((a) => a.job_id === job.id).length})
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <CardTitle>Candidaturas</CardTitle>
                <p className="text-sm text-slate-500 mt-1">Atualize a etapa do processo seletivo e converta aprovados.</p>
              </div>
              <div className="w-full md:w-72">
                <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as vagas</SelectItem>
                    {jobs.map((j) => <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <Loading /> : filteredApplications.length === 0 ? <Empty text="Nenhuma candidatura encontrada." /> : (
                <div className="overflow-x-auto rounded-2xl border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="p-3 text-left">Candidato</th>
                        <th className="p-3 text-left">Vaga</th>
                        <th className="p-3 text-left">Contato</th>
                        <th className="p-3 text-left">Cidade</th>
                        <th className="p-3 text-left">Etapa</th>
                        <th className="p-3 text-left">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApplications.map((app) => {
                        const candidate = candidateMap.get(app.candidate_id);
                        const job = jobMap.get(app.job_id);
                        const currentStatus = app.status || candidate?.status || "novo";
                        return (
                          <tr key={app.id} className="border-t bg-white align-top">
                            <td className="p-3">
                              <div className="font-semibold">{candidate?.nome || "—"}</div>
                              <div className="text-xs text-slate-500">CPF: {maskCPF(candidate?.cpf)}</div>
                              <div className="text-xs text-slate-500">Pretensão: {fmtMoney(candidate?.pretensao_salarial)}</div>
                            </td>
                            <td className="p-3">
                              <div>{job?.title || "Banco de talentos"}</div>
                              <div className="text-xs text-slate-500">{job?.area || candidate?.area_interesse || "—"}</div>
                            </td>
                            <td className="p-3">
                              <div>{candidate?.email || "—"}</div>
                              <div className="text-xs text-slate-500">{maskPhone(candidate?.telefone)}</div>
                            </td>
                            <td className="p-3">{candidate?.cidade || "—"}/{candidate?.uf || "—"}</td>
                            <td className="p-3 min-w-[180px]">
                              <Select value={currentStatus} onValueChange={(v) => updateApplicationStatus(app, v)} disabled={!isAdmin || saving}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {candidateStages.map((stage) => <SelectItem key={stage} value={stage}>{stage}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-3">
                              <div className="flex flex-col gap-2">
                                <StatusBadge tone={currentStatus === "aprovado" ? "good" : currentStatus === "reprovado" ? "bad" : "navy"}>{currentStatus}</StatusBadge>
                                {candidate && currentStatus === "aprovado" && (
                                  <Button size="sm" className="text-white" style={{ background: C.ruby }} onClick={() => convertCandidate(candidate)} disabled={saving}>
                                    Converter em colaborador
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function Kpi({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return <Card className="rounded-2xl"><CardContent className="p-5"><div className="flex items-center gap-3"><Icon className="h-5 w-5" style={{ color: C.ruby }} /><div><div className="text-sm text-slate-500">{label}</div><div className="text-2xl font-bold">{value}</div></div></div></CardContent></Card>;
}

function Loading() {
  return <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="py-12 text-center text-slate-500">{text}</div>;
}
