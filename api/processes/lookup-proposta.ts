import { supabaseAdmin, getAuthUser, json, badRequest, unauthorized } from "./_supabase";

export default async function handler(req: any, res: any) {
  const { user } = await getAuthUser(req);
  if (!user) return unauthorized(res);

  if (req.method !== "POST") return json(res, 405, { ok: false, message: "Método não suportado" });

  let body: any = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return badRequest(res, "Body inválido (JSON)");
  }

  const proposta = String(body?.proposta || "").trim();
  if (!proposta) return badRequest(res, "proposta é obrigatório");

  const { data: venda, error } = await supabaseAdmin
    .from("vendas")
    .select("id, lead_id, numero_proposta, grupo, cota, segmento, produto, administradora, created_at")
    .eq("numero_proposta", proposta)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return json(res, 500, { ok: false, message: error.message });
  if (!venda) return json(res, 200, { ok: true, found: false });

  let cliente_nome: string | null = null;
  let cliente_id: string | null = null;
  let lead_id: string | null = venda.lead_id ?? null;

  if (lead_id) {
    // tenta clientes primeiro
    const { data: cli } = await supabaseAdmin
      .from("clientes")
      .select("id, nome")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cli?.nome) {
      cliente_nome = cli.nome;
      cliente_id = cli.id;
    } else {
      const { data: ld } = await supabaseAdmin
        .from("leads")
        .select("id, nome")
        .eq("id", lead_id)
        .maybeSingle();

      if (ld?.nome) cliente_nome = ld.nome;
    }
  }

  return json(res, 200, {
    ok: true,
    found: true,
    data: {
      proposta,
      grupo: venda.grupo ?? null,
      cota: venda.cota ?? null,
      segmento: venda.segmento ?? null,
      administradora: venda.administradora ?? null,
      cliente_nome,
      lead_id,
      cliente_id,
    },
  });
}
