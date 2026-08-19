import fs from "node:fs";

const file = "src/pages/whatsapp/WhatsAppAtendimento.tsx";
const source = fs.readFileSync(file, "utf8");

const automaticReadBlock = `                if (
                  payload.eventType === "INSERT" &&
                  row.direction === "inbound"
                ) {
                  void supabase
                    .from("whatsapp_conversations")
                    .update({ unread_count: 0 })
                    .eq("id", row.conversation_id);
                }
`;

if (!source.includes(automaticReadBlock)) {
  console.log("[patch-whatsapp-unread-v46] automatic read block already absent; nothing to change.");
  process.exit(0);
}

const next = source.replace(
  automaticReadBlock,
  `                // Mensagens recebidas permanecem não lidas até o usuário abrir o ticket.\n`,
);

fs.writeFileSync(file, next);
console.log("[patch-whatsapp-unread-v46] removed automatic unread_count reset from realtime inbound flow.");
