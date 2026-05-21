import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
  CheckCircle2,
  Loader2,
  LogIn,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
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

export default function PublicTrabalheConosco() {
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

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

      setJobs((data || []) as Job[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJobs();
  }, []);

  function goToCandidateArea(jobId?: string) {
    navigate(jobId ? `/area-candidato?job=${jobId}` : "/area-candidato");
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(180deg,#f8fafc 0%,#fff 45%,#f8fafc 100%)" }}
    >
      <section className="relative overflow-hidden px-4 py-10 md:py-16">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(circle at 20% 20%, #A11C27 0, transparent 30%), radial-gradient(circle at 80% 10%, #1E293F 0, transparent 28%), radial-gradient(circle at 70% 80%, #B5A573 0, transparent 26%)",
          }}
        />

        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-start gap-8 lg:grid-cols-[1.05fr_.95fr]">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border bg-white/80 px-4 py-2 text-sm shadow-sm">
              <Sparkles className="h-4 w-4" style={{ color: C.gold }} />
              Trabalhe Conosco • Consulmax
            </div>

            <div>
              <h1
                className="text-4xl font-extrabold tracking-tight md:text-5xl"
                style={{ color: C.navy }}
              >
                Venha crescer com a Consulmax
              </h1>

              <p className="mt-4 max-w-2xl text-lg text-slate-600">
                Aqui, planejamento, atendimento próximo e ambição caminham juntos.
                Buscamos pessoas que queiram aprender, servir bem e construir uma carreira com propósito.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <InfoCard
                icon={Target}
                title="Missão"
                text="Ajudar pessoas e empresas a transformarem planejamento em conquistas reais."
              />
              <InfoCard
                icon={Rocket}
                title="Visão"
                text="Ser referência em consórcio, estratégia patrimonial e relacionamento com o cliente."
              />
              <InfoCard
                icon={ShieldCheck}
                title="Valores"
                text="Ética, clareza, responsabilidade, evolução constante e foco em resultado sustentável."
              />
            </div>

            <Card className="rounded-3xl border-white/70 bg-white/90 shadow-xl backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: C.navy }}>
                  <Briefcase className="h-5 w-5" />
                  Vagas disponíveis
                </CardTitle>

                <p className="text-sm text-slate-500">
                  Escolha uma vaga, crie seu acesso no portal do candidato, cadastre seu currículo
                  e acompanhe sua etapa no processo seletivo.
                </p>
              </CardHeader>

              <CardContent className="space-y-3">
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : jobs.length === 0 ? (
                  <div className="rounded-2xl border bg-slate-50 p-4 text-sm text-slate-600">
                    Nenhuma vaga aberta no momento. Você ainda pode criar seu acesso e deixar seu currículo
                    no nosso banco de talentos.
                  </div>
                ) : (
                  jobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-2xl border bg-white p-4 transition hover:bg-slate-50"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="text-lg font-semibold" style={{ color: C.navy }}>
                            {job.title}
                          </div>

                          <div className="text-sm text-slate-500">
                            {job.area || "Área não informada"}
                          </div>

                          {job.description && (
                            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                              {job.description}
                            </p>
                          )}

                          {job.requirements && (
                            <p className="mt-2 whitespace-pre-wrap text-xs text-slate-500">
                              Requisitos: {job.requirements}
                            </p>
                          )}
                        </div>

                        <Button
                          className="shrink-0 rounded-2xl text-white"
                          style={{ background: C.ruby }}
                          onClick={() => goToCandidateArea(job.id)}
                        >
                          Candidatar-se
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="sticky top-4 rounded-3xl border-white/70 bg-white/95 shadow-2xl backdrop-blur">
            <CardHeader
              className="rounded-t-3xl text-white"
              style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.ruby})` }}
            >
              <CardTitle className="flex items-center gap-2 text-2xl">
                <UserRound className="h-6 w-6" />
                Portal do Candidato
              </CardTitle>

              <p className="text-sm text-white/80">
                Crie seu acesso, salve seu currículo e use ele para se candidatar às vagas.
              </p>
            </CardHeader>

            <CardContent className="space-y-4 p-5">
              <div className="space-y-3 rounded-2xl border bg-slate-50 p-4">
                <Step
                  title="1. Crie seu acesso"
                  text="Entre com e-mail e senha ou recupere seu acesso quando precisar."
                />
                <Step
                  title="2. Cadastre seu currículo"
                  text="Preencha seus dados uma única vez e mantenha tudo atualizado."
                />
                <Step
                  title="3. Candidate-se às vagas"
                  text="Seu currículo fica vinculado à vaga escolhida e o RH acompanha sua etapa."
                />
              </div>

              <Button
                onClick={() => goToCandidateArea()}
                className="h-12 w-full rounded-2xl text-white"
                style={{ background: C.ruby }}
              >
                <LogIn className="mr-2 h-4 w-4" />
                Entrar ou criar acesso
              </Button>

              <p className="text-center text-xs text-slate-500">
                As informações preenchidas serão usadas exclusivamente para fins de recrutamento e seleção da Consulmax.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl border bg-white/80 p-4 shadow-sm">
      <Icon className="mb-2 h-5 w-5" style={{ color: C.ruby }} />
      <div className="font-semibold" style={{ color: C.navy }}>
        {title}
      </div>
      <p className="mt-1 text-sm text-slate-600">{text}</p>
    </div>
  );
}

function Step({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex gap-2">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: C.ruby }} />
      <div>
        <div className="font-semibold" style={{ color: C.navy }}>
          {title}
        </div>
        <p className="text-sm text-slate-600">{text}</p>
      </div>
    </div>
  );
}
