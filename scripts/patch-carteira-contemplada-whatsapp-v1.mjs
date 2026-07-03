import fs from 'fs';

const file = 'src/pages/Carteira.tsx';
let src = fs.readFileSync(file, 'utf8');

const helper = `

  async function dispararWhatsAppContemplacao(vendaId: string) {
    try {
      const response = await fetch("/api/carteira/contemplada-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venda_id: vendaId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok === false) {
        const msg = data?.error?.message || data?.error || "Falha ao enviar modelo de contemplação.";
        throw new Error(String(msg));
      }
      console.info("WhatsApp contemplação enviado", data);
      return data;
    } catch (error: any) {
      console.warn("Erro ao enviar WhatsApp de contemplação", error);
      alert(\`Contemplação salva, mas não foi possível enviar o WhatsApp automático: \${error?.message || error}\`);
      return null;
    }
  }
`;

if (!src.includes('async function dispararWhatsAppContemplacao')) {
  const anchor = `  async function updateVenda(id: string, patch: any) {
    const { error } = await supabase.from("vendas").update(patch as any).eq("id", id);
    if (error && /data_nascimento/.test(error.message || "")) {
      const { error: e2 } = await supabase.from("vendas").update({ ...patch, data_nascimento: undefined } as any).eq("id", id);
      if (e2) throw e2;
      return;
    }
    if (error) throw error;
  }
`;
  if (!src.includes(anchor)) throw new Error('patch-carteira-contemplada-whatsapp-v1: updateVenda anchor not found');
  src = src.replace(anchor, anchor + helper);
}

const oldBlock = `      await updateVenda(v.id, patch);
      await reloadEncarteiradas();
      closeCotaEditor();
    } catch (e: any) {
      alert(e.message ?? "Erro ao salvar contemplação.");
    }
  };
`;

const newBlock = `      const shouldSendWhatsApp = !v.contemplada && ceContFlag;

      await updateVenda(v.id, patch);

      if (shouldSendWhatsApp) {
        await dispararWhatsAppContemplacao(v.id);
      }

      await reloadEncarteiradas();
      closeCotaEditor();
    } catch (e: any) {
      alert(e.message ?? "Erro ao salvar contemplação.");
    }
  };
`;

if (!src.includes('const shouldSendWhatsApp = !v.contemplada && ceContFlag;')) {
  if (!src.includes(oldBlock)) throw new Error('patch-carteira-contemplada-whatsapp-v1: saveContemplacao block not found');
  src = src.replace(oldBlock, newBlock);
}

fs.writeFileSync(file, src);
console.log('patch-carteira-contemplada-whatsapp-v1 applied');
