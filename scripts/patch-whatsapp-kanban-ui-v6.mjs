import fs from 'node:fs';

const file = 'src/pages/AtendimentoWhatsApp.tsx';
let s = fs.readFileSync(file, 'utf8');

function replaceOnce(from, to) {
  if (s.includes(from)) s = s.replace(from, to);
}

// O Kanban virou a navegação principal. A lógica antiga fechava/trocava a conversa
// quando ela não pertencia à aba lateral escondida (Novos/Meus/Filas), causando o
// efeito de a gaveta piscar e fechar. Agora só fecha se o usuário realmente não
// puder ver o atendimento.
replaceOnce(
`  useEffect(() => {
    if (!active) return;

    const canStillView = canViewConversation(active, profile, authUserId);
    const existsInTab = filteredConversations.some((conv) => conv.id === active.id);

    if ((!canStillView || !existsInTab) && filteredConversations.length > 0) setActive(filteredConversations[0]);
    if ((!canStillView || !existsInTab) && filteredConversations.length === 0) setActive(null);
  }, [active, authUserId, filteredConversations, profile]);`,
`  useEffect(() => {
    if (!active) return;

    const canStillView = typeof canViewLocal === "function"
      ? canViewLocal(active)
      : canViewConversation(active, profile, authUserId);

    if (!canStillView) setActive(null);
  }, [active?.id, allowedQueues, authUserId, manager, profile]);`
);

// Se o patch anterior não tiver trocado todos os cliques, garante novamente.
s = s.split('onClick={() => setActive(conv)}').join('onClick={() => openConversationDrawer(conv)}');

fs.writeFileSync(file, s);
console.log('[patch-whatsapp-kanban-ui-v6] ok');
