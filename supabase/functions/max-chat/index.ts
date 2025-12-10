// supabase/functions/max-chat/index.ts

// Tipos do runtime de Edge Functions
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Mode = "livre" | "estrategia" | "objeções";

type MaxRequestBody = {
  prompt: string;
  mode?: Mode;
  context?: any;
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

if (!OPENAI_API_KEY) {
  console.warn(
    "[max-chat] Variável de ambiente OPENAI_API_KEY não definida. Configure nas Edge Function Secrets do projeto Supabase."
  );
}

Deno.serve(async (req) => {
  // ==== CORS pré-flight ====
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // ==== Só aceitamos POST ====
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  // ==== Garante que temos a chave da OpenAI ====
  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          "OPENAI_API_KEY não configurada nas Edge Function Secrets do Supabase.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  let body: MaxRequestBody;
  try {
    body = (await req.json()) as MaxRequestBody;
  } catch (err) {
    console.error("[max-chat] Erro ao parsear body:", err);
    return new Response(
      JSON.stringify({ error: "JSON inválido no body da requisição." }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  const { prompt, mode = "livre", context } = body || {};

  if (!prompt || typeof prompt !== "string") {
    return new Response(
      JSON.stringify({ error: "Campo 'prompt' é obrigatório." }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  // ==== Monta contexto resumido ====
  let contextSnippet = "";
  if (context) {
    try {
      const raw = JSON.stringify(context);
      contextSnippet = raw.slice(0, 8000);
    } catch (_err) {
      contextSnippet = "";
    }
  }

  // ==== System prompt do Max ====
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
    // ==== Chamada à OpenAI usando a Responses API ====
    const resp = await fetch("https://api.openai.com/v1/responses", {
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

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[max-chat] Erro da OpenAI:", resp.status, errText);
      return new Response(
        JSON.stringify({
          error: "Erro ao chamar a API da OpenAI.",
          detail: errText,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const data = await resp.json();

    // Responses API: output[0].content[0].text
    const answer =
      data?.output?.[0]?.content?.[0]?.text ??
      "Não consegui gerar uma resposta agora, tenta reformular a pergunta para o Max 🐶.";

    return new Response(JSON.stringify({ answer }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("[max-chat] Erro inesperado:", err);
    return new Response(
      JSON.stringify({
        error: "Erro interno ao processar a solicitação para o Max.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
