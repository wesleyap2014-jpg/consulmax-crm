// api/users/create.ts
import { createClient } from "@supabase/supabase-js";

// --------------- helpers ---------------
function tempPassword(len = 12) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXZabcdefghiijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from({ length: len })
    .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
    .join("");
}

function parseBody(req: any) {
  try {
    if (!req || req.body == null) return {};
    if (typeof req.body === "string") return JSON.parse(req.body);
    // Em funções Node da Vercel o JSON já chega como objeto quando header está correto.
    return req.body;
  } catch (e) {
    return {}; // evita crash
  }
}

// --------------- env ---------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("ENV faltando:", { SUPABASE_URL: !!SUPABASE_URL, SERVICE_ROLE: !!SERVICE_ROLE });
}

// Cliente admin (service role)
const admin = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --------------- handler ---------------
export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Segurança mínima (se precisar liberar para outro domínio, ajuste)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return res.status(500).json({ error: "Missing SUPABASE_URL or SERVICE_ROLE" });
    }

    const body = parseBody(req);
    const {
      email,
      nome,
      role = "viewer",
      phone,
      cep,
      logradouro,
      numero,
      bairro,
      cidade,
      uf,
      pix_type: rawPixType,
      pix_key: rawPixKey,
    } = body || {};

    if (!email || !nome) {
      return res.status(400).json({ error: "Informe email e nome." });
    }

    // Normaliza PIX
    let pix_type: "cpf" | "email" | "telefone" | null = null;
    let pix_key: string | null = null;
    const allowed = ["cpf", "email", "telefone"];
    if (typeof rawPixType === "string") {
      const norm = rawPixType.toLowerCase().trim();
      if (allowed.includes(norm)) {
        pix_type = norm as any;
        pix_key = (rawPixKey ?? "").toString().trim() || null;
      }
    }

    // 1) cria usuário no Auth com senha temporária (ou pode optar por sendInvite)
    const password = tempPassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { nome, role },
    });
    if (createErr) {
      console.error("auth.admin.createUser error:", createErr);
      return res.status(400).json({ error: createErr.message });
    }

    const auth_user_id = created.user?.id;
    if (!auth_user_id) {
      return res.status(500).json({ error: "Falha ao obter auth_user_id" });
    }

    // 2) upsert no seu perfil (tabela public.users)
    const { error: upsertErr } = await admin
      .from("users")
      .upsert(
        {
          auth_user_id,
          email,
          nome,
          role,
          phone: phone ?? null,
          cep: cep ?? null,
          logradouro: logradouro ?? null,
          numero: numero ?? null,
          bairro: bairro ?? null,
          cidade: cidade ?? null,
          uf: uf ?? null,
          pix_type, // só vai com valor permitido; caso contrário fica null e não bate no CHECK
          pix_key,
        },
        { onConflict: "auth_user_id" }
      );
    if (upsertErr) {
      console.error("upsert users error:", upsertErr);
      return res.status(400).json({ error: upsertErr.message });
    }

    // Se quiser obrigar troca de senha no primeiro login, guarde uma flag de "must_reset" na tabela users
    // e trate no app; ou use password recovery por e-mail aqui, se tiver provider de e-mail configurado.

    return res.status(200).json({ ok: true, auth_user_id, temp_password: password });
  } catch (err: any) {
    console.error("create-user handler crash:", err);
    return res.status(500).json({ error: err?.message || "Internal error" });
  }
}
