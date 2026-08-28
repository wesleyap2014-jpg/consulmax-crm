import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.end(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Política de Privacidade — Consulmax Content OS</title>
<style>body{font-family:Arial,sans-serif;max-width:860px;margin:40px auto;padding:0 20px;line-height:1.6;color:#1E293F}h1,h2{color:#1E293F}a{color:#A11C27}.muted{color:#64748b}</style></head><body>
<h1>Política de Privacidade — Consulmax Content OS</h1>
<p class="muted">Última atualização: 27 de agosto de 2026.</p>
<p>Esta Política explica como a Consulmax trata dados quando uma conta profissional de rede social é conectada ao Consulmax Content OS, módulo interno do CRM usado para planejamento, produção, publicação e análise de conteúdo.</p>
<h2>1. Dados que podemos tratar</h2>
<p>Quando o usuário autoriza uma integração, podemos receber identificadores da conta, nome de usuário, nome de exibição, foto do perfil, tipo da conta, permissões concedidas, conteúdos pertencentes à conta, URLs/permalinks e métricas disponibilizadas pela plataforma. Tokens de acesso necessários à integração são armazenados de forma cifrada no backend e não são expostos ao navegador.</p>
<h2>2. Finalidades</h2>
<p>Os dados são utilizados para conectar contas autorizadas, exibir e sincronizar conteúdos, publicar conteúdos solicitados pelo usuário, acompanhar desempenho, organizar fluxos editoriais e melhorar recomendações internas do CRM.</p>
<h2>3. Compartilhamento e venda de dados</h2>
<p>A Consulmax não vende dados de usuários. Dados podem trafegar somente entre o CRM, os provedores de infraestrutura necessários à operação e a própria plataforma social autorizada, na medida necessária para executar as funções solicitadas.</p>
<h2>4. Segurança</h2>
<p>Credenciais sociais são mantidas fora do frontend e tokens são cifrados em repouso. O acesso administrativo à Central de Contas é restrito a usuários autorizados do CRM.</p>
<h2>5. Retenção e exclusão</h2>
<p>Os dados permanecem enquanto a integração estiver ativa ou enquanto forem necessários para os registros operacionais legítimos do CRM. O usuário pode revogar o acesso na própria plataforma e solicitar exclusão dos dados vinculados à integração.</p>
<h2>6. Direitos e contato</h2>
<p>Para solicitar acesso, correção ou exclusão de dados relacionados ao Content OS, entre em contato pelo e-mail <a href="mailto:wesley.planejadorfinanceiro@outlook.com.br">wesley.planejadorfinanceiro@outlook.com.br</a>.</p>
<h2>7. Plataformas de terceiros</h2>
<p>Instagram, Facebook e demais redes sociais possuem políticas e termos próprios. A autorização concedida pelo usuário também está sujeita aos controles e políticas dessas plataformas.</p>
</body></html>`);
}
