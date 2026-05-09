// src/pages/SimuladoresHub.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight, Building2, ShieldCheck, Sparkles } from "lucide-react";

type AdminRow = {
  id: string;
  name: string;
  slug?: string | null;
  logo_url?: string | null;
  description?: string | null;
};

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
};

function slugify(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function adminSlug(admin: AdminRow) {
  return admin.slug || slugify(admin.name);
}

function isEmbracon(admin: AdminRow) {
  const s = adminSlug(admin);
  return s === "embracon" || (admin.name || "").toLowerCase() === "embracon";
}

function logoFallback(name: string) {
  const initials = (name || "AD")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "AD";

  return (
    <div
      className="flex h-16 w-16 items-center justify-center rounded-3xl text-lg font-black shadow-inner"
      style={{ background: "rgba(30,41,63,.08)", color: C.navy, border: "1px solid rgba(30,41,63,.10)" }}
    >
      {initials}
    </div>
  );
}

function descriptionFor(admin: AdminRow) {
  if (admin.description) return admin.description;
  if (isEmbracon(admin)) {
    return "Simulador exclusivo para regras Embracon: crédito, parcelas, lance embutido, lance próprio e pós-contemplação.";
  }
  return "Administradora cadastrada no CRM. O simulador exclusivo dela será criado quando a operação for implantada.";
}

export default function SimuladoresHub() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<AdminRow[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("sim_admins")
        .select("id,name,slug,logo_url,description")
        .order("name", { ascending: true });

      if (!alive) return;

      if (error) {
        // Compatibilidade com bancos que ainda não tenham logo_url/description.
        const fallback = await supabase.from("sim_admins").select("id,name,slug").order("name", { ascending: true });
        setAdmins((fallback.data ?? []) as AdminRow[]);
      } else {
        setAdmins((data ?? []) as AdminRow[]);
      }
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const orderedAdmins = useMemo(() => {
    return [...admins].sort((a, b) => {
      if (isEmbracon(a) && !isEmbracon(b)) return -1;
      if (!isEmbracon(a) && isEmbracon(b)) return 1;
      return (a.name || "").localeCompare(b.name || "", "pt-BR");
    });
  }, [admins]);

  function openAdmin(admin: AdminRow) {
    if (isEmbracon(admin)) {
      navigate("/simuladores/embracon");
      return;
    }
    navigate(`/simuladores/${adminSlug(admin)}`);
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando administradoras...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <section
        className="relative overflow-hidden rounded-[28px] border p-6 md:p-8 shadow-sm"
        style={{ background: "linear-gradient(135deg, rgba(30,41,63,.98), rgba(161,28,39,.94))", borderColor: "rgba(255,255,255,.22)" }}
      >
        <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full blur-3xl" style={{ background: "rgba(181,165,115,.28)" }} />
        <div className="absolute -bottom-24 left-12 h-56 w-56 rounded-full blur-3xl" style={{ background: "rgba(255,255,255,.12)" }} />
        <div className="relative z-[1] max-w-3xl text-white">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> Hub de Simuladores Consulmax
          </div>
          <h1 className="text-2xl md:text-4xl font-black tracking-tight">Escolha a administradora para iniciar a simulação</h1>
          <p className="mt-3 text-sm md:text-base text-white/82">
            Cada administradora terá seu próprio arquivo e sua própria regra de cálculo. Assim, a Embracon fica blindada e novas administradoras entram sem quebrar o que já funciona.
          </p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {orderedAdmins.map((admin) => {
          const active = isEmbracon(admin);
          return (
            <Card
              key={admin.id}
              className="group overflow-hidden rounded-[28px] border bg-white/72 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-xl"
              style={{ borderColor: active ? "rgba(161,28,39,.22)" : "rgba(30,41,63,.12)" }}
            >
              <CardContent className="p-5 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {admin.logo_url ? (
                      <img
                        src={admin.logo_url}
                        alt={`Logo ${admin.name}`}
                        className="h-16 w-16 rounded-3xl border bg-white object-contain p-2 shadow-inner"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      logoFallback(admin.name)
                    )}
                    <div>
                      <h2 className="text-lg font-black" style={{ color: C.navy }}>{admin.name}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{ background: active ? "rgba(161,28,39,.10)" : "rgba(30,41,63,.08)", color: active ? C.ruby : C.navy }}
                        >
                          {active ? "Disponível" : "Em implantação"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Building2 className="h-5 w-5 opacity-35" />
                </div>

                <p className="min-h-[64px] text-sm leading-relaxed text-slate-600">{descriptionFor(admin)}</p>

                <div className="rounded-2xl border bg-slate-50/80 p-3 text-xs text-slate-600">
                  <div className="flex items-center gap-2 font-semibold" style={{ color: C.navy }}>
                    <ShieldCheck className="h-4 w-4" /> Estrutura isolada por administradora
                  </div>
                  <p className="mt-1">Arquivo próprio, cálculo próprio e evolução sem interferir nos demais simuladores.</p>
                </div>

                <Button
                  className="h-11 w-full rounded-2xl font-semibold"
                  style={{ background: active ? C.ruby : C.navy, color: "white" }}
                  onClick={() => openAdmin(admin)}
                >
                  {active ? "Iniciar simulação" : "Ver administradora"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}

        {orderedAdmins.length === 0 && (
          <Card className="rounded-[28px] border bg-white/75 shadow-sm backdrop-blur md:col-span-2 xl:col-span-3">
            <CardContent className="p-8 text-center text-sm text-slate-600">
              Nenhuma administradora cadastrada em <strong>sim_admins</strong>.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
