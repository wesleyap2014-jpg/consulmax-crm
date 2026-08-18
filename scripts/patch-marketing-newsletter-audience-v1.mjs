import fs from "node:fs";

const path = "src/pages/MarketingNewsletterPanel.tsx";
let text = fs.readFileSync(path, "utf8");

const importAnchor = 'import React, { useEffect, useMemo, useState } from "react";\n';
const importLine = 'import MarketingNewsletterAudienceDialog from "./MarketingNewsletterAudienceDialog";\n';
if (!text.includes(importLine)) {
  if (!text.includes(importAnchor)) throw new Error("Newsletter audience: import anchor not found");
  text = text.replace(importAnchor, importAnchor + importLine);
}

const stateAnchor = '  const [dialogOpen, setDialogOpen] = useState(false);\n';
const stateLine = '  const [audienceNewsletter, setAudienceNewsletter] = useState<Newsletter | null>(null);\n';
if (!text.includes(stateLine)) {
  if (!text.includes(stateAnchor)) throw new Error("Newsletter audience: state anchor not found");
  text = text.replace(stateAnchor, stateAnchor + stateLine);
}

const iconAnchor = '  Upload,\n';
if (!text.includes('  Users,\n')) {
  if (!text.includes(iconAnchor)) throw new Error("Newsletter audience: icon anchor not found");
  text = text.replace(iconAnchor, iconAnchor + '  Users,\n');
}

const oldDescription = '          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Crie, revise e organize as newsletters da Consulmax. O envio por e-mail será integrado em uma etapa posterior; aqui ficam o conteúdo e o histórico editorial.</p>';
const newDescription = '          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Crie, revise e organize as newsletters da Consulmax, selecione Clientes e Meus Parceiros e prepare a fila individual de disparo.</p>';
if (text.includes(oldDescription)) text = text.replace(oldDescription, newDescription);

const copyAnchor = '                    <Button size="icon" variant="outline" title="Copiar conteúdo" disabled={!item.content} onClick={() => item.content && navigator.clipboard.writeText(item.content).catch(() => undefined)}><Copy className="h-4 w-4" /></Button>';
const audienceButton = '                    <Button size="sm" variant="outline" title="Selecionar público" onClick={() => setAudienceNewsletter(item)}><Users className="mr-1.5 h-4 w-4" />Público</Button>\n';
if (!text.includes(audienceButton.trim())) {
  if (!text.includes(copyAnchor)) throw new Error("Newsletter audience: card action anchor not found");
  text = text.replace(copyAnchor, audienceButton + copyAnchor);
}

const dialogAnchor = '      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>';
const audienceDialog = `      <MarketingNewsletterAudienceDialog
        newsletter={audienceNewsletter}
        open={Boolean(audienceNewsletter)}
        onOpenChange={(nextOpen) => { if (!nextOpen) setAudienceNewsletter(null); }}
      />

`;
if (!text.includes('<MarketingNewsletterAudienceDialog')) {
  if (!text.includes(dialogAnchor)) throw new Error("Newsletter audience: dialog anchor not found");
  text = text.replace(dialogAnchor, audienceDialog + dialogAnchor);
}

fs.writeFileSync(path, text, "utf8");
console.log("Newsletter audience patch applied");
