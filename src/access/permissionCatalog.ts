export type AccessGroupKey = "vendas" | "marketing" | "pos" | "admin" | "fin" | "max";
export type PermissionKind = "info" | "action";

export type PermissionOption = {
  key: string;
  label: string;
  description?: string;
};

export type GuideDefinition = {
  key: string;
  group: AccessGroupKey;
  label: string;
  path: string;
  pathPrefixes: string[];
  description: string;
  information: PermissionOption[];
  actions: PermissionOption[];
};

export type GuidePermission = {
  view?: boolean;
  information?: Record<string, boolean>;
  actions?: Record<string, boolean>;
};

export type PermissionMatrix = Record<string, GuidePermission>;

export const ACCESS_GROUPS: Array<{ key: AccessGroupKey; label: string }> = [
  { key: "vendas", label: "Vendas" },
  { key: "marketing", label: "Marketing" },
  { key: "pos", label: "Pós-venda" },
  { key: "admin", label: "Administrativo" },
  { key: "fin", label: "Financeiro" },
  { key: "max", label: "Maximize-se" },
];

export const ACCESS_GUIDES: GuideDefinition[] = [
  {
    key: "sala_guerra",
    group: "vendas",
    label: "Sala de Guerra",
    path: "/planejamento",
    pathPrefixes: ["/planejamento"],
    description: "Planejamento comercial, metas, prioridades e acompanhamento da execução da semana.",
    information: [
      { key: "own_plan", label: "Ver o próprio planejamento" },
      { key: "team_plan", label: "Ver planejamento e indicadores da equipe" },
      { key: "targets", label: "Ver metas e indicadores comerciais" },
    ],
    actions: [
      { key: "edit_plan", label: "Criar e editar planejamento" },
      { key: "edit_targets", label: "Definir ou ajustar metas" },
      { key: "manage_team", label: "Acompanhar e orientar a equipe" },
    ],
  },
  {
    key: "oportunidades",
    group: "vendas",
    label: "Oportunidades",
    path: "/oportunidades",
    pathPrefixes: ["/oportunidades", "/leads"],
    description: "Funil comercial, leads, qualificação, follow-ups, propostas e fechamento.",
    information: [
      { key: "commercial_values", label: "Ver valores de crédito e dados comerciais" },
      { key: "score_ai", label: "Ver score, diagnóstico e direção da IA" },
      { key: "seller", label: "Ver vendedor responsável" },
      { key: "history", label: "Ver histórico, anotações e follow-ups" },
      { key: "simulations", label: "Ver simulações e propostas vinculadas" },
    ],
    actions: [
      { key: "create_lead", label: "Criar lead" },
      { key: "create_opportunity", label: "Criar oportunidade" },
      { key: "treat", label: "Tratar oportunidade" },
      { key: "edit", label: "Editar dados comerciais" },
      { key: "change_stage", label: "Mover etapa do funil" },
      { key: "follow_up", label: "Registrar e reagendar follow-up" },
      { key: "reassign", label: "Reatribuir vendedor" },
      { key: "whatsapp", label: "Acionar WhatsApp pelo card" },
      { key: "call", label: "Realizar ligação pelo CRM" },
      { key: "qualify_ai", label: "Executar qualificação com IA" },
      { key: "close_won", label: "Fechar como ganho" },
      { key: "close_lost", label: "Fechar como perdido" },
    ],
  },
  {
    key: "whatsapp",
    group: "vendas",
    label: "WhatsApp",
    path: "/whatsapp/atendimento",
    pathPrefixes: ["/whatsapp", "/atendimento-whatsapp", "/central-whatsapp", "/atendimento"],
    description: "Atendimento, mensagens, modelos, mídia, campanhas e autorizações do WhatsApp.",
    information: [
      { key: "conversations", label: "Ver conversas e histórico" },
      { key: "campaigns", label: "Ver campanhas" },
      { key: "templates", label: "Ver modelos aprovados" },
      { key: "authorizations", label: "Ver autorizações e consentimentos" },
    ],
    actions: [
      { key: "send_text", label: "Enviar mensagens de texto" },
      { key: "send_media", label: "Enviar imagens e PDFs" },
      { key: "send_audio", label: "Gravar e enviar áudio" },
      { key: "send_template", label: "Enviar modelos oficiais" },
      { key: "calls", label: "Realizar e atender chamadas" },
      { key: "create_campaign", label: "Criar campanha" },
      { key: "dispatch_campaign", label: "Disparar campanha" },
      { key: "manage_templates", label: "Gerenciar modelos" },
      { key: "manage_authorizations", label: "Gerenciar autorizações" },
    ],
  },
  {
    key: "agenda",
    group: "vendas",
    label: "Agenda",
    path: "/agenda",
    pathPrefixes: ["/agenda"],
    description: "Agenda comercial, reuniões, compromissos e automações relacionadas.",
    information: [
      { key: "own_events", label: "Ver a própria agenda" },
      { key: "team_events", label: "Ver agenda dos prepostos da cascata" },
      { key: "birthdays", label: "Ver aniversários e alertas" },
    ],
    actions: [
      { key: "create", label: "Criar compromisso" },
      { key: "edit", label: "Editar compromisso" },
      { key: "delete", label: "Excluir compromisso" },
      { key: "live_meeting", label: "Criar/entrar em sala de reunião" },
      { key: "birthday_whatsapp", label: "Enviar felicitação de aniversário pelo WhatsApp" },
    ],
  },
  {
    key: "simuladores",
    group: "vendas",
    label: "Simuladores",
    path: "/simuladores",
    pathPrefixes: ["/simuladores"],
    description: "Simuladores das administradoras e estratégias comerciais.",
    information: [
      { key: "tables", label: "Ver tabelas, taxas e parâmetros comerciais" },
      { key: "saved", label: "Ver simulações salvas" },
    ],
    actions: [
      { key: "simulate", label: "Realizar simulações" },
      { key: "save", label: "Salvar simulação" },
      { key: "share", label: "Compartilhar/resumir simulação" },
      { key: "manage_admins", label: "Adicionar ou configurar administradoras" },
    ],
  },
  {
    key: "central_grupos",
    group: "vendas",
    label: "Central de Grupos",
    path: "/central-grupos",
    pathPrefixes: ["/central-grupos", "/grupos-disponiveis", "/robos/area-restrita-maggi", "/area-restrita-maggi"],
    description: "Consulta de grupos, assembleias, taxas, lances e sincronizações dos robôs.",
    information: [
      { key: "groups", label: "Ver grupos e faixas de crédito" },
      { key: "fees", label: "Ver taxa administrativa, FR e seguro" },
      { key: "assembly", label: "Ver resultados de assembleia e lances" },
      { key: "robot_status", label: "Ver status e histórico das sincronizações" },
    ],
    actions: [
      { key: "filter", label: "Filtrar e pesquisar grupos" },
      { key: "sync", label: "Executar sincronização" },
      { key: "run_robot", label: "Executar robôs manualmente" },
      { key: "edit", label: "Editar dados/configurações do grupo" },
    ],
  },
  {
    key: "propostas",
    group: "vendas",
    label: "Propostas",
    path: "/propostas",
    pathPrefixes: ["/propostas"],
    description: "Criação, edição, envio e acompanhamento de propostas comerciais.",
    information: [
      { key: "own", label: "Ver propostas próprias" },
      { key: "team", label: "Ver propostas da cascata" },
      { key: "metrics", label: "Ver indicadores de geração, envio e abertura" },
    ],
    actions: [
      { key: "create", label: "Criar proposta" },
      { key: "edit", label: "Editar proposta" },
      { key: "send", label: "Enviar proposta" },
      { key: "duplicate", label: "Duplicar proposta" },
      { key: "export", label: "Exportar/baixar proposta" },
      { key: "delete", label: "Excluir proposta" },
    ],
  },
  {
    key: "propostas_pro_max",
    group: "vendas",
    label: "Propostas Pró Max",
    path: "/propostas-pro-max",
    pathPrefixes: ["/propostas-pro-max"],
    description: "Propostas avançadas, projeções, comparativos, extratos e compartilhamento público.",
    information: [
      { key: "financial_projection", label: "Ver projeção financeira e extrato mensal" },
      { key: "comparison", label: "Ver comparativos consórcio x financiamento" },
      { key: "team", label: "Ver propostas da cascata" },
    ],
    actions: [
      { key: "create", label: "Criar Pró Max" },
      { key: "edit", label: "Editar Pró Max" },
      { key: "send", label: "Enviar Pró Max" },
      { key: "share", label: "Gerar compartilhamento público" },
      { key: "export", label: "Exportar/baixar" },
      { key: "manage_parameters", label: "Gerenciar parâmetros globais" },
    ],
  },
  {
    key: "ranking",
    group: "vendas",
    label: "Ranking",
    path: "/ranking",
    pathPrefixes: ["/ranking", "/ranking-vendedores", "/ranking-vendas", "/vendedores/ranking"],
    description: "Ranking e desempenho comercial dos vendedores.",
    information: [
      { key: "own", label: "Ver a própria posição" },
      { key: "team", label: "Ver ranking da cascata" },
      { key: "global", label: "Ver ranking global" },
      { key: "values", label: "Ver valores vendidos" },
    ],
    actions: [],
  },
  {
    key: "contempladas",
    group: "vendas",
    label: "Contempladas",
    path: "/estoque-contempladas",
    pathPrefixes: ["/estoque-contempladas", "/estoque", "/cotas-contempladas"],
    description: "Estoque de cotas contempladas, filtros, avaliação e composição de cotas.",
    information: [
      { key: "credit", label: "Ver crédito, entrada e parcelas" },
      { key: "seller_margin", label: "Ver dados internos/comerciais" },
      { key: "source", label: "Ver origem/fornecedor da cota" },
    ],
    actions: [
      { key: "filter", label: "Filtrar e pesquisar cotas" },
      { key: "combine", label: "Fazer junção de cotas / usar Max" },
      { key: "edit", label: "Editar informações da cota" },
      { key: "import", label: "Importar/sincronizar estoque" },
      { key: "export", label: "Exportar dados" },
    ],
  },
  {
    key: "carteira",
    group: "pos",
    label: "Carteira",
    path: "/carteira",
    pathPrefixes: ["/carteira"],
    description: "Acompanhamento da carteira de vendas, clientes, contemplação e pós-venda.",
    information: [
      { key: "sales", label: "Ver vendas e cotas" },
      { key: "financial", label: "Ver valores financeiros e comissionamento relacionado" },
      { key: "customer_success", label: "Ver Sucesso do Cliente e relatórios" },
      { key: "seller", label: "Ver vendedor responsável" },
    ],
    actions: [
      { key: "edit", label: "Editar dados da venda/cota" },
      { key: "lance_strategy", label: "Registrar estratégia de lance" },
      { key: "customer_success", label: "Realizar Sucesso do Cliente" },
      { key: "whatsapp", label: "Acionar cliente via WhatsApp" },
      { key: "export", label: "Exportar dados/relatórios" },
    ],
  },
  {
    key: "giro_carteira",
    group: "pos",
    label: "Giro de Carteira",
    path: "/giro-de-carteira",
    pathPrefixes: ["/giro-de-carteira", "/giro"],
    description: "Planejamento e execução de giros/contatos de carteira.",
    information: [
      { key: "own", label: "Ver giros próprios" },
      { key: "team", label: "Ver giros da cascata" },
      { key: "customer_data", label: "Ver dados do cliente e da cota" },
    ],
    actions: [
      { key: "create", label: "Criar giro" },
      { key: "execute", label: "Executar/registrar contato" },
      { key: "complete", label: "Concluir giro" },
      { key: "reassign", label: "Reatribuir responsável" },
      { key: "export", label: "Exportar" },
    ],
  },
  {
    key: "gestao_grupos",
    group: "pos",
    label: "Gestão de Grupos",
    path: "/gestao-de-grupos",
    pathPrefixes: ["/gestao-de-grupos"],
    description: "Gestão de grupos da carteira, ofertas de lance e acompanhamento de assembleias.",
    information: [
      { key: "groups", label: "Ver grupos e cotas" },
      { key: "lance", label: "Ver histórico e estratégia de lance" },
      { key: "assembly", label: "Ver assembleias e resultados" },
    ],
    actions: [
      { key: "edit", label: "Editar gestão do grupo" },
      { key: "offer_lance", label: "Registrar oferta de lance" },
      { key: "whatsapp", label: "Enviar orientação pelo WhatsApp" },
      { key: "export", label: "Exportar demonstrativos" },
    ],
  },
  {
    key: "marketing",
    group: "marketing",
    label: "Central de Marketing",
    path: "/marketing",
    pathPrefixes: ["/marketing"],
    description: "Plano de mídia, calendário, conteúdos, criativos e newsletters.",
    information: [
      { key: "plan", label: "Ver plano de mídia e calendário" },
      { key: "content", label: "Ver conteúdos e pautas" },
      { key: "creatives", label: "Ver biblioteca de criativos" },
      { key: "newsletters", label: "Ver newsletters e histórico de disparo" },
    ],
    actions: [
      { key: "edit_plan", label: "Criar/editar plano de mídia" },
      { key: "create_content", label: "Criar/editar conteúdo" },
      { key: "manage_creatives", label: "Cadastrar/editar criativos" },
      { key: "create_newsletter", label: "Criar newsletter" },
      { key: "dispatch_newsletter", label: "Disparar newsletter" },
    ],
  },
  {
    key: "relatorios",
    group: "admin",
    label: "Relatórios",
    path: "/relatorios",
    pathPrefixes: ["/relatorios"],
    description: "Relatórios gerenciais, indicadores e exportações.",
    information: [
      { key: "commercial", label: "Ver indicadores comerciais" },
      { key: "team", label: "Ver dados da cascata" },
      { key: "financial", label: "Ver informações financeiras" },
      { key: "sensitive", label: "Ver informações sensíveis" },
    ],
    actions: [
      { key: "export", label: "Exportar relatórios" },
    ],
  },
  {
    key: "usuarios",
    group: "admin",
    label: "Usuários",
    path: "/usuarios",
    pathPrefixes: ["/usuarios"],
    description: "Cadastro de usuários, unidades, perfis de acesso, cascata e categoria de parceiro.",
    information: [
      { key: "list", label: "Ver lista de usuários" },
      { key: "personal", label: "Ver dados pessoais" },
      { key: "access", label: "Ver perfil, permissões e hierarquia" },
      { key: "partner_category", label: "Ver categoria do parceiro" },
    ],
    actions: [
      { key: "create", label: "Criar usuário" },
      { key: "edit", label: "Editar usuário" },
      { key: "deactivate", label: "Ativar/desativar usuário" },
      { key: "manage_units", label: "Gerenciar unidades" },
      { key: "manage_profiles", label: "Criar e editar perfis de usuário" },
      { key: "assign_profiles", label: "Atribuir perfis aos usuários" },
      { key: "manage_partner_categories", label: "Gerenciar categorias do parceiro" },
    ],
  },
  {
    key: "parametros",
    group: "admin",
    label: "Parâmetros",
    path: "/parametros",
    pathPrefixes: ["/parametros"],
    description: "Parâmetros globais e configurações operacionais do CRM.",
    information: [
      { key: "view_values", label: "Ver parâmetros configurados" },
    ],
    actions: [
      { key: "edit", label: "Alterar parâmetros" },
    ],
  },
  {
    key: "clientes",
    group: "admin",
    label: "Clientes",
    path: "/clientes",
    pathPrefixes: ["/clientes"],
    description: "Cadastro de clientes, vendas relacionadas e Sucesso do Cliente.",
    information: [
      { key: "personal", label: "Ver dados cadastrais" },
      { key: "sales", label: "Ver vendas/cotas do cliente" },
      { key: "sensitive", label: "Ver dados sensíveis" },
      { key: "customer_success", label: "Ver Sucesso do Cliente e análise FOFA" },
    ],
    actions: [
      { key: "create", label: "Criar cliente" },
      { key: "edit", label: "Editar cadastro" },
      { key: "customer_success", label: "Realizar Sucesso do Cliente" },
      { key: "download_report", label: "Baixar relatório do atendimento" },
      { key: "whatsapp", label: "Acionar WhatsApp" },
      { key: "export", label: "Exportar dados" },
    ],
  },
  {
    key: "meus_parceiros",
    group: "admin",
    label: "Meus Parceiros",
    path: "/meus-parceiros",
    pathPrefixes: ["/meus-parceiros"],
    description: "Parceiros indicadores, indicações, conversões e comissões pactuadas.",
    information: [
      { key: "registration", label: "Ver cadastro do parceiro" },
      { key: "metrics", label: "Ver indicações, conversões e comissão gerada" },
    ],
    actions: [
      { key: "create", label: "Cadastrar parceiro indicador" },
      { key: "edit", label: "Editar parceiro indicador" },
      { key: "export", label: "Exportar" },
    ],
  },
  {
    key: "processos",
    group: "admin",
    label: "Processos",
    path: "/processos",
    pathPrefixes: ["/processos"],
    description: "Acompanhamento de processos internos, responsáveis, etapas e prazos.",
    information: [
      { key: "list", label: "Ver processos" },
      { key: "details", label: "Ver detalhes e histórico" },
      { key: "team", label: "Ver processos da cascata/equipe" },
    ],
    actions: [
      { key: "create", label: "Criar processo" },
      { key: "edit", label: "Editar processo" },
      { key: "change_status", label: "Alterar etapa/status" },
      { key: "assign", label: "Atribuir responsável" },
      { key: "delete", label: "Excluir processo" },
    ],
  },
  {
    key: "rh",
    group: "admin",
    label: "RH",
    path: "/rh",
    pathPrefixes: ["/rh"],
    description: "Colaboradores, vínculos, vagas e rotinas de Recursos Humanos.",
    information: [
      { key: "employees", label: "Ver colaboradores" },
      { key: "contracts", label: "Ver vínculos e informações profissionais" },
      { key: "sensitive", label: "Ver informações sensíveis de RH" },
      { key: "vacancies", label: "Ver vagas e candidatos" },
    ],
    actions: [
      { key: "manage_employees", label: "Cadastrar/editar colaboradores" },
      { key: "manage_contracts", label: "Gerenciar vínculos" },
      { key: "manage_vacancies", label: "Criar/editar vagas" },
      { key: "manage_candidates", label: "Gerenciar candidatos" },
    ],
  },
  {
    key: "comissoes",
    group: "fin",
    label: "Comissões",
    path: "/comissoes",
    pathPrefixes: ["/comissoes"],
    description: "Comissões, regras, fluxo de recebimento/pagamento, recibos e estornos.",
    information: [
      { key: "own", label: "Ver próprias comissões" },
      { key: "team", label: "Ver comissões da cascata" },
      { key: "global", label: "Ver comissões globais" },
      { key: "rules", label: "Ver regras e percentuais" },
      { key: "taxes", label: "Ver impostos e valores líquidos" },
    ],
    actions: [
      { key: "manage_rules", label: "Configurar regras/percentuais" },
      { key: "register_receipt", label: "Registrar recebimento da administradora" },
      { key: "pay", label: "Registrar pagamento" },
      { key: "upload_receipt", label: "Anexar recibos/comprovantes" },
      { key: "adjust", label: "Realizar ajustes" },
      { key: "chargeback", label: "Lançar/reverter estorno" },
      { key: "edit_dates", label: "Editar datas" },
      { key: "export", label: "Exportar demonstrativos" },
    ],
  },
  {
    key: "fluxo_caixa",
    group: "fin",
    label: "Fluxo de Caixa",
    path: "/fluxo-de-caixa",
    pathPrefixes: ["/fluxo-de-caixa"],
    description: "Entradas, saídas, saldos e controle do fluxo financeiro.",
    information: [
      { key: "entries", label: "Ver lançamentos" },
      { key: "balances", label: "Ver saldos e totais" },
    ],
    actions: [
      { key: "create", label: "Criar lançamento" },
      { key: "edit", label: "Editar lançamento" },
      { key: "delete", label: "Excluir lançamento" },
      { key: "export", label: "Exportar" },
    ],
  },
  {
    key: "central_projetos",
    group: "max",
    label: "Central de Projetos",
    path: "/central-projetos",
    pathPrefixes: ["/central-projetos", "/gestao-de-projetos", "/projetos"],
    description: "Projetos internos, tarefas, responsáveis, prazos e andamento.",
    information: [
      { key: "list", label: "Ver projetos" },
      { key: "details", label: "Ver detalhes, tarefas e histórico" },
      { key: "team", label: "Ver projetos da equipe" },
    ],
    actions: [
      { key: "create", label: "Criar projeto" },
      { key: "edit", label: "Editar projeto" },
      { key: "assign", label: "Atribuir responsáveis" },
      { key: "change_status", label: "Alterar andamento/status" },
      { key: "delete", label: "Excluir projeto" },
    ],
  },
  {
    key: "procedimentos",
    group: "max",
    label: "Procedimentos",
    path: "/procedimentos",
    pathPrefixes: ["/procedimentos"],
    description: "Base de procedimentos e instruções operacionais da empresa.",
    information: [
      { key: "published", label: "Ver procedimentos publicados" },
      { key: "drafts", label: "Ver rascunhos e conteúdo interno" },
    ],
    actions: [
      { key: "create", label: "Criar procedimento" },
      { key: "edit", label: "Editar procedimento" },
      { key: "publish", label: "Publicar/despublicar" },
      { key: "delete", label: "Excluir procedimento" },
    ],
  },
  {
    key: "links",
    group: "max",
    label: "Links Úteis",
    path: "/links",
    pathPrefixes: ["/links", "/links-uteis", "/linksuteis"],
    description: "Biblioteca de links e atalhos úteis para a operação.",
    information: [
      { key: "list", label: "Ver links" },
    ],
    actions: [
      { key: "create", label: "Cadastrar link" },
      { key: "edit", label: "Editar link" },
      { key: "delete", label: "Excluir link" },
    ],
  },
];

export const ACCESS_GUIDE_BY_KEY = new Map(ACCESS_GUIDES.map((guide) => [guide.key, guide]));

export function guideKeyForPath(pathname: string): string | null {
  const normalized = pathname || "/";
  const sorted = [...ACCESS_GUIDES].sort((a, b) => {
    const maxA = Math.max(...a.pathPrefixes.map((p) => p.length));
    const maxB = Math.max(...b.pathPrefixes.map((p) => p.length));
    return maxB - maxA;
  });

  for (const guide of sorted) {
    if (guide.pathPrefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
      return guide.key;
    }
  }
  return null;
}

export function permissionAllowed(
  matrix: PermissionMatrix | null | undefined,
  guideKey: string,
  kind: PermissionKind | "view",
  permissionKey?: string,
): boolean {
  if (!matrix) return false;
  const wildcard = matrix["*"];
  if (wildcard?.view === true && kind === "view") return true;
  if (wildcard?.actions?.["*"] === true && kind === "action") return true;
  if (wildcard?.information?.["*"] === true && kind === "info") return true;

  const guide = matrix[guideKey];
  if (!guide) return false;
  if (kind === "view") return guide.view === true;
  if (!permissionKey) return false;
  if (kind === "action") return guide.actions?.[permissionKey] === true;
  return guide.information?.[permissionKey] === true;
}

export function buildFullPermissionMatrix(): PermissionMatrix {
  return ACCESS_GUIDES.reduce<PermissionMatrix>((acc, guide) => {
    acc[guide.key] = {
      view: true,
      information: Object.fromEntries(guide.information.map((item) => [item.key, true])),
      actions: Object.fromEntries(guide.actions.map((item) => [item.key, true])),
    };
    return acc;
  }, {});
}

export function buildReadOnlyPermissionMatrix(): PermissionMatrix {
  return ACCESS_GUIDES.reduce<PermissionMatrix>((acc, guide) => {
    acc[guide.key] = {
      view: true,
      information: Object.fromEntries(guide.information.map((item) => [item.key, true])),
      actions: Object.fromEntries(guide.actions.map((item) => [item.key, false])),
    };
    return acc;
  }, {});
}
