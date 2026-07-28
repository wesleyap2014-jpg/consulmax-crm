import { createClient } from "@supabase/supabase-js";

const jobId = String(process.env.SYNC_JOB_ID || "").trim();
const administradora = String(process.env.SYNC_ADMINISTRADORA || "").trim().toLowerCase();
const stage = String(process.env.SYNC_FAILURE_STAGE || "Falha no GitHub Actions").trim();
const runId = String(process.env.GITHUB_RUN_ID || "").trim();
const repository = String(process.env.GITHUB_REPOSITORY || "").trim();
const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!jobId) {
  console.log("mark github job failed: sem SYNC_JOB_ID; nada para atualizar");
  process.exit(0);
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error("mark github job failed: Supabase não configurado");
  process.exit(1);
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const finishedAt = new Date().toISOString();
const runUrl = repository && runId
  ? `https://github.com/${repository}/actions/runs/${runId}`
  : null;

const message = `${stage}. O workflow terminou antes de executar o robô. Consulte os logs do GitHub Actions.`;

const update = {
  status: "error",
  current_stage: stage,
  error_message: message,
  finished_at: finishedAt,
  updated_at: finishedAt,
};

if (runId) update.github_run_id = Number(runId) || null;
if (runUrl) update.github_run_url = runUrl;

let query = client
  .from("robot_sync_jobs")
  .update(update)
  .eq("id", jobId)
  .in("status", ["pending", "running"]);

if (administradora === "bb" || administradora === "maggi") {
  query = query.eq("administradora", administradora);
}

const { data, error } = await query.select("id,status,current_stage").maybeSingle();

if (error) {
  console.error(`mark github job failed: ${error.message}`);
  process.exit(1);
}

console.log("mark github job failed:", data || { id: jobId, skipped: true });
