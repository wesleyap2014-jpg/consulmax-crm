import fs from 'node:fs';

const file = 'src/pages/AtendimentoWhatsApp.tsx';
let s = fs.readFileSync(file, 'utf8');

const oldBlock = `      if (currentActive?.id) {
        const refreshedActive = next.find((c) => c.id === currentActive.id);
        if (refreshedActive) setActive(refreshedActive);
      } else if (next.length > 0) {
        const firstVisible = next.find((c) => canViewConversation(c, profile, authUserId));
        if (firstVisible) setActive(firstVisible);
      }`;

const newBlock = `      if (currentActive?.id) {
        const refreshedActive = next.find((c) => c.id === currentActive.id);
        if (refreshedActive) setActive(refreshedActive);
      }
      // Não abre conversa automaticamente.
      // O usuário deve escolher o card no Kanban; ao minimizar, a gaveta permanece fechada.`;

if (s.includes(oldBlock)) {
  s = s.replace(oldBlock, newBlock);
} else {
  console.warn('[patch-whatsapp-no-auto-open-v9] bloco de auto-open não encontrado');
}

fs.writeFileSync(file, s);
console.log('[patch-whatsapp-no-auto-open-v9] ok');
