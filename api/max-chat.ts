// api/max-chat.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

type Mode = "livre" | "estrategia" | "objeções";

type MaxRequestBody = {
  prompt: string;
  mode?: Mode;
  context?: any;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function applyCors(res: VercelResponse) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res);

  // Pré-flight (CORS)
  if (req.method === "OPTIONS") {
    return res.status(200).end("ok");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      error: "OPENAI_API_KEY não configurada nas variáveis de ambiente da Vercel.",
    });
  }

  const body = req.body as MaxRequestBody | undefined;
  const prompt = body?.prompt;
  const mode: Mode = body?.mode || "livre";
  const context = body?.context;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Campo 'prompt' é obrigatório." });
  }

  // Contexto resumido
  let contextSnippet = "";
  if (context) {
    try {
      const raw = JSON.stringify(context);
      contextSnippet = raw.slice(0, 8000);
    } catch {
      contextSnippet = "";
    }
  }

  const systemPrompt = `
Você é o **Max**, cachorrinho mascote da Consulmax Consórcios 🐶.

Características:
- Fala sempre em **português do Brasil**.
- Tom: leve, direto, parceiro de vendas (sem ser bobo).
- Especialista em: consórcios, vendas consultivas, scripts de abordagem, tratamento de objeções e fechamento.
- Público: time comercial da Consulmax (SDR, vendedor/especialista, gestor, pós-venda).

Regras gerais:
- Ajude o usuário a montar **roteiros práticos**, com frases que ele possa falar ao telefone, WhatsApp ou reunião.
- Sempre que fizer sentido, organize as respostas em **tópicos/bullets**.
- Quando a pergunta for sobre objeções, sugira tanto:
  - como o cliente fala (ex.: "Vou falar com a minha esposa")
  - quanto a resposta recomendada + próximo passo.
- Se o contexto do CRM for enviado, use-o como base:
  - Plano da semana (weekly_plans + items)
  - Playbook (sales_playbooks)
  - Objeções já mapeadas (sales_objections)
- Nunca exponha dados sensíveis do cliente final. Fale de forma genérica e segura.
`.trim();

  let modeInstruction = "";
  switch (mode) {
    case "estrategia":
      modeInstruction = `
Tarefa atual: ajudar o usuário a montar uma **estratégia de vendas completa** da abertura ao fechamento.
- Use o contexto do plano da semana e do playbook (segmento, persona, dor principal).
- Entregue:
  1) Ideia central da semana (Big Idea)
  2) Sugestão de script de abertura
  3) Perguntas de diagnóstico
  4) Sugestão de apresentação e oferta
  5) Frases de fechamento
  6) Sugestão de follow-up, se o cliente não decidir na hora.
`.trim();
      break;
    case "objeções":
      modeInstruction = `
Tarefa atual: sugerir e trabalhar **objeções de vendas**.
- Liste as principais objeções que esse tipo de cliente pode ter.
- Para cada objeção, entregue:
  - Como o cliente fala (frase real)
  - Sugestão de resposta
  - Próxima ação recomendada (ex.: aprofundar, reagendar, envolver cônjuge, etc.).
`.trim();
      break;
    case "livre":
    default:
      modeInstruction = `
Tarefa atual: responder livremente a pergunta do usuário, sempre conectando com:
- melhorias de script,
- estratégias de abordagem,
- contorno de objeções,
- aumento de conversão nas vendas.
`.trim();
      break;
  }

  const finalInput = `
${systemPrompt}

[Modo]: ${mode}
[Instruções do modo]:
${modeInstruction}

[Pedido do usuário]:
${prompt}

[Contexto do CRM (resumido em JSON)]:
${contextSnippet || "(sem contexto enviado)"}
`.trim();

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.1-mini",
        input: finalInput,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[max-chat] Erro OpenAI:", response.status, errorText);
      return res.status(500).json({
        error: "Erro ao chamar a API da OpenAI.",
        detail: errorText,
      });
    }

    const data = await response.json();

    const answer =
      data?.output?.[0]?.content?.[0]?.text ??
      "Não consegui gerar uma resposta agora, tenta reformular a pergunta para o Max 🐶.";

    return res.status(200).json({ answer });
  } catch (err) {
    console.error("[max-chat] Erro inesperado:", err);
    return res.status(500).json({
      error: "Erro interno ao processar a solicitação para o Max.",
    });
  }
}
