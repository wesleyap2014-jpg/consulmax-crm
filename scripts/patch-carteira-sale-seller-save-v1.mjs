import fs from "node:fs";
const file="src/pages/Carteira.tsx";let src=fs.readFileSync(file,"utf8");
const oldStart=`      const segmento = normalizeProdutoToSegmento(form.produto as Produto);\n      const payload: Partial<Venda> = {`;
const newStart=`      const segmento = normalizeProdutoToSegmento(form.produto as Produto);\n      const saleSellerAuthId = canChooseSaleSeller ? String(form.vendedor_id || "") : userId;\n      if (!saleSellerAuthId) throw new Error("Selecione o vendedor responsável pela venda.");\n      if (canChooseSaleSeller && !saleSellerOptions.some((u) => u.auth_user_id === saleSellerAuthId)) {\n        throw new Error("O vendedor selecionado não pertence ao seu nível de acesso/unidade.");\n      }\n\n      const payload: Partial<Venda> = {`;
if(!src.includes(oldStart))throw new Error("[carteira-seller-save] início payload não encontrado");src=src.replace(oldStart,newStart);
if(!src.includes('        vendedor_id: userId,'))throw new Error("[carteira-seller-save] vendedor payload não encontrado");src=src.replace('        vendedor_id: userId,','        vendedor_id: saleSellerAuthId,');
const reset=`        data_nascimento: "",\n      });`;
if(!src.includes(reset))throw new Error("[carteira-seller-save] reset não encontrado");src=src.replace(reset,`        data_nascimento: "",\n        vendedor_id: canChooseSaleSeller ? "" : userId,\n      });`);
fs.writeFileSync(file,src);console.log("[carteira-seller-save] aplicado");