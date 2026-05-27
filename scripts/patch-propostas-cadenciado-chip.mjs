import fs from "node:fs";

const filePath = "src/pages/Propostas.tsx";
let source = fs.readFileSync(filePath, "utf8");

const marker = "PROPOSTAS_CADENCIADO_CHIP_V1";
if (source.includes(marker)) {
  console.log("[patch-propostas-cadenciado-chip] chip já aplicado.");
  process.exit(0);
}

const needle = `      </Card>\n\n      <div className={\`grid gap-6 transition-all \${resultsOpen ? "lg:grid-cols-2" : "lg:grid-cols-1"}\`}>`;

const replacement = `      </Card>\n\n      {/* ${marker} */}\n      <Card className="border-[#B5A573]/70 bg-gradient-to-r from-[#F8FAFC] to-[#F5F5F5] shadow-sm">\n        <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">\n          <div>\n            <div className="font-semibold text-[#1E293F] flex items-center gap-2">\n              <FileText className="h-4 w-4 text-[#A11C27]" />\n              Proposta Cadenciada\n            </div>\n            <div className="text-sm text-muted-foreground">\n              Monte uma apresentação com várias cotas, contemplação em cadência e fluxo de parcelas por período.\n            </div>\n          </div>\n          <Button\n            type="button"\n            className="rounded-2xl bg-[#1E293F] hover:bg-[#111827] text-white"\n            onClick={() => { window.location.href = "/propostas-cadenciado"; }}\n          >\n            Abrir Cadenciado\n          </Button>\n        </CardContent>\n      </Card>\n\n      <div className={\`grid gap-6 transition-all \${resultsOpen ? "lg:grid-cols-2" : "lg:grid-cols-1"}\`}>`;

if (!source.includes(needle)) {
  throw new Error("[patch-propostas-cadenciado-chip] ponto de inserção não encontrado em Propostas.tsx");
}

source = source.replace(needle, replacement);
fs.writeFileSync(filePath, source);
console.log("[patch-propostas-cadenciado-chip] chip aplicado em Propostas.tsx.");
