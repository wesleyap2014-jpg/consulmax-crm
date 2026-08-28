import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Exclusão de dados — Consulmax Content OS</title><style>body{font-family:Arial,sans-serif;max-width:820px;margin:40px auto;padding:0 20px;line-height:1.6;color:#1E293F}h1,h2{color:#1E293F}code{background:#f1f5f9;padding:2px 6px;border-radius:6px}</style></head><body>
<h1>Solicitação de exclusão de dados</h1>
<p>Usuários que conectaram uma conta social ao Consulmax Content OS podem solicitar a exclusão dos dados relacionados à integração a qualquer momento.</p>
<h2>Como solicitar</h2>
<ol><li>Revogue o acesso do <strong>Consulmax Content OS</strong> nas configurações de Apps e Sites da plataforma social, se desejar interromper imediatamente a autorização.</li><li>Envie um e-mail para <strong>wesley.planejadorfinanceiro@outlook.com.br</strong> com o assunto <code>Exclusão de dados — Content OS</code>.</li><li>Informe somente a rede social e o nome de usuário da conta conectada. Não envie senha, token ou código de autenticação.</li></ol>
<p>Após validação da solicitação, serão removidos os tokens armazenados, a vinculação da conta e os dados de integração que não precisem ser mantidos por obrigação legal ou registro legítimo de segurança/auditoria.</p>
<h2>Prazo</h2><p>A solicitação será processada em prazo razoável, observadas as obrigações legais aplicáveis.</p>
</body></html>`);
}
