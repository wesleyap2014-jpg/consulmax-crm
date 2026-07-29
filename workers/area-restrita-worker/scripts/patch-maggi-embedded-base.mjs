import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/group-document-ai.mjs");
let source = fs.readFileSync(file, "utf8");

const validationAnchor = '  if (!fieldIsSupported(result, "lanceEmbutidoBase")) result.lanceEmbutidoBase = "nao_informado";';
if (!source.includes('result.lanceEmbutidoBase = "valor_categoria"; // regra global Maggi')) {
  if (!source.includes(validationAnchor)) {
    throw new Error("Não foi possível localizar a validação da base do lance embutido.");
  }
  source = source.replace(
    validationAnchor,
    `${validationAnchor}\n  result.lanceEmbutidoBase = "valor_categoria"; // regra global Maggi`,
  );
}

const oldConfigBlock = `  if (result?.lanceEmbutidoBase && result.lanceEmbutidoBase !== "nao_informado") {
    nextConfig.lanceEmbutidoBase = result.lanceEmbutidoBase;
    nextConfig.baseCalculoEmbutido = result.lanceEmbutidoBase;
  }`;
const fixedConfigBlock = `  // Na Maggi, a base do lance embutido é sempre o valor da categoria:
  // crédito + taxa de administração + fundo de reserva.
  nextConfig.lanceEmbutidoBase = "valor_categoria";
  nextConfig.baseCalculoEmbutido = "valor_categoria";`;
if (source.includes(oldConfigBlock)) source = source.replace(oldConfigBlock, fixedConfigBlock);
if (!source.includes('nextConfig.lanceEmbutidoBase = "valor_categoria";')) {
  throw new Error("Não foi possível fixar a base do lance embutido no config.");
}

const promptAnchor = '- "valor_categoria" significa crédito acrescido de taxa de administração e fundo de reserva.';
const promptRule = '- Regra global Maggi: a base do lance embutido é sempre "valor_categoria" (crédito + taxa de administração + fundo de reserva), mesmo quando o PDF estiver omisso ou trouxer texto incompleto. Não tente inferir outra base.';
if (!source.includes(promptRule)) {
  if (!source.includes(promptAnchor)) throw new Error("Não foi possível localizar o prompt da IA.");
  source = source.replace(promptAnchor, `${promptRule}\n${promptAnchor}`);
}

fs.writeFileSync(file, source);
console.log("Base do lance embutido Maggi fixada como crédito + taxa de administração + fundo de reserva.");
