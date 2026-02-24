import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Pega o user (auth) a partir do Authorization: Bearer <token> */
export async function getAuthUser(req: any) {
  const auth = req.headers?.authorization || req.headers?.Authorization;
  const token = typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : null;

  if (!token) return { user: null, token: null };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) return { user: null, token: null };
  return { user: data.user ?? null, token };
}

export function json(res: any, status: number, payload: any) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export function badRequest(res: any, message: string, extra?: any) {
  return json(res, 400, { ok: false, message, ...extra });
}

export function unauthorized(res: any) {
  return json(res, 401, { ok: false, message: "Não autorizado" });
}
