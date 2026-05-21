// src/pages/PublicAreaCandidato.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileText,
  GraduationCap,
  Languages as LanguagesIcon,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Plus,
  Save,
  Send,
  Trash2,
  UserRound,
} from "lucide-react";

const C = { ruby: "#A11C27", navy: "#1E293F", gold: "#B5A573" };

type Mode = "login" | "signup" | "reset";
type PortalTab = "curriculo" | "vagas" | "candidaturas";

type AcademicFormation = {
  id: string;
  type: "faculdade" | "especializacao_mba";
  course: string;
  institution: string;
  start_date: string;
  end_date: string;
  in_progress: boolean;
};

type CourseCertification = {
  id: string;
  type: "curso" | "certificacao";
  name: string;
  description: string;
  conclusion_year: string;
};

type ProfessionalExperience = {
  id: string;
  company: string;
  role: string;
  activities: string;
  start_month: string;
  end_month: string;
  current: boolean;
};

type CandidateLanguage = {
  id: string;
  language: "portugues" | "ingles" | "espanhol" | "outro";
  other_language: string;
  level: "basico" | "intermediario" | "avancado";
};

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

  nascimento: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  foto_url: string | null;

  pcd: boolean | null;
  pcd_tipo: string | null;
  pcd_adaptacao: string | null;

  ensino_medio: string | null;
  academic_formations: AcademicFormation[] | null;
  courses_certifications: CourseCertification[] | null;
  professional_experiences: ProfessionalExperience[] | null;
  languages: CandidateLanguage[] | null;

  additional_info: string | null;
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
  foto_url: string;
  nome: string;
  email: string;
  nascimento: string;
  idade: string;
  cpf: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  telefone: string;

  pcd: "sim" | "nao";
  pcd_tipo: string;
  pcd_adaptacao: string;

  ensino_medio: "cursando" | "completo" | "incompleto" | "";

  academic_formations: AcademicFormation[];
  courses_certifications: CourseCertification[];
  professional_experiences: ProfessionalExperience[];
  languages: CandidateLanguage[];

  area_interesse: string;
  pretensao_salarial: string;
  linkedin: string;
  instagram: string;
  additional_info: string;
};

const initialForm: CandidateForm = {
  foto_url: "",
  nome: "",
  email: "",
  nascimento: "",
  idade: "",
  cpf: "",
  cep: "",
  logradouro: "",
  numero: "",
  bairro: "",
  cidade: "",
  uf: "RO",
  telefone: "",

  pcd: "nao",
  pcd_tipo: "",
  pcd_adaptacao: "",

  ensino_medio: "",

  academic_formations: [],
  courses_certifications: [],
  professional_experiences: [],
  languages: [],

  area_interesse: "",
  pretensao_salarial: "",
  linkedin: "",
  instagram: "",
  additional_info: "",
};

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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

function maskCEP(v: string) {
  const d = onlyDigits(v).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, "$1-$2");
}

function maskMonthYear(v: string) {
  const d = onlyDigits(v).slice(0, 6);
  return d.replace(/^(\d{2})(\d)/, "$1/$2");
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

function calculateAge(dateISO: string) {
  if (!dateISO) return "";
  const birth = new Date(`${dateISO}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "";

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? String(age) : "";
}

function parseJsonArray<T>(value: any): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function statusTone(status?: string | null): "default" | "good" | "warn" | "bad" | "navy" {
  if (status === "aprovado" || status === "convertido") return "good";
  if (status === "reprovado") return "bad";
  if (status === "entrevista" || status === "teste" || status === "triagem") return "warn";
  return "navy";
}

function emptyAcademicFormation(): AcademicFormation {
  return {
    id: createId(),
    type: "faculdade",
    course: "",
    institution: "",
    start_date: "",
    end_date: "",
    in_progress: false,
  };
}

function emptyCourseCertification(): CourseCertification {
  return {
    id: createId(),
    type: "curso",
    name: "",
    description: "",
    conclusion_year: "",
  };
}

function emptyProfessionalExperience(): ProfessionalExperience {
  return {
    id: createId(),
    company: "",
    role: "",
    activities: "",
    start_month: "",
    end_month: "",
    current: false,
  };
}

function emptyLanguage(language: CandidateLanguage["language"] = "portugues"): CandidateLanguage {
  return {
    id: createId(),
    language,
    other_language: "",
    level: "basico",
  };
}

export default function PublicAreaCandidato() {
  const [params, setParams] = useSearchParams();
  const requestedJobId = params.get("job") || "";

  const [mode, setMode] = useState<Mode>("login");
  const [portalTab, setPortalTab] = useState<PortalTab>(requestedJobId ? "vagas" : "curriculo");

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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState("");

  const jobMap = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const openJobs = useMemo(() => jobs.filter((j) => j.status === "aberta"), [jobs]);
  const appliedJobIds = useMemo(() => new Set(applications.map((a) => a.job_id)), [applications]);

  const hasCurriculum = useMemo(() => {
    return (
      !!candidate?.id &&
      !!form.nome.trim() &&
      !!form.nascimento &&
      onlyDigits(form.cpf).length === 11 &&
      onlyDigits(form.cep).length === 8 &&
      !!form.logradouro.trim() &&
      !!form.numero.trim() &&
      !!form.bairro.trim() &&
      !!form.cidade.trim() &&
      !!form.uf.trim() &&
      onlyDigits(form.telefone).length >= 10 &&
      (form.pcd === "nao" || !!form.pcd_tipo.trim())
    );
  }, [candidate?.id, form]);

  async function loadJobs() {
    const { data, error } = await supabase
      .from("hr_jobs")
      .select("id, title, area, description, requirements, status")
      .order("created_at", { ascending: false });

    if (error) throw error;
    setJobs((data || []) as Job[]);
  }

  function fillForm(c: Candidate | null, emailFallback = "") {
    setForm({
      foto_url: c?.foto_url || "",
      nome: c?.nome || "",
      email: c?.email || emailFallback || "",
      nascimento: c?.nascimento || "",
      idade: calculateAge(c?.nascimento || ""),
      cpf: maskCPF(c?.cpf || ""),
      cep: maskCEP(c?.cep || ""),
      logradouro: c?.logradouro || "",
      numero: c?.numero || "",
      bairro: c?.bairro || "",
      cidade: c?.cidade || "",
      uf: c?.uf || "RO",
      telefone: maskPhone(c?.telefone || ""),

      pcd: c?.pcd ? "sim" : "nao",
      pcd_tipo: c?.pcd_tipo || "",
      pcd_adaptacao: c?.pcd_adaptacao || "",

      ensino_medio: (c?.ensino_medio as CandidateForm["ensino_medio"]) || "",

      academic_formations: parseJsonArray<AcademicFormation>(c?.academic_formations),
      courses_certifications: parseJsonArray<CourseCertification>(c?.courses_certifications),
      professional_experiences: parseJsonArray<ProfessionalExperience>(c?.professional_experiences),
      languages: parseJsonArray<CandidateLanguage>(c?.languages),

      area_interesse: c?.area_interesse || "",
      pretensao_salarial: numberToMoneyInput(c?.pretensao_salarial),
      linkedin: c?.linkedin || "",
      instagram: c?.instagram || "",
      additional_info: c?.additional_info || "",
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
      const { data: appData, error: appError } = await supabase
        .from("hr_applications")
        .select("*")
        .eq("candidate_id", c.id)
        .order("created_at", { ascending: false });

      if (appError) throw appError;
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
      else fillForm(null);
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

      if (user?.id) {
        loadCandidate(user.id, user.email || "");
        setPortalTab(requestedJobId ? "vagas" : "curriculo");
      } else {
        setCandidate(null);
        setApplications([]);
        fillForm(null);
      }
    });

    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (requestedJobId) {
      setSelectedJobId(requestedJobId);
      setPortalTab("vagas");
    }
  }, [requestedJobId]);

  useEffect(() => {
    setForm((old) => ({ ...old, idade: calculateAge(old.nascimento) }));
  }, [form.nascimento]);

  useEffect(() => {
    const cepDigits = onlyDigits(form.cep);
    if (cepDigits.length !== 8) return;

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
        const data = await res.json();

        if (data?.erro) return;

        setForm((old) => ({
          ...old,
          logradouro: data?.logradouro || old.logradouro,
          bairro: data?.bairro || old.bairro,
          cidade: data?.localidade || old.cidade,
          uf: data?.uf || old.uf,
        }));
      } catch {
        // Mantém preenchimento manual em caso de falha.
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [form.cep]);

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
    setPortalTab("curriculo");
  }

  function validateCandidateForm(showAlert = true) {
    const cpfDigits = onlyDigits(form.cpf);
    const cepDigits = onlyDigits(form.cep);
    const phoneDigits = onlyDigits(form.telefone);

    const fail = (msg: string) => {
      if (showAlert) alert(msg);
      return false;
    };

    if (!form.nome.trim()) return fail("Informe seu nome completo.");
    if (!form.nascimento) return fail("Informe sua data de nascimento.");
    if (cpfDigits.length !== 11) return fail("Informe um CPF válido com 11 dígitos.");
    if (cepDigits.length !== 8) return fail("Informe um CEP válido com 8 dígitos.");
    if (!form.logradouro.trim()) return fail("Informe o logradouro.");
    if (!form.numero.trim()) return fail("Informe o número.");
    if (!form.bairro.trim()) return fail("Informe o bairro.");
    if (!form.cidade.trim()) return fail("Informe a cidade.");
    if (!form.uf.trim()) return fail("Informe a UF.");
    if (phoneDigits.length < 10) return fail("Informe um telefone válido.");
    if (form.pcd === "sim" && !form.pcd_tipo.trim()) return fail("Informe o tipo de deficiência/necessidade.");

    return true;
  }

  async function uploadCandidatePhoto(file: File) {
    if (!userId) return alert("Faça login para enviar sua foto.");

    setUploadingPhoto(true);

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/${Date.now()}.${ext}`;

      const { error } = await supabase.storage.from("candidate_photos").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
      });

      if (error) throw error;

      const { data } = supabase.storage.from("candidate_photos").getPublicUrl(path);
      const publicUrl = data.publicUrl;

      setForm((old) => ({ ...old, foto_url: publicUrl }));
      setMessage("Foto carregada com sucesso. Clique em Salvar currículo para gravar.");
    } catch (err: any) {
      alert(err?.message || "Erro ao enviar foto. Verifique se o bucket candidate_photos existe no Supabase Storage.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function saveCandidate(): Promise<string | null> {
    if (!userId) {
      alert("Faça login para salvar seu currículo.");
      return null;
    }

    if (!validateCandidateForm(true)) return null;

    setSaving(true);

    try {
      const payload = {
        auth_user_id: userId,
        nome: form.nome.trim(),
        email: (form.email || authEmail).trim().toLowerCase(),
        telefone: onlyDigits(form.telefone),
        cpf: onlyDigits(form.cpf),

        nascimento: form.nascimento || null,
        cep: onlyDigits(form.cep),
        logradouro: form.logradouro.trim(),
        numero: form.numero.trim(),
        bairro: form.bairro.trim(),
        cidade: form.cidade.trim(),
        uf: form.uf.trim().toUpperCase(),
        foto_url: form.foto_url || null,

        pcd: form.pcd === "sim",
        pcd_tipo: form.pcd === "sim" ? form.pcd_tipo.trim() : null,
        pcd_adaptacao: form.pcd === "sim" ? form.pcd_adaptacao.trim() || null : null,

        ensino_medio: form.ensino_medio || null,
        academic_formations: form.academic_formations,
        courses_certifications: form.courses_certifications,
        professional_experiences: form.professional_experiences,
        languages: form.languages,

        area_interesse: form.area_interesse.trim() || null,
        pretensao_salarial: moneyToNumber(form.pretensao_salarial),
        linkedin: form.linkedin.trim() || null,
        instagram: form.instagram.trim() || null,
        additional_info: form.additional_info.trim() || null,

        status: candidate?.status || "novo",
        updated_at: new Date().toISOString(),
      };

      let candidateId = candidate?.id || null;

      if (candidateId) {
        const { error } = await supabase.from("hr_candidates").update(payload).eq("id", candidateId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("hr_candidates").insert(payload).select("*").maybeSingle();
        if (error) throw error;

        const created = data as Candidate | null;
        candidateId = created?.id || null;
      }

      if (!candidateId) throw new Error("Não foi possível salvar o candidato.");

      await loadCandidate(userId, form.email);
      setMessage("Currículo salvo com sucesso.");
      return candidateId;
    } catch (err: any) {
      alert(err?.message || "Erro ao salvar currículo.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function ensureCandidateBeforeApply() {
    if (!validateCandidateForm(false)) {
      alert("Complete e salve seu currículo antes de se candidatar.");
      setPortalTab("curriculo");
      return null;
    }

    if (candidate?.id) return candidate.id;

    const savedId = await saveCandidate();
    return savedId;
  }

  async function applyToJob(jobId = selectedJobId) {
    if (!userId) return alert("Faça login para se candidatar.");
    if (!jobId || jobId === "banco") return alert("Selecione uma vaga aberta.");

    const cId = await ensureCandidateBeforeApply();
    if (!cId) return;

    setSaving(true);

    try {
      const { error } = await supabase.from("hr_applications").upsert(
        {
          job_id: jobId,
          candidate_id: cId,
          status: "inscrito",
          notes: form.additional_info.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "job_id,candidate_id" }
      );

      if (error) throw error;

      await loadCandidate(userId, form.email);
      setSelectedJobId(jobId);
      setParams({ job: jobId });
      setPortalTab("candidaturas");
      setMessage("Candidatura enviada com sucesso.");
    } catch (err: any) {
      alert(err?.message || "Erro ao enviar candidatura.");
    } finally {
      setSaving(false);
    }
  }

  function updateAcademic(id: string, patch: Partial<AcademicFormation>) {
    setForm((old) => ({
      ...old,
      academic_formations: old.academic_formations.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    }));
  }

  function updateCourse(id: string, patch: Partial<CourseCertification>) {
    setForm((old) => ({
      ...old,
      courses_certifications: old.courses_certifications.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    }));
  }

  function updateExperience(id: string, patch: Partial<ProfessionalExperience>) {
    setForm((old) => ({
      ...old,
      professional_experiences: old.professional_experiences.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    }));
  }

  function updateLanguage(id: string, patch: Partial<CandidateLanguage>) {
    setForm((old) => ({
      ...old,
      languages: old.languages.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div
          className="rounded-3xl p-6 text-white shadow-xl"
          style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})` }}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm">
                <UserRound className="h-4 w-4" /> Área do Candidato
              </div>
              <h1 className="text-3xl font-bold md:text-4xl">Sua carreira na Consulmax começa aqui</h1>
              <p className="mt-2 max-w-2xl text-white/80">
                Crie seu acesso, cadastre seu currículo completo e use ele para se candidatar às vagas.
              </p>
            </div>

            {userId && (
              <Button variant="secondary" className="rounded-2xl" onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" /> Sair
              </Button>
            )}
          </div>
        </div>

        {message && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            {message}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : !userId ? (
          <AuthCard
            mode={mode}
            setMode={setMode}
            email={authEmail}
            setEmail={setAuthEmail}
            password={authPassword}
            setPassword={setAuthPassword}
            confirmPassword={confirmPassword}
            setConfirmPassword={setConfirmPassword}
            saving={saving}
            onSubmit={signIn}
          />
        ) : (
          <>
            <Card className="rounded-3xl">
              <CardContent className="flex flex-wrap gap-2 p-3">
                <PortalChip
                  active={portalTab === "curriculo"}
                  onClick={() => setPortalTab("curriculo")}
                  icon={FileText}
                  label={candidate?.id ? "Editar currículo" : "Cadastrar currículo"}
                />
                <PortalChip
                  active={portalTab === "vagas"}
                  onClick={() => setPortalTab("vagas")}
                  icon={Briefcase}
                  label="Vagas disponíveis"
                />
                <PortalChip
                  active={portalTab === "candidaturas"}
                  onClick={() => setPortalTab("candidaturas")}
                  icon={ClipboardList}
                  label="Minhas candidaturas"
                />
              </CardContent>
            </Card>

            {portalTab === "curriculo" && (
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2" style={{ color: C.navy }}>
                    <UserRound className="h-5 w-5" />
                    {candidate?.id ? "Editar currículo" : "Cadastrar currículo"}
                  </CardTitle>
                  <p className="text-sm text-slate-500">
                    Preencha seu currículo completo uma única vez. Ele será vinculado às vagas em que você se candidatar.
                  </p>
                </CardHeader>

                <CardContent className="space-y-6">
                  <Section title="1. Dados pessoais" icon={UserRound}>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-[180px_1fr]">
                      <div className="space-y-3">
                        <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-3xl border bg-slate-100">
                          {form.foto_url ? (
                            <img src={form.foto_url} alt="Foto do candidato" className="h-full w-full object-cover" />
                          ) : (
                            <Camera className="h-10 w-10 text-slate-400" />
                          )}
                        </div>
                        <Label className="block">
                          <span className="mb-2 block text-sm">Foto do candidato</span>
                          <Input
                            type="file"
                            accept="image/*"
                            disabled={uploadingPhoto}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadCandidatePhoto(file);
                            }}
                          />
                        </Label>
                        {uploadingPhoto && (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Loader2 className="h-3 w-3 animate-spin" /> Enviando foto...
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <Field label="Nome completo">
                          <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                        </Field>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <Field label="Data de nascimento">
                            <Input
                              type="date"
                              value={form.nascimento}
                              onChange={(e) => setForm({ ...form, nascimento: e.target.value })}
                            />
                          </Field>
                          <Field label="Idade">
                            <Input value={form.idade} disabled />
                          </Field>
                          <Field label="CPF">
                            <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCPF(e.target.value) })} />
                          </Field>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-[140px_1fr_110px]">
                          <Field label="CEP">
                            <Input value={form.cep} onChange={(e) => setForm({ ...form, cep: maskCEP(e.target.value) })} />
                          </Field>
                          <Field label="Logradouro">
                            <Input
                              value={form.logradouro}
                              onChange={(e) => setForm({ ...form, logradouro: e.target.value })}
                            />
                          </Field>
                          <Field label="Número">
                            <Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
                          </Field>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_90px]">
                          <Field label="Bairro">
                            <Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
                          </Field>
                          <Field label="Cidade">
                            <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
                          </Field>
                          <Field label="UF">
                            <Input
                              value={form.uf}
                              onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase().slice(0, 2) })}
                            />
                          </Field>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <Field label="Telefone para contato">
                            <Input
                              value={form.telefone}
                              onChange={(e) => setForm({ ...form, telefone: maskPhone(e.target.value) })}
                            />
                          </Field>
                          <Field label="E-mail">
                            <Input value={form.email || authEmail} disabled />
                          </Field>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <Field label="É PCD?">
                            <Select
                              value={form.pcd}
                              onValueChange={(v) => setForm({ ...form, pcd: v as "sim" | "nao" })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="nao">Não</SelectItem>
                                <SelectItem value="sim">Sim</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>

                          {form.pcd === "sim" && (
                            <>
                              <Field label="Tipo de deficiência/necessidade">
                                <Input
                                  value={form.pcd_tipo}
                                  onChange={(e) => setForm({ ...form, pcd_tipo: e.target.value })}
                                />
                              </Field>
                              <Field label="Precisa de adaptação?">
                                <Input
                                  value={form.pcd_adaptacao}
                                  onChange={(e) => setForm({ ...form, pcd_adaptacao: e.target.value })}
                                  placeholder="Descreva, se necessário"
                                />
                              </Field>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Section>

                  <Section title="2. Formação acadêmica" icon={GraduationCap}>
                    <Field label="Ensino médio">
                      <Select
                        value={form.ensino_medio || undefined}
                        onValueChange={(v) => setForm({ ...form, ensino_medio: v as CandidateForm["ensino_medio"] })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cursando">Cursando</SelectItem>
                          <SelectItem value="completo">Completo</SelectItem>
                          <SelectItem value="incompleto">Incompleto</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>

                    <div className="space-y-3">
                      {form.academic_formations.map((item) => (
                        <div key={item.id} className="rounded-3xl border bg-white p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="font-semibold" style={{ color: C.navy }}>
                              Formação
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-2xl"
                              onClick={() =>
                                setForm((old) => ({
                                  ...old,
                                  academic_formations: old.academic_formations.filter((x) => x.id !== item.id),
                                }))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <Field label="Tipo">
                              <Select
                                value={item.type}
                                onValueChange={(v) =>
                                  updateAcademic(item.id, { type: v as AcademicFormation["type"] })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="faculdade">Faculdade</SelectItem>
                                  <SelectItem value="especializacao_mba">Especialização/MBA</SelectItem>
                                </SelectContent>
                              </Select>
                            </Field>
                            <Field label="Situação">
                              <Select
                                value={item.in_progress ? "cursando" : "concluido"}
                                onValueChange={(v) => updateAcademic(item.id, { in_progress: v === "cursando" })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="concluido">Concluído</SelectItem>
                                  <SelectItem value="cursando">Cursando</SelectItem>
                                </SelectContent>
                              </Select>
                            </Field>
                            <Field label="Curso">
                              <Input value={item.course} onChange={(e) => updateAcademic(item.id, { course: e.target.value })} />
                            </Field>
                            <Field label="Instituição">
                              <Input
                                value={item.institution}
                                onChange={(e) => updateAcademic(item.id, { institution: e.target.value })}
                              />
                            </Field>
                            <Field label="Data de início">
                              <Input
                                type="date"
                                value={item.start_date}
                                onChange={(e) => updateAcademic(item.id, { start_date: e.target.value })}
                              />
                            </Field>
                            <Field label="Data de fim">
                              <Input
                                type="date"
                                value={item.end_date}
                                disabled={item.in_progress}
                                onChange={(e) => updateAcademic(item.id, { end_date: e.target.value })}
                              />
                            </Field>
                          </div>
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() =>
                          setForm((old) => ({
                            ...old,
                            academic_formations: [...old.academic_formations, emptyAcademicFormation()],
                          }))
                        }
                      >
                        <Plus className="mr-2 h-4 w-4" /> Adicionar formação
                      </Button>
                    </div>
                  </Section>

                  <Section title="3. Outros cursos ou certificações" icon={FileText}>
                    <div className="space-y-3">
                      {form.courses_certifications.map((item) => (
                        <div key={item.id} className="rounded-3xl border bg-white p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="font-semibold" style={{ color: C.navy }}>
                              Curso/Certificação
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-2xl"
                              onClick={() =>
                                setForm((old) => ({
                                  ...old,
                                  courses_certifications: old.courses_certifications.filter((x) => x.id !== item.id),
                                }))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr_150px]">
                            <Field label="Tipo">
                              <Select
                                value={item.type}
                                onValueChange={(v) => updateCourse(item.id, { type: v as CourseCertification["type"] })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="curso">Curso</SelectItem>
                                  <SelectItem value="certificacao">Certificação</SelectItem>
                                </SelectContent>
                              </Select>
                            </Field>
                            <Field label="Nome do curso/certificação">
                              <Input value={item.name} onChange={(e) => updateCourse(item.id, { name: e.target.value })} />
                            </Field>
                            <Field label="Ano da conclusão">
                              <Input
                                value={item.conclusion_year}
                                onChange={(e) =>
                                  updateCourse(item.id, { conclusion_year: onlyDigits(e.target.value).slice(0, 4) })
                                }
                              />
                            </Field>
                          </div>

                          <div className="mt-3">
                            <Field label="Breve descrição dos assuntos abordados">
                              <Textarea
                                value={item.description}
                                onChange={(e) => updateCourse(item.id, { description: e.target.value })}
                              />
                            </Field>
                          </div>
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() =>
                          setForm((old) => ({
                            ...old,
                            courses_certifications: [...old.courses_certifications, emptyCourseCertification()],
                          }))
                        }
                      >
                        <Plus className="mr-2 h-4 w-4" /> Adicionar curso/certificação
                      </Button>
                    </div>
                  </Section>

                  <Section title="4. Experiências profissionais" icon={Briefcase}>
                    <div className="space-y-3">
                      {form.professional_experiences.map((item) => (
                        <div key={item.id} className="rounded-3xl border bg-white p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="font-semibold" style={{ color: C.navy }}>
                              Experiência
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-2xl"
                              onClick={() =>
                                setForm((old) => ({
                                  ...old,
                                  professional_experiences: old.professional_experiences.filter((x) => x.id !== item.id),
                                }))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <Field label="Empresa">
                              <Input
                                value={item.company}
                                onChange={(e) => updateExperience(item.id, { company: e.target.value })}
                              />
                            </Field>
                            <Field label="Cargo">
                              <Input value={item.role} onChange={(e) => updateExperience(item.id, { role: e.target.value })} />
                            </Field>
                          </div>

                          <div className="mt-3">
                            <Field label="Descrição das atividades">
                              <Textarea
                                value={item.activities}
                                onChange={(e) => updateExperience(item.id, { activities: e.target.value })}
                              />
                            </Field>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[160px_160px_1fr]">
                            <Field label="De">
                              <Input
                                placeholder="mm/aaaa"
                                value={item.start_month}
                                onChange={(e) => updateExperience(item.id, { start_month: maskMonthYear(e.target.value) })}
                              />
                            </Field>
                            <Field label="Até">
                              <Input
                                placeholder="mm/aaaa"
                                disabled={item.current}
                                value={item.current ? "" : item.end_month}
                                onChange={(e) => updateExperience(item.id, { end_month: maskMonthYear(e.target.value) })}
                              />
                            </Field>
                            <Field label="Está trabalhando atualmente?">
                              <Select
                                value={item.current ? "sim" : "nao"}
                                onValueChange={(v) =>
                                  updateExperience(item.id, {
                                    current: v === "sim",
                                    end_month: v === "sim" ? "" : item.end_month,
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="nao">Não</SelectItem>
                                  <SelectItem value="sim">Sim</SelectItem>
                                </SelectContent>
                              </Select>
                            </Field>
                          </div>
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() =>
                          setForm((old) => ({
                            ...old,
                            professional_experiences: [...old.professional_experiences, emptyProfessionalExperience()],
                          }))
                        }
                      >
                        <Plus className="mr-2 h-4 w-4" /> Adicionar experiência
                      </Button>
                    </div>
                  </Section>

                  <Section title="5. Idiomas" icon={LanguagesIcon}>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {[
                        ["portugues", "Português"],
                        ["ingles", "Inglês"],
                        ["espanhol", "Espanhol"],
                        ["outro", "Outro"],
                      ].map(([value, label]) => (
                        <Button
                          key={value}
                          type="button"
                          variant="outline"
                          className="rounded-2xl"
                          onClick={() =>
                            setForm((old) => ({
                              ...old,
                              languages: [...old.languages, emptyLanguage(value as CandidateLanguage["language"])],
                            }))
                          }
                        >
                          <Plus className="mr-2 h-4 w-4" /> {label}
                        </Button>
                      ))}
                    </div>

                    <div className="space-y-3">
                      {form.languages.map((item) => (
                        <div key={item.id} className="rounded-3xl border bg-white p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="font-semibold" style={{ color: C.navy }}>
                              Idioma
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-2xl"
                              onClick={() =>
                                setForm((old) => ({
                                  ...old,
                                  languages: old.languages.filter((x) => x.id !== item.id),
                                }))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <Field label="Idioma">
                              <Select
                                value={item.language}
                                onValueChange={(v) =>
                                  updateLanguage(item.id, { language: v as CandidateLanguage["language"] })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="portugues">Português</SelectItem>
                                  <SelectItem value="ingles">Inglês</SelectItem>
                                  <SelectItem value="espanhol">Espanhol</SelectItem>
                                  <SelectItem value="outro">Outro</SelectItem>
                                </SelectContent>
                              </Select>
                            </Field>

                            {item.language === "outro" && (
                              <Field label="Descreva o idioma">
                                <Input
                                  value={item.other_language}
                                  onChange={(e) => updateLanguage(item.id, { other_language: e.target.value })}
                                />
                              </Field>
                            )}

                            <Field label="Nível">
                              <Select
                                value={item.level}
                                onValueChange={(v) => updateLanguage(item.id, { level: v as CandidateLanguage["level"] })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="basico">Básico</SelectItem>
                                  <SelectItem value="intermediario">Intermediário</SelectItem>
                                  <SelectItem value="avancado">Avançado</SelectItem>
                                </SelectContent>
                              </Select>
                            </Field>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>

                  <Section title="6. Informações adicionais" icon={ClipboardList}>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Field label="Área de interesse">
                        <Input
                          value={form.area_interesse}
                          onChange={(e) => setForm({ ...form, area_interesse: e.target.value })}
                          placeholder="Comercial, administrativo, atendimento..."
                        />
                      </Field>
                      <Field label="Pretensão salarial">
                        <Input
                          value={form.pretensao_salarial}
                          onChange={(e) => setForm({ ...form, pretensao_salarial: e.target.value })}
                          placeholder="Ex.: 2500,00"
                        />
                      </Field>
                      <Field label="LinkedIn">
                        <Input value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} />
                      </Field>
                      <Field label="Instagram">
                        <Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} />
                      </Field>
                    </div>

                    <Field label="Outras informações que gostaria de adicionar">
                      <Textarea
                        value={form.additional_info}
                        onChange={(e) => setForm({ ...form, additional_info: e.target.value })}
                        placeholder="Fale sobre suas experiências, objetivos, disponibilidade ou qualquer informação importante para o processo seletivo."
                      />
                    </Field>
                  </Section>

                  <div className="flex flex-col gap-2 md:flex-row">
                    <Button
                      disabled={saving}
                      onClick={saveCandidate}
                      className="rounded-2xl text-white"
                      style={{ background: C.ruby }}
                    >
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Salvar currículo
                    </Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => setPortalTab("vagas")}>
                      Ver vagas disponíveis
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {portalTab === "vagas" && (
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
                <Card className="rounded-3xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2" style={{ color: C.navy }}>
                      <Briefcase className="h-5 w-5" /> Vagas disponíveis
                    </CardTitle>
                    <p className="text-sm text-slate-500">
                      Ao se candidatar, seu currículo salvo será vinculado à vaga escolhida.
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {openJobs.length === 0 ? (
                      <div className="rounded-2xl border bg-slate-50 p-4 text-sm text-slate-500">
                        Nenhuma vaga aberta no momento.
                      </div>
                    ) : (
                      openJobs.map((job) => {
                        const alreadyApplied = appliedJobIds.has(job.id);
                        const highlighted = requestedJobId === job.id;

                        return (
                          <div
                            key={job.id}
                            className="rounded-2xl border bg-white p-4"
                            style={highlighted ? { borderColor: C.gold, boxShadow: `0 0 0 2px ${C.gold}33` } : undefined}
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <div className="text-lg font-semibold" style={{ color: C.navy }}>
                                  {job.title}
                                </div>
                                <div className="text-sm text-slate-500">{job.area || "Área não informada"}</div>

                                {job.description && (
                                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{job.description}</p>
                                )}

                                {job.requirements && (
                                  <p className="mt-2 whitespace-pre-wrap text-xs text-slate-500">
                                    Requisitos: {job.requirements}
                                  </p>
                                )}
                              </div>

                              <div className="flex shrink-0 flex-col gap-2">
                                {alreadyApplied && <StatusBadge tone="good">inscrito</StatusBadge>}
                                <Button
                                  disabled={saving || alreadyApplied}
                                  onClick={() => {
                                    setSelectedJobId(job.id);
                                    setParams({ job: job.id });
                                    applyToJob(job.id);
                                  }}
                                  className="rounded-2xl text-white"
                                  style={{ background: alreadyApplied ? "#94a3b8" : C.ruby }}
                                >
                                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                  {alreadyApplied ? "Já inscrito" : "Candidatar-se"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>

                <Card className="h-fit rounded-3xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2" style={{ color: C.navy }}>
                      <FileText className="h-5 w-5" /> Currículo
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {hasCurriculum ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                        Seu currículo está cadastrado e será vinculado às vagas em que você se candidatar.
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        Complete e salve seu currículo antes de se candidatar.
                      </div>
                    )}

                    <Button variant="outline" className="w-full rounded-2xl" onClick={() => setPortalTab("curriculo")}>
                      {candidate?.id ? "Editar currículo" : "Cadastrar currículo"}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {portalTab === "candidaturas" && (
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2" style={{ color: C.navy }}>
                    <CheckCircle2 className="h-5 w-5" /> Minhas candidaturas
                  </CardTitle>
                  <p className="text-sm text-slate-500">Acompanhe aqui a etapa de cada processo seletivo.</p>
                </CardHeader>

                <CardContent className="space-y-3">
                  {applications.length === 0 ? (
                    <div className="rounded-2xl border bg-slate-50 p-4 text-sm text-slate-500">
                      Você ainda não se candidatou a nenhuma vaga.
                    </div>
                  ) : (
                    applications.map((app) => (
                      <div key={app.id} className="rounded-2xl border bg-white p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="font-semibold">{jobMap.get(app.job_id)?.title || "Vaga"}</div>
                            <div className="text-xs text-slate-500">Enviada em {formatDateBR(app.created_at)}</div>
                          </div>
                          <StatusBadge tone={statusTone(app.status)}>{app.status}</StatusBadge>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </>
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
  const {
    mode,
    setMode,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    saving,
    onSubmit,
  } = props;

  return (
    <Card className="mx-auto max-w-xl rounded-3xl shadow-xl">
      <CardHeader
        className="rounded-t-3xl text-white"
        style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})` }}
      >
        <CardTitle className="flex items-center gap-2 text-2xl">
          {mode === "reset" ? <Mail className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
          {mode === "signup" ? "Criar acesso" : mode === "reset" ? "Recuperar senha" : "Entrar na área do candidato"}
        </CardTitle>
        <p className="text-sm text-white/80">Use seu e-mail para acessar o portal e editar seu currículo.</p>
      </CardHeader>

      <CardContent className="space-y-3 p-5">
        <Field label="E-mail">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>

        {mode !== "reset" && (
          <Field label="Senha">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}

        {mode === "signup" && (
          <Field label="Confirmar senha">
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </Field>
        )}

        <Button disabled={saving} onClick={onSubmit} className="h-12 w-full rounded-2xl text-white" style={{ background: C.ruby }}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {mode === "signup" ? "Criar meu acesso" : mode === "reset" ? "Enviar recuperação" : "Entrar"}
        </Button>

        <div className="flex flex-wrap justify-center gap-2 text-sm">
          {mode !== "login" && (
            <button className="underline" style={{ color: C.navy }} onClick={() => setMode("login")}>
              Já tenho acesso
            </button>
          )}
          {mode !== "signup" && (
            <button className="underline" style={{ color: C.navy }} onClick={() => setMode("signup")}>
              Criar conta
            </button>
          )}
          {mode !== "reset" && (
            <button className="underline" style={{ color: C.navy }} onClick={() => setMode("reset")}>
              Esqueci minha senha
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PortalChip({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${
        active ? "text-white" : "bg-white hover:bg-slate-50"
      }`}
      style={active ? { background: C.ruby, borderColor: C.ruby } : { borderColor: "#e2e8f0", color: C.navy }}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border bg-slate-50/70 p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl text-white" style={{ background: C.navy }}>
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-lg font-semibold" style={{ color: C.navy }}>
          {title}
        </h2>
      </div>

      <div className="space-y-4">{children}</div>
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
