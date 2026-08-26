import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ ok: false });
  res.setHeader("Cache-Control", "no-store");
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const recordingBucket = process.env.RECORDING_S3_BUCKET || process.env.SUPABASE_S3_BUCKET || "recordings";
  const checks = {
    livekit: Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && (process.env.LIVEKIT_WS_URL || process.env.LIVEKIT_URL)),
    openai: Boolean(process.env.OPENAI_API_KEY),
    recording: Boolean(
      (process.env.RECORDING_S3_ACCESS_KEY || process.env.RECORDING_S3_ACCESS_KEY_ID || process.env.SUPABASE_S3_ACCESS_KEY || process.env.SUPABASE_S3_ACCESS_KEY_ID) &&
      (process.env.RECORDING_S3_SECRET_KEY || process.env.RECORDING_S3_SECRET_ACCESS_KEY || process.env.SUPABASE_S3_SECRET_KEY || process.env.SUPABASE_S3_SECRET_ACCESS_KEY) &&
      (process.env.RECORDING_S3_ENDPOINT || process.env.SUPABASE_S3_ENDPOINT || supabaseUrl) &&
      recordingBucket
    ),
    database: false,
  };
  try {
    const { error } = await supabaseAdmin.from("meeting_ai_reports").select("id", { head: true, count: "exact" }).limit(1);
    checks.database = !error;
  } catch {}
  return res.status(checks.livekit && checks.openai && checks.recording && checks.database ? 200 : 503).json({ ok: Object.values(checks).every(Boolean), checks });
}
