import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export const config = { maxDuration: 60 };

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GITHUB_ACTIONS_TOKEN = process.env.GITHUB_ACTIONS_TOKEN || "";
const GITHUB_ACTIONS_REPOSITORY =
  process.env.GITHUB_ACTIONS_REPOSITORY || "wesleyap2014-jpg/consulmax-crm";
const GITHUB_ACTIONS_REF = process.env.GITHUB_ACTIONS_REF || "main";
const GITHUB_API_VERSION = "2026-03-10";
const WORKFLOW_FILE = "area-restrita-maggi-github-poc.yml";
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

const ACTIVE_STATES = new Set([
  "queued",
  "starting",
  "waiting_cloudflare",
  "waiting_price_tables",
  "submitting_login",
  "price_tables_syncing",
  "assembly_results_syncing",
  "price_tables_found",
  "opening_documents",
  "opening_price_tables",
]);

async function verifyAdmin(req: VercelRequest) {
  if (!admin)
    return {
      ok: false as const,
      status: 503,
      error: "Supabase Admin não configurado na Vercel.",
    };

  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token)
    return {
      ok: false as const,
      status: 401,
      error: "Token de autenticação ausente.",
    };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user)
    return {
      ok: false as const,
      status: 401,
      error: "Sessão inválida ou expirada.",
    };

  const appRole = String(data.user.app_metadata?.role || "").toLowerCase();
  if (appRole === "admin") return { ok: true as const, user: data.user };

  const { data: profile } = await admin
    .from("users")
    .select("role,user_role")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  const role = String(profile?.role || profile?.user_role || "").toLowerCase();
  if (role !== "admin")
    return {
      ok: false as const,
      status: 403,
      error: "Apenas administradores podem operar este robô.",
    };

  return { ok: true as const, user: data.user };
}

function githubDispatchUrl() {
  const parts = GITHUB_ACTIONS_REPOSITORY.split("/");
  if (parts.length !== 2 || parts.some((part) => !part.trim())) {
    throw new Error(
      "GITHUB_ACTIONS_REPOSITORY inválido. Use proprietario/repositorio.",
    );
  }
  const [owner, repository] = parts;
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/${encodeURIComponent(WORKFLOW_FILE)}/dispatches`;
}

async function loadRuntimeSession() {
  if (!admin) return null;
  const { data, error } = await admin
    .from("area_restrita_runtime_sessions")
    .select("*")
    .eq("key", SESSION_KEY)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function resetRuntimeSession(message: string) {
  if (!admin) throw new Error("Supabase Admin não configurado.");
  const now = new Date().toISOString();
  const { error } = await admin.from("area_restrita_runtime_sessions").upsert(
    {
      key: SESSION_KEY,
      administradora: "maggi",
      state: "queued",
      message,
      remote_url: null,
      github_run_id: null,
      github_run_url: null,
      started_at: now,
      finished_at: null,
      expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      updated_at: now,
    },
    { onConflict: "key" },
  );
  if (error) throw error;
}

async function markDispatchError(message: string) {
  if (!admin) return;
  const now = new Date().toISOString();
  await admin
    .from("area_restrita_runtime_sessions")
    .update({
      state: "error",
      message: message.slice(0, 1500),
      remote_url: null,
      finished_at: now,
      updated_at: now,
    })
    .eq("key", SESSION_KEY);
}

async function dispatchGithubWorkflow() {
  if (!GITHUB_ACTIONS_TOKEN) {
    return {
      dispatched: false,
      reason: "Token do GitHub indisponível; execução seguirá pela fila automática.",
    };
  }

  const response = await fetch(githubDispatchUrl(), {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_ACTIONS_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "consulmax-crm",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
    body: JSON.stringify({ ref: GITHUB_ACTIONS_REF }),
    signal: AbortSignal.timeout(20_000),
  });

  if (response.status === 204) {
    return { dispatched: true, reason: null };
  }

  const raw = await response.text();
  let payload: any = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  const detail = String(payload?.message || raw || "resposta sem detalhes")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);

  return {
    dispatched: false,
    reason: `Disparo direto indisponível (HTTP ${response.status}: ${detail}). A fila automática assumirá a execução.`,
  };
}

function serializeSession(session: Record<string, any> | null) {
  const now = Date.now();
  const expiresAt = session?.expires_at
    ? new Date(session.expires_at).getTime()
    : 0;
  const expired = Boolean(expiresAt && expiresAt <= now);
  const state = expired ? "idle" : String(session?.state || "idle");
  const running = !expired && ACTIVE_STATES.has(state);
  const remoteUrl =
    !expired && running && session?.remote_url
      ? String(session.remote_url)
      : null;

  return {
    ok: true,
    workerOnline: running,
    syncRunning: running,
    syncPid: null,
    remoteUrl,
    githubRunUrl: session?.github_run_url || null,
    startedAt: session?.started_at || null,
    weeklySchedule: {
      enabled: false,
      hour: 8,
      timeZone: "America/Porto_Velho",
      lastWeeklyKey: null,
      next: null,
    },
    status: {
      ok: state !== "error",
      state,
      message:
        session?.message ||
        (state === "idle"
          ? "GitHub Runner pronto para uma nova execução."
          : "Execução em andamento no GitHub Actions."),
      updatedAt: session?.updated_at || null,
      currentUrl: null,
      syncProgress: {},
    },
    manifest: null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  const auth = await verifyAdmin(req);
  if (!auth.ok)
    return res.status(auth.status).json({ ok: false, error: auth.error });

  if (req.method === "GET") {
    try {
      const session = await loadRuntimeSession();
      return res.status(200).json(serializeSession(session));
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: String((error as Error)?.message || error),
      });
    }
  }

  if (req.method === "POST") {
    const action = String(req.body?.action || "sync").toLowerCase();
    if (action !== "sync")
      return res.status(400).json({ ok: false, error: "Ação inválida." });

    try {
      const current = await loadRuntimeSession();
      const currentState = String(current?.state || "idle");
      const currentExpiry = current?.expires_at
        ? new Date(current.expires_at).getTime()
        : 0;
      const active =
        ACTIVE_STATES.has(currentState) &&
        (!currentExpiry || currentExpiry > Date.now());

      if (active) {
        return res.status(409).json({
          ok: true,
          message: "Já existe uma execução da Área Restrita Maggi em andamento.",
          ...serializeSession(current),
        });
      }

      await resetRuntimeSession("Solicitação registrada. Aguardando o GitHub Runner.");
      const dispatch = await dispatchGithubWorkflow();

      if (!dispatch.dispatched && admin) {
        await admin
          .from("area_restrita_runtime_sessions")
          .update({
            message:
              "Solicitação na fila automática. O GitHub Runner verificará a fila em até 5 minutos.",
            updated_at: new Date().toISOString(),
          })
          .eq("key", SESSION_KEY);
      }

      const session = await loadRuntimeSession();
      return res.status(202).json({
        ...serializeSession(session),
        message: dispatch.dispatched
          ? "Robô da Área Restrita Maggi enviado ao GitHub Actions. A tela atualizará automaticamente."
          : "Solicitação registrada. O GitHub Runner iniciará automaticamente em até 5 minutos.",
        dispatchMode: dispatch.dispatched ? "direct" : "queue",
      });
    } catch (error) {
      const message = String((error as Error)?.message || error);
      await markDispatchError(message);
      return res.status(502).json({
        ok: false,
        error: message,
      });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Método não permitido." });
}
