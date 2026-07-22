// api/robots/sync-groups.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

type AdminKey = "bb" | "maggi";
type JobMode = "full" | "segment" | "assemblies";

type RobotResult = {
  ok: boolean;
  status: "not_configured" | "ready" | "queued" | "synced" | "error";
  administradora: AdminKey;
  message: string;
  found?: number;
  created?: number;
  updated?: number;
  deactivated?: number;
  details?: Record<string, any>;
};

export const config = {
  maxDuration: 60,
};

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GITHUB_ACTIONS_TOKEN = process.env.GITHUB_ACTIONS_TOKEN || "";
const GITHUB_ACTIONS_REPOSITORY =
  process.env.GITHUB_ACTIONS_REPOSITORY || "wesleyap2014-jpg/consulmax-crm";
const GITHUB_ACTIONS_REF = process.env.GITHUB_ACTIONS_REF || "main";
const GITHUB_API_VERSION = "2026-03-10";

const ADMIN_WORKFLOWS: Record<AdminKey, string> = {
  bb: "sync-bb-consorcios.yml",
  maggi: "sync-maggi-consorcios.yml",
};

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

const ADMIN_SEGMENTS: Record<AdminKey, Set<string>> = {
  bb: new Set([
    "auto_ipca",
    "auto_fipe",
    "outros_bens",
    "pesados",
    "motocicleta",
    "imoveis",
  ]),
  maggi: new Set(["automoveis", "imoveis"]),
};

function parseBody(req: VercelRequest) {
  if (typeof req.body === "string" && req.body.length)
    return JSON.parse(req.body);
  return req.body || {};
}

function allowedAdmin(value: unknown): AdminKey | null {
  const key = String(value || "").toLowerCase();
  if (key === "bb" || key === "maggi") return key;
  return null;
}

async function verifyUser(req: VercelRequest) {
  if (!admin) throw new Error("Supabase Admin não configurado na Vercel.");

  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { ok: false, error: "Token de autenticação ausente." };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user)
    return { ok: false, error: "Sessão inválida ou expirada." };

  const role = String(data.user.app_metadata?.role || "").toLowerCase();
  if (role === "admin") return { ok: true, user: data.user };

  const { data: profile } = await admin
    .from("users")
    .select("role,user_role,email,nome")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  const profileRole = String(
    profile?.role || profile?.user_role || "",
  ).toLowerCase();
  if (profileRole !== "admin")
    return { ok: false, error: "Apenas Admin pode executar robôs." };

  return { ok: true, user: data.user };
}

function isBBAssemblyRequest(options: Record<string, any>) {
  const tipo = String(options.tipo || options.mode || "").toLowerCase();
  return (
    tipo === "assembleia" ||
    tipo === "assemblies" ||
    tipo === "assembly" ||
    tipo === "resultado_assembleia"
  );
}

function requestedJob(administradora: AdminKey, options: Record<string, any>) {
  if (administradora === "bb" && isBBAssemblyRequest(options)) {
    return { mode: "assemblies" as JobMode, segment: null };
  }

  const rawSegment =
    options.segmento ||
    options.segment ||
    (administradora === "bb" ? options.bbSegmento : options.maggiSegmento);
  const segment = rawSegment ? String(rawSegment).trim().toLowerCase() : null;
  return {
    mode: segment ? ("segment" as JobMode) : ("full" as JobMode),
    segment,
  };
}

function emptyProgress(administradora: AdminKey) {
  return administradora === "bb"
    ? {
        segments: {},
        assemblies: {
          total: 0,
          done: 0,
          success: 0,
          error: 0,
          currentGroup: "",
          errors: [],
        },
      }
    : { segments: {} };
}

async function enqueueJob(
  administradora: AdminKey,
  options: Record<string, any>,
  requestedBy: string,
): Promise<RobotResult> {
  if (!admin) throw new Error("Supabase Admin não configurado na Vercel.");

  const { mode, segment } = requestedJob(administradora, options);
  if (
    mode === "segment" &&
    !ADMIN_SEGMENTS[administradora].has(segment || "")
  ) {
    return {
      ok: false,
      status: "error",
      administradora,
      message: `Segmento ${administradora.toUpperCase()} inválido.`,
      details: { allowed_segments: Array.from(ADMIN_SEGMENTS[administradora]) },
    };
  }

  const { data: activeJob, error: activeError } = await admin
    .from("robot_sync_jobs")
    .select("*")
    .eq("administradora", administradora)
    .in("status", ["pending", "running"])
    .order("requested_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (activeError) throw activeError;

  if (activeJob) {
    return {
      ok: true,
      status: "queued",
      administradora,
      message:
        activeJob.status === "running"
          ? `Já existe uma sincronização ${administradora.toUpperCase()} em andamento no GitHub Actions.`
          : `Já existe uma sincronização ${administradora.toUpperCase()} aguardando o GitHub Actions.`,
      details: { job_id: activeJob.id, job: activeJob, reused: true },
    };
  }

  const { data: job, error } = await admin
    .from("robot_sync_jobs")
    .insert({
      administradora,
      mode,
      segment,
      source: "manual",
      status: "pending",
      requested_by: requestedBy,
      current_stage: "Aguardando GitHub Actions",
      progress: emptyProgress(administradora),
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505")
      return enqueueJob(administradora, options, requestedBy);
    throw error;
  }

  return {
    ok: true,
    status: "queued",
    administradora,
    message: `Sincronização ${administradora.toUpperCase()} adicionada à fila do GitHub Actions. O início pode levar alguns minutos.`,
    details: { job_id: job.id, job },
  };
}

function githubDispatchUrl(administradora: AdminKey) {
  const parts = GITHUB_ACTIONS_REPOSITORY.split("/");
  if (parts.length !== 2 || parts.some((part) => !part.trim())) {
    throw new Error(
      "GITHUB_ACTIONS_REPOSITORY inválido. Use o formato proprietario/repositorio.",
    );
  }

  const [owner, repository] = parts;
  const workflow = ADMIN_WORKFLOWS[administradora];
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
}

function githubErrorMessage(status: number, payload: any, raw: string) {
  const message = String(payload?.message || raw || "resposta sem detalhes")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
  return `GitHub Actions recusou o disparo (HTTP ${status}): ${message}`;
}

async function dispatchGithubWorkflow(
  administradora: AdminKey,
  job: Record<string, any>,
) {
  const inputs: Record<string, string> = {
    mode: String(job.mode || "full"),
    job_id: String(job.id),
  };
  if (job.segment) inputs.segment = String(job.segment);

  const response = await fetch(githubDispatchUrl(administradora), {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_ACTIONS_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "consulmax-crm",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
    body: JSON.stringify({ ref: GITHUB_ACTIONS_REF, inputs }),
  });

  const raw = await response.text();
  let payload: any = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(githubErrorMessage(response.status, payload, raw));
  }

  const runId = Number(payload?.workflow_run_id || 0) || null;
  const runUrl = String(payload?.html_url || "") || null;
  const dispatchedAt = new Date().toISOString();
  const update: Record<string, any> = {
    current_stage: "GitHub Actions acionado",
    updated_at: dispatchedAt,
  };
  if (runId) update.github_run_id = runId;
  if (runUrl) update.github_run_url = runUrl;

  // O workflow pode assumir o trabalho antes desta atualização terminar.
  // Nesse caso, preservamos o status mais novo gravado pelo próprio worker.
  const { data: updatedJob, error: updateError } = await admin!
    .from("robot_sync_jobs")
    .update(update)
    .eq("id", job.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (updateError) {
    console.error("Falha ao registrar metadados do disparo GitHub:", {
      jobId: job.id,
      message: updateError.message,
    });
  }

  return {
    job: updatedJob || { ...job, ...update },
    run_id: runId,
    run_url: runUrl,
    dispatched_at: dispatchedAt,
  };
}

async function markDispatchFailure(jobId: string, message: string) {
  if (!admin) return;
  const finishedAt = new Date().toISOString();
  await admin
    .from("robot_sync_jobs")
    .update({
      status: "error",
      finished_at: finishedAt,
      updated_at: finishedAt,
      current_stage: "Falha ao acionar GitHub Actions",
      error_message: message.slice(0, 1500),
    })
    .eq("id", jobId)
    .eq("status", "pending");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const auth = await verifyUser(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const body = parseBody(req);
    const administradora = allowedAdmin(body?.administradora);
    if (!administradora)
      return res.status(400).json({
        ok: false,
        error: "Administradora inválida. Use bb ou maggi.",
      });

    if (!GITHUB_ACTIONS_TOKEN) {
      return res.status(503).json({
        ok: false,
        status: "not_configured",
        administradora,
        error:
          "Disparo imediato não configurado. Adicione GITHUB_ACTIONS_TOKEN às variáveis da Vercel.",
      });
    }

    const result = await enqueueJob(
      administradora,
      body || {},
      auth.user?.id || "",
    );

    const job = result.details?.job;
    if (result.status === "queued" && job?.status === "pending") {
      try {
        const dispatch = await dispatchGithubWorkflow(administradora, job);
        result.message = `Sincronização ${administradora.toUpperCase()} acionada no GitHub Actions. A execução começará assim que o GitHub disponibilizar a máquina.`;
        result.details = {
          ...result.details,
          job: dispatch.job,
          github_dispatch: {
            run_id: dispatch.run_id,
            run_url: dispatch.run_url,
            dispatched_at: dispatch.dispatched_at,
          },
        };
      } catch (dispatchError: any) {
        const message =
          dispatchError?.message || "Falha ao acionar o GitHub Actions.";
        await markDispatchFailure(String(job.id), message);
        return res.status(502).json({
          ok: false,
          status: "error",
          administradora,
          error: message,
          details: { job_id: job.id },
        });
      }
    }

    const status =
      result.status === "queued" ? 202 : result.status === "error" ? 400 : 200;
    return res.status(status).json(result);
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      status: "error",
      error: err?.message || "Erro interno ao executar robô.",
    });
  }
}
