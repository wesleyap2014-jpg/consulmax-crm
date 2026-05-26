import fs from "node:fs";

function replaceBetween(text, start, end, replacement) {
  const a = text.indexOf(start);
  if (a < 0) return text;
  const b = text.indexOf(end, a);
  if (b < 0) return text;
  return text.slice(0, a) + replacement + text.slice(b + end.length);
}

function patchFrontend() {
  const p = "src/pages/AtendimentoWhatsApp.tsx";
  let s = fs.readFileSync(p, "utf8");

  const refs = `  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);`;
  const refs2 = `${refs}
  const [callPanelOpen, setCallPanelOpen] = useState(false);
  const [sendingCallRequest, setSendingCallRequest] = useState(false);`;
  if (!s.includes("sendingCallRequest")) s = s.replace(refs, refs2);

  const newCall = `  function dialablePhone() {
    const digits = onlyDigits(activePhone);
    if (!digits) return "";
    if (digits.startsWith("55")) return digits;
    if (digits.length === 10 || digits.length === 11) return "55" + digits;
    return digits;
  }

  function callSoon() {
    if (!active || !activePhone) return;
    setCallPanelOpen((prev) => !prev);
  }

  async function sendCallRequest() {
    if (!active || !activePhone) return;
    setSendingCallRequest(true);
    const firstName = conversationName(active).split(/\\s+/)[0] || "Olá";
    const body = `${firstName}, posso te ligar agora? Se preferir, também pode me chamar por ligação aqui no WhatsApp. 😊`;
    try {
      await sendMessage(body);
    } finally {
      setSendingCallRequest(false);
    }
  }

  function openNativeCall() {
    const phone = dialablePhone();
    if (!phone) return;
    window.location.href = "tel:+" + phone;
  }

  function openWhatsAppChat() {
    const phone = dialablePhone();
    if (!phone) return;
    window.open("https://wa.me/" + phone, "_blank", "noopener,noreferrer");
  }

  const activeIsMine =`;

  s = replaceBetween(s, "  function callSoon() {", "  const activeIsMine =", newCall);
  s = replaceBetween(s, "  async function callSoon() {", "  const activeIsMine =", newCall);
  s = s.replace(/const activeIsMine =\s*const activeIsMine =\s*/g, "const activeIsMine = ");

  const panelAt = `                      {emojiOpen && (`;
  const panel = `                      {callPanelOpen && (
                        <div className="rounded-2xl border bg-slate-50 p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="flex items-center gap-2 text-sm font-bold text-slate-800"><Phone className="h-4 w-4" />Ligação</p>
                              <p className="mt-1 text-xs text-slate-500">Envie um pedido discreto de ligação ou abra o discador do aparelho. Ligação nativa pelo WhatsApp depende de liberação específica da Meta.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" variant="outline" onClick={sendCallRequest} disabled={sendingCallRequest || sending} className="gap-2">
                                {sendingCallRequest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                Pedir ligação
                              </Button>
                              <Button type="button" variant="outline" onClick={openNativeCall} className="gap-2"><Phone className="h-4 w-4" />Ligar</Button>
                              <Button type="button" variant="outline" onClick={openWhatsAppChat} className="gap-2"><MessageCircle className="h-4 w-4" />WhatsApp</Button>
                            </div>
                          </div>
                        </div>
                      )}

${panelAt}`;
  if (!s.includes("Pedir ligação")) s = s.replace(panelAt, panel);

  const oldBtn = `<Button type="button" variant="outline" onClick={callSoon} className="h-auto min-w-[52px]" title="Fazer ligação"><Phone className="h-5 w-5" /></Button>`;
  const oldBtn2 = `<Button type="button" variant="outline" onClick={callSoon} disabled={sending || callStatus === "requesting_mic" || callStatus === "creating_offer" || callStatus === "calling"} className="h-auto min-w-[52px]" title="Fazer ligação"><Phone className="h-5 w-5" /></Button>`;
  const newBtn = `<Button type="button" variant="outline" onClick={callSoon} disabled={sending} className="h-auto min-w-[52px]" title="Ligação"><Phone className="h-5 w-5" /></Button>`;
  s = s.replace(oldBtn, newBtn);
  s = s.replace(oldBtn2, newBtn);

  fs.writeFileSync(p, s);
  console.log("[patch-whatsapp-call] botão de ligação estável aplicado.");
}

function patchSend() {
  const p = "api/whatsapp/send.ts";
  let s = fs.readFileSync(p, "utf8");
  s = s.replace('const GRAPH_BASE = "https://graph.facebook.com/v21.0";', 'const GRAPH_BASE = "https://graph.facebook.com/v25.0";');
  fs.writeFileSync(p, s);
  console.log("[patch-whatsapp-call] send.ts mantido estável.");
}

patchFrontend();
patchSend();