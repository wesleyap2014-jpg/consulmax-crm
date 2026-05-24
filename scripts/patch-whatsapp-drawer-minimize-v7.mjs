import fs from 'node:fs';

const file = 'src/pages/AtendimentoWhatsApp.tsx';
let s = fs.readFileSync(file, 'utf8');

function replaceOnce(from, to) {
  if (s.includes(from)) s = s.replace(from, to);
}

function insertBefore(needle, block, flag) {
  if (s.includes(needle) && !s.includes(flag)) s = s.replace(needle, block + '\n' + needle);
}

// Deixa a gaveta como área relativa para o botão flutuante.
replaceOnce(
  '<Card className="flex h-full min-h-screen flex-col overflow-hidden rounded-none border-0 shadow-none">',
  '<Card className="relative flex h-full min-h-screen flex-col overflow-hidden rounded-none border-0 shadow-none">'
);

// Botão flutuante sempre visível para minimizar/fechar a conversa lateral.
insertBefore(
  '          {!active ? (',
  `          {active && (
            <button
              type="button"
              onClick={() => setActive(null)}
              className="absolute right-4 top-4 z-[80] inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-lg transition hover:bg-slate-50"
              title="Minimizar conversa"
            >
              <span className="text-lg leading-none">×</span>
              Minimizar
            </button>
          )}`,
  'Minimizar conversa'
);

// Reforça também no header, caso o botão flutuante fique fora da área visível em telas menores.
replaceOnce(
  '{!activeIsClosed && <Button variant="outline" onClick={finalizarConversa} disabled={updatingConversation || sending} className="gap-2"><CheckCircle2 className="h-4 w-4" />Finalizar</Button>}',
  '<Button variant="outline" onClick={() => setActive(null)} className="gap-2">Minimizar</Button>\n                    {!activeIsClosed && <Button variant="outline" onClick={finalizarConversa} disabled={updatingConversation || sending} className="gap-2"><CheckCircle2 className="h-4 w-4" />Finalizar</Button>}'
);

// Se o patch v5 já inseriu outro botão fantasma, evita duplicar em builds repetidos.
s = s.replace(/<Button variant="ghost" onClick=\{\(\) => setActive\(null\)\} className="text-xl leading-none">×<\/Button>\n\s*<Button variant="outline" onClick=\{\(\) => setActive\(null\)\} className="gap-2">Minimizar<\/Button>/g,
  '<Button variant="outline" onClick={() => setActive(null)} className="gap-2">Minimizar</Button>');

fs.writeFileSync(file, s);
console.log('[patch-whatsapp-drawer-minimize-v7] ok');
