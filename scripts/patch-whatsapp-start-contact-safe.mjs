import fs from 'node:fs';

const file = 'src/pages/AtendimentoWhatsApp.tsx';
let s = fs.readFileSync(file, 'utf8');

const oldBlock = `    const { data: contact, error: contactError } = await supabase
      .from("whatsapp_contacts")
      .upsert({ wa_id: phone, telefone: phone, nome: name, updated_at: now }, { onConflict: "wa_id" })
      .select("id")
      .single();
    if (contactError || !contact?.id) {
      console.error("Erro ao criar contato:", contactError);
      alert("Não foi possível criar/localizar o contato.");
      return;
    }`;

const newBlock = `    let contact: { id: string } | null = null;

    const { data: existingContacts, error: findContactError } = await supabase
      .from("whatsapp_contacts")
      .select("id")
      .or(\`wa_id.eq.\${phone},telefone.eq.\${phone}\`)
      .limit(1);

    if (!findContactError && existingContacts?.[0]?.id) {
      contact = { id: existingContacts[0].id };
      await supabase
        .from("whatsapp_contacts")
        .update({ wa_id: phone, telefone: phone, nome: name, updated_at: now })
        .eq("id", contact.id);
    } else {
      const { data: insertedContact, error: insertContactError } = await supabase
        .from("whatsapp_contacts")
        .insert({ wa_id: phone, telefone: phone, nome: name, updated_at: now })
        .select("id")
        .single();

      if (insertContactError || !insertedContact?.id) {
        console.error("Erro ao criar/localizar contato:", { findContactError, insertContactError });
        alert("Não foi possível criar/localizar o contato. Verifique as permissões da tabela whatsapp_contacts.");
        return;
      }

      contact = { id: insertedContact.id };
    }`;

if (s.includes(oldBlock)) {
  s = s.replace(oldBlock, newBlock);
} else if (!s.includes('let contact: { id: string } | null = null;')) {
  console.warn('[patch-whatsapp-start-contact-safe] bloco antigo não encontrado; nenhuma alteração aplicada');
}

fs.writeFileSync(file, s);
console.log('[patch-whatsapp-start-contact-safe] ok');
