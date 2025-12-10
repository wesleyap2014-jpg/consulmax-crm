// api/max-chat.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

type Mode = "livre" | "estrategia" | "objeções";

interface MaxRequestBody {
  prompt: string;
  mode?: Mode;
  context?: any;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function applyCors(res: VercelResponse) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    applyCors(res);
    return res.status(200).end();
  }

  applyCors(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!OPENAI_API_KEY) {
    console.warn("[max-chat] OPENAI_API_KEY não configurada na Vercel");
    return res
      .status(500)
      .json({ error: "OPENAI_API_KEY não configurada na Vercel." });
  }

  try {
    const rawBody = req.body;
    const body: MaxRequestBody =
      typeof rawBody === "string" ? JSON.parse(rawBody) : (rawBody || {});

    const { prompt, mode = "livre", context } = body;

    if (!prompt || typeof prompt !== "string") {
      return res
        .status(400)
        .json({ error: "Campo 'prompt' é obrigatório e deve ser string." });
    }

    // Resumo do contexto para não estourar o tamanho
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
- Fala sempre em português do Brasil.
- Tom: leve, direto, parceiro de vendas (sem ser bobo).
- Especialista em: consórcios, vendas consultivas, scripts de abordagem, tratamento de objeções e fechamento.
- Público: time comercial da Consulmax (SDR, vendedor/especialista, gestor, pós-venda).

Regras gerais:
- Ajude o usuário a montar roteiros práticos, com frases que ele possa falar ao telefone, WhatsApp ou reunião.
- Sempre que fizer sentido, organize as respostas em tópicos/bullets.
- Quando a pergunta for sobre objeções, sugira:
  - como o cliente fala (ex.: "Vou falar com a minha esposa")
  - a resposta recomendada + próximo passo.
- Se o contexto do CRM for enviado, use:
  - Plano da semana (weekly_plans + items)
  - Playbook (sales_playbooks)
  - Objeções já mapeadas (sales_objections)
- Nunca exponha dados sensíveis do cliente final. Fale de forma genérica e segura.
    `;

    let modeInstruction = "";
    switch (mode) {
      case "estrategia":
        modeInstruction = `
Tarefa atual: ajudar o usuário a montar uma estratégia de vendas completa da abertura ao fechamento.
- Use o contexto do plano da semana e do playbook (segmento, persona, dor principal).
- Entregue:
  1) Ideia central da semana (Big Idea)
  2) Script de abertura sugerido
  3) Perguntas de diagnóstico
  4) Sugestão de apresentação e oferta
  5) Frases de fechamento
  6) Sugestão de follow-up se o cliente não decidir na hora.
        `;
        break;
      case "objeções":
        modeInstruction = `
Tarefa atual: sugerir e trabalhar objeções de vendas.
- Liste as principais objeções que esse tipo de cliente pode ter.
- Para cada uma, entregue:
  - Como o cliente fala (frase real)
  - Sugestão de resposta
  - Próxima ação recomendada (aprofundar, reagendar, envolver cônjuge etc.).
        `;
        break;
      case "livre":
      default:
        modeInstruction = `
Tarefa atual: responder livremente a pergunta do usuário, sempre tentando conectar com:
- melhorias de script,
- estratégias de abordagem,
- contorno de objeções,
- aumento de conversão nas vendas.
        `;
        break;
    }

    const userPrompt = `
[Modo]: ${mode}
[Prompt do usuário]: ${prompt}

[Contexto do CRM (resumido em JSON)]:
${contextSnippet || "(sem contexto enviado)"}
    `;

    // === CHAMADA À OPENAI ===
    const openAiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          temperature: 0.7,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "system", content: modeInstruction },
            { role: "user", content: userPrompt },
          ],
        }),
      }
    );

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text();
      console.error("[max-chat] Erro OpenAI:", errorText);
      return res.status(500).json({
        error: "Erro ao chamar a API da OpenAI.",
        detail: errorText,
      });
    }

    const completion = await openAiResponse.json();
    const answer: string =
      completion.choices?.[0]?.message?.content ??
      "Não consegui gerar uma resposta agora, tenta reformular a pergunta para o Max 🐶.";

    return res.status(200).json({ answer });
  } catch (err) {
    console.error("[max-chat] Erro geral:", err);
    return res.status(500).json({
      error: "Erro interno ao processar a solicitação para o Max.",
    });
  }
}
