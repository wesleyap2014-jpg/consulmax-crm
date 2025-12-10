// supabase/functions/max-chat/index.ts
// Tipos do runtime de Edge Functions
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
  // CORS pre-flight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
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
      JSON.stringify({ error: "Invalid JSON body" }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  const { prompt, mode = "livre", context } = body;

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

  const systemPrompt =
    "Você é o Max, cachorrinho mascote da Consulmax Consórcios. " +
    "Fale em português do Brasil, de forma prática, amigável e objetiva. " +
    "Ajude o time de vendas a montar estratégias, roteiros de abordagem e contorno de objeções. " +
    "Evite respostas muito longas; prefira bullets e passos numerados.";

  let modeInstruction = "";
  if (mode === "estrategia") {
    modeInstruction =
      "Foque em montar uma estratégia de vendas completa da abordagem ao fechamento, em passos numerados e bullets práticos.";
  } else if (mode === "objeções") {
    modeInstruction =
      "Liste objeções prováveis dos clientes e traga, para cada uma, uma resposta sugerida e o próximo passo.";
  } else {
    modeInstruction =
      "Responda de forma direta, ajudando o vendedor no que ele pediu.";
  }

  const contextSnippet = context
    ? `\n\nContexto estruturado (JSON, resumido):\n${JSON.stringify(context).slice(
        0,
        4000
      )}`
    : "";

  const finalInput =
    `${systemPrompt}\n\n` +
    `Modo atual: ${mode}.\n${modeInstruction}\n\n` +
    `Pedido do usuário:\n${prompt}${contextSnippet}`;

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
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
          error: "Erro ao chamar OpenAI",
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

    const json = await resp.json();

    const answer =
      json?.output?.[0]?.content?.[0]?.text ??
      "Não consegui gerar uma resposta no momento.";

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
      JSON.stringify({ error: "Erro interno ao conversar com Max." }),
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
