import fs from "node:fs";

const filePath = "src/pages/simuladores/MaggiSimulator.tsx";
let source = fs.readFileSync(filePath, "utf8");

const marker = "MAGGI_LEAD_SELECT_POPOVER_V1";
if (source.includes(marker)) {
  console.log("[patch-maggi-lead-select] já aplicado.");
  process.exit(0);
}

function replaceOnce(label, from, to) {
  if (!source.includes(from)) {
    throw new Error(`[patch-maggi-lead-select] ponto não encontrado: ${label}`);
  }
  source = source.replace(from, to);
}

replaceOnce(
  "popover import",
  `import { Label } from "@/components/ui/label";\n`,
  `import { Label } from "@/components/ui/label";\nimport { Popover, PopoverButton, PopoverContent } from "@/components/ui/popover";\n`
);

replaceOnce(
  "chevrons import",
  `  Car,\n`,
  `  Car,\n  ChevronsUpDown,\n`
);

replaceOnce(
  "lead open state",
  `  const [leadSearch, setLeadSearch] = useState("");\n  const [selectedLeadId, setSelectedLeadId] = useState("");\n`,
  `  const [leadSearch, setLeadSearch] = useState("");\n  const [selectedLeadId, setSelectedLeadId] = useState("");\n  const [leadOpen, setLeadOpen] = useState(false);\n`
);

const oldLeadBlock = `              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder={
                    loadingLeads
                      ? "Carregando leads..."
                      : "Buscar por nome, telefone ou e-mail"
                  }
                />
              </div>

              <div className="mt-3 max-h-52 overflow-y-auto rounded-2xl border">
                {filteredLeads.map((lead) => {
                  const active = selectedLeadId === lead.id;

                  return (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => setSelectedLeadId(lead.id)}
                      className="flex w-full items-center justify-between gap-3 border-b px-3 py-3 text-left text-sm last:border-b-0 hover:bg-slate-50"
                      style={{
                        background: active ? "rgba(161,28,39,.06)" : undefined,
                      }}
                    >
                      <div>
                        <div className="font-bold" style={{ color: C.navy }}>
                          {getLeadName(lead)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {getLeadPhone(lead) || lead.email || "Sem contato"}
                        </div>
                      </div>

                      {active && (
                        <CheckCircle2
                          className="h-4 w-4"
                          style={{ color: C.ruby }}
                        />
                      )}
                    </button>
                  );
                })}

                {!loadingLeads && filteredLeads.length === 0 && (
                  <div className="p-4 text-center text-sm text-slate-500">
                    Nenhum lead encontrado.
                  </div>
                )}
              </div>

              {selectedLead && (
                <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                  Lead selecionado:{" "}
                  <strong style={{ color: C.navy }}>
                    {getLeadName(selectedLead)}
                  </strong>
                </div>
              )}`;

const newLeadBlock = `              {/* ${marker} */}
              <Popover open={leadOpen} onOpenChange={setLeadOpen}>
                <PopoverButton className="h-11 rounded-2xl border-slate-200 bg-white px-4 text-left shadow-sm hover:bg-slate-50">
                  <span className="min-w-0 flex-1 truncate">
                    {selectedLead ? getLeadName(selectedLead) : loadingLeads ? "Carregando leads..." : "Selecionar lead"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
                </PopoverButton>

                <PopoverContent align="start" className="w-[min(520px,95vw)] rounded-2xl p-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      autoFocus
                      className="h-10 rounded-xl pl-9"
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                      placeholder="Buscar por nome, telefone ou e-mail"
                    />
                  </div>

                  <div className="mt-3 max-h-72 overflow-y-auto rounded-2xl border bg-white">
                    {filteredLeads.map((lead) => {
                      const active = selectedLeadId === lead.id;

                      return (
                        <button
                          key={lead.id}
                          type="button"
                          onClick={() => {
                            setSelectedLeadId(lead.id);
                            setLeadSearch("");
                            setLeadOpen(false);
                          }}
                          className="flex w-full items-center justify-between gap-3 border-b px-3 py-3 text-left text-sm last:border-b-0 hover:bg-slate-50"
                          style={{
                            background: active ? "rgba(161,28,39,.06)" : undefined,
                          }}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-bold" style={{ color: C.navy }}>
                              {getLeadName(lead)}
                            </div>
                            <div className="truncate text-xs text-slate-500">
                              {getLeadPhone(lead) || lead.email || "Sem contato"}
                            </div>
                          </div>

                          {active && (
                            <CheckCircle2
                              className="h-4 w-4 shrink-0"
                              style={{ color: C.ruby }}
                            />
                          )}
                        </button>
                      );
                    })}

                    {!loadingLeads && filteredLeads.length === 0 && (
                      <div className="p-4 text-center text-sm text-slate-500">
                        Nenhum lead encontrado.
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {selectedLead && (
                <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                  Lead selecionado:{" "}
                  <strong style={{ color: C.navy }}>
                    {getLeadName(selectedLead)}
                  </strong>
                  {getLeadPhone(selectedLead) && (
                    <span className="ml-2 text-xs text-slate-500">
                      {getLeadPhone(selectedLead)}
                    </span>
                  )}
                </div>
              )}`;

replaceOnce("lead block", oldLeadBlock, newLeadBlock);

fs.writeFileSync(filePath, source);
console.log("[patch-maggi-lead-select] Lead da Maggi alterado para Select/Popover.");
