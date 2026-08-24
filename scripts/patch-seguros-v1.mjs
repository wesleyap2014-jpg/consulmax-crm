import fs from "node:fs";
import zlib from "node:zlib";
import crypto from "node:crypto";

const assetFile = "scripts/assets/seguros-v1.tsx.gz.b64";
const pageFile = "src/pages/Seguros.tsx";
const permissionFile = "src/access/permissionCatalog.ts";

const encoded = fs.readFileSync(assetFile, "utf8").trim();
const page = zlib.gunzipSync(Buffer.from(encoded, "base64")).toString("utf8");
const checksum = crypto.createHash("sha256").update(page).digest("hex").slice(0, 12);
const currentPage = fs.existsSync(pageFile) ? fs.readFileSync(pageFile, "utf8") : "";

if (currentPage !== page) {
  fs.writeFileSync(pageFile, page);
  console.log(`[seguros-v1] tela aplicada (${checksum})`);
} else {
  console.log(`[seguros-v1] tela já aplicada (${checksum})`);
}

let permissions = fs.readFileSync(permissionFile, "utf8");
if (!permissions.includes('key: "seguros"')) {
  const marker = `  {\n    key: "giro_carteira",`;
  const guide = `  {\n    key: "seguros",\n    group: "pos",\n    label: "Seguros",\n    path: "/seguros",\n    pathPrefixes: ["/seguros"],\n    description: "Carteira de seguros, emissão, documentos, vigência, comissão, pendências e renovação.",\n    information: [\n      { key: "portfolio", label: "Ver carteira de seguros" },\n      { key: "financial", label: "Ver prêmio, IOF e comissão" },\n      { key: "documents", label: "Ver proposta, apólice e documentos" },\n      { key: "lifecycle", label: "Ver status, vistoria, pendências e renovação" },\n      { key: "seller", label: "Ver unidade e vendedor responsável" },\n    ],\n    actions: [\n      { key: "create", label: "Lançar nova venda" },\n      { key: "edit", label: "Editar seguro/apólice" },\n      { key: "upload_documents", label: "Anexar proposta e apólice" },\n      { key: "update_status", label: "Atualizar status operacional" },\n      { key: "manage_inspection", label: "Gerenciar vistoria" },\n      { key: "renewal", label: "Gerenciar renovação" },\n    ],\n  },\n`;

  if (!permissions.includes(marker)) {
    throw new Error("[seguros-v1] âncora de permissões não encontrada");
  }

  permissions = permissions.replace(marker, `${guide}${marker}`);
  fs.writeFileSync(permissionFile, permissions);
  console.log("[seguros-v1] guia adicionada ao catálogo de permissões");
} else {
  console.log("[seguros-v1] permissão já cadastrada");
}
