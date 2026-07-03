import fs from 'fs';

const file = 'src/pages/GestaoDeGrupos.tsx';
let src = fs.readFileSync(file, 'utf8');

const helper = `

  async function dispararNaoContempladasWhatsApp() {
    try {
      const response = await fetch("/api/gestao-grupos/nao-contemplada-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          group_ids: linhas.map((l) => l.group_id),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok === false) {
        const msg = data?.error?.message || data?.error || "Falha ao enviar modelo de não contemplação.";
        throw new Error(String(msg));
      }
      alert(
        "WhatsApp de não contemplados processado.\\n" +
          "Enviadas: " + (data?.sent ?? 0) + "\\n" +
          "Ignoradas: " + (data?.skipped ?? 0) + "\\n" +
          "Erros: " + (data?.errors ?? 0)
      );
      return data;
    } catch (error) {
      console.warn("Erro ao enviar WhatsApp de não contemplados", error);
      alert("Resultados salvos, mas não foi possível enviar o WhatsApp automático: " + (error?.message || error));
      return null;
    }
  }
`;

if (!src.includes('async function dispararNaoContempladasWhatsApp')) {
  const anchor = `  const podeSalvar = Boolean(date) && linhas.length > 0 && Boolean(nextDue) && Boolean(nextDraw) && Boolean(nextAsm);
`;
  if (!src.includes(anchor)) throw new Error('patch-gestao-nao-contemplada-whatsapp-v1: podeSalvar anchor not found');
  src = src.replace(anchor, anchor + helper);
}

const oldPromptBlock = `    const tipoLance = window.prompt(
      "Estratégia/lance ofertado para enviar aos clientes não contemplados desta assembleia:",
      "Acompanhamento estratégico"
    );
    if (tipoLance == null) return null;
    const estrategia = tipoLance.trim() || "Acompanhamento estratégico";

`;
if (src.includes(oldPromptBlock)) src = src.replace(oldPromptBlock, "");

const oldTipoLanceLine = `          tipo_lance: estrategia,
`;
if (src.includes(oldTipoLanceLine)) src = src.replace(oldTipoLanceLine, "");

const oldBlock = `      await onSaved();
      alert("Resultados salvos com sucesso!");
      onClose();
    } catch (e: any) {
`;

const newBlock = `      await onSaved();

      const enviarNaoContempladas = window.confirm(
        "Resultados salvos com sucesso!\\n\\nDeseja enviar agora o WhatsApp para as cotas ativas, adimplentes e não contempladas desses grupos?"
      );
      if (enviarNaoContempladas) {
        await dispararNaoContempladasWhatsApp();
      } else {
        alert("Resultados salvos com sucesso!");
      }

      onClose();
    } catch (e: any) {
`;

if (!src.includes('Deseja enviar agora o WhatsApp para as cotas ativas')) {
  if (!src.includes(oldBlock)) throw new Error('patch-gestao-nao-contemplada-whatsapp-v1: save success block not found');
  src = src.replace(oldBlock, newBlock);
}

fs.writeFileSync(file, src);
console.log('patch-gestao-nao-contemplada-whatsapp-v1 applied');
