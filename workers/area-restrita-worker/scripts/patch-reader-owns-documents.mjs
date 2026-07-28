import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/remote-browser.mjs");
let source = fs.readFileSync(filePath, "utf8");

if (source.includes("AREA_RESTRITA_READER_OWNS_DOCUMENTS")) {
  console.log("Monitor visual já está separado do leitor de PDFs.");
  process.exit(0);
}

const oldBlock = `        if (canContinueToDocuments && !priceTableHandled) {
          const navigationResult = await navigateToPriceTable(page, context);
          if (navigationResult.opened) {
            priceTableHandled = true;
            state = "price_table_opened";
            message = navigationResult.downloadStarted
              ? "Documentos (PDF) > Tabela de Preços acessado e arquivo salvo no volume."
              : "Documentos (PDF) > Tabela de Preços acessado. A tela resultante ficou aberta para o próximo mapeamento.";
            statusDetails = {
              ...statusDetails,
              priceTable: navigationResult,
            };
          } else {
            state = "authenticated_waiting_price_table";
            message = "Sessão autenticada. Tentando abrir Documentos (PDF) e Tabela de Preços.";
            statusDetails = {
              ...statusDetails,
              priceTableLookup: navigationResult,
            };
          }
        } else if (priceTableHandled) {
          state = "price_table_opened";
          message = "Tabela de Preços já foi acessada nesta execução.";
        }`;

const newBlock = `        if (canContinueToDocuments) {
          // AREA_RESTRITA_READER_OWNS_DOCUMENTS:
          // o monitor visual cuida apenas de login/Cloudflare. A guia dedicada do
          // price-table-runner é a única responsável por Documentos e PDFs.
          state = "authenticated_ready";
          message = "Sessão autenticada. O leitor dedicado está autorizado a processar Documentos (PDF) e Tabelas de Preços.";
          statusDetails = {
            ...statusDetails,
            readerOwnsDocuments: true,
          };
        }`;

if (!source.includes(oldBlock)) {
  throw new Error("Bloco de navegação visual não encontrado em remote-browser.mjs.");
}

source = source.replace(oldBlock, newBlock);
fs.writeFileSync(filePath, source);
console.log("Monitor visual separado do leitor dedicado de PDFs.");
