import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Briefcase, CheckCircle2, Loader2, Send, Sparkles, UserRound } from "lucide-react";

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
};

type Job = {
  id: string;
  title: string;
  area: string | null;
  description: string | null;
  requirements: string | null;
  status: string;
  public_slug: string | null;
};

type CandidateForm = {
  job_id: string;
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
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

function moneyToNumber(v: string) {
  if (!v.trim()) return null;
  const n = Number(v.replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const initialForm: CandidateForm = {
  job_id: "",
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

export default function PublicTrabalheConosco() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CandidateForm>(initialForm);
  const [success, setSuccess] = useState(false);

  const selectedJob = useMemo(() => jobs.find((j) => j.id === form.job_id) || null, [jobs, form.job_id]);

  async function loadJobs() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("hr_jobs")
        .select("id, title, area, description, requirements, status, public_slug")
        .eq("status", "aberta")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn(error.message);
        setJobs([]);
        return;
      }

      const list = (data || []) as Job[];
      setJobs(list);
      if (list[0]?.id && !form.job_id) setForm((prev) => ({ ...prev, job_id: list[0].id, area_interesse: list[0].area || prev.area_interesse }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    const cpfDigits = onlyDigits(form.cpf);
    const phoneDigits = onlyDigits(form.telefone);

    if (!form.nome.trim()) return alert("Informe seu nome completo.");
    if (!form.email.trim()) return alert("Informe seu e-mail.");
    if (phoneDigits.length < 10) return alert("Informe um telefone válido.");
    if (cpfDigits.length !== 11) return alert("Informe um CPF válido.");

    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        telefone: phoneDigits,
        cpf: cpfDigits,
        cidade: form.cidade.trim() || null,
        uf: form.uf.trim().toUpperCase() || null,
        linkedin: form.linkedin.trim() || null,
        instagram: form.instagram.trim() || null,
        pretensao_salarial: moneyToNumber(form.pretensao_salarial),
        area_interesse: selectedJob?.area || form.area_interesse.trim() || null,
        status: "novo",
      };

      const { data: candidateData, error: candidateError } = await supabase
        .from("hr_candidates")
        .upsert(payload, { onConflict: "cpf" })
        .select("id")
        .maybeSingle();

      if (candidateError) throw candidateError;

      const candidateId = candidateData?.id;
      if (!candidateId) throw new Error("Não foi possível identificar o candidato.");

      if (form.job_id) {
        const { error: applicationError } = await supabase
          .from("hr_applications")
          .upsert(
            {
              job_id: form.job_id,
              candidate_id: candidateId,
              status: "inscrito",
              notes: form.resumo.trim() || null,
            },
            { onConflict: "job_id,candidate_id" }
          );

        if (applicationError) throw applicationError;
      }

      setSuccess(true);
      setForm(initialForm);
    } catch (err: any) {
      alert(err?.message || "Não foi possível enviar sua candidatura.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg,#f8fafc 0%,#fff 45%,#f8fafc 100%)" }}>
      <section className="relative overflow-hidden px-4 py-10 md:py-16">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(circle at 20% 20%, #A11C27 0, transparent 30%), radial-gradient(circle at 80% 10%, #1E293F 0, transparent 28%), radial-gradient(circle at 70% 80%, #B5A573 0, transparent 26%)",
          }}
        />

        <div className="relative max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1.05fr_.95fr] gap-8 items-start">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border bg-white/80 px-4 py-2 text-sm shadow-sm">
              <Sparkles className="h-4 w-4" style={{ color: C.gold }} />
              Trabalhe Conosco • Consulmax
            </div>

            <div>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight" style={{ color: C.navy }}>
                Venha crescer com a Consulmax
              </h1>
              <p className="mt-4 text-lg text-slate-600 max-w-2xl">
                Buscamos pessoas com vontade de evoluir, servir bem e construir uma carreira em uma empresa que transforma planejamento em conquistas reais.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <InfoCard title="Crescimento" text="Ambiente de aprendizado, metas claras e evolução profissional." />
              <InfoCard title="Cultura" text="Atendimento próximo, responsabilidade e foco em resultado." />
              <InfoCard title="Propósito" text="Ajudar pessoas e empresas a conquistarem com planejamento." />
            </div>

            <Card className="rounded-3xl border-white/70 shadow-xl bg-white/90 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: C.navy }}>
                  <Briefcase className="h-5 w-5" />
                  Vagas abertas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : jobs.length === 0 ? (
                  <div className="rounded-2xl border bg-slate-50 p-4 text-sm text-slate-600">
                    Nenhuma vaga aberta no momento. Você ainda pode enviar seu currículo para nosso banco de talentos.
                  </div>
                ) : (
                  jobs.map((job) => (
                    <button
                      key={job.id}
                      onClick={() => setForm((prev) => ({ ...prev, job_id: job.id, area_interesse: job.area || prev.area_interesse }))}
                      className="w-full text-left rounded-2xl border p-4 transition hover:bg-slate-50"
                      style={{ borderColor: form.job_id === job.id ? C.ruby : "#e2e8f0" }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold" style={{ color: C.navy }}>{job.title}</div>
                          <div className="text-sm text-slate-500">{job.area || "Área não informada"}</div>
                        </div>
                        {form.job_id === job.id && <CheckCircle2 className="h-5 w-5" style={{ color: C.ruby }} />}
                      </div>
                      {job.description && <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{job.description}</p>}
                      {job.requirements && <p className="text-xs text-slate-500 mt-2 whitespace-pre-wrap">Requisitos: {job.requirements}</p>}
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-3xl border-white/70 shadow-2xl bg-white/95 backdrop-blur sticky top-4">
            <CardHeader
              className="text-white rounded-t-3xl"
              style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})` }}
            >
              <CardTitle className="flex items-center gap-2 text-2xl">
                <UserRound className="h-6 w-6" />
                Envie sua candidatura
              </CardTitle>
              <p className="text-sm text-white/80">Preencha seus dados para participar do processo seletivo.</p>
            </CardHeader>

            <CardContent className="p-5 space-y-3">
              {success && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  Candidatura enviada com sucesso. A equipe da Consulmax irá avaliar suas informações.
                </div>
              )}

              <Field label="Vaga de interesse">
                <Select value={form.job_id || "banco"} onValueChange={(v) => setForm({ ...form, job_id: v === "banco" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="banco">Banco de talentos</SelectItem>
                    {jobs.map((job) => <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>

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
              <Field label="Resumo profissional"><Textarea value={form.resumo} onChange={(e) => setForm({ ...form, resumo: e.target.value })} placeholder="Conte um pouco sobre sua experiência, objetivos e por que quer trabalhar conosco." /></Field>

              <Button disabled={saving} onClick={submit} className="w-full h-12 rounded-2xl text-white" style={{ background: C.ruby }}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Enviar candidatura
              </Button>

              <p className="text-xs text-slate-500 text-center">
                Ao enviar, você autoriza o uso das informações para fins de recrutamento e seleção da Consulmax.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border bg-white/80 p-4 shadow-sm">
      <div className="font-semibold" style={{ color: C.navy }}>{title}</div>
      <p className="text-sm text-slate-600 mt-1">{text}</p>
    </div>
  );
}
