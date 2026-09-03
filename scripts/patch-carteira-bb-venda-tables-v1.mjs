import fs from "node:fs";

const file = "src/pages/Carteira.tsx";
let src = fs.readFileSync(file, "utf8");

function replaceOnce(search, replacement, label) {
  if (src.includes(replacement)) return;
  if (!src.includes(search)) {
    throw new Error(`[patch-carteira-bb-venda-tables-v1] Âncora não encontrada: ${label}`);
  }
  src = src.replace(search, replacement);
}

const configAnchor = `const FORMAS: FormaVenda[] = ["Parcela Cheia", "Reduzida 25%", "Reduzida 50%"];`;
const configBlock = `const BB_VENDA_PRODUTOS: Produto[] = ["Automóvel", "Imóvel", "Serviço", "Motocicleta", "Pesados"];

const BB_VENDA_TABELAS: Partial<Record<Produto, readonly string[]>> = {
  "Automóvel": ["Auto Fipe", "Auto IPCA"],
  "Imóvel": ["Mais BBC Imóveis 240", "Mais BBC Todos Segmentos"],
  "Serviço": ["Outros Bens Móveis"],
  "Motocicleta": ["Motocicleta"],
  "Pesados": ["Trator e Caminhão Geral"],
};

function isBBVendaAdmin(name: string | null | undefined): boolean {
  const key = (name || "")
    .toString()
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  return key === "bb consorcios" || key.includes("banco do brasil") || key.includes("bb consorcio");
}

function bbVendaTabelas(produto: Produto | string | null | undefined): readonly string[] {
  return BB_VENDA_TABELAS[(produto || "") as Produto] ?? [];
}

${configAnchor}`;

if (!src.includes("const BB_VENDA_PRODUTOS")) {
  replaceOnce(configAnchor, configBlock, "configuração de produtos/tabelas BB");
}

const productResetAnchor = `  useEffect(() => {
    setForm((f) => ({ ...f, tabela: "" }));
  }, [form.produto]);`;
const productResetReplacement = `${productResetAnchor}

  useEffect(() => {
    if (!isBBVendaAdmin(form.administradora as string)) return;

    const currentProduto = form.produto as Produto;
    const currentTabela = (form.tabela || "").toString();
    const produtoPermitido = BB_VENDA_PRODUTOS.includes(currentProduto);
    const produtoCorrigido = produtoPermitido ? currentProduto : BB_VENDA_PRODUTOS[0];
    const tabelasPermitidas = bbVendaTabelas(produtoCorrigido);
    const tabelaValida = !currentTabela || tabelasPermitidas.includes(currentTabela);

    if (produtoPermitido && tabelaValida) return;

    setForm((f) => ({
      ...f,
      produto: produtoCorrigido,
      tabela: tabelaValida ? f.tabela : "",
    }));
  }, [form.administradora, form.produto, form.tabela]);`;

if (!src.includes("const currentProduto = form.produto as Produto;")) {
  replaceOnce(productResetAnchor, productResetReplacement, "normalização do formulário BB");
}

const validationAnchor = `      if (!form.numero_proposta?.trim()) throw new Error("Número da proposta é obrigatório.");`;
const validationReplacement = `${validationAnchor}

      if (isBBVendaAdmin(form.administradora as string)) {
        const tabelasPermitidasBB = bbVendaTabelas(form.produto as Produto);
        if (!tabelasPermitidasBB.length) throw new Error("Este segmento não é habilitado para BB CONSÓRCIOS.");
        if (!form.tabela?.trim()) throw new Error("Selecione a tabela do BB CONSÓRCIOS.");
        if (!tabelasPermitidasBB.includes(form.tabela)) throw new Error("A tabela selecionada não pertence ao segmento informado para BB CONSÓRCIOS.");
      }`;

if (!src.includes("const tabelasPermitidasBB = bbVendaTabelas")) {
  replaceOnce(validationAnchor, validationReplacement, "validação da tabela BB");
}

const tabelaOptionsRegex = /  const tabelaOptions = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[form\.produto, form\.administradora, simTables, simAdmins\]\);/;
const tabelaOptionsReplacement = `  const tabelaOptions = useMemo(() => {
    const prod = (form.produto as Produto) || "Automóvel";
    const admName = (form.administradora as string) || "";
    const admId = simAdmins.find((a) => a.name === admName)?.id;

    if (isBBVendaAdmin(admName)) {
      return bbVendaTabelas(prod).map((nome_tabela, index) => ({
        id: \`bb-venda-\${normalizeTableName(prod)}-\${index}\`,
        admin_id: admId ?? "bb-consorcios",
        segmento: normalizeProdutoToSegmento(prod) ?? prod,
        nome_tabela,
        faixa_min: null,
        faixa_max: null,
        prazo_limite: null,
      }));
    }

    const filtered = simTables.filter((t) => {
      if (admId && t.admin_id !== admId) return false;
      return produtoMatchesTableSegment(prod, t.segmento);
    });

    const seen = new Set<string>();
    const unique = filtered.filter((t) => {
      const key = normalizeTableName(t.nome_tabela);
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique;
  }, [form.produto, form.administradora, simTables, simAdmins]);`;

if (!src.includes('id: `bb-venda-${normalizeTableName(prod)}-${index}`')) {
  if (!tabelaOptionsRegex.test(src)) throw new Error("[patch-carteira-bb-venda-tables-v1] Bloco tabelaOptions não encontrado");
  src = src.replace(tabelaOptionsRegex, tabelaOptionsReplacement);
}

const produtoOptionsRegex = /  const produtoOptionsForAdmin: Produto\[\] = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[form\.administradora, simAdmins, simTables\]\);/;
const produtoOptionsReplacement = `  const produtoOptionsForAdmin: Produto[] = useMemo(() => {
    const admName = (form.administradora as string) || "";
    if (isBBVendaAdmin(admName)) return BB_VENDA_PRODUTOS;

    const admId = simAdmins.find((a) => a.name === admName)?.id;
    if (!admId) return PRODUTOS;

    const segSet = new Set(simTables.filter((t) => t.admin_id === admId).map((t) => normalizeSegmentLabel(t.segmento)));

    const filtered = PRODUTOS.filter((p) => {
      const candidates = segmentCandidatesForProduto(p);
      return candidates.some((c) => segSet.has(c));
    });

    return filtered.length ? filtered : PRODUTOS;
  }, [form.administradora, simAdmins, simTables]);`;

if (!src.includes("if (isBBVendaAdmin(admName)) return BB_VENDA_PRODUTOS;")) {
  if (!produtoOptionsRegex.test(src)) throw new Error("[patch-carteira-bb-venda-tables-v1] Bloco produtoOptionsForAdmin não encontrado");
  src = src.replace(produtoOptionsRegex, produtoOptionsReplacement);
}

const adminChangeAnchor = `                      if (admId) {
                        const segSet = new Set(simTables.filter((t) => t.admin_id === admId).map((t) => normalizeSegmentLabel(t.segmento)));

                        const allowed = PRODUTOS.filter((p) => {
                          const candidates = segmentCandidatesForProduto(p);
                          return candidates.some((c) => segSet.has(c));
                        });

                        if (allowed.length && !allowed.includes(nextProduto as Produto)) nextProduto = allowed[0];
                      }`;
const adminChangeReplacement = `                      if (isBBVendaAdmin(value)) {
                        if (!BB_VENDA_PRODUTOS.includes(nextProduto)) nextProduto = BB_VENDA_PRODUTOS[0];
                      } else if (admId) {
                        const segSet = new Set(simTables.filter((t) => t.admin_id === admId).map((t) => normalizeSegmentLabel(t.segmento)));

                        const allowed = PRODUTOS.filter((p) => {
                          const candidates = segmentCandidatesForProduto(p);
                          return candidates.some((c) => segSet.has(c));
                        });

                        if (allowed.length && !allowed.includes(nextProduto as Produto)) nextProduto = allowed[0];
                      }`;

if (!src.includes("if (isBBVendaAdmin(value))")) {
  replaceOnce(adminChangeAnchor, adminChangeReplacement, "troca de administradora no modal Nova Venda");
}

fs.writeFileSync(file, src, "utf8");
console.log("[patch-carteira-bb-venda-tables-v1] OK");
