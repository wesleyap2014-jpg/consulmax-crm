import fs from "node:fs";

const file = "src/pages/Agenda.tsx";
if (!fs.existsSync(file)) {
  console.log("[patch-agenda-birthday-whatsapp-v1] Agenda.tsx não encontrado");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

function log(label, status) {
  console.log(`[patch-agenda-birthday-whatsapp-v1] ${label}: ${status}`);
}

function replace(label, from, to) {
  if (src.includes(to)) return log(label, "já aplicado");
  if (!src.includes(from)) return log(label, "trecho não encontrado");
  src = src.replace(from, to);
  changed = true;
  log(label, "aplicado");
}

replace(
  "state birthday whatsapp",
  `  const [mustOpenAgenda, setMustOpenAgenda] = useState<{ has: boolean; birthdays: AgendaEvento[] } | null>(null);`,
  `  const [mustOpenAgenda, setMustOpenAgenda] = useState<{ has: boolean; birthdays: AgendaEvento[] } | null>(null);
  const [birthdayWhatsAppStatus, setBirthdayWhatsAppStatus] = useState<string>("");`
);

replace(
  "auto send function",
  `  /** Abas rápidas */`,
  `  async function dispararAniversariosWhatsApp(auto = false) {
    const key = \`agenda:birthday-whatsapp:\${todayKey()}\`;
    if (auto && localStorage.getItem(key)) return;

    try {
      setBirthdayWhatsAppStatus(auto ? "Verificando aniversários..." : "Enviando felicitações...");
      const response = await fetch("/api/agenda/birthday-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: todayKey() }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new Error(json?.error || "Falha ao enviar felicitações.");
      localStorage.setItem(key, new Date().toISOString());
      const sent = Number(json.sent || 0);
      const skipped = Number(json.skipped || 0);
      setBirthdayWhatsAppStatus(sent ? \`\${sent} felicitação(ões) enviada(s) automaticamente.\` : skipped ? "Felicitações de hoje já estavam enviadas ou sem telefone." : "Nenhum aniversário para disparar hoje.");
      await loadEvents(page);
      await loadTodayEvents();
      await loadSideLists();
    } catch (e: any) {
      setBirthdayWhatsAppStatus(e?.message || "Não foi possível enviar felicitações automáticas.");
    }
  }

  /** Abas rápidas */`
);

replace(
  "trigger on agenda load",
  `      if (hasToday) {
        setMustOpenAgenda({ has: true, birthdays: (bdays || []) as any });`,
  `      if (hasToday) {
        setMustOpenAgenda({ has: true, birthdays: (bdays || []) as any });
        if ((bdays?.length || 0) > 0) {
          await dispararAniversariosWhatsApp(true);
        }`
);

replace(
  "birthday kpi status",
  `          hint="Ação rápida no WhatsApp"
          tone="gold"`,
  `          hint={birthdayWhatsAppStatus || "Envio automático via WhatsApp"}
          tone="gold"`
);

replace(
  "manual birthday button today cards",
  `                      <button style={btnTiny} onClick={() => clipboardCopy(BIRTHDAY_MSG(person))}>
                        Copiar parabéns
                      </button>`,
  `                      <>
                        <button style={btnTiny} onClick={() => dispararAniversariosWhatsApp(false)}>
                          Enviar modelo
                        </button>
                        <button style={btnTiny} onClick={() => clipboardCopy(BIRTHDAY_MSG(person))}>
                          Copiar parabéns
                        </button>
                      </>`
);

if (changed) fs.writeFileSync(file, src);
console.log("[patch-agenda-birthday-whatsapp-v1] concluído");
