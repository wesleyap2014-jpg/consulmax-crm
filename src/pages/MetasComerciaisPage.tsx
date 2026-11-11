// Página dedicada de Metas Comerciais. A rota /planejamento permanece na Sala de Guerra.
import React, { useEffect, useState } from "react";
import { Target, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MetasComerciais from "@/components/planning/MetasComerciais";

type Person = {
  id: string;
  auth_user_id: string;
  nome: string;
  email?: string | null;
  user_role?: string | null;
  is_active?: boolean | null;
};

export default function MetasComerciaisPage() {
  const [me, setMe] = useState<Person | null>(null);
  const [users, setUsers] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth?.user) throw authError || new Error("Sua sessão expirou. Entre novamente no CRM.");
        const { data: own, error: ownError } = await supabase.from("users")
          .select("id,auth_user_id,nome,email,user_role,role,is_active")
          .eq("auth_user_id", auth.user.id)
          .maybeSingle();
        if (ownError || !own) throw ownError || new Error("Perfil não localizado no CRM.");
        if (own.is_active === false) throw new Error("Seu usuário está inativo.");

        const isAdmin = own.user_role === "admin" || own.role === "admin";
        const normalizedMe: Person = {
          id: own.id,
          auth_user_id: own.auth_user_id,
          nome: own.nome || "",
          email: own.email,
          user_role: isAdmin ? "admin" : own.user_role,
          is_active: own.is_active,
        };
        let people: Person[] = [normalizedMe];
        if (isAdmin) {
          const { data: team, error: teamError } = await supabase.from("users")
            .select("id,auth_user_id,nome,email,user_role,is_active")
            .eq("is_active", true)
            .order("nome", { ascending: true });
          if (teamError) throw teamError;
          people = (team || []) as Person[];
          if (!people.some((person) => person.id === normalizedMe.id)) people.unshift(normalizedMe);
        }

        if (!active) return;
        setMe(normalizedMe);
        setUsers(people);
      } catch (err: any) {
        if (active) setError(err?.message || "Não foi possível abrir Metas Comerciais.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  if (loading) {
    return <div className="flex min-h-[45vh] items-center justify-center gap-2 text-sm text-slate-600">
      <Loader2 className="h-5 w-5 animate-spin" /> Carregando metas comerciais...
    </div>;
  }

  if (error || !me) {
    return <div role="alert" className="mx-auto max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
      <div className="mb-2 flex items-center gap-2 font-bold"><AlertCircle className="h-5 w-5" /> Não foi possível carregar Metas Comerciais</div>
      {error || "Perfil não disponível."}
    </div>;
  }

  return <div className="min-w-0 space-y-5 pb-8">
    <header className="rounded-2xl bg-[#1E293F] px-5 py-6 text-white shadow-sm sm:px-7">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10">
          <Target className="h-6 w-6 text-[#E0CE8C]" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#E0CE8C]">Consulmax · Gestão Comercial</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">Metas Comerciais</h1>
          <p className="mt-1 text-sm text-slate-200">Metas mensais e anuais, evolução da equipe e realização por encarteiramento.</p>
        </div>
      </div>
    </header>
    <MetasComerciais currentUser={me} users={users} />
  </div>;
}
