import React, { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAccess } from "./AccessContext";
import { ACCESS_GUIDE_BY_KEY, guideKeyForPath } from "./permissionCatalog";

const normalize = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const ACTION_ALIASES: Record<string, Record<string, string[]>> = {
  oportunidades: {
    create_lead: ["novo lead", "nova lead", "criar lead", "adicionar lead"],
    create_opportunity: ["nova oportunidade", "criar oportunidade", "adicionar oportunidade"],
    treat: ["tratar", "iniciar tratamento", "abrir tratamento"],
    edit: ["editar oportunidade", "editar lead", "salvar alterações", "salvar oportunidade"],
    change_stage: ["mover etapa", "alterar etapa", "avançar etapa", "voltar etapa"],
    follow_up: ["follow-up", "follow up", "registrar tentativa", "reagendar", "agendar retorno"],
    reassign: ["reatribuir", "trocar vendedor", "alterar vendedor"],
    whatsapp: ["whats", "whatsapp"],
    call: ["ligar", "chamar", "telefonar"],
    qualify_ai: ["qualificar com ia", "qualificação ia", "qualificacao ia", "analisar com max", "max"],
    close_won: ["fechado ganho", "fechar ganho", "fechar como ganho", "ganho"],
    close_lost: ["fechado perdido", "fechar perdido", "fechar como perdido", "perdido"],
  },
  whatsapp: {
    send_text: ["enviar mensagem", "enviar texto"],
    send_media: ["anexar", "imagem", "pdf", "documento", "enviar mídia", "enviar midia"],
    send_audio: ["gravar áudio", "gravar audio", "enviar áudio", "enviar audio"],
    send_template: ["modelo", "template", "enviar modelo"],
    calls: ["ligar", "chamada", "atender", "recusar chamada"],
    create_campaign: ["nova campanha", "criar campanha"],
    dispatch_campaign: ["disparar", "iniciar campanha", "enviar campanha"],
    manage_templates: ["novo modelo", "criar modelo", "editar modelo", "sincronizar modelos"],
    manage_authorizations: ["autorizar", "revogar", "consentimento", "autorização", "autorizacao"],
  },
  agenda: {
    create: ["novo compromisso", "novo evento", "agendar", "criar evento"],
    edit: ["editar evento", "editar compromisso", "salvar evento", "salvar compromisso"],
    delete: ["excluir evento", "excluir compromisso", "remover evento"],
    live_meeting: ["sala", "reunião", "reuniao", "entrar na reunião", "iniciar reunião"],
    birthday_whatsapp: ["whatsapp aniversário", "whatsapp aniversario", "enviar parabéns", "enviar parabens"],
  },
  simuladores: {
    simulate: ["simular", "calcular simulação", "calcular simulacao"],
    save: ["salvar simulação", "salvar simulacao"],
    share: ["compartilhar", "resumo whatsapp", "copiar resumo"],
    manage_admins: ["adicionar administradora", "configurar administradora", "editar administradora"],
  },
  central_grupos: {
    filter: ["filtrar", "aplicar filtros", "limpar filtros"],
    sync: ["sincronizar", "atualizar grupos", "sincronização", "sincronizacao"],
    run_robot: ["executar robô", "executar robo", "rodar robô", "rodar robo", "buscar grupos"],
    edit: ["editar grupo", "salvar grupo"],
  },
  propostas: {
    create: ["nova proposta", "criar proposta", "gerar proposta"],
    edit: ["editar proposta", "salvar proposta"],
    send: ["enviar proposta", "reenviar proposta"],
    duplicate: ["duplicar", "copiar proposta"],
    export: ["baixar", "pdf", "exportar", "imprimir"],
    delete: ["excluir proposta", "remover proposta"],
  },
  propostas_pro_max: {
    create: ["nova proposta", "novo pró max", "novo pro max", "gerar proposta"],
    edit: ["editar proposta", "salvar proposta", "salvar pró max", "salvar pro max"],
    send: ["enviar", "enviar proposta"],
    share: ["compartilhar", "link público", "link publico"],
    export: ["baixar", "pdf", "exportar", "imprimir"],
    manage_parameters: ["parâmetros", "parametros", "configurações", "configuracoes"],
  },
  contempladas: {
    filter: ["filtrar", "aplicar filtros", "limpar filtros"],
    combine: ["junção", "juncao", "combinar", "max"],
    edit: ["editar cota", "salvar cota"],
    import: ["importar", "sincronizar", "atualizar estoque"],
    export: ["exportar", "baixar", "excel", "csv"],
  },
  carteira: {
    edit: ["editar", "salvar alterações", "salvar alteracoes"],
    lance_strategy: ["estratégia de lance", "estrategia de lance", "lance"],
    customer_success: ["sucesso do cliente", "salvar atendimento", "atendimento"],
    whatsapp: ["whatsapp", "enviar aviso", "enviar mensagem"],
    export: ["exportar", "baixar", "pdf", "excel"],
  },
  giro_carteira: {
    create: ["novo giro", "criar giro"],
    execute: ["executar", "registrar contato", "registrar tentativa"],
    complete: ["concluir", "finalizar giro"],
    reassign: ["reatribuir", "trocar responsável", "trocar responsavel"],
    export: ["exportar", "baixar", "excel", "pdf"],
  },
  gestao_grupos: {
    edit: ["editar", "salvar"],
    offer_lance: ["oferta de lance", "ofertar lance", "registrar lance"],
    whatsapp: ["whatsapp", "enviar orientação", "enviar orientacao"],
    export: ["exportar", "baixar", "pdf"],
  },
  marketing: {
    edit_plan: ["editar plano", "salvar plano", "plano de mídia", "plano de midia"],
    create_content: ["novo conteúdo", "novo conteudo", "criar conteúdo", "criar conteudo"],
    manage_creatives: ["novo criativo", "editar criativo", "adicionar criativo"],
    create_newsletter: ["nova newsletter", "criar newsletter"],
    dispatch_newsletter: ["disparar newsletter", "enviar newsletter"],
  },
  relatorios: {
    export: ["exportar", "baixar", "excel", "csv", "pdf", "imprimir"],
  },
  usuarios: {
    create: ["cadastro de usuário", "cadastro de usuario", "novo usuário", "novo usuario"],
    edit: ["editar", "salvar usuário", "salvar usuario"],
    deactivate: ["inativar", "desativar", "ativar usuário", "ativar usuario"],
    manage_units: ["unidades", "nova unidade", "editar unidade", "cadastrar unidade"],
    manage_profiles: ["gerenciar perfis", "novo perfil", "salvar perfil", "duplicar", "excluir perfil"],
    assign_profiles: ["atribuições", "atribuicoes", "perfil de acesso"],
    manage_partner_categories: ["categorias do parceiro", "nova categoria", "salvar categoria"],
  },
  parametros: {
    edit: ["editar", "salvar", "atualizar", "alterar"],
  },
  clientes: {
    create: ["novo cliente", "cadastrar cliente", "criar cliente"],
    edit: ["editar cliente", "salvar cliente", "salvar cadastro"],
    customer_success: ["sucesso do cliente", "salvar atendimento"],
    download_report: ["baixar relatório", "baixar relatorio", "relatório", "relatorio"],
    whatsapp: ["whatsapp", "enviar mensagem"],
    export: ["exportar", "baixar", "excel", "csv"],
  },
  meus_parceiros: {
    create: ["novo parceiro", "cadastrar parceiro", "adicionar parceiro"],
    edit: ["editar parceiro", "salvar parceiro"],
    export: ["exportar", "baixar", "excel", "csv"],
  },
  processos: {
    create: ["novo processo", "criar processo"],
    edit: ["editar processo", "salvar processo"],
    change_status: ["alterar status", "mover etapa", "concluir processo"],
    assign: ["atribuir", "responsável", "responsavel"],
    delete: ["excluir processo", "remover processo"],
  },
  rh: {
    manage_employees: ["novo colaborador", "cadastrar colaborador", "editar colaborador", "salvar colaborador"],
    manage_contracts: ["contrato", "vínculo", "vinculo", "admissão", "admissao"],
    manage_vacancies: ["nova vaga", "criar vaga", "editar vaga", "publicar vaga"],
    manage_candidates: ["candidato", "aprovar candidato", "reprovar candidato", "mover candidato"],
  },
  comissoes: {
    manage_rules: ["regras", "percentual", "configurar comissão", "configurar comissao"],
    register_receipt: ["recebimento", "receber administradora", "registrar recebimento"],
    pay: ["pagar", "registrar pagamento", "pagamento"],
    upload_receipt: ["comprovante", "recibo", "anexar"],
    adjust: ["ajuste", "desconto", "bônus", "bonus"],
    chargeback: ["estorno", "reverter estorno"],
    edit_dates: ["editar data", "alterar data", "calendário", "calendario"],
    export: ["exportar", "baixar", "pdf", "excel"],
  },
  fluxo_caixa: {
    create: ["novo lançamento", "novo lancamento", "adicionar lançamento", "adicionar lancamento"],
    edit: ["editar lançamento", "editar lancamento", "salvar"],
    delete: ["excluir lançamento", "excluir lancamento", "remover lançamento", "remover lancamento"],
    export: ["exportar", "baixar", "excel", "csv", "pdf"],
  },
  central_projetos: {
    create: ["novo projeto", "criar projeto"],
    edit: ["editar projeto", "salvar projeto"],
    assign: ["atribuir", "responsável", "responsavel"],
    change_status: ["alterar status", "mover", "concluir projeto"],
    delete: ["excluir projeto", "remover projeto"],
  },
  procedimentos: {
    create: ["novo procedimento", "criar procedimento"],
    edit: ["editar procedimento", "salvar procedimento"],
    publish: ["publicar", "despublicar"],
    delete: ["excluir procedimento", "remover procedimento"],
  },
  links: {
    create: ["novo link", "adicionar link", "cadastrar link"],
    edit: ["editar link", "salvar link"],
    delete: ["excluir link", "remover link"],
  },
};

function aliasesFor(guideKey: string, actionKey: string, fallbackLabel: string) {
  const explicit = ACTION_ALIASES[guideKey]?.[actionKey] || [];
  return Array.from(new Set([...explicit, fallbackLabel])).map(normalize).filter((value) => value.length >= 3);
}

function controlText(element: Element) {
  const html = element as HTMLElement;
  const input = element as HTMLInputElement;
  return normalize(
    [
      html.innerText,
      html.getAttribute("aria-label"),
      html.getAttribute("title"),
      input.value,
      html.getAttribute("data-action-permission"),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function restoreControl(element: HTMLElement) {
  if (element.dataset.crmPermissionDenied !== "true") return;
  element.dataset.crmPermissionDenied = "false";
  if (element.dataset.crmOriginalDisplay !== undefined) {
    element.style.display = element.dataset.crmOriginalDisplay;
    delete element.dataset.crmOriginalDisplay;
  }
  element.removeAttribute("aria-disabled");
  element.removeAttribute("data-crm-denied-action");
}

function denyControl(element: HTMLElement, actionKey: string) {
  if (element.dataset.crmPermissionDenied !== "true") {
    element.dataset.crmOriginalDisplay = element.style.display || "";
  }
  element.dataset.crmPermissionDenied = "true";
  element.setAttribute("aria-disabled", "true");
  element.setAttribute("data-crm-denied-action", actionKey);
  element.style.display = "none";
}

export default function GuidePermissionRuntime({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { legacyMode, canAction } = useAccess();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const guideKey = guideKeyForPath(location.pathname);
    const guide = guideKey ? ACCESS_GUIDE_BY_KEY.get(guideKey) : null;

    const scan = () => {
      const controls = root.querySelectorAll<HTMLElement>(
        'button,a[role="button"],[role="button"],input[type="button"],input[type="submit"],[data-action-permission]',
      );

      if (!guideKey || !guide || legacyMode) {
        controls.forEach(restoreControl);
        return;
      }

      const actionRules = guide.actions.map((action) => ({
        key: action.key,
        allowed: canAction(guideKey, action.key),
        aliases: aliasesFor(guideKey, action.key, action.label),
      }));

      controls.forEach((control) => {
        const explicitPermission = normalize(control.getAttribute("data-action-permission") || "");
        if (explicitPermission) {
          const exact = actionRules.find((rule) => normalize(rule.key) === explicitPermission);
          if (exact && !exact.allowed) denyControl(control, exact.key);
          else restoreControl(control);
          return;
        }

        const text = controlText(control);
        if (!text) {
          restoreControl(control);
          return;
        }

        const matches = actionRules.filter((rule) => rule.aliases.some((alias) => text.includes(alias)));
        if (!matches.length || matches.some((rule) => rule.allowed)) {
          restoreControl(control);
          return;
        }
        denyControl(control, matches[0].key);
      });
    };

    scan();
    const observer = new MutationObserver(() => scan());
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label", "title", "value"] });

    const blockDenied = (event: Event) => {
      const target = event.target as Element | null;
      const denied = target?.closest?.('[data-crm-permission-denied="true"]');
      if (!denied) return;
      event.preventDefault();
      event.stopPropagation();
      if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
    };
    root.addEventListener("click", blockDenied, true);

    return () => {
      observer.disconnect();
      root.removeEventListener("click", blockDenied, true);
      root.querySelectorAll<HTMLElement>('[data-crm-permission-denied="true"]').forEach(restoreControl);
    };
  }, [canAction, legacyMode, location.pathname]);

  return <div ref={rootRef}>{children}</div>;
}
