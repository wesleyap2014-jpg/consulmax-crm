import fs from "node:fs";

const marker = "patch-whatsapp-br-phone-alias-v36-safe";

function patchIfExists(file, patcher) {
  if (!fs.existsSync(file)) return;
  let src = fs.readFileSync(file, "utf8");
  const next = patcher(src);
  if (next !== src) {
    fs.writeFileSync(file, next);
    console.log(`${marker}: ${file} ajustado`);
  } else {
    console.log(`${marker}: ${file} sem alterações`);
  }
}

// Mantém a correção segura que evita o erro resolveWhatsAppSendPhone is not defined
// e adiciona fallback para áudio gravado quando a Meta rejeitar o formato do navegador.
patchIfExists("api/whatsapp/send.ts", (src) => {
  src = src
    .replace(/await resolveWhatsAppSendPhone\(to, conversation_id\)/g, "onlyDigits(to)")
    .replace(/await resolveWhatsAppSendPhone\(phoneValue, null\)/g, "onlyDigits(phoneValue)");

  src = src.replace(
    `if (!uploadResponse.ok || !uploadData?.id) {
    console.error("META_MEDIA_UPLOAD_ERROR", uploadData);
    return { ok: false, status: uploadResponse.status, error: uploadData };
  }`,
    `if (!uploadResponse.ok || !uploadData?.id) {
    console.error("META_MEDIA_UPLOAD_ERROR", uploadData);

    // Chrome/Edge normalmente gravam áudio em WebM/Opus, que a Meta não aceita como áudio.
    // Para não perder a mensagem, salvamos no Storage e enviamos um link seguro ao cliente.
    if (mediaKind === "audio") {
      const signed = await supabaseAdmin.storage.from(MEDIA_BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 7);
      const fallbackUrl = signed.data?.signedUrl || "";
      const fallbackBody = fallbackUrl
        ? \`Áudio enviado pela Consulmax: \${fallbackUrl}\`
        : "Áudio gravado pela Consulmax, mas não foi possível gerar o link do arquivo.";
      const fallback = await sendTextMessage({
        conversation_id,
        to: phone,
        body: fallbackBody,
        user_id,
        sender_type,
        raw_payload_extra: { ...(raw_payload_extra || {}), _audio_fallback: true, meta_upload_error: uploadData, storage_path: storagePath },
      });
      return { ok: fallback.ok, status: fallback.status, data: fallback.data, media_id: null, storage_path };
    }

    return { ok: false, status: uploadResponse.status, error: uploadData };
  }`
  );

  return src;
});

// Restaura inbound: se encontramos contato por alias BR, não podemos sobrescrever wa_id/telefone,
// porque pode bater em unique constraint e impedir a mensagem recebida de ser salva.
patchIfExists("api/whatsapp/webhook.ts", (src) => {
  return src.replace(
    `? await supabaseAdmin.from("whatsapp_contacts").update({ wa_id: waId, telefone: waId, nome: existingContact.nome || nome, updated_at: inboundAt }).eq("id", existingContact.id).select("id, lead_id").single()`,
    `? await supabaseAdmin.from("whatsapp_contacts").update({ nome: existingContact.nome || nome, updated_at: inboundAt }).eq("id", existingContact.id).select("id, lead_id").single()`
  );
});

// Pequenos ajustes visuais no drawer do Kanban e gravação sem fingir MIME aceito.
patchIfExists("src/pages/whatsapp/WhatsAppAtendimento.tsx", (src) => {
  src = src
    .replace(/top-6 w-\[min\(500px,calc\(100vw-48px\)\)\]/g, "top-[96px] w-[min(500px,calc(100vw-48px))]")
    .replace(/bottom-6 right-6 top-6/g, "bottom-6 right-6 top-[96px]")
    .replace(/max-h-\[calc\(100vh-72px\)\]/g, "max-h-[calc(100vh-120px)]")
    .replace(
      `const finalType = recorder.mimeType?.includes("ogg") ? "audio/ogg" : recorder.mimeType?.includes("mp4") ? "audio/mp4" : recorder.mimeType?.includes("aac") ? "audio/aac" : "audio/ogg"; const ext = finalType === "audio/mp4" ? "m4a" : finalType === "audio/aac" ? "aac" : "ogg"; const blob = new Blob(audioChunksRef.current, { type: finalType }); const audioFile = new File([blob], \`audio-\${Date.now()}.\${ext}\`, { type: finalType }); setFile(audioFile);`,
      `const recordedType = recorder.mimeType || "audio/webm"; const finalType = recordedType.includes("ogg") ? "audio/ogg" : recordedType.includes("mp4") ? "audio/mp4" : recordedType.includes("aac") ? "audio/aac" : recordedType.includes("mpeg") ? "audio/mpeg" : recordedType; const ext = finalType.includes("ogg") ? "ogg" : finalType.includes("mp4") ? "m4a" : finalType.includes("aac") ? "aac" : finalType.includes("mpeg") ? "mp3" : "webm"; const blob = new Blob(audioChunksRef.current, { type: finalType }); const audioFile = new File([blob], \`audio-\${Date.now()}.\${ext}\`, { type: finalType }); setFile(audioFile);`
    );
  return src;
});

await import("./patch-whatsapp-consent-gate-v37a.mjs");
await import("./patch-whatsapp-module-fixes-v38b.mjs");
await import("./patch-whatsapp-atendimento-web-layout-v39.mjs");

console.log(`${marker}: concluído`);
