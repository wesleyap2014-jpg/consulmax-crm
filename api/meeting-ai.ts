import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "crypto";
import { supabaseAdmin } from "./_supabase";
import { eventModerator, parseBody } from "./_livekit-server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-transcribe";
const MEETING_MODEL = process.env.OPENAI_MEETING_MODEL || "gpt-5.6-luna";

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function outputText(data: any) {
  if (typeof data?.output_text === "string") return data.output_text;
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if ((content?.type === "output_text" || content?.type === "text") && typeof content?.text === "string") return content.text;
    }
  }
  return "";
}

async function responsesJson(name: string, schema: any, instructions: string, input: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MEETING_MODEL,
      store: false,
      instructions,
      input,
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`OpenAI Responses: ${response.status} ${raw.slice(0, 1000)}`);
  const parsed = raw ? JSON.parse(raw) : {};
  const text = outputText(parsed);
  if (!text) throw new Error("A OpenAI não retornou texto estruturado.");
  return JSON.parse(text);
}

async function transcriptText(eventId: string, limit = 160) {
  const { data, error } = await supabaseAdmin
    .from("meeting_transcripts")
    .select("participant_name,participant_role,transcript_text,created_at")
    .eq("agenda_evento_id", eventId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []).reverse().map((x: any) => `[${x.participant_role}] ${x.participant_name || "Participante"}: ${x.transcript_text}`).join("\n");
}

async function meetingContext(event: any) {
  const parts: string[] = [];
  parts.push(`Título: ${event.titulo || "Reunião"}`);
  parts.push(`Tipo de análise: ${event.ai_mode || "sales"}`);
  if (event.cliente_id) {
    const { data } = await supabaseAdmin.from("clientes").select("nome,observacoes").eq("id", event.cliente_id).maybeSingle();
    if (data?.nome) parts.push(`Cliente: ${data.nome}`);
    if (data?.observacoes) parts.push(`Contexto do cliente: ${String(data.observacoes).slice(0, 1200)}`);
  }
  if (event.lead_id) {
    const { data } = await supabaseAdmin.from("leads").select("nome,descricao").eq("id", event.lead_id).maybeSingle();
    if (data?.nome) parts.push(`Lead: ${data.nome}`);
    if (data?.descricao) parts.push(`Contexto do lead: ${String(data.descricao).slice(0, 1200)}`);
  }
  if (event.opportunity_id) {
    const { data } = await supabaseAdmin.from("opportunities").select("codigo,estagio,segmento,valor_credito").eq("id", event.opportunity_id).maybeSingle();
    if (data) parts.push(`Oportunidade: ${data.codigo || ""}; estágio ${data.estagio || ""}; segmento ${data.segmento || ""}; crédito ${data.valor_credito || ""}`);
  }
  return parts.join("\n");
}

const coachSchema = {
  type: "object",
  additionalProperties: false,
  required: ["should_surface", "stage", "priority", "title", "insight", "suggested_phrase", "context_excerpt"],
  properties: {
    should_surface: { type: "boolean" },
    stage: { type: "string" },
    priority: { type: "string", enum: ["low", "medium", "high"] },
    title: { type: "string" },
    insight: { type: "string" },
    suggested_phrase: { type: "string" },
    context_excerpt: { type: "string" },
  },
};

const reportSchema = {
  type: "object",
  additionalProperties: false,
  required: ["executive_summary", "minutes", "decisions", "action_items", "pains", "objections", "strong_points", "attention_points", "sales_stage", "buying_signals", "risks", "recommended_next_step", "suggested_follow_up", "score"],
  properties: {
    executive_summary: { type: "string" },
    minutes: { type: "string" },
    decisions: { type: "array", items: { type: "string" } },
    action_items: { type: "array", items: { type: "object", additionalProperties: false, required: ["owner", "task", "due"], properties: { owner: { type: "string" }, task: { type: "string" }, due: { type: "string" } } } },
    pains: { type: "array", items: { type: "string" } },
    objections: { type: "array", items: { type: "string" } },
    strong_points: { type: "array", items: { type: "string" } },
    attention_points: { type: "array", items: { type: "string" } },
    sales_stage: { type: ["string", "null"] },
    buying_signals: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    recommended_next_step: { type: "string" },
    suggested_follow_up: { type: "string" },
    score: { type: "number", minimum: 0, maximum: 100 },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { error: "Método não permitido." });

  const body = parseBody(req);
  const action = String(body?.action || "status");
  if (action === "status" && !body?.agenda_evento_id) {
    return json(res, 200, { ok: true, configured: Boolean(OPENAI_API_KEY), transcribeModel: TRANSCRIBE_MODEL, meetingModel: MEETING_MODEL });
  }
  if (!OPENAI_API_KEY) return json(res, 503, { error: "OPENAI_API_KEY não configurada na Vercel." });

  const eventId = String(body?.agenda_evento_id || "").trim();
  if (!eventId) return json(res, 400, { error: "agenda_evento_id é obrigatório." });
  const moderator = await eventModerator(req, eventId);
  if (!moderator.ok) return json(res, moderator.status, { error: moderator.error });

  try {
    if (action === "transcribe") {
      const base64 = String(body?.audio_base64 || "");
      if (!base64) return json(res, 400, { error: "Áudio vazio." });
      const buffer = Buffer.from(base64, "base64");
      if (!buffer.length || buffer.length > 4_000_000) return json(res, 413, { error: "Trecho de áudio inválido ou muito grande." });
      const mime = String(body?.mime_type || "audio/webm").split(";")[0];
      const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("file", new Blob([buffer], { type: mime }), `meeting.${ext}`);
      form.append("model", TRANSCRIBE_MODEL);
      form.append("language", "pt");
      form.append("prompt", "Reunião profissional da Consulmax Consórcios. Vocabulário frequente: consórcio, contemplação, lance, administradora, crédito, parcela, alavancagem, carteira, Embracon, BB Consórcios, Maggi.");
      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(`OpenAI Transcription: ${response.status} ${raw.slice(0, 1000)}`);
      const parsed = raw ? JSON.parse(raw) : {};
      const text = String(parsed?.text || "").trim();
      if (!text) return json(res, 200, { ok: true, text: "" });
      const identity = String(body?.participant_identity || "participant").slice(0, 160);
      const segment = Number(body?.segment_index || 0);
      const upsert = await supabaseAdmin.from("meeting_transcripts").upsert({
        agenda_evento_id: eventId,
        segment_index: segment,
        participant_identity: identity,
        participant_name: String(body?.participant_name || "Participante").slice(0, 160),
        participant_role: body?.participant_role === "host" ? "host" : "participant",
        transcript_text: text,
        started_at_ms: Number.isFinite(Number(body?.started_at_ms)) ? Number(body.started_at_ms) : null,
        ended_at_ms: Number.isFinite(Number(body?.ended_at_ms)) ? Number(body.ended_at_ms) : null,
        source: "live_track",
        model: TRANSCRIBE_MODEL,
      }, { onConflict: "agenda_evento_id,participant_identity,segment_index" }).select("id").single();
      if (upsert.error) throw new Error(upsert.error.message);
      await supabaseAdmin.from("agenda_eventos").update({ ai_report_status: "collecting", updated_at: new Date().toISOString() }).eq("id", eventId);
      return json(res, 200, { ok: true, text, segmentId: upsert.data?.id });
    }

    if (action === "coach") {
      const transcript = await transcriptText(eventId, 100);
      if (transcript.length < 180) return json(res, 200, { ok: true, surfaced: false, reason: "Pouca conversa transcrita." });
      const context = await meetingContext(moderator.event);
      const analysis = await responsesJson(
        "meeting_coach",
        coachSchema,
        "Você é o Max IA, coach privado do organizador de uma reunião da Consulmax. Analise somente a conversa recente. Seja extremamente seletivo: should_surface só deve ser true quando houver uma objeção, sinal de compra, pergunta importante não explorada, risco, mudança clara de etapa ou uma próxima fala que realmente aumente a qualidade da conversa. Nunca invente fatos. A sugestão deve ser curta, natural e falável em português do Brasil. Em vendas, privilegie diagnóstico consultivo e não pressione o cliente.",
        `${context}\n\nTRANSCRIÇÃO RECENTE:\n${transcript.slice(-18000)}`,
      );
      if (!analysis.should_surface) return json(res, 200, { ok: true, surfaced: false });
      const dedupe = createHash("sha1").update(`${analysis.stage}|${analysis.title}|${analysis.suggested_phrase}`.toLowerCase()).digest("hex").slice(0, 24);
      const inserted = await supabaseAdmin.from("meeting_ai_insights").upsert({
        agenda_evento_id: eventId,
        insight_type: "coach",
        meeting_stage: analysis.stage,
        priority: analysis.priority,
        title: analysis.title,
        insight: analysis.insight,
        suggested_phrase: analysis.suggested_phrase,
        context_excerpt: analysis.context_excerpt,
        dedupe_key: dedupe,
        model: MEETING_MODEL,
      }, { onConflict: "agenda_evento_id,dedupe_key", ignoreDuplicates: true }).select("*").maybeSingle();
      if (inserted.error) throw new Error(inserted.error.message);
      return json(res, 200, { ok: true, surfaced: Boolean(inserted.data), insight: inserted.data || null });
    }

    if (action === "state") {
      const [{ data: transcripts }, { data: insights }, { data: report }] = await Promise.all([
        supabaseAdmin.from("meeting_transcripts").select("id,participant_name,participant_role,transcript_text,created_at").eq("agenda_evento_id", eventId).order("created_at", { ascending: false }).limit(60),
        supabaseAdmin.from("meeting_ai_insights").select("*").eq("agenda_evento_id", eventId).order("created_at", { ascending: false }).limit(20),
        supabaseAdmin.from("meeting_ai_reports").select("*").eq("agenda_evento_id", eventId).maybeSingle(),
      ]);
      return json(res, 200, { ok: true, transcripts: (transcripts || []).reverse(), insights: insights || [], report: report || null, status: moderator.event.ai_report_status || "idle" });
    }

    if (action === "ack") {
      const id = String(body?.insight_id || "");
      if (!id) return json(res, 400, { error: "insight_id obrigatório." });
      await supabaseAdmin.from("meeting_ai_insights").update({ acknowledged_at: new Date().toISOString() }).eq("id", id).eq("agenda_evento_id", eventId);
      return json(res, 200, { ok: true });
    }

    if (action === "finalize") {
      await supabaseAdmin.from("agenda_eventos").update({ ai_report_status: "processing", updated_at: new Date().toISOString() }).eq("id", eventId);
      try {
        const transcript = await transcriptText(eventId, 500);
        if (transcript.length < 80) throw new Error("Não há transcrição suficiente para gerar a análise da reunião.");
        const context = await meetingContext(moderator.event);
        const report = await responsesJson(
          "meeting_report",
          reportSchema,
          "Você é o Max IA, analista de reuniões da Consulmax. Produza ata objetiva e feedback privado para o organizador. Diferencie fatos observados de interpretação. Se for venda, avalie diagnóstico, escuta, tratamento de objeções, clareza da proposta, sinais de compra, riscos e próximo passo. Pontos de atenção devem ser específicos e construtivos. Não invente compromissos, valores ou decisões. O score representa a qualidade da condução da reunião, não a probabilidade garantida de venda.",
          `${context}\n\nTRANSCRIÇÃO COMPLETA:\n${transcript.slice(-120000)}`,
        );
        const now = new Date().toISOString();
        const saved = await supabaseAdmin.from("meeting_ai_reports").upsert({
          agenda_evento_id: eventId,
          meeting_type: moderator.event.ai_mode || "sales",
          executive_summary: report.executive_summary,
          minutes_text: report.minutes,
          report,
          model: MEETING_MODEL,
          status: "completed",
          error: null,
          generated_at: now,
          updated_at: now,
        }, { onConflict: "agenda_evento_id" }).select("*").single();
        if (saved.error) throw new Error(saved.error.message);

        const { data: latestNote } = await supabaseAdmin.from("meeting_notes").select("id").eq("agenda_evento_id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle();
        const notePatch = {
          ai_summary: report.executive_summary,
          pains: (report.pains || []).join("\n"),
          objections: (report.objections || []).join("\n"),
          next_steps: report.recommended_next_step || report.suggested_follow_up || "",
          opportunity_hint: report.sales_stage || null,
        };
        if (latestNote?.id) await supabaseAdmin.from("meeting_notes").update(notePatch).eq("id", latestNote.id);
        else await supabaseAdmin.from("meeting_notes").insert({ agenda_evento_id: eventId, cliente_id: moderator.event.cliente_id, lead_id: moderator.event.lead_id, user_id: moderator.userId, ...notePatch });

        await supabaseAdmin.from("agenda_eventos").update({ ai_report_status: "completed", updated_at: now }).eq("id", eventId);
        return json(res, 200, { ok: true, report: saved.data });
      } catch (err: any) {
        const now = new Date().toISOString();
        await Promise.all([
          supabaseAdmin.from("agenda_eventos").update({ ai_report_status: "failed", updated_at: now }).eq("id", eventId),
          supabaseAdmin.from("meeting_ai_reports").upsert({ agenda_evento_id: eventId, meeting_type: moderator.event.ai_mode || "sales", status: "failed", error: String(err?.message || err), updated_at: now }, { onConflict: "agenda_evento_id" }),
        ]);
        throw err;
      }
    }

    return json(res, 400, { error: "Ação de IA inválida." });
  } catch (err: any) {
    console.error("[meeting-ai]", err);
    return json(res, 500, { error: err?.message || "Erro no Max IA." });
  }
}
