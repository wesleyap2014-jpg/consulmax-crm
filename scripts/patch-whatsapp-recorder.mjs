import fs from "node:fs";

const filePath = "src/pages/AtendimentoWhatsApp.tsx";
let source = fs.readFileSync(filePath, "utf8");

function replaceOnce(needle, replacement, label) {
  if (!source.includes(needle)) {
    console.warn(`[patch-whatsapp-recorder] trecho não encontrado: ${label}`);
    return;
  }

  source = source.replace(needle, replacement);
}

if (!source.includes("recordingSeconds")) {
  replaceOnce(
    `  const [emojiOpen, setEmojiOpen] = useState(false);\n  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});`,
    `  const [emojiOpen, setEmojiOpen] = useState(false);\n  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});\n  const [recording, setRecording] = useState(false);\n  const [recordingSeconds, setRecordingSeconds] = useState(0);`,
    "states"
  );
}

if (!source.includes("mediaRecorderRef")) {
  replaceOnce(
    `  const audioInputRef = useRef<HTMLInputElement | null>(null);\n  const attachmentInputRef = useRef<HTMLInputElement | null>(null);`,
    `  const audioInputRef = useRef<HTMLInputElement | null>(null);\n  const attachmentInputRef = useRef<HTMLInputElement | null>(null);\n  const mediaRecorderRef = useRef<MediaRecorder | null>(null);\n  const mediaChunksRef = useRef<Blob[]>([]);\n  const recordingTimerRef = useRef<number | null>(null);`,
    "refs"
  );
}

if (!source.includes("function formatRecordingTime")) {
  replaceOnce(
    `function MetricCard({ label, value, tone }: { label: string; value: number; tone: "gold" | "navy" | "red" | "green" }) {`,
    `function formatRecordingTime(seconds: number) {\n  const min = Math.floor(seconds / 60);\n  const sec = seconds % 60;\n\n  return min + ":" + String(sec).padStart(2, "0");\n}\n\nfunction MetricCard({ label, value, tone }: { label: string; value: number; tone: "gold" | "navy" | "red" | "green" }) {`,
    "formatRecordingTime"
  );
}

if (!source.includes("function clearRecordingTimer")) {
  replaceOnce(
    `  async function updateConversationPatch(patch: Partial<Conversation>) {`,
    `  function clearRecordingTimer() {\n    if (recordingTimerRef.current) {\n      window.clearInterval(recordingTimerRef.current);\n      recordingTimerRef.current = null;\n    }\n  }\n\n  async function startAudioRecording() {\n    if (recording || sending) return;\n\n    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {\n      alert("Seu navegador não permite gravar áudio diretamente aqui. Use o botão de anexo para enviar um arquivo de áudio.");\n      return;\n    }\n\n    try {\n      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });\n      const preferredMimeTypes = ["audio/ogg;codecs=opus", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/webm;codecs=opus", "audio/webm"];\n      const supportedMimeType = preferredMimeTypes.find((mime) => MediaRecorder.isTypeSupported(mime));\n      const recorder = supportedMimeType ? new MediaRecorder(stream, { mimeType: supportedMimeType }) : new MediaRecorder(stream);\n\n      mediaChunksRef.current = [];\n      mediaRecorderRef.current = recorder;\n\n      recorder.ondataavailable = (event) => {\n        if (event.data?.size) mediaChunksRef.current.push(event.data);\n      };\n\n      recorder.onstop = () => {\n        stream.getTracks().forEach((track) => track.stop());\n      };\n\n      recorder.start();\n      setRecording(true);\n      setRecordingSeconds(0);\n      clearRecordingTimer();\n      recordingTimerRef.current = window.setInterval(() => setRecordingSeconds((prev) => prev + 1), 1000);\n    } catch (error) {\n      console.error("WHATSAPP_AUDIO_RECORD_START_ERROR", error);\n      alert("Não consegui acessar o microfone. Verifique a permissão do navegador e tente novamente.");\n    }\n  }\n\n  function cancelAudioRecording() {\n    const recorder = mediaRecorderRef.current;\n\n    clearRecordingTimer();\n    setRecording(false);\n    setRecordingSeconds(0);\n    mediaChunksRef.current = [];\n\n    if (recorder && recorder.state !== "inactive") {\n      recorder.onstop = () => {\n        recorder.stream.getTracks().forEach((track) => track.stop());\n      };\n      recorder.stop();\n    }\n\n    mediaRecorderRef.current = null;\n  }\n\n  function stopAudioRecording() {\n    const recorder = mediaRecorderRef.current;\n\n    if (!recorder || recorder.state === "inactive") {\n      cancelAudioRecording();\n      return;\n    }\n\n    recorder.onstop = async () => {\n      const recordedMimeType = recorder.mimeType || "audio/webm";\n      const whatsappMimeType = recordedMimeType.includes("webm") ? "audio/ogg" : recordedMimeType.split(";")[0];\n      const extension = whatsappMimeType === "audio/mp4" ? "m4a" : whatsappMimeType === "audio/mpeg" ? "mp3" : "ogg";\n      const blob = new Blob(mediaChunksRef.current, { type: whatsappMimeType });\n\n      recorder.stream.getTracks().forEach((track) => track.stop());\n      clearRecordingTimer();\n      setRecording(false);\n      setRecordingSeconds(0);\n      mediaRecorderRef.current = null;\n      mediaChunksRef.current = [];\n\n      if (!blob.size) {\n        alert("Não consegui capturar áudio. Tente gravar novamente.");\n        return;\n      }\n\n      const file = new File([blob], \`audio-consulmax-\${Date.now()}.\${extension}\`, { type: whatsappMimeType });\n      await sendMediaFile(file);\n    };\n\n    recorder.stop();\n  }\n\n  useEffect(() => {\n    return () => {\n      clearRecordingTimer();\n\n      const recorder = mediaRecorderRef.current;\n      if (recorder && recorder.state !== "inactive") {\n        recorder.stream.getTracks().forEach((track) => track.stop());\n        recorder.stop();\n      }\n    };\n  }, []);\n\n  async function updateConversationPatch(patch: Partial<Conversation>) {`,
    "recorder-functions"
  );
}

// Corrige versões antigas já aplicadas no arquivo durante build anterior/local.
source = source.replace(
  `const recorder = new MediaRecorder(stream);`,
  `const preferredMimeTypes = ["audio/ogg;codecs=opus", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/webm;codecs=opus", "audio/webm"];\n      const supportedMimeType = preferredMimeTypes.find((mime) => MediaRecorder.isTypeSupported(mime));\n      const recorder = supportedMimeType ? new MediaRecorder(stream, { mimeType: supportedMimeType }) : new MediaRecorder(stream);`
);

source = source.replace(
  `const mimeType = recorder.mimeType || "audio/webm";\n      const blob = new Blob(mediaChunksRef.current, { type: mimeType });`,
  `const recordedMimeType = recorder.mimeType || "audio/webm";\n      const whatsappMimeType = recordedMimeType.includes("webm") ? "audio/ogg" : recordedMimeType.split(";")[0];\n      const extension = whatsappMimeType === "audio/mp4" ? "m4a" : whatsappMimeType === "audio/mpeg" ? "mp3" : "ogg";\n      const blob = new Blob(mediaChunksRef.current, { type: whatsappMimeType });`
);

source = source.replace(
  `const file = new File([blob], \`audio-consulmax-\${Date.now()}.webm\`, { type: mimeType });`,
  `const file = new File([blob], \`audio-consulmax-\${Date.now()}.\${extension}\`, { type: whatsappMimeType });`
);

replaceOnce(
  `<Button type="button" variant="outline" onClick={() => audioInputRef.current?.click()} disabled={sending} className="h-auto min-w-[52px]" title="Enviar áudio"><Mic className="h-5 w-5" /></Button>`,
  `<Button type="button" variant="outline" onClick={recording ? stopAudioRecording : startAudioRecording} disabled={sending} className={\`h-auto min-w-[52px] \${recording ? "border-red-300 bg-red-50 text-red-700" : ""}\`} title={recording ? "Enviar áudio gravado" : "Gravar áudio"}>\n                          {recording ? <Send className="h-5 w-5" /> : <Mic className="h-5 w-5" />}\n                        </Button>`,
  "audio-button"
);

if (!source.includes("Gravando áudio")) {
  replaceOnce(
    `                      <div className="flex gap-3">`,
    `                      {recording && (\n                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">\n                          <div className="flex items-center gap-2 font-semibold">\n                            <span className="relative flex h-3 w-3">\n                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />\n                              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />\n                            </span>\n                            Gravando áudio... {formatRecordingTime(recordingSeconds)}\n                          </div>\n\n                          <div className="flex items-center gap-2">\n                            <Button type="button" size="sm" variant="outline" onClick={cancelAudioRecording}>Cancelar</Button>\n                            <Button type="button" size="sm" onClick={stopAudioRecording} style={{ background: C.red }} className="gap-2 text-white">\n                              <Send className="h-4 w-4" />\n                              Enviar áudio\n                            </Button>\n                          </div>\n                        </div>\n                      )}\n\n                      <div className="flex gap-3">`,
    "recording-banner"
  );
}

fs.writeFileSync(filePath, source);
console.log("[patch-whatsapp-recorder] AtendimentoWhatsApp atualizado para gravação de áudio.");
