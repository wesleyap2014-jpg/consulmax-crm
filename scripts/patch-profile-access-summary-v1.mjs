import fs from "node:fs";

function patchFile(file) {
  let src = fs.readFileSync(file, "utf8");
  let changed = false;

  if (!src.includes('import ProfileAccessSummary from "@/components/profile/ProfileAccessSummary";')) {
    const anchor = 'import { Button } from "@/components/ui/button";\n';
    if (src.includes(anchor)) {
      src = src.replace(anchor, `${anchor}import ProfileAccessSummary from "@/components/profile/ProfileAccessSummary";\n`);
      changed = true;
    }
  }

  const cardStart = '<Card className="bg-white/95 xl:col-span-4">\n          <CardHeader className="pb-2"><SectionTitle icon={ShieldCheck}>Perfil de Acesso e Permissões</SectionTitle></CardHeader>';
  const cardEnd = '        </Card>\n      </div>\n\n      <div className="grid gap-4 xl:grid-cols-12">';
  const startIdx = src.indexOf(cardStart);
  if (startIdx >= 0) {
    const endIdx = src.indexOf(cardEnd, startIdx);
    if (endIdx >= 0) {
      const replacement = '<ProfileAccessSummary userId={profile.id} role={profile.role} scopes={profile.scopes} />\n      </div>\n\n      <div className="grid gap-4 xl:grid-cols-12">';
      src = src.slice(0, startIdx) + replacement + src.slice(endIdx + cardEnd.length);
      changed = true;
    }
  }

  if (changed) fs.writeFileSync(file, src);
  console.log(`[profile-access-summary] ${file}: ${changed ? "aplicado" : "sem alterações"}`);
}

patchFile("src/pages/MeuPerfil.tsx");
patchFile("src/pages/MeuPerfilCascata.tsx");

await import("./patch-meu-perfil-metas-presenca-v3.mjs");
await import("./patch-crm-last-access-agenda-v1.mjs");
await import("./patch-ranking-destaques-v1.mjs");
await import("./patch-ranking-tabs-v2.mjs");
await import("./patch-destaques-feed-meu-dia-v1.mjs");
await import("./patch-ranking-feed-brand-fonts-v1.mjs");
await import("./patch-ranking-highlights-closeout-v2.mjs");
await import("./patch-meu-perfil-multiselect-v1.mjs");
await import("./patch-meu-perfil-programa-parceiros-consolidado-v2.mjs");
await import("./patch-agenda-preference-invites-v2.mjs");
await import("./patch-agenda-internal-directory-realtime-v3.mjs");
await import("./patch-agenda-cancellation-internal-v4.mjs");
await import("./patch-agenda-meeting-ai-v5.mjs");
await import("./patch-agenda-meet-v2.mjs");
await import("./patch-agenda-meeting-artifacts-v6.mjs");
await import("./patch-agenda-internal-guest-picker-v7.mjs");
await import("./patch-agenda-event-overlay-v8.mjs");
await import("./patch-serverless-esm-imports-v1.mjs");
