import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const WORKER_URL = String(
  process.env.AREA_RESTRITA_WORKER_URL ||
    "https://consulmax-crm-production.up.railway.app",
).replace(/\/$/, "");
const ROBOT_SECRET = String(
  process.env.AREA_RESTRITA_ROBOT_SECRET || process.env.ROBOT_API_SECRET || "",
).trim();

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
  if (!admin) return { ok: false as const, status: 503, error: "Supabase Admin não configurado na Vercel." };

  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { ok: false as const, status: 401, error: "Token de autenticação ausente." };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user)
    return { ok: false as const, status: 401, error: "Sessão inválida ou expirada." };

  const appRole = String(data.user.app_metadata?.role || "").toLowerCase();
  if (appRole === "admin") return { ok: true as const, user: data.user };

  const { data: profile } = await admin
    .from("users")
    .select("role,user_role")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  const role = String(profile?.role || profile?.user_role || "").toLowerCase();
  if (role !== "admin")
    return { ok: false as const, status: 403, error: "Apenas administradores podem operar este robô." };

  return { ok: true as const, user: data.user };
}

async function workerRequest(pathname: string, method: "GET" | "POST") {
  if (!ROBOT_SECRET) {
    return {
      ok: false,
      status: 503,
      payload: {
        ok: false,
        error: "ROBOT_API_SECRET não configurado na Vercel.",
      },
    };
  }

  try {
    const response = await fetch(`${WORKER_URL}/api/worker/${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${ROBOT_SECRET}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(55_000),
    });
    const raw = await response.text();
    let payload: Record<string, any> = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { ok: false, error: raw.slice(0, 500) || "Resposta inválida do worker." };
    }
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      payload: {
        ok: false,
        error: `Worker da Área Restrita indisponível: ${String((error as Error)?.message || error)}`,
      },
    };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  const auth = await verifyAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  if (req.method === "GET") {
    const result = await workerRequest("status", "GET");
    return res.status(result.status).json({
      ...result.payload,
      remoteUrl: WORKER_URL,
    });
  }

  if (req.method === "POST") {
    const action = String(req.body?.action || "sync").toLowerCase();
    if (action !== "sync") return res.status(400).json({ ok: false, error: "Ação inválida." });
    const result = await workerRequest("sync", "POST");
    return res.status(result.status).json({
      ...result.payload,
      remoteUrl: WORKER_URL,
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Método não permitido." });
}
