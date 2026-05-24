import fs from 'node:fs';

const file = 'src/pages/AtendimentoWhatsApp.tsx';
let s = fs.readFileSync(file, 'utf8');

function replaceOnce(from, to) {
  if (s.includes(from)) s = s.replace(from, to);
}

function insertAfter(needle, block, flag) {
  if (s.includes(needle) && !s.includes(flag)) s = s.replace(needle, needle + '\n' + block);
}

function insertBefore(needle, block, flag) {
  if (s.includes(needle) && !s.includes(flag)) s = s.replace(needle, block + '\n' + needle);
}

// Deixa a gaveta como área relativa quando o patch visual já tiver transformado o painel em drawer.
replaceOnce(
  '<Card className="flex h-full min-h-screen flex-col overflow-hidden rounded-none border-0 shadow-none">',
  '<Card className="relative flex h-full min-h-screen flex-col overflow-hidden rounded-none border-0 shadow-none">'
);

// Botão fixo global. Fica fora do header da conversa, então não some com scroll nem depende do layout interno.
insertAfter(
  '<div className="min-h-screen p-4 md:p-6" style={{ background: "#f7f7f8" }}>',
  `      {active && (
        <button
          type="button"
          onClick={() => setActive(null)}
          className="fixed right-4 top-20 z-[9999] inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-2xl transition hover:bg-slate-50"
          title="Minimizar conversa"
        >
          <span className="text-xl leading-none">×</span>
          Minimizar
        </button>
      )}`,
  'fixed right-4 top-20 z-[9999]'
);

// Segundo botão dentro do header, ao lado do botão Finalizar. Usa várias formas porque outros patches podem alterar espaços.
replaceOnce(
  '{!activeIsClosed && <Button variant="outline" onClick={finalizarConversa} disabled={updatingConversation || sending} className="gap-2"><CheckCircle2 className="h-4 w-4" />Finalizar</Button>}',
  '<Button variant="outline" onClick={() => setActive(null)} className="gap-2">Minimizar</Button>\n                    {!activeIsClosed && <Button variant="outline" onClick={finalizarConversa} disabled={updatingConversation || sending} className="gap-2"><CheckCircle2 className="h-4 w-4" />Finalizar</Button>}'
);

replaceOnce(
  '                    {!activeIsClosed && <Button variant="outline" onClick={finalizarConversa} disabled={updatingConversation || sending} className="gap-2"><CheckCircle2 className="h-4 w-4" />Finalizar</Button>}',
  '                    <Button variant="outline" onClick={() => setActive(null)} className="gap-2">Minimizar</Button>\n                    {!activeIsClosed && <Button variant="outline" onClick={finalizarConversa} disabled={updatingConversation || sending} className="gap-2"><CheckCircle2 className="h-4 w-4" />Finalizar</Button>}'
);

// Atalho de escape para minimizar. Fica dentro do componente, próximo aos estados derivados.
insertBefore(
  '  const activeIsMine = !!active?.assigned_to && active.assigned_to === authUserId;',
  `  useEffect(() => {
    function closeDrawerOnEsc(event: KeyboardEvent) {
      if (event.key === "Escape") setActive(null);
    }
    window.addEventListener("keydown", closeDrawerOnEsc);
    return () => window.removeEventListener("keydown", closeDrawerOnEsc);
  }, []);
`,
  'closeDrawerOnEsc'
);

fs.writeFileSync(file, s);
console.log('[patch-whatsapp-drawer-minimize-v7] ok');
