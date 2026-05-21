// src/pages/RHVagas.tsx
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
  Archive,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  MessageSquare,
  RefreshCcw,
  Save,
  Send,
  UserPlus,
  Users,
  X,
} from "lucide-react";

const C = { ruby: "#A11C27", navy: "#1E293F", gold: "#B5A573" };

type StageKey = "novo" | "triagem" | "teste" | "entrevista" | "aprovado" | "reprovado";

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

  nascimento?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade: string | null;
  uf: string | null;
  foto_url?: string | null;

  pcd?: boolean | null;
  pcd_tipo?: string | null;
  pcd_adaptacao?: string | null;

  ensino_medio?: string | null;
  academic_formations?: any[] | string | null;
  courses_certifications?: any[] | string | null;
  professional_experiences?: any[] | string | null;
  languages?: any[] | string | null;

  area_interesse: string | null;
  pretensao_salarial: number | null;
  linkedin?: string | null;
  instagram?: string | null;
  additional_info?: string | null;

  status: string | null;
  created_at: string;
};

type Application = {
  id: string;
  job_id: string;
  candidate_id: string;
  status: string;
  notes: string | null;
  parecer_candidato?: string | null;
  parecer_interno?: string | null;
  banco_talentos?: boolean | null;
  moved_at?: string | null;
  moved_by?: string | null;
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

type MoveModalState = {
  open: boolean;
  application: Application | null;
  toStatus: StageKey;
  parecerCandidato: string;
  parecerInterno: string;
};

type LinkTalentState = {
  open: boolean;
  application: Application | null;
  jobId: string;
};

const candidateStages: { key: StageKey; label: string; description: string }[] = [
  { key: "novo", label: "Novo", description: "Candidatura recebida" },
  { key: "triagem", label: "Triagem", description: "Currículo em análise" },
  { key: "teste", label: "Teste", description: "Etapa de avaliação" },
  { key: "entrevista", label: "Entrevista", description: "Conversa com o candidato" },
  { key: "aprovado", label: "Aprovado", description: "Apto para contratação" },
  { key: "reprovado", label: "Reprovado", description: "Encerrado para a vaga" },
];

function emptyJobForm(): JobForm {
  return { title: "", area: "", description: "", requirements: "", status: "aberta", public_slug: "" };
}

function emptyMoveModal(): MoveModalState {
  return {
    open: false,
    application: null,
    toStatus: "triagem",
    parecerCandidato: "",
    parecerInterno: "",
  };
}

function emptyLinkTalent(): LinkTalentState {
  return {
    open: false,
    application: null,
    jobId: "",
  };
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
  return (
    d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4") || "—"
  );
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
  try {
    return new Intl.DateTimeFormat("pt-BR").format(new Date(v));
  } catch {
    return v;
  }
}

function statusLabel(status?: string | null) {
  const found = candidateStages.find((s) => s.key === status);
  return found?.label || status || "Novo";
}

function statusTone(status?: string | null): "default" | "good" | "warn" | "bad" | "navy" {
  if (status === "aprovado" || status === "convertido") return "good";
  if (status === "reprovado") return "bad";
  if (status === "triagem" || status === "teste" || status === "entrevista") return "warn";
  if (status === "banco_talentos") return "navy";
  return "default";
}

function escapeHtml(v?: string | number | boolean | null) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeArray(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeText(v?: string | null) {
  return v && String(v).trim() ? String(v).trim() : "—";
}

function formatLanguageName(lang?: string | null, other?: string | null) {
  if (lang === "portugues") return "Português";
  if (lang === "ingles") return "Inglês";
  if (lang === "espanhol") return "Espanhol";
  if (lang === "outro") return other || "Outro";
  return lang || "—";
}

function formatLevel(level?: string | null) {
  if (level === "basico") return "Básico";
  if (level === "intermediario") return "Intermediário";
  if (level === "avancado") return "Avançado";
  return level || "—";
}

function formatEducationStatus(v?: string | null) {
  if (v === "cursando") return "Cursando";
  if (v === "completo") return "Completo";
  if (v === "incompleto") return "Incompleto";
  return v || "—";
}

function formatFormationType(v?: string | null) {
  if (v === "faculdade") return "Faculdade";
  if (v === "especializacao_mba") return "Especialização/MBA";
  return v || "—";
}

function StatusBadge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad" | "navy";
}) {
  const styles: Record<string, React.CSSProperties> = {
    default: { background: "#f1f5f9", color: "#334155" },
    good: { background: "#dcfce7", color: "#166534" },
    warn: { background: "#fef3c7", color: "#92400e" },
    bad: { background: "#fee2e2", color: "#991b1b" },
    navy: { background: C.navy, color: "#fff" },
  };

  return (
    <Badge className="rounded-full" style={styles[tone]}>
      {children}
    </Badge>
  );
}

function downloadCandidatePdf(candidate: Candidate) {
  const academic = safeArray(candidate.academic_formations);
  const courses = safeArray(candidate.courses_certifications);
  const experiences = safeArray(candidate.professional_experiences);
  const languages = safeArray(candidate.languages);

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Currículo - ${escapeHtml(candidate.nome || "Candidato")}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 32px;
      color: #1E293F;
      background: #f8fafc;
    }
    .page {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 24px;
      padding: 32px;
      border: 1px solid #e2e8f0;
    }
    .header {
      display: flex;
      gap: 20px;
      align-items: center;
      border-bottom: 4px solid #A11C27;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .photo {
      width: 112px;
      height: 112px;
      border-radius: 24px;
      object-fit: cover;
      background: #e2e8f0;
      border: 1px solid #e2e8f0;
      flex: 0 0 auto;
    }
    .photo-empty {
      width: 112px;
      height: 112px;
      border-radius: 24px;
      background: linear-gradient(135deg, #f1f5f9, #e2e8f0);
      border: 1px solid #e2e8f0;
      flex: 0 0 auto;
    }
    h1 { margin: 0; font-size: 28px; color: #1E293F; }
    h2 {
      font-size: 16px;
      margin: 26px 0 10px;
      color: #A11C27;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .muted { color: #64748b; font-size: 13px; }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 20px;
    }
    .item {
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 12px;
      margin-bottom: 10px;
      break-inside: avoid;
    }
    .label { font-size: 11px; color: #64748b; text-transform: uppercase; }
    .value { font-size: 14px; margin-top: 3px; white-space: pre-wrap; }
    .badge {
      display: inline-block;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      color: #334155;
      margin-top: 6px;
    }
    @media print {
      body { background: white; padding: 0; }
      .page { border: none; border-radius: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      ${
        candidate.foto_url
          ? `<img class="photo" src="${escapeHtml(candidate.foto_url)}" />`
          : `<div class="photo-empty"></div>`
      }
      <div>
        <h1>${escapeHtml(candidate.nome || "Candidato")}</h1>
        <div class="muted">${escapeHtml(candidate.email || "E-mail não informado")} • ${escapeHtml(maskPhone(candidate.telefone))}</div>
        <div class="muted">${escapeHtml(candidate.cidade || "—")}/${escapeHtml(candidate.uf || "—")} • CPF ${escapeHtml(maskCPF(candidate.cpf))}</div>
        <div class="badge">Área de interesse: ${escapeHtml(candidate.area_interesse || "—")}</div>
      </div>
    </div>

    <h2>Dados pessoais</h2>
    <div class="grid">
      <div><div class="label">Nascimento</div><div class="value">${escapeHtml(formatDateBR(candidate.nascimento))}</div></div>
      <div><div class="label">Telefone</div><div class="value">${escapeHtml(maskPhone(candidate.telefone))}</div></div>
      <div><div class="label">E-mail</div><div class="value">${escapeHtml(candidate.email || "—")}</div></div>
      <div><div class="label">Pretensão salarial</div><div class="value">${escapeHtml(fmtMoney(candidate.pretensao_salarial))}</div></div>
      <div><div class="label">Ensino médio</div><div class="value">${escapeHtml(formatEducationStatus(candidate.ensino_medio))}</div></div>
      <div><div class="label">PCD</div><div class="value">${candidate.pcd ? "Sim" : "Não"}</div></div>
      <div><div class="label">Tipo PCD</div><div class="value">${escapeHtml(candidate.pcd_tipo || "—")}</div></div>
      <div><div class="label">Adaptação PCD</div><div class="value">${escapeHtml(candidate.pcd_adaptacao || "—")}</div></div>
    </div>

    <h2>Endereço</h2>
    <div class="value">
      ${escapeHtml(candidate.logradouro || "—")}, ${escapeHtml(candidate.numero || "—")} -
      ${escapeHtml(candidate.bairro || "—")} - ${escapeHtml(candidate.cidade || "—")}/${escapeHtml(candidate.uf || "—")}
      - CEP ${escapeHtml(candidate.cep || "—")}
    </div>

    <h2>Formação acadêmica</h2>
    ${
      academic.length
        ? academic
            .map(
              (a) => `
      <div class="item">
        <strong>${escapeHtml(a.course || "Curso")}</strong>
        <div class="muted">${escapeHtml(a.institution || "Instituição não informada")}</div>
        <div class="muted">${escapeHtml(formatFormationType(a.type))} • ${a.in_progress ? "Cursando" : "Concluído"}</div>
        <div class="muted">${escapeHtml(a.start_date || "—")} até ${a.in_progress ? "atual" : escapeHtml(a.end_date || "—")}</div>
      </div>`
            )
            .join("")
        : `<div class="muted">Nenhuma formação informada.</div>`
    }

    <h2>Cursos e certificações</h2>
    ${
      courses.length
        ? courses
            .map(
              (c) => `
      <div class="item">
        <strong>${escapeHtml(c.name || "Curso/Certificação")}</strong>
        <div class="muted">${escapeHtml(c.type || "—")} • ${escapeHtml(c.conclusion_year || "Ano não informado")}</div>
        <div class="value">${escapeHtml(c.description || "")}</div>
      </div>`
            )
            .join("")
        : `<div class="muted">Nenhum curso ou certificação informado.</div>`
    }

    <h2>Experiências profissionais</h2>
    ${
      experiences.length
        ? experiences
            .map(
              (e) => `
      <div class="item">
        <strong>${escapeHtml(e.role || "Cargo")}</strong>
        <div class="muted">${escapeHtml(e.company || "Empresa não informada")}</div>
        <div class="muted">${escapeHtml(e.start_month || "—")} até ${e.current ? "atual" : escapeHtml(e.end_month || "—")}</div>
        <div class="value">${escapeHtml(e.activities || "")}</div>
      </div>`
            )
            .join("")
        : `<div class="muted">Nenhuma experiência informada.</div>`
    }

    <h2>Idiomas</h2>
    ${
      languages.length
        ? languages
            .map(
              (l) => `
      <div class="item">
        <strong>${escapeHtml(formatLanguageName(l.language, l.other_language))}</strong>
        <div class="muted">${escapeHtml(formatLevel(l.level))}</div>
      </div>`
            )
            .join("")
        : `<div class="muted">Nenhum idioma informado.</div>`
    }

    <h2>Informações adicionais</h2>
    <div class="value">${escapeHtml(candidate.additional_info || "—")}</div>

    <h2>Redes</h2>
    <div class="grid">
      <div><div class="label">LinkedIn</div><div class="value">${escapeHtml(candidate.linkedin || "—")}</div></div>
      <div><div class="label">Instagram</div><div class="value">${escapeHtml(candidate.instagram || "—")}</div></div>
    </div>
  </div>

  <script>
    window.onload = function() {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>
  `;

  const win = window.open("", "_blank");
  if (!win) return alert("Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.");

  win.document.open();
  win.document.write(html);
  win.document.close();
}

export default function RHVagas() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [jobForm, setJobForm] = useState<JobForm>(emptyJobForm());
  const [selectedJobId, setSelectedJobId] = useState<string>("all");

  const [moveModal, setMoveModal] = useState<MoveModalState>(emptyMoveModal());
  const [linkTalent, setLinkTalent] = useState<LinkTalentState>(emptyLinkTalent());

  const candidateMap = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const jobMap = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const filteredApplications = useMemo(() => {
    const base = applications.filter((a) => !a.banco_talentos);

    if (selectedJobId === "all") return base;
    return base.filter((a) => a.job_id === selectedJobId);
  }, [applications, selectedJobId]);

  const talentApplications = useMemo(() => {
    return applications.filter((a) => a.banco_talentos);
  }, [applications]);

  const kanbanGroups = useMemo(() => {
    const groups = new Map<StageKey, Application[]>();

    candidateStages.forEach((stage) => groups.set(stage.key, []));

    filteredApplications.forEach((app) => {
      const status = normalizeStage(app.status);
      groups.set(status, [...(groups.get(status) || []), app]);
    });

    return groups;
  }, [filteredApplications]);

  async function load() {
    setLoading(true);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;

      setAuthUserId(uid || null);

      if (!uid) return;

      const { data: profile } = await supabase
        .from("users")
        .select("id, role, user_role")
        .eq("auth_user_id", uid)
        .maybeSingle();

      const admin = profile?.role === "admin" || profile?.user_role === "admin";
      setIsAdmin(admin);

      const [
        { data: jobsData, error: jobsError },
        { data: candData, error: candError },
        { data: appData, error: appError },
      ] = await Promise.all([
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

  useEffect(() => {
    load();
  }, []);

  function normalizeStage(status?: string | null): StageKey {
    const s = (status || "novo") as StageKey;
    return candidateStages.some((stage) => stage.key === s) ? s : "novo";
  }

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

  function openMoveModal(application: Application, toStatus?: StageKey) {
    const current = normalizeStage(application.status);
    const fallbackNext = nextStage(current) || current;

    setMoveModal({
      open: true,
      application,
      toStatus: toStatus || fallbackNext,
      parecerCandidato: "",
      parecerInterno: "",
    });
  }

  async function notifyCandidateApplicationUpdate(applicationId: string, historyId?: string | null) {
    try {
      const { error } = await supabase.functions.invoke("send-candidate-update-email", {
        body: {
          application_id: applicationId,
          history_id: historyId || null,
        },
      });

      if (error) {
        console.warn("[RHVagas] E-mail de atualização não enviado:", error.message);
      }
    } catch (err: any) {
      console.warn("[RHVagas] Falha ao chamar função de e-mail:", err?.message || err);
    }
  }

  async function confirmMoveApplication() {
    if (!isAdmin) return;
    if (!moveModal.application) return;

    const application = moveModal.application;
    const fromStatus = normalizeStage(application.status);
    const toStatus = moveModal.toStatus;
    const parecerCandidato = moveModal.parecerCandidato.trim();
    const parecerInterno = moveModal.parecerInterno.trim();

    if (!parecerCandidato) {
      return alert("Informe o parecer que será registrado para o candidato.");
    }

    setSaving(true);

    try {
      const { error: appError } = await supabase
        .from("hr_applications")
        .update({
          status: toStatus,
          parecer_candidato: parecerCandidato,
          parecer_interno: toStatus === "reprovado" ? parecerInterno || null : null,
          moved_at: new Date().toISOString(),
          moved_by: authUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", application.id);

      if (appError) throw appError;

      const { error: candError } = await supabase
        .from("hr_candidates")
        .update({
          status: toStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", application.candidate_id);

      if (candError) throw candError;

      const { data: historyData, error: historyError } = await supabase
        .from("hr_application_history")
        .insert({
          application_id: application.id,
          candidate_id: application.candidate_id,
          job_id: application.job_id,
          from_status: fromStatus,
          to_status: toStatus,
          parecer_candidato: parecerCandidato,
          parecer_interno: toStatus === "reprovado" ? parecerInterno || null : null,
          moved_by: authUserId,
        })
        .select("id")
        .maybeSingle();

      if (historyError) {
        console.warn("[RHVagas] Não foi possível registrar histórico:", historyError.message);
      }

      await notifyCandidateApplicationUpdate(application.id, historyData?.id || null);

      setMoveModal(emptyMoveModal());
      await load();
    } catch (err: any) {
      alert(err?.message || "Erro ao atualizar etapa.");
    } finally {
      setSaving(false);
    }
  }

  async function sendToTalentBank(application: Application) {
    if (!isAdmin) return;
    const candidate = candidateMap.get(application.candidate_id);

    if (!candidate) return alert("Candidato não encontrado.");

    const ok = window.confirm(
      `Enviar ${candidate.nome || "este candidato"} para o Banco de Talentos? Ele poderá ser vinculado a outra vaga futuramente.`
    );

    if (!ok) return;

    setSaving(true);

    try {
      const { error: appError } = await supabase
        .from("hr_applications")
        .update({
          banco_talentos: true,
          moved_at: new Date().toISOString(),
          moved_by: authUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", application.id);

      if (appError) throw appError;

      const { error: candError } = await supabase
        .from("hr_candidates")
        .update({
          status: "banco_talentos",
          updated_at: new Date().toISOString(),
        })
        .eq("id", application.candidate_id);

      if (candError) throw candError;

      const { data: historyData, error: historyError } = await supabase
        .from("hr_application_history")
        .insert({
          application_id: application.id,
          candidate_id: application.candidate_id,
          job_id: application.job_id,
          from_status: application.status || "novo",
          to_status: "banco_talentos",
          parecer_candidato: "Candidato direcionado para o Banco de Talentos da Consulmax.",
          parecer_interno: "Movimentação para Banco de Talentos realizada pelo RH.",
          moved_by: authUserId,
        })
        .select("id")
        .maybeSingle();

      if (historyError) {
        console.warn("[RHVagas] Não foi possível registrar histórico:", historyError.message);
      }

      await notifyCandidateApplicationUpdate(application.id, historyData?.id || null);

      await load();
    } catch (err: any) {
      alert(err?.message || "Erro ao enviar para o Banco de Talentos.");
    } finally {
      setSaving(false);
    }
  }

  async function linkTalentToJob() {
    if (!isAdmin) return;
    if (!linkTalent.application) return;
    if (!linkTalent.jobId) return alert("Selecione uma vaga para vincular o candidato.");

    const sourceApplication = linkTalent.application;
    const candidate = candidateMap.get(sourceApplication.candidate_id);
    const job = jobMap.get(linkTalent.jobId);

    if (!candidate) return alert("Candidato não encontrado.");
    if (!job) return alert("Vaga não encontrada.");

    setSaving(true);

    try {
      const { data: linkedApplication, error } = await supabase
        .from("hr_applications")
        .upsert(
          {
            job_id: linkTalent.jobId,
            candidate_id: sourceApplication.candidate_id,
            status: "novo",
            notes: sourceApplication.notes || "Candidato vinculado a partir do Banco de Talentos.",
            banco_talentos: false,
            parecer_candidato: `Você foi vinculado(a) à vaga ${job.title} a partir do Banco de Talentos da Consulmax.`,
            parecer_interno: "Candidato vinculado a partir do Banco de Talentos.",
            moved_at: new Date().toISOString(),
            moved_by: authUserId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "job_id,candidate_id" }
        )
        .select("id")
        .maybeSingle();

      if (error) throw error;

      const { error: candError } = await supabase
        .from("hr_candidates")
        .update({
          status: "novo",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sourceApplication.candidate_id);

      if (candError) throw candError;

      if (linkedApplication?.id) {
        const { data: historyData, error: historyError } = await supabase
          .from("hr_application_history")
          .insert({
            application_id: linkedApplication.id,
            candidate_id: sourceApplication.candidate_id,
            job_id: linkTalent.jobId,
            from_status: "banco_talentos",
            to_status: "novo",
            parecer_candidato: `Você foi vinculado(a) à vaga ${job.title} a partir do Banco de Talentos da Consulmax.`,
            parecer_interno: "Candidato vinculado a partir do Banco de Talentos.",
            moved_by: authUserId,
          })
          .select("id")
          .maybeSingle();

        if (historyError) {
          console.warn("[RHVagas] Não foi possível registrar histórico:", historyError.message);
        }

        await notifyCandidateApplicationUpdate(linkedApplication.id, historyData?.id || null);
      }

      setLinkTalent(emptyLinkTalent());
      await load();

      alert(`${candidate.nome || "Candidato"} vinculado à vaga ${job.title}.`);
    } catch (err: any) {
      alert(err?.message || "Erro ao vincular candidato à vaga.");
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

      await supabase
        .from("hr_candidates")
        .update({ status: "convertido", updated_at: new Date().toISOString() })
        .eq("id", candidate.id);

      await load();
      alert("Candidato convertido em colaborador. Complete contrato, salário e escala na guia RH.");
    } catch (err: any) {
      alert(err?.message || "Erro ao converter candidato.");
    } finally {
      setSaving(false);
    }
  }

  function nextStage(stage: StageKey): StageKey | null {
    const idx = candidateStages.findIndex((s) => s.key === stage);
    if (idx < 0 || idx >= candidateStages.length - 1) return null;
    return candidateStages[idx + 1].key;
  }

  function previousStage(stage: StageKey): StageKey | null {
    const idx = candidateStages.findIndex((s) => s.key === stage);
    if (idx <= 0) return null;
    return candidateStages[idx - 1].key;
  }

  const openJobs = jobs.filter((j) => j.status === "aberta").length;
  const newCandidates = candidates.filter((c) => (c.status || "novo") === "novo").length;
  const approvedCandidates = candidates.filter((c) => (c.status || "") === "aprovado").length;
  const talentCount = talentApplications.length;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 space-y-5">
      <div
        className="rounded-3xl p-5 md:p-6 text-white shadow-xl"
        style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})` }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">RH • Vagas</h1>
            <p className="text-white/80 mt-1">
              Cadastre vagas, acompanhe candidaturas em Kanban, registre pareceres e gerencie o Banco de Talentos.
            </p>
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

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Kpi icon={Briefcase} label="Vagas abertas" value={openJobs} />
        <Kpi icon={Users} label="Candidatos" value={candidates.length} />
        <Kpi icon={UserPlus} label="Novos" value={newCandidates} />
        <Kpi icon={CheckCircle2} label="Aprovados" value={approvedCandidates} />
        <Kpi icon={Archive} label="Banco de talentos" value={talentCount} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle>{jobForm.id ? "Editar vaga" : "Nova vaga"}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            {!isAdmin && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Somente admin pode gerenciar vagas.
              </div>
            )}

            <Field label="Título da vaga">
              <Input
                value={jobForm.title}
                onChange={(e) =>
                  setJobForm({
                    ...jobForm,
                    title: e.target.value,
                    public_slug: jobForm.public_slug || slugify(e.target.value),
                  })
                }
                disabled={!isAdmin}
              />
            </Field>

            <Field label="Área">
              <Input
                value={jobForm.area}
                onChange={(e) => setJobForm({ ...jobForm, area: e.target.value })}
                disabled={!isAdmin}
                placeholder="Administrativo, Comercial, Atendimento..."
              />
            </Field>

            <Field label="Descrição">
              <Textarea
                value={jobForm.description}
                onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                disabled={!isAdmin}
              />
            </Field>

            <Field label="Requisitos">
              <Textarea
                value={jobForm.requirements}
                onChange={(e) => setJobForm({ ...jobForm, requirements: e.target.value })}
                disabled={!isAdmin}
              />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Status">
                <Select
                  value={jobForm.status}
                  onValueChange={(v) => setJobForm({ ...jobForm, status: v })}
                  disabled={!isAdmin}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberta">Aberta</SelectItem>
                    <SelectItem value="pausada">Pausada</SelectItem>
                    <SelectItem value="fechada">Fechada</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Slug público">
                <Input
                  value={jobForm.public_slug}
                  onChange={(e) => setJobForm({ ...jobForm, public_slug: slugify(e.target.value) })}
                  disabled={!isAdmin}
                />
              </Field>
            </div>

            <div className="flex gap-2">
              <Button onClick={saveJob} disabled={!isAdmin || saving} className="text-white" style={{ background: C.ruby }}>
                <Save className="h-4 w-4 mr-2" />
                Salvar vaga
              </Button>

              <Button variant="outline" onClick={() => setJobForm(emptyJobForm())}>
                Limpar
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-3xl">
            <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <CardTitle>Vagas cadastradas</CardTitle>
                <p className="text-sm text-slate-500 mt-1">
                  Apenas vagas com status aberta aparecem no /trabalhe-conosco.
                </p>
              </div>
            </CardHeader>

            <CardContent>
              {loading ? (
                <Loading />
              ) : jobs.length === 0 ? (
                <Empty text="Nenhuma vaga cadastrada." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {jobs.map((job) => (
                    <div key={job.id} className="rounded-2xl border bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold" style={{ color: C.navy }}>
                            {job.title}
                          </div>
                          <div className="text-sm text-slate-500">{job.area || "Área não informada"}</div>
                        </div>

                        <StatusBadge tone={job.status === "aberta" ? "good" : job.status === "pausada" ? "warn" : "bad"}>
                          {job.status}
                        </StatusBadge>
                      </div>

                      {job.description && <p className="text-sm text-slate-600 mt-3 line-clamp-3">{job.description}</p>}

                      <div className="flex flex-wrap gap-2 mt-4">
                        <Button size="sm" variant="outline" onClick={() => editJob(job)}>
                          Editar
                        </Button>

                        <Button size="sm" variant="outline" onClick={() => setSelectedJobId(job.id)}>
                          Ver candidaturas ({applications.filter((a) => a.job_id === job.id && !a.banco_talentos).length})
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
                <CardTitle>Candidaturas • Kanban</CardTitle>
                <p className="text-sm text-slate-500 mt-1">
                  Movimente o candidato entre etapas, baixe o currículo e registre o parecer do processo seletivo.
                </p>
              </div>

              <div className="w-full md:w-72">
                <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as vagas</SelectItem>
                    {jobs.map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent>
              {loading ? (
                <Loading />
              ) : filteredApplications.length === 0 ? (
                <Empty text="Nenhuma candidatura encontrada." />
              ) : (
                <div className="overflow-x-auto pb-2">
                  <div className="grid min-w-[1180px] grid-cols-6 gap-3">
                    {candidateStages.map((stage) => {
                      const items = kanbanGroups.get(stage.key) || [];

                      return (
                        <div key={stage.key} className="rounded-3xl border bg-slate-100/70 p-3">
                          <div className="mb-3 flex items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold" style={{ color: C.navy }}>
                                {stage.label}
                              </div>
                              <div className="text-xs text-slate-500">{stage.description}</div>
                            </div>

                            <Badge className="rounded-full bg-white text-slate-700">{items.length}</Badge>
                          </div>

                          <div className="space-y-3">
                            {items.length === 0 ? (
                              <div className="rounded-2xl border border-dashed bg-white/60 p-4 text-center text-xs text-slate-400">
                                Sem candidatos
                              </div>
                            ) : (
                              items.map((app) => {
                                const candidate = candidateMap.get(app.candidate_id);
                                const job = jobMap.get(app.job_id);
                                const currentStatus = normalizeStage(app.status);
                                const next = nextStage(currentStatus);
                                const previous = previousStage(currentStatus);

                                return (
                                  <CandidateKanbanCard
                                    key={app.id}
                                    app={app}
                                    candidate={candidate}
                                    job={job}
                                    currentStatus={currentStatus}
                                    previous={previous}
                                    next={next}
                                    isAdmin={isAdmin}
                                    saving={saving}
                                    onMove={(to) => openMoveModal(app, to)}
                                    onTalentBank={() => sendToTalentBank(app)}
                                    onConvert={() => candidate && convertCandidate(candidate)}
                                    onDownloadPdf={() => candidate && downloadCandidatePdf(candidate)}
                                  />
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Archive className="h-5 w-5" style={{ color: C.ruby }} />
                Banco de Talentos
              </CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                Candidatos preservados para futuras oportunidades. Vincule a uma vaga quando fizer sentido.
              </p>
            </CardHeader>

            <CardContent>
              {loading ? (
                <Loading />
              ) : talentApplications.length === 0 ? (
                <Empty text="Nenhum candidato no Banco de Talentos." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {talentApplications.map((app) => {
                    const candidate = candidateMap.get(app.candidate_id);
                    const originalJob = jobMap.get(app.job_id);

                    return (
                      <div key={app.id} className="rounded-2xl border bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold" style={{ color: C.navy }}>
                              {candidate?.nome || "Candidato"}
                            </div>
                            <div className="text-xs text-slate-500">
                              Origem: {originalJob?.title || "Vaga não localizada"}
                            </div>
                          </div>

                          <StatusBadge tone="navy">Banco</StatusBadge>
                        </div>

                        <div className="mt-3 space-y-1 text-xs text-slate-600">
                          <div>{candidate?.email || "E-mail não informado"}</div>
                          <div>{maskPhone(candidate?.telefone)}</div>
                          <div>
                            {candidate?.cidade || "—"}/{candidate?.uf || "—"}
                          </div>
                          <div>Área: {candidate?.area_interesse || "—"}</div>
                          <div>Pretensão: {fmtMoney(candidate?.pretensao_salarial)}</div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!candidate}
                            onClick={() => candidate && downloadCandidatePdf(candidate)}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Currículo
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!isAdmin || saving}
                            onClick={() =>
                              setLinkTalent({
                                open: true,
                                application: app,
                                jobId: "",
                              })
                            }
                          >
                            <Send className="h-4 w-4 mr-2" />
                            Vincular à vaga
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {moveModal.open && (
        <MoveApplicationModal
          state={moveModal}
          candidate={moveModal.application ? candidateMap.get(moveModal.application.candidate_id) : undefined}
          job={moveModal.application ? jobMap.get(moveModal.application.job_id) : undefined}
          saving={saving}
          onClose={() => setMoveModal(emptyMoveModal())}
          onChange={setMoveModal}
          onConfirm={confirmMoveApplication}
        />
      )}

      {linkTalent.open && (
        <LinkTalentModal
          state={linkTalent}
          jobs={jobs.filter((j) => j.status === "aberta")}
          candidate={linkTalent.application ? candidateMap.get(linkTalent.application.candidate_id) : undefined}
          saving={saving}
          onClose={() => setLinkTalent(emptyLinkTalent())}
          onChange={setLinkTalent}
          onConfirm={linkTalentToJob}
        />
      )}
    </div>
  );
}

function CandidateKanbanCard({
  app,
  candidate,
  job,
  currentStatus,
  previous,
  next,
  isAdmin,
  saving,
  onMove,
  onTalentBank,
  onConvert,
  onDownloadPdf,
}: {
  app: Application;
  candidate?: Candidate;
  job?: Job;
  currentStatus: StageKey;
  previous: StageKey | null;
  next: StageKey | null;
  isAdmin: boolean;
  saving: boolean;
  onMove: (to: StageKey) => void;
  onTalentBank: () => void;
  onConvert: () => void;
  onDownloadPdf: () => void;
}) {
  return (
    <div className="rounded-2xl border bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold leading-tight" style={{ color: C.navy }}>
            {candidate?.nome || "Candidato"}
          </div>
          <div className="mt-1 text-xs text-slate-500">{job?.title || "Vaga não localizada"}</div>
        </div>

        <StatusBadge tone={statusTone(currentStatus)}>{statusLabel(currentStatus)}</StatusBadge>
      </div>

      <div className="mt-3 space-y-1 text-xs text-slate-600">
        <div>{candidate?.email || "E-mail não informado"}</div>
        <div>{maskPhone(candidate?.telefone)}</div>
        <div>
          {candidate?.cidade || "—"}/{candidate?.uf || "—"}
        </div>
        <div>CPF: {maskCPF(candidate?.cpf)}</div>
        <div>Pretensão: {fmtMoney(candidate?.pretensao_salarial)}</div>
        <div>Enviado em: {formatDateBR(app.created_at)}</div>
      </div>

      {app.parecer_candidato && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          <div className="mb-1 flex items-center gap-1 font-semibold">
            <MessageSquare className="h-3 w-3" />
            Último parecer
          </div>
          <div className="line-clamp-3">{app.parecer_candidato}</div>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <Button size="sm" variant="outline" disabled={!candidate} onClick={onDownloadPdf}>
          <Download className="h-4 w-4 mr-2" />
          Baixar currículo
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!isAdmin || saving || !previous}
            onClick={() => previous && onMove(previous)}
          >
            Voltar
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={!isAdmin || saving || !next}
            onClick={() => next && onMove(next)}
          >
            Avançar
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        <Select value={currentStatus} onValueChange={(v) => onMove(v as StageKey)} disabled={!isAdmin || saving}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {candidateStages.map((stage) => (
              <SelectItem key={stage.key} value={stage.key}>
                Mover para {stage.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" variant="outline" disabled={!isAdmin || saving} onClick={onTalentBank}>
          <Archive className="h-4 w-4 mr-2" />
          Banco de talentos
        </Button>

        {currentStatus === "aprovado" && (
          <Button size="sm" className="text-white" style={{ background: C.ruby }} disabled={saving} onClick={onConvert}>
            Converter em colaborador
          </Button>
        )}
      </div>
    </div>
  );
}

function MoveApplicationModal({
  state,
  candidate,
  job,
  saving,
  onClose,
  onChange,
  onConfirm,
}: {
  state: MoveModalState;
  candidate?: Candidate;
  job?: Job;
  saving: boolean;
  onClose: () => void;
  onChange: (s: MoveModalState) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
        <div
          className="flex items-start justify-between gap-3 rounded-t-3xl p-5 text-white"
          style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})` }}
        >
          <div>
            <div className="text-xl font-bold">Movimentar candidato</div>
            <div className="text-sm text-white/80">
              {candidate?.nome || "Candidato"} • {job?.title || "Vaga"}
            </div>
          </div>

          <button onClick={onClose} className="rounded-full bg-white/15 p-2 hover:bg-white/25">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <Field label="Nova etapa">
            <Select
              value={state.toStatus}
              onValueChange={(v) => onChange({ ...state, toStatus: v as StageKey })}
              disabled={saving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {candidateStages.map((stage) => (
                  <SelectItem key={stage.key} value={stage.key}>
                    {stage.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Parecer para o candidato">
            <Textarea
              value={state.parecerCandidato}
              onChange={(e) => onChange({ ...state, parecerCandidato: e.target.value })}
              disabled={saving}
              placeholder="Ex.: Seu currículo foi analisado e você avançou para a próxima etapa do processo seletivo."
              className="min-h-28"
            />
          </Field>

          {state.toStatus === "reprovado" && (
            <Field label="Parecer interno, opcional">
              <Textarea
                value={state.parecerInterno}
                onChange={(e) => onChange({ ...state, parecerInterno: e.target.value })}
                disabled={saving}
                placeholder="Registro interno para o RH. Ex.: perfil não aderente à vaga atual, mas pode ser considerado para oportunidades comerciais futuras."
                className="min-h-24"
              />
            </Field>
          )}

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            O parecer para o candidato ficará salvo na candidatura, aparecerá na Área do Candidato e será enviado por e-mail.
          </div>

          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>

            <Button onClick={onConfirm} disabled={saving} className="text-white" style={{ background: C.ruby }}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Confirmar movimentação
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkTalentModal({
  state,
  jobs,
  candidate,
  saving,
  onClose,
  onChange,
  onConfirm,
}: {
  state: LinkTalentState;
  jobs: Job[];
  candidate?: Candidate;
  saving: boolean;
  onClose: () => void;
  onChange: (s: LinkTalentState) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white shadow-2xl">
        <div
          className="flex items-start justify-between gap-3 rounded-t-3xl p-5 text-white"
          style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})` }}
        >
          <div>
            <div className="text-xl font-bold">Vincular candidato à vaga</div>
            <div className="text-sm text-white/80">{candidate?.nome || "Candidato"} • Banco de Talentos</div>
          </div>

          <button onClick={onClose} className="rounded-full bg-white/15 p-2 hover:bg-white/25">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <Field label="Selecione a vaga">
            <Select value={state.jobId} onValueChange={(v) => onChange({ ...state, jobId: v })} disabled={saving}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha uma vaga aberta" />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {jobs.length === 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Não há vagas abertas disponíveis para vincular.
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>

            <Button onClick={onConfirm} disabled={saving || jobs.length === 0} className="text-white" style={{ background: C.ruby }}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Vincular à vaga
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5" style={{ color: C.ruby }} />
          <div>
            <div className="text-sm text-slate-500">{label}</div>
            <div className="text-2xl font-bold">{value}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Loading() {
  return (
    <div className="py-12 flex justify-center">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-12 text-center text-slate-500">{text}</div>;
}
