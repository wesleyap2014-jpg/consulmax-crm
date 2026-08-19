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

const INFO_ALIASES: Record<string, Record<string, string[]>> = {
  sala_guerra: {
    own_plan: ["meu planejamento", "planejamento"],
    team_plan: ["equipe", "time", "vendedor"],
    targets: ["meta", "indicador", "resultado"],
  },
  oportunidades: {
    commercial_values: ["credito", "crédito", "valor", "r$", "entrada", "parcela"],
    score_ai: ["score", "qualificacao", "qualificação", "max", "ia"],
    seller: ["vendedor", "responsavel", "responsável"],
    history: ["historico", "histórico", "follow up", "follow-up", "anotacoes", "anotações"],
    simulations: ["simulacao", "simulação", "proposta"],
  },
  whatsapp: {
    conversations: ["conversa", "mensagem", "historico", "histórico"],
    campaigns: ["campanha"],
    templates: ["modelo", "template"],
    authorizations: ["autorizacao", "autorização", "consentimento"],
  },
  agenda: {
    own_events: ["minha agenda", "meus eventos"],
    team_events: ["equipe", "vendedor", "responsavel", "responsável"],
    birthdays: ["aniversario", "aniversário"],
  },
  simuladores: {
    tables: ["tabela", "taxa", "prazo", "parcela", "credito", "crédito"],
    saved: ["salvas", "salvos", "historico", "histórico"],
  },
  central_grupos: {
    groups: ["grupo", "segmento", "credito", "crédito", "prazo"],
    fees: ["taxa", "adm", "fr", "fundo", "seguro"],
    assembly: ["assembleia", "lance", "mediana", "maior", "menor"],
    robot_status: ["sincronizacao", "sincronização", "robo", "robô", "status"],
  },
  propostas: {
    own: ["minhas propostas", "vendedor"],
    team: ["equipe", "unidade", "vendedor"],
    metrics: ["geradas", "enviadas", "abertas", "kpi", "indicador"],
  },
  propostas_pro_max: {
    financial_projection: ["projecao", "projeção", "extrato", "parcela", "saldo", "financeiro"],
    comparison: ["comparativo", "financiamento", "sac", "price"],
    team: ["equipe", "unidade", "vendedor"],
  },
  ranking: {
    own: ["minha posicao", "minha posição"],
    team: ["equipe", "filial", "unidade"],
    global: ["ranking", "posicao", "posição"],
    values: ["valor", "credito vendido", "crédito vendido", "vendas"],
  },
  contempladas: {
    credit: ["credito", "crédito", "entrada", "parcela", "saldo", "avaliacao", "avaliação"],
    seller_margin: ["margem", "comissao", "comissão", "interno"],
    source: ["origem", "fornecedor", "administradora"],
  },
  carteira: {
    sales: ["venda", "cota", "grupo", "proposta"],
    financial: ["valor", "credito", "crédito", "comissao", "comissão", "parcela"],
    customer_success: ["sucesso do cliente", "fofa", "atendimento"],
    seller: ["vendedor", "responsavel", "responsável"],
  },
  giro_carteira: {
    own: ["meus giros", "responsavel", "responsável"],
    team: ["equipe", "vendedor", "unidade"],
    customer_data: ["cliente", "telefone", "cota", "grupo", "credito", "crédito"],
  },
  gestao_grupos: {
    groups: ["grupo", "cota", "credito", "crédito"],
    lance: ["lance", "estrategia", "estratégia"],
    assembly: ["assembleia", "resultado"],
  },
  marketing: {
    plan: ["plano de midia", "plano de mídia", "calendario", "calendário"],
    content: ["conteudo", "conteúdo", "pauta"],
    creatives: ["criativo", "biblioteca"],
    newsletters: ["newsletter", "disparo"],
  },
  relatorios: {
    commercial: ["comercial", "vendas", "conversao", "conversão"],
    team: ["equipe", "vendedor", "unidade"],
    financial: ["financeiro", "receita", "comissao", "comissão", "valor"],
    sensitive: ["cpf", "pix", "telefone", "email", "e-mail"],
  },
  usuarios: {
    list: ["nome", "usuario", "usuário"],
    personal: ["e-mail", "email", "celular", "telefone", "pix", "cpf"],
    access: ["papel", "perfil de acesso", "nivel", "nível", "unidade", "cascata"],
    partner_category: ["categoria", "partner", "associado"],
  },
  parametros: {
    view_values: ["valor", "parametro", "parâmetro", "configuracao", "configuração"],
  },
  clientes: {
    personal: ["cpf", "telefone", "celular", "e-mail", "email", "endereco", "endereço"],
    sales: ["venda", "cota", "grupo", "credito", "crédito"],
    sensitive: ["cpf", "pix", "renda", "documento"],
    customer_success: ["sucesso do cliente", "fofa", "atendimento"],
  },
  meus_parceiros: {
    registration: ["nome", "telefone", "e-mail", "email", "cpf", "cnpj", "pix"],
    metrics: ["indicacoes", "indicações", "convertidas", "comissao", "comissão"],
  },
  processos: {
    list: ["processo", "status", "prazo"],
    details: ["detalhe", "historico", "histórico", "descricao", "descrição"],
    team: ["responsavel", "responsável", "equipe", "unidade"],
  },
  rh: {
    employees: ["colaborador", "funcionario", "funcionário", "nome"],
    contracts: ["contrato", "cargo", "setor", "admissao", "admissão"],
    sensitive: ["cpf", "salario", "salário", "pix", "endereco", "endereço"],
    vacancies: ["vaga", "candidato"],
  },
  comissoes: {
    own: ["minhas comissoes", "minhas comissões"],
    team: ["vendedor", "equipe", "unidade"],
    global: ["empresa", "matriz", "total"],
    rules: ["regra", "percentual", "%"],
    taxes: ["imposto", "liquido", "líquido", "tributo"],
  },
  fluxo_caixa: {
    entries: ["lancamento", "lançamento", "entrada", "saida", "saída", "descricao", "descrição"],
    balances: ["saldo", "total", "resultado"],
  },
  central_projetos: {
    list: ["projeto", "status", "prazo"],
    details: ["detalhe", "tarefa", "historico", "histórico"],
    team: ["responsavel", "responsável", "equipe"],
  },
  procedimentos: {
    published: ["publicado", "procedimento"],
    drafts: ["rascunho", "interno"],
  },
  links: {
    list: ["link", "url", "categoria"],
  },
};

function restore(element: HTMLElement) {
  if (element.dataset.crmInfoDenied !== "true") return;
  element.dataset.crmInfoDenied = "false";
  if (element.dataset.crmInfoOriginalDisplay !== undefined) {
    element.style.display = element.dataset.crmInfoOriginalDisplay;
    delete element.dataset.crmInfoOriginalDisplay;
  }
  element.removeAttribute("data-crm-denied-info");
}

function hide(element: HTMLElement, permissionKey: string) {
  if (element.dataset.crmInfoDenied !== "true") {
    element.dataset.crmInfoOriginalDisplay = element.style.display || "";
  }
  element.dataset.crmInfoDenied = "true";
  element.dataset.crmDeniedInfo = permissionKey;
  element.style.display = "none";
}

function aliasesFor(guideKey: string, key: string, label: string) {
  return Array.from(new Set([...(INFO_ALIASES[guideKey]?.[key] || []), label]))
    .map(normalize)
    .filter((value) => value.length >= 2);
}

export default function GuideInformationRuntime({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { legacyMode, canInfo } = useAccess();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const guideKey = guideKeyForPath(location.pathname);
    const guide = guideKey ? ACCESS_GUIDE_BY_KEY.get(guideKey) : null;

    const scan = () => {
      const previouslyHidden = root.querySelectorAll<HTMLElement>('[data-crm-info-denied="true"]');
      previouslyHidden.forEach(restore);
      if (!guideKey || !guide || legacyMode) return;

      const rules = guide.information.map((info) => ({
        key: info.key,
        allowed: canInfo(guideKey, info.key),
        aliases: aliasesFor(guideKey, info.key, info.label),
      }));

      root.querySelectorAll<HTMLElement>("[data-info-permission]").forEach((element) => {
        const key = element.getAttribute("data-info-permission") || "";
        const rule = rules.find((candidate) => candidate.key === key);
        if (rule && !rule.allowed) hide(element, rule.key);
      });

      root.querySelectorAll<HTMLTableElement>("table").forEach((table) => {
        const headers = Array.from(table.querySelectorAll<HTMLElement>("thead th"));
        headers.forEach((header, index) => {
          const text = normalize(header.innerText || header.textContent || "");
          if (!text) return;
          const matches = rules.filter((rule) => rule.aliases.some((alias) => text.includes(alias)));
          if (!matches.length || matches.some((rule) => rule.allowed)) return;
          hide(header, matches[0].key);
          table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row) => {
            const cell = row.children[index] as HTMLElement | undefined;
            if (cell) hide(cell, matches[0].key);
          });
        });
      });
    };

    scan();
    const observer = new MutationObserver(() => scan());
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      root.querySelectorAll<HTMLElement>('[data-crm-info-denied="true"]').forEach(restore);
    };
  }, [canInfo, legacyMode, location.pathname]);

  return <div ref={rootRef}>{children}</div>;
}
