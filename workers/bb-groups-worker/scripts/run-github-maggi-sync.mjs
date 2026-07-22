import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

const SEGMENTS = ["automoveis", "imoveis"];
const REQUIRED_ACTION_ENVS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MAGGI_AVAILABLE_GROUPS_PORTAL_URL",
  "MAGGI_AVAILABLE_GROUPS_USERNAME",
  "MAGGI_AVAILABLE_GROUPS_PASSWORD",
];
const missingActionEnvs = REQUIRED_ACTION_ENVS.filter(
  (name) => !process.env[name],
);
if (missingActionEnvs.length) {
  console.log(
    `[maggi-github-sync] Configuração pendente no GitHub Actions: ${missingActionEnvs.join(", ")}.`,
  );
  process.exit(0);
}

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const SYNC_TRIGGER = String(process.env.SYNC_TRIGGER || "queue").toLowerCase();
const SYNC_MODE = String(process.env.SYNC_MODE || "full").toLowerCase();
const SYNC_SEGMENT = String(process.env.SYNC_SEGMENT || "").toLowerCase();
const LOCAL_PORT = Number(process.env.LOCAL_WORKER_PORT || 3031);
const LOCAL_SECRET = `github-maggi-${randomUUID()}`;
const LOCAL_URL = `http://127.0.0.1:${LOCAL_PORT}`;
const GITHUB_RUN_ID = Number(process.env.GITHUB_RUN_ID || 0) || null;
const GITHUB_RUN_URL =
  process.env.GITHUB_SERVER_URL &&
  process.env.GITHUB_REPOSITORY &&
  GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : null;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

function errorText(error) {
  return String(error?.message || error || "Erro desconhecido").slice(0, 1500);
}

function log(message, details) {
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.log(
    `[maggi-github-sync] ${new Date().toISOString()} ${message}${suffix}`,
  );
}

function emptyProgress(segments = SEGMENTS) {
  return {
    segments: Object.fromEntries(
      segments.map((segment) => [
        segment,
        { status: "pending", message: "Aguardando" },
      ]),
    ),
  };
}

async function findActiveJob() {
  const { data, error } = await supabase
    .from("robot_sync_jobs")
    .select("*")
    .eq("administradora", "maggi")
    .in("status", ["pending", "running"])
    .order("requested_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function claimQueuedJob() {
  const candidate = await findActiveJob();
  if (!candidate || candidate.status !== "pending") return null;

  const startedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("robot_sync_jobs")
    .update({
      status: "running",
      started_at: startedAt,
      updated_at: startedAt,
      current_stage: "Preparando GitHub Actions",
      github_run_id: GITHUB_RUN_ID,
      github_run_url: GITHUB_RUN_URL,
    })
    .eq("id", candidate.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function createTriggeredJob() {
  const active = await findActiveJob();
  if (active) {
    log("execução ignorada porque já existe um trabalho Maggi ativo", {
      jobId: active.id,
      status: active.status,
      mode: active.mode,
    });
    return null;
  }

  const mode = SYNC_MODE === "segment" ? "segment" : "full";
  const segment = mode === "segment" ? SYNC_SEGMENT : null;
  if (mode === "segment" && !SEGMENTS.includes(segment)) {
    throw new Error(
      `Segmento inválido para workflow_dispatch: ${segment || "não informado"}.`,
    );
  }

  const startedAt = new Date().toISOString();
  const source = SYNC_TRIGGER === "cron" ? "cron" : "github";
  const selectedSegments = mode === "segment" ? [segment] : SEGMENTS;
  const { data, error } = await supabase
    .from("robot_sync_jobs")
    .insert({
      administradora: "maggi",
      mode,
      segment,
      source,
      status: "running",
      requested_at: startedAt,
      started_at: startedAt,
      updated_at: startedAt,
      current_stage: "Preparando GitHub Actions",
      progress: emptyProgress(selectedSegments),
      github_run_id: GITHUB_RUN_ID,
      github_run_url: GITHUB_RUN_URL,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function resolveJob() {
  if (SYNC_TRIGGER === "queue") return claimQueuedJob();
  return createTriggeredJob();
}

async function updateJob(jobId, values) {
  const { error } = await supabase
    .from("robot_sync_jobs")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", jobId);

  if (error) throw error;
}

function startWorker() {
  log("iniciando worker Playwright local");
  const child = spawn(process.execPath, ["dist/index.js"], {
    env: {
      ...process.env,
      PORT: String(LOCAL_PORT),
      ROBOT_API_SECRET: LOCAL_SECRET,
      PLAYWRIGHT_HEADLESS: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

async function waitForWorker(child) {
  for (let attempt = 1; attempt <= 40; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(
        `Worker local encerrou antes de ficar disponível (código ${child.exitCode}).`,
      );
    }

    try {
      const response = await fetch(`${LOCAL_URL}/health`);
      if (response.ok) return;
    } catch {
      // O servidor ainda está inicializando.
    }
    await delay(500);
  }

  throw new Error(
    "Worker local não ficou disponível dentro do tempo esperado.",
  );
}

async function stopWorker(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(5000),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function callWorker(segments) {
  const response = await fetch(`${LOCAL_URL}/sync/maggi/available-groups`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOCAL_SECRET}`,
    },
    body: JSON.stringify({ segments }),
  });

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = { raw: raw.slice(0, 1000) };
  }

  if (!response.ok || data?.ok === false) {
    const stage = data?.stage ? ` [etapa: ${data.stage}]` : "";
    throw new Error(
      `${data?.error || data?.message || `Worker retornou HTTP ${response.status}.`}${stage}`,
    );
  }

  return data || {};
}

function markSegments(progress, segments, status, message) {
  progress.segments ||= {};
  for (const segment of segments) {
    progress.segments[segment] = { status, message };
  }
}

function applyResult(progress, segments, result) {
  const details = Array.isArray(result?.details?.readDetails)
    ? result.details.readDetails
    : [];
  for (const segment of segments) {
    const item = details.find((detail) => detail.segmento === segment) || {};
    progress.segments[segment] = {
      status: "done",
      found: Number(item.grupos || item.linhas || 0),
      rawRows: Number(item.linhas || 0),
      message: "Segmento concluído.",
    };
  }
}

async function recordAutomaticSuccess(job, summary, finishedAt) {
  if (job.source !== "cron" || job.mode !== "full") return;

  const { error } = await supabase.from("robot_sync_status").upsert(
    {
      key: "maggi_groups_cron",
      administradora: "maggi",
      process: "groups",
      source: "cron",
      last_success_at: finishedAt,
      summary: {
        ...summary,
        startedAt: job.started_at,
        finishedAt,
        execution: "github_actions",
        githubRunId: GITHUB_RUN_ID,
        githubRunUrl: GITHUB_RUN_URL,
      },
      updated_at: finishedAt,
    },
    { onConflict: "key" },
  );

  if (error) throw error;
}

async function executeJob(job) {
  const segments = job.mode === "segment" ? [job.segment] : SEGMENTS;
  const progress =
    job.progress && typeof job.progress === "object"
      ? job.progress
      : emptyProgress(segments);
  let child = null;

  try {
    markSegments(progress, segments, "running", "Sincronizando grupos...");
    await updateJob(job.id, {
      current_stage: "Sincronizando grupos Maggi",
      current_item: segments.join(", "),
      progress,
    });

    child = startWorker();
    await waitForWorker(child);
    const result = await callWorker(segments);
    applyResult(progress, segments, result);

    const summary = {
      mode: job.mode,
      segment: job.segment,
      segmentsSuccess: segments.length,
      segmentsError: 0,
      groupsFound: Number(result.found || 0),
      created: Number(result.created || 0),
      updated: Number(result.updated || 0),
      deactivated: Number(result.deactivated || 0),
    };
    const finishedAt = new Date().toISOString();

    await recordAutomaticSuccess(job, summary, finishedAt);
    await updateJob(job.id, {
      status: "success",
      finished_at: finishedAt,
      current_stage: "Sincronização concluída",
      current_item: "",
      progress,
      summary,
      error_message: null,
    });

    log("execução concluída", { jobId: job.id, ...summary });
  } catch (error) {
    const message = errorText(error);
    markSegments(progress, segments, "error", message);
    log("falha na sincronização", { jobId: job.id, error: message });
    await updateJob(job.id, {
      status: "error",
      finished_at: new Date().toISOString(),
      current_stage: "Falha na sincronização",
      current_item: "",
      progress,
      error_message: message,
    }).catch((updateError) =>
      log("falha ao atualizar trabalho", { error: errorText(updateError) }),
    );
    process.exitCode = 1;
  } finally {
    await stopWorker(child);
  }
}

const job = await resolveJob();
if (!job) {
  log("nenhum trabalho disponível para esta execução", {
    trigger: SYNC_TRIGGER,
  });
} else {
  log("trabalho iniciado", {
    jobId: job.id,
    mode: job.mode,
    source: job.source,
  });
  await executeJob(job);
}
