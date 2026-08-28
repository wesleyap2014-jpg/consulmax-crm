import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Termos de Uso — Consulmax Content OS</title><style>body{font-family:Arial,sans-serif;max-width:860px;margin:40px auto;padding:0 20px;line-height:1.6;color:#1E293F}h1,h2{color:#1E293F}.muted{color:#64748b}</style></head><body>
<h1>Termos de Uso — Consulmax Content OS</h1><p class="muted">Última atualização: 27 de agosto de 2026.</p>
<p>O Consulmax Content OS é uma ferramenta interna integrada ao CRM Consulmax para planejamento, produção, aprovação, publicação e análise de conteúdo em contas sociais expressamente autorizadas.</p>
<h2>1. Autorização</h2><p>Somente contas cujo titular ou administrador tenha concedido autorização por meio do fluxo oficial da plataforma podem ser conectadas. O usuário pode revogar o acesso a qualquer momento.</p>
<h2>2. Publicação</h2><p>Conteúdos somente devem ser publicados após as etapas de autorização e aprovação definidas pelo usuário e pelas regras internas do CRM. O usuário permanece responsável pela veracidade, direitos autorais e conformidade do conteúdo publicado.</p>
<h2>3. Uso das APIs</h2><p>O serviço depende das APIs e políticas das plataformas de terceiros. Funcionalidades podem variar conforme permissões, disponibilidade, limites e regras dessas plataformas.</p>
<h2>4. Segurança</h2><p>Tokens e credenciais técnicas são mantidos no backend com controles de acesso e cifragem. Senhas das redes sociais não são armazenadas pelo CRM.</p>
<h2>5. Suspensão ou revogação</h2><p>A integração pode ser suspensa quando a plataforma revogar permissões, o token expirar, houver risco de segurança ou o usuário solicitar desconexão.</p>
<h2>6. Contato</h2><p>Dúvidas relacionadas ao Content OS podem ser encaminhadas para wesley.planejadorfinanceiro@outlook.com.br.</p>
</body></html>`);
}
