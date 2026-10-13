import fs from "node:fs";

const path = "src/pages/AgendaExecutive.tsx";
let src = fs.readFileSync(path, "utf8");
const before = src;

// A etapa v4 recria o EventDrawer inteiro; por isso a opção de compartilhar
// precisa entrar depois das atualizações de convidados, overlays e materiais.
const start = src.indexOf("function EventDrawer(");
const end = src.indexOf("\nfunction Detail(", start);
if (start < 0 || end < 0) throw new Error("[agenda-v11] EventDrawer não encontrado");
let drawer = src.slice(start, end);

if (!drawer.includes('copyEventLink("attendance")')) {
  const header = /(  const \{ ev \} = props;[^\n]*\n)/;
  if (!header.test(drawer)) throw new Error("[agenda-v11] cabeçalho do EventDrawer mudou");
  const handler = `  const [shareBusy, setShareBusy] = useState<"attendance" | "meeting" | null>(null);
  const [shareStatus, setShareStatus] = useState("");
  async function copyEventLink(kind: "attendance" | "meeting") {
    if (shareBusy) return;
    setShareBusy(kind);
    setShareStatus("");
    try {
      const url = kind === "attendance" ? await getAgendaAttendanceLink(ev) : await getAgendaMeetingGuestLink(ev);
      const copied = await copyAgendaShareUrl(url);
      setShareStatus(copied
        ? kind === "attendance" ? "Link de presença copiado!" : "Link da reunião copiado!"
        : "Link gerado. Copie o endereço na janela exibida.");
    } catch (error: any) {
      setShareStatus("Não foi possível gerar o link: " + (error?.message || "erro desconhecido"));
    } finally {
      setShareBusy(null);
    }
  }
`;
  drawer = drawer.replace(header, "$1" + handler);

  const target = '<button className="cx-action-btn" onClick={() => downloadICS(ev)}><Download size={17} /> Adicionar calendário</button>}</div>';
  if (!drawer.includes(target)) throw new Error("[agenda-v11] barra de ações mudou");
  const actions = `<button className="cx-action-btn" onClick={() => downloadICS(ev)}><Download size={17} /> Adicionar calendário</button>}{props.canEdit && !cancelled && (ev.tipo === "reuniao" || ev.tipo === "outro") && <button className="cx-action-btn" disabled={Boolean(shareBusy)} onClick={() => void copyEventLink("attendance")}><Copy size={17} /> {shareBusy === "attendance" ? "Gerando…" : "Copiar link de presença"}</button>}{props.canEdit && !cancelled && ev.tipo === "reuniao" && <button className="cx-action-btn" disabled={Boolean(shareBusy)} onClick={() => void copyEventLink("meeting")}><Copy size={17} /> {shareBusy === "meeting" ? "Preparando…" : "Copiar link da reunião"}</button>}</div>{shareStatus && <div className="cx-share-feedback" role="status">{shareStatus}</div>}{props.canEdit && !cancelled && (ev.tipo === "reuniao" || ev.tipo === "outro") && <p className="cx-share-hint">Presença: registra funcionários com acesso ao CRM. Reunião: permite entrar no Consulmax Meet.</p>}`;
  drawer = drawer.replace(target, actions);
  src = src.slice(0, start) + drawer + src.slice(end);
  console.log("[agenda-v11] links de presença e Meet integrados ao overlay");
} else {
  console.log("[agenda-v11] compartilhamento já aplicado");
}
if (!src.includes("async function getAgendaAttendanceLink(") || !src.includes("async function getAgendaMeetingGuestLink(") || !src.includes("async function copyAgendaShareUrl(")) {
  throw new Error("[agenda-v11] funções de compartilhamento ausentes: preservar helpers da AgendaExecutive");
}
if (!src.includes(".cx-share-feedback{")) {
  src = src.replace(".cx-drawer-section{margin-top:14px;", ".cx-share-feedback{margin-top:8px;padding:9px 11px;border-radius:9px;background:#f1f5f9;color:#1E293F;font-size:11px;font-weight:800;overflow-wrap:anywhere}.cx-share-hint{margin:8px 0 0;color:#64748b;font-size:10px;line-height:1.5}.cx-drawer-section{margin-top:14px;");
}
const jsxLine = src.split(String.fromCharCode(10))[788];
if (jsxLine) console.log("[agenda-v11-parse-check] col=11128 around: " + JSON.stringify(jsxLine.slice(10800, 11500)));
if (src !== before) fs.writeFileSync(path, src);
console.log("[agenda-v11] verificação: presença=" + src.includes('Copiar link de presença') + ", convidados=" + src.includes("Ver todos os convidados") + ", overlay=" + src.includes("<EventOverlay"));
