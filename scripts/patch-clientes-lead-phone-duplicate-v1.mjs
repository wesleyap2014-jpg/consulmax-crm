import fs from "node:fs";

const file = "src/pages/Clientes.tsx";
let src = fs.readFileSync(file, "utf8");
const marker = "CLIENTES_LEAD_PHONE_DUPLICATE_FIX_V1";

if (src.includes(marker)) {
  console.log("[clientes-phone] correção já aplicada");
  process.exit(0);
}

const oldLeadUpdate = `      const { error: eLead } = await supabase
        .from("leads")
        .update({
          nome: nome.trim() || active.nome,
          telefone: normalizedPhone,
          email: email.trim() || null,
        })
        .eq("id", active.lead_id);
      if (eLead) throw eLead;`;

const newLeadUpdate = `      // ${marker}: não regrava o telefone quando mudou apenas a formatação.
      // Isso preserva leads históricos duplicados cuja telefone_unique_key foi deixada nula pela migração.
      const currentLeadPhone = parseStoredPhone(active.telefone)?.number || null;
      const leadUpdate: Record<string, any> = {
        nome: nome.trim() || active.nome,
        email: email.trim() || null,
      };
      if (currentLeadPhone !== normalizedPhone) {
        leadUpdate.telefone = normalizedPhone;
      }

      const { error: eLead } = await supabase
        .from("leads")
        .update(leadUpdate)
        .eq("id", active.lead_id);
      if (eLead) throw eLead;`;

if (!src.includes(oldLeadUpdate)) {
  throw new Error("[clientes-phone] bloco de atualização do lead não encontrado");
}
src = src.replace(oldLeadUpdate, newLeadUpdate);

const oldCatch = `    } catch (e: any) {
      alert(e?.message || "Não foi possível salvar.");
    } finally {`;

const newCatch = `    } catch (e: any) {
      const duplicatePhone =
        e?.code === "23505" && String(e?.message || "").includes("leads_telefone_unique_key_idx");
      if (duplicatePhone) {
        alert("Este telefone já está vinculado a outro lead/cliente no CRM. Confira o cadastro existente antes de alterar o número.");
      } else {
        alert(e?.message || "Não foi possível salvar.");
      }
    } finally {`;

if (!src.includes(oldCatch)) {
  throw new Error("[clientes-phone] bloco de tratamento de erro não encontrado");
}
src = src.replace(oldCatch, newCatch);

fs.writeFileSync(file, src);
console.log("[clientes-phone] correção aplicada");
