import React, { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useParams } from "react-router-dom";
import { CalendarCheck2, CheckCircle2, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

type AttendanceResult = {
  event_id: string;
  event_title: string;
  event_start: string | null;
  attendee_name: string;
  attended_at: string;
  already_registered: boolean;
};

export default function PublicAgendaAttendance() {
  const { token } = useParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AttendanceResult | null>(null);

  const attendanceClient = useMemo(
    () => createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
    [],
  );

  async function registerAttendance(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (!token) throw new Error("Link de presença inválido.");
      if (!email.trim() || !password) throw new Error("Informe seu e-mail e a senha do CRM.");

      const { error: signInError } = await attendanceClient.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw new Error("E-mail ou senha do CRM inválidos.");

      const { data, error: rpcError } = await attendanceClient.rpc("register_agenda_attendance", {
        p_token: token,
      });
      if (rpcError) throw rpcError;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("Não foi possível registrar a presença.");
      setResult(row as AttendanceResult);
      setPassword("");
      await attendanceClient.auth.signOut();
    } catch (e: any) {
      setError(e?.message || "Não foi possível registrar a presença.");
      await attendanceClient.auth.signOut().catch(() => undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,#A11C2718,transparent_35%),linear-gradient(145deg,#f8fafc,#eef2f7)] px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <img src="/logo-consulmax.png?v=3" alt="Consulmax" className="mx-auto h-12 w-auto object-contain" />
          <div className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-[#A11C27]">CRM Consulmax</div>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Registro de presença</h1>
          <p className="mt-2 text-sm text-slate-500">Use as mesmas credenciais do CRM. Sua senha é usada apenas para autenticar este registro e não é armazenada nesta página.</p>
        </div>

        <Card className="border-slate-200 bg-white/95 shadow-xl shadow-slate-200/40">
          {result ? (
            <CardContent className="p-7 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </span>
              <h2 className="mt-4 text-xl font-black text-slate-950">Presença confirmada</h2>
              <p className="mt-1 text-sm text-slate-500">{result.already_registered ? "Sua presença já havia sido registrada anteriormente." : "Seu registro foi concluído com sucesso."}</p>
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
                <div className="font-extrabold text-slate-900">{result.event_title}</div>
                <div className="mt-1 text-sm text-slate-500">Evento: {formatDateTime(result.event_start)}</div>
                <div className="mt-1 text-sm text-slate-500">Participante: {result.attendee_name}</div>
                <div className="mt-1 text-sm text-slate-500">Presença: {formatDateTime(result.attended_at)}</div>
              </div>
            </CardContent>
          ) : (
            <form onSubmit={registerAttendance}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-black text-slate-900">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#A11C27]/10 text-[#A11C27]"><CalendarCheck2 className="h-4 w-4" /></span>
                  Confirmar participação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pb-7">
                <label className="block text-sm font-bold text-slate-700">
                  E-mail do CRM
                  <div className="relative mt-1.5">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" autoComplete="email" placeholder="seuemail@empresa.com" />
                  </div>
                </label>
                <label className="block text-sm font-bold text-slate-700">
                  Senha do CRM
                  <div className="relative mt-1.5">
                    <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9" autoComplete="current-password" placeholder="Sua senha" />
                  </div>
                </label>
                {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}
                <Button type="submit" disabled={loading} className="h-11 w-full bg-[#A11C27] font-extrabold hover:bg-[#861720]">
                  {loading ? "Registrando…" : "Registrar minha presença"}
                </Button>
                <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  A autenticação desta página usa uma sessão isolada e não altera o usuário que já estiver conectado ao CRM em outra aba.
                </div>
              </CardContent>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
