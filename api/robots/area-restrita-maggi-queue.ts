import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export const config = { maxDuration: 30 };

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SESSION_KEY = "maggi";

const admin =
  SUPABASE_URL && SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      })
    : null;

async function verifyAdmin(req: VercelRequest) {
  if (!admin)
    return { ok: false as const, status: 503, error: "Supabase Admin não configurado." };

  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token)
    return { ok: false as const, status: 401, error: "Token de autenticação ausente." };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user)
    return { ok: false as const, status: 401, error: "Sessão inválida ou expirada." };

  const appRole = String(data.user.app_metadata?.role || "").toLowerCase();
  if (appRole === "admin") return { ok: true as const };

  const { data: profile } = await admin
    .from("users")
    .select("role,user_role")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  const role = String(profile?.role || profile?.user_role || "").toLowerCase();
  if (role !== "admin")
    return { ok: false as const, status: 403, error: "Apenas administradores podem operar este robô." };

  return { ok: true as const };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Método não permitido." });
  }

  const auth = await verifyAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
  if (!admin) return res.status(503).json({ ok: false, error: "Supabase Admin não configurado." });

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

  const { error: sessionError } = await admin.from("area_restrita_runtime_sessions").upsert(
    {
      key: SESSION_KEY,
      administradora: "maggi",
      state: "queued",
      message: "Solicitação registrada. O GitHub Runner iniciará automaticamente em até 5 minutos.",
      remote_url: null,
      github_run_id: null,
      github_run_url: null,
      started_at: now,
      finished_at: null,
      expires_at: expiresAt,
      updated_at: now,
    },
    { onConflict: "key" },
  );

  if (sessionError) {
    return res.status(500).json({ ok: false, error: sessionError.message });
  }

  const { error: requestError } = await admin.from("area_restrita_run_requests").upsert(
    {
      key: SESSION_KEY,
      requested_at: now,
      consumed_at: null,
      updated_at: now,
    },
    { onConflict: "key" },
  );

  if (requestError) {
    return res.status(500).json({ ok: false, error: requestError.message });
  }

  return res.status(202).json({
    ok: true,
    message: "Solicitação registrada. O GitHub Runner iniciará automaticamente em até 5 minutos.",
    dispatchMode: "queue",
  });
}
