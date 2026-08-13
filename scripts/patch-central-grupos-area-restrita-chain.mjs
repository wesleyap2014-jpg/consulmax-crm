import fs from "node:fs";

const file = "src/pages/CentralGrupos.tsx";
if (!fs.existsSync(file)) {
  console.log("patch central grupos area restrita chain: file not found");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
let changed = false;

const oldSuccess = 'text: `Sincronização Maggi concluída pelo GitHub Actions: ${Number(summary.groupsFound || 0)} grupo(s) disponível(is) em ${Number(summary.segmentsSuccess || 0)} segmento(s).`,';
const newSuccess = 'text: `Sincronização Maggi concluída pelo GitHub Actions: ${Number(summary.groupsFound || 0)} grupo(s) disponível(is) em ${Number(summary.segmentsSuccess || 0)} segmento(s). A leitura detalhada de crédito, prazo, taxa de administração, fundo de reserva e lance embutido foi iniciada automaticamente. Se o Cloudflare solicitar confirmação, abra a Área Restrita Maggi e marque “Verify you are human”.`,';
if (src.includes(oldSuccess) && !src.includes("A leitura detalhada de crédito, prazo")) {
  src = src.replace(oldSuccess, newSuccess);
  changed = true;
}

const radarButton = `            <Button
              className="rounded-2xl text-white"
              style={{ background: C.ruby }}
              onClick={() => navigate("/radar-ofertas")}
            >
              Abrir Radar <ArrowRight className="ml-2 h-4 w-4" />
            </Button>`;

const chainedButtons = `            <Button
              variant="outline"
              className="rounded-2xl border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
              onClick={() => navigate("/robos/area-restrita-maggi")}
            >
              <Bot className="mr-2 h-4 w-4" />
              Área Restrita Maggi
            </Button>
${radarButton}`;

if (src.includes(radarButton) && !src.includes('onClick={() => navigate("/robos/area-restrita-maggi")}')) {
  src = src.replace(radarButton, chainedButtons);
  changed = true;
}

if (changed) {
  fs.writeFileSync(file, src);
  console.log("patch central grupos area restrita chain: applied");
} else {
  console.log("patch central grupos area restrita chain: no changes");
}

await import("./patch-area-restrita-reliable-status.mjs");
await import("./patch-sidebar-hide-admin-links-v1.mjs");
