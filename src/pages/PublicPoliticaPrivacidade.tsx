// src/pages/PublicPoliticaPrivacidade.tsx
import React from "react";

const C = {
  red: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
};

export default function PublicPoliticaPrivacidade() {
  const updatedAt = "22 de maio de 2026";

  return (
    <main className="min-h-screen bg-[#F5F5F5] text-slate-800">
      <section
        className="border-b"
        style={{
          background: `linear-gradient(135deg, ${C.navy} 0%, ${C.red} 100%)`,
        }}
      >
        <div className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-14">
          <div className="mb-6 flex items-center gap-3">
            <img
              src="/logo-consulmax.png?v=3"
              alt="Consulmax Consórcios"
              className="h-12 w-12 rounded-xl bg-white/90 object-contain p-1"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/favicon.ico?v=3";
              }}
            />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
                Consulmax Consórcios
              </p>
              <h1 className="text-3xl font-bold text-white md:text-4xl">
                Política de Privacidade
              </h1>
            </div>
          </div>

          <p className="max-w-3xl text-base leading-relaxed text-white/85">
            Esta Política de Privacidade explica como a Consulmax coleta, utiliza,
            armazena e protege dados pessoais em seus canais digitais, incluindo
            site, CRM, formulários, atendimento via WhatsApp, campanhas e demais
            meios de relacionamento com clientes, leads, parceiros e usuários.
          </p>

          <p className="mt-4 text-sm text-white/70">
            Última atualização: {updatedAt}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-12">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 md:p-10">
          <div className="prose prose-slate max-w-none">
            <h2>1. Quem somos</h2>
            <p>
              A Consulmax Consórcios atua com soluções de planejamento financeiro,
              consórcios, estratégias patrimoniais e relacionamento comercial com
              clientes interessados em aquisição de bens, investimentos, expansão
              patrimonial e proteção financeira.
            </p>

            <p>
              Para fins desta Política, “Consulmax”, “nós” ou “nossa empresa” se
              referem à Consulmax Serviços de Planejamento Estruturado e Proteção
              LTDA, inscrita no CNPJ nº 57.942.043/0001-03.
            </p>

            <h2>2. Quais dados podemos coletar</h2>
            <p>
              Podemos coletar dados fornecidos diretamente pelo titular ou gerados
              durante o relacionamento com a Consulmax, incluindo:
            </p>

            <ul>
              <li>nome completo;</li>
              <li>telefone e WhatsApp;</li>
              <li>e-mail;</li>
              <li>CPF, CNPJ ou dados de identificação, quando necessários;</li>
              <li>cidade, estado e endereço, quando aplicável;</li>
              <li>informações profissionais, renda estimada ou perfil financeiro;</li>
              <li>objetivo de aquisição, valor de crédito desejado e interesse em consórcio;</li>
              <li>histórico de atendimento, mensagens, solicitações e preferências;</li>
              <li>dados de navegação, origem do lead, campanhas e interações digitais.</li>
            </ul>

            <h2>3. Como coletamos os dados</h2>
            <p>
              Os dados podem ser coletados por meio de formulários, landing pages,
              site, WhatsApp, redes sociais, anúncios, e-mail, ligações, reuniões,
              indicações, sistemas internos, integrações com ferramentas de
              atendimento e demais canais oficiais da Consulmax.
            </p>

            <h2>4. Para que usamos os dados</h2>
            <p>
              Utilizamos dados pessoais para as seguintes finalidades:
            </p>

            <ul>
              <li>atender solicitações de clientes, leads e parceiros;</li>
              <li>realizar triagem, qualificação e diagnóstico comercial;</li>
              <li>elaborar simulações, propostas e estratégias de consórcio;</li>
              <li>agendar reuniões, contatos e acompanhamentos;</li>
              <li>registrar oportunidades e histórico de relacionamento no CRM;</li>
              <li>enviar comunicações, lembretes, conteúdos informativos e mensagens transacionais;</li>
              <li>cumprir obrigações legais, regulatórias e contratuais;</li>
              <li>melhorar nossos processos, atendimento, segurança e experiência do usuário.</li>
            </ul>

            <h2>5. Uso do WhatsApp e atendimento automatizado</h2>
            <p>
              A Consulmax pode utilizar WhatsApp, chatbots, automações e assistentes
              virtuais para atendimento inicial, qualificação de leads, direcionamento
              comercial, envio de informações, registro de solicitações e agendamento
              de reuniões.
            </p>

            <p>
              O atendimento automatizado não substitui a análise humana em situações
              que envolvam proposta comercial, estratégia de contratação, condições
              específicas, decisão financeira ou qualquer informação que exija validação
              por um consultor autorizado.
            </p>

            <h2>6. Compartilhamento de dados</h2>
            <p>
              Podemos compartilhar dados pessoais apenas quando necessário para a
              execução dos serviços, atendimento ao cliente, cumprimento de obrigações
              legais ou operação dos sistemas utilizados pela Consulmax.
            </p>

            <p>
              Esse compartilhamento pode ocorrer com administradoras de consórcio,
              parceiros comerciais, provedores de tecnologia, plataformas de CRM,
              hospedagem, mensageria, automação, análise de dados, contabilidade,
              assessoria jurídica e demais prestadores necessários à operação.
            </p>

            <h2>7. Segurança das informações</h2>
            <p>
              Adotamos medidas técnicas e administrativas para proteger os dados
              pessoais contra acesso não autorizado, perda, alteração, divulgação
              indevida ou uso inadequado.
            </p>

            <p>
              Apesar dos nossos esforços, nenhum sistema é totalmente imune a riscos.
              Por isso, também recomendamos que o usuário mantenha seus dispositivos,
              senhas e canais de comunicação protegidos.
            </p>

            <h2>8. Tempo de armazenamento</h2>
            <p>
              Os dados pessoais serão armazenados pelo tempo necessário para cumprir
              as finalidades descritas nesta Política, atender obrigações legais,
              proteger direitos da Consulmax e manter histórico de relacionamento
              comercial, conforme permitido pela legislação aplicável.
            </p>

            <h2>9. Direitos do titular</h2>
            <p>
              Nos termos da Lei Geral de Proteção de Dados Pessoais — LGPD, o titular
              pode solicitar, quando aplicável:
            </p>

            <ul>
              <li>confirmação da existência de tratamento;</li>
              <li>acesso aos dados pessoais;</li>
              <li>correção de dados incompletos, inexatos ou desatualizados;</li>
              <li>eliminação de dados tratados com base no consentimento, quando aplicável;</li>
              <li>informações sobre compartilhamento;</li>
              <li>revogação de consentimento, quando o tratamento depender dele;</li>
              <li>demais direitos previstos na legislação vigente.</li>
            </ul>

            <h2>10. Cookies e tecnologias semelhantes</h2>
            <p>
              Podemos utilizar cookies, pixels, tags e tecnologias semelhantes para
              melhorar a experiência do usuário, medir desempenho de campanhas,
              entender origem de acessos, personalizar comunicações e aprimorar nossos
              canais digitais.
            </p>

            <h2>11. Base legal para tratamento</h2>
            <p>
              O tratamento de dados pessoais pode ocorrer com base no consentimento,
              execução de contrato ou procedimentos preliminares, cumprimento de
              obrigação legal ou regulatória, legítimo interesse, exercício regular
              de direitos e demais bases legais previstas na LGPD.
            </p>

            <h2>12. Alterações nesta Política</h2>
            <p>
              Esta Política de Privacidade poderá ser atualizada periodicamente para
              refletir mudanças em nossos processos, sistemas, obrigações legais ou
              práticas de atendimento. A versão mais recente estará sempre disponível
              nesta página.
            </p>

            <h2>13. Contato</h2>
            <p>
              Para dúvidas, solicitações ou exercício de direitos relacionados a dados
              pessoais, entre em contato com a Consulmax pelos canais oficiais de
              atendimento.
            </p>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="m-0 text-sm text-slate-600">
                <strong>Consulmax Consórcios</strong>
                <br />
                Site: consulmaxconsorcios.com.br
                <br />
                Política publicada em: {updatedAt}
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
