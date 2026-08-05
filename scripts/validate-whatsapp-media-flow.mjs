import fs from "node:fs";

const pagePath = "src/pages/whatsapp/WhatsAppAtendimento.tsx";
const bubblePath = "src/pages/whatsapp/WhatsAppMessageBubble.tsx";
const page = fs.readFileSync(pagePath, "utf8");
const bubble = fs.readFileSync(bubblePath, "utf8");

const requiredPageSnippets = [
  "convertRecordedAudioToMp3",
  'from "lamejs/lame.min.js?url"',
  "loadBrowserLameJs",
  'type: "audio/mpeg"',
  'await sendPayload(conversation, "", audioFile)',
  "getStoredMedia(message)?.link",
  "Parar e enviar áudio",
];

for (const snippet of requiredPageSnippets) {
  if (!page.includes(snippet)) {
    throw new Error(
      `[validate-whatsapp-media-flow] Fluxo de mídia incompleto na Central: ${snippet}`,
    );
  }
}

if (/setFile\(audioFile\)/.test(page)) {
  throw new Error(
    "[validate-whatsapp-media-flow] O áudio gravado voltou a ser apenas anexado, sem envio automático.",
  );
}

const requiredBubbleSnippets = [
  "template_header_media",
  "templateMedia.link",
  "storedMedia?.type",
];

for (const snippet of requiredBubbleSnippets) {
  if (!bubble.includes(snippet)) {
    throw new Error(
      `[validate-whatsapp-media-flow] Renderização de mídia do modelo incompleta: ${snippet}`,
    );
  }
}

console.log(
  "[validate-whatsapp-media-flow] imagem/PDF de modelos e áudio MP3 automático validados.",
);
