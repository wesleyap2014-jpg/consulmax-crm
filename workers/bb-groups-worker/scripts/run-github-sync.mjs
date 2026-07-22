import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

const SEGMENTS = [
  "auto_ipca",
  "auto_fipe",
  "outros_bens",
  "pesados",
  "motocicleta",
  "imoveis",
];

const REQUIRED_ACTION_ENVS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BB_ROBOT_PORTAL_URL",
  "BB_ROBOT_USERNAME",
  "BB_ROBOT_PASSWORD",
];
const missingActionEnvs = REQUIRED_ACTION_ENVS.filter((name) => !process.env[name]);
if (missingActionEnvs.length) {
  console.log(`[bb-github-sync] Configuração pendente no GitHub Actions: ${missingActionEnvs.join(", ")}.`);
  process.exit(0);
}

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const SYNC_TRIGGER = String(process.env.SYNC_TRIGGER || "queue").toLowerCase();
const SYNC_MODE = String(process.env.SYNC_MODE || "full").toLowerCase();
const SYNC_SEGMENT = String(process.env.SYNC_SEGMENT || "").toLowerCase();
const SYNC_JOB_ID = String(process.env.SYNC_JOB_ID || "").trim();
const LOCAL_PORT = Number(process.env.LOCAL_WORKER_PORT || 3030);
const LOCAL_SECRET = `github-${randomUUID()}`;
const LOCAL_URL = `http://127.0.0.1:${LOCAL_PORT}`;
const GITHUB_RUN_ID = Number(process.env.GITHUB_RUN_ID || 0) || null;
const GITHUB_RUN_URL = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
  : null;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
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
  console.log(`[bb-github-sync] ${new Date().toISOString()} ${message}${suffix}`);
}

function emptyProgress() {
  return {
    segments: {},
    assemblies: {
      total: 0,
      done: 0,
      success: 0,
      error: 0,
      currentGroup: "",
      errors: [],
    },
  };
}

async function findActiveJob(jobId = "") {
  let query = supabase
    .from("robot_sync_jobs")
    .select("*")
    .eq("administradora", "bb")
    .in("status", ["pending", "running"]);

  query = jobId
    ? query.eq("id", jobId)
    : query.order("requested_at", { ascending: true }).limit(1);

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data || null;
}

async function claimQueuedJob() {
  const candidate = await findActiveJob(SYNC_JOB_ID);
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
    log("execução ignorada porque já existe um trabalho BB ativo", {
      jobId: active.id,
      status: active.status,
      mode: active.mode,
    });
    return null;
  }

  const mode = ["full", "segment", "assemblies"].includes(SYNC_MODE) ? SYNC_MODE : "full";
  const segment = mode === "segment" ? SYNC_SEGMENT : null;
  if (mode === "segment" && !SEGMENTS.includes(segment)) {
    throw new Error(`Segmento inválido para workflow_dispatch: ${segment || "não informado"}.`);
  }

  const startedAt = new Date().toISOString();
  const source = SYNC_TRIGGER === "cron" ? "cron" : "github";
  const { data, error } = await supabase
    .from("robot_sync_jobs")
    .insert({
      administradora: "bb",
      mode,
      segment,
      source,
      status: "running",
      requested_at: startedAt,
      started_at: startedAt,
      updated_at: startedAt,
      current_stage: "Preparando GitHub Actions",
      progress: emptyProgress(),
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
      throw new Error(`Worker local encerrou antes de ficar disponível (código ${child.exitCode}).`);
    }

    try {
      const response = await fetch(`${LOCAL_URL}/health`);
      if (response.ok) return;
    } catch {
      // O servidor ainda está inicializando.
    }
    await delay(500);
  }

  throw new Error("Worker local não ficou disponível dentro do tempo esperado.");
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

async function callWorker(path, body) {
  const response = await fetch(`${LOCAL_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOCAL_SECRET}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = { raw: raw.slice(0, 1000) };
  }

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || data?.message || `Worker retornou HTTP ${response.status}.`);
  }

  return data || {};
}

async function runSegment(job, progress, segment) {
  progress.segments[segment] = { status: "running", message: "Sincronizando grupos..." };
  await updateJob(job.id, {
    current_stage: "Sincronizando grupos BB",
    current_item: segment,
    progress,
  });

  try {
    const result = await callWorker("/sync/bb/groups", { segmento: segment });
    progress.segments[segment] = {
      status: "done",
      found: Number(result.found || 0),
      created: Number(result.created || 0),
      updated: Number(result.updated || 0),
      deactivated: Number(result.deactivated || 0),
      rawRows: Number(result.details?.raw_rows || 0),
      readDetails: Array.isArray(result.details?.readDetails) ? result.details.readDetails : [],
      message: result.message || "Segmento concluído.",
    };
    await updateJob(job.id, { progress });
    return { ok: true, result };
  } catch (error) {
    const message = errorText(error);
    progress.segments[segment] = { status: "error", message };
    await updateJob(job.id, { progress });
    return { ok: false, error: message };
  }
}

async function activeGroups() {
  const { data, error } = await supabase
    .from("sim_bb_groups")
    .select("grupo")
    .eq("is_active", true)
    .order("grupo", { ascending: true });

  if (error) throw error;
  return Array.from(new Set((data || [])
    .map((row) => String(row.grupo || "").trim())
    .filter((group) => group && group !== "000000")));
}

async function runAssemblies(job, progress) {
  const groups = await activeGroups();
  progress.assemblies = {
    total: groups.length,
    done: 0,
    success: 0,
    error: 0,
    currentGroup: "",
    errors: [],
  };
  await updateJob(job.id, {
    current_stage: "Sincronizando assembleias BB",
    current_item: "",
    progress,
  });

  for (const group of groups) {
    progress.assemblies.currentGroup = group;
    await updateJob(job.id, { current_item: group, progress });

    try {
      await callWorker("/sync/bb/assembly-result", { grupo: group });
      progress.assemblies.success += 1;
    } catch (error) {
      const message = `Grupo ${group}: ${errorText(error)}`;
      progress.assemblies.error += 1;
      progress.assemblies.errors = [message, ...progress.assemblies.errors].slice(0, 10);
    }

    progress.assemblies.done += 1;
    await updateJob(job.id, { progress });
  }

  progress.assemblies.currentGroup = "";
  await updateJob(job.id, { current_item: "", progress });
}

function summarize(job, progress) {
  const segmentResults = Object.values(progress.segments || {});
  const segmentsSuccess = segmentResults.filter((item) => item.status === "done").length;
  const segmentsError = segmentResults.filter((item) => item.status === "error").length;
  const groupsFound = segmentResults.reduce((total, item) => total + Number(item.found || 0), 0);
  const assemblies = progress.assemblies || {};
  const failures = segmentsError + Number(assemblies.error || 0);
  const successes = segmentsSuccess + Number(assemblies.success || 0);

  return {
    mode: job.mode,
    segment: job.segment,
    segmentsSuccess,
    segmentsError,
    groupsFound,
    assembliesTotal: Number(assemblies.total || 0),
    assembliesSuccess: Number(assemblies.success || 0),
    assembliesError: Number(assemblies.error || 0),
    failures,
    successes,
  };
}

async function recordAutomaticSuccess(job, summary, finishedAt) {
  if (job.source !== "cron" || job.mode !== "full" || summary.failures > 0) return;

  const { error } = await supabase.from("robot_sync_status").upsert({
    key: "bb_groups_cron",
    administradora: "bb",
    process: "groups_and_assemblies",
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
  }, { onConflict: "key" });

  if (error) throw error;
}

async function executeJob(job) {
  const progress = job.progress && typeof job.progress === "object" ? job.progress : emptyProgress();
  progress.segments ||= {};
  progress.assemblies ||= emptyProgress().assemblies;
  let child = null;

  try {
    child = startWorker();
    await waitForWorker(child);

    const segments = job.mode === "full" ? SEGMENTS : job.mode === "segment" ? [job.segment] : [];
    for (const segment of segments) {
      await runSegment(job, progress, segment);
    }

    if (job.mode === "full" || job.mode === "assemblies") {
      await runAssemblies(job, progress);
    }

    const summary = summarize(job, progress);
    const finishedAt = new Date().toISOString();
    const status = summary.failures === 0
      ? "success"
      : summary.successes > 0
        ? "partial_error"
        : "error";
    const errorMessage = status === "success"
      ? null
      : `${summary.failures} etapa(s) terminaram com erro. Consulte o progresso e os logs do GitHub Actions.`;

    await recordAutomaticSuccess(job, summary, finishedAt);
    await updateJob(job.id, {
      status,
      finished_at: finishedAt,
      current_stage: status === "success" ? "Sincronização concluída" : "Sincronização concluída com erros",
      current_item: "",
      progress,
      summary,
      error_message: errorMessage,
    });

    log("execução concluída", { jobId: job.id, status, ...summary });
    if (status !== "success") process.exitCode = 1;
  } catch (error) {
    const message = errorText(error);
    log("falha fatal", { jobId: job.id, error: message });
    await updateJob(job.id, {
      status: "error",
      finished_at: new Date().toISOString(),
      current_stage: "Falha na sincronização",
      current_item: "",
      progress,
      error_message: message,
    }).catch((updateError) => log("falha ao atualizar trabalho", { error: errorText(updateError) }));
    process.exitCode = 1;
  } finally {
    await stopWorker(child);
  }
}

const job = await resolveJob();
if (!job) {
  log("nenhum trabalho disponível para esta execução", { trigger: SYNC_TRIGGER });
} else {
  log("trabalho iniciado", { jobId: job.id, mode: job.mode, source: job.source });
  await executeJob(job);
}
