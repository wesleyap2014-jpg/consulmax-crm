import fs from "node:fs";

const path = "src/pages/AgendaExecutive.tsx";
let src = fs.readFileSync(path, "utf8");
const before = src;

function replaceAllExact(from, to, label) {
  if (src.includes(to)) { console.log(`[agenda-v5] ${label}: já aplicado`); return; }
  if (!src.includes(from)) { console.log(`[agenda-v5] ${label}: trecho não encontrado`); return; }
  src = src.split(from).join(to);
  console.log(`[agenda-v5] ${label}: aplicado`);
}

replaceAllExact(
  `  addVideo: boolean;\n  internalGuestIds: string[];`,
  `  addVideo: boolean;\n  aiEnabled: boolean;\n  aiMode: "sales" | "service" | "success" | "internal" | "minutes";\n  internalGuestIds: string[];`,
  "campos de IA no compromisso",
);

replaceAllExact(
  `addVideo: false, internalGuestIds: []`,
  `addVideo: false, aiEnabled: false, aiMode: "sales", internalGuestIds: []`,
  "estado padrão da IA",
);

replaceAllExact(
  `videocall_url: createDraft.link.trim() || null, meeting_link: createDraft.link.trim() || null, descricao: createDraft.description.trim() || null };`,
  `videocall_url: createDraft.link.trim() || null, meeting_link: createDraft.link.trim() || null, descricao: createDraft.description.trim() || null, waiting_room_enabled: true, ai_enabled: Boolean(createDraft.addVideo && createDraft.aiEnabled), ai_mode: createDraft.aiMode, recording_preference: "manual", ai_report_status: createDraft.addVideo && createDraft.aiEnabled ? "collecting" : "idle" };`,
  "persistência da IA",
);

const videoTail = `</span></label><label className="full">Link externo opcional`;
const aiUi = `</span></label>{draft.addVideo && <div className="full" style={{ display: "grid", gap: 8, border: "1px solid #E0CE8C", background: "#FFFDF6", padding: 11, borderRadius: 10 }}><label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={draft.aiEnabled} onChange={(e) => setDraft((d) => ({ ...d, aiEnabled: e.target.checked }))} style={{ width: 16, height: 16 }} /><span><strong style={{ color: C.navy }}>Usar Max IA nesta reunião</strong><small style={{ display: "block", color: C.muted, fontWeight: 500 }}>Transcrição, sugestões ao vivo, ata e feedback privados para o organizador.</small></span></label>{draft.aiEnabled && <label style={{ display: "grid", gap: 5, color: C.navy, fontSize: 11, fontWeight: 700 }}>Tipo de análise<select value={draft.aiMode} onChange={(e) => setDraft((d) => ({ ...d, aiMode: e.target.value as CreateDraft["aiMode"] }))}><option value="sales">Venda</option><option value="service">Atendimento</option><option value="success">Sucesso do Cliente</option><option value="internal">Reunião interna</option><option value="minutes">Ata somente</option></select></label>}</div>}<label className="full">Link externo opcional`;
if (!src.includes("Usar Max IA nesta reunião")) {
  if (src.includes(videoTail)) { src = src.replace(videoTail, aiUi); console.log("[agenda-v5] opção Max IA no formulário: aplicado"); }
  else console.log("[agenda-v5] opção Max IA no formulário: trecho não encontrado");
}

if (src !== before) fs.writeFileSync(path, src);
console.log(`[agenda-v5] AgendaExecutive: ${src !== before ? "atualizado" : "sem alterações"}`);
