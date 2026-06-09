import fs from "node:fs";

const file = "src/pages/whatsapp/WhatsAppAtendimento.tsx";
if (!fs.existsSync(file)) {
  console.log("patch-whatsapp-atendimento-web-layout-v39: arquivo não encontrado");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");

if (!src.includes("const [mediaUrls, setMediaUrls]")) {
  src = src.replace(
    `const [sendSatisfaction, setSendSatisfaction] = useState(true), [messageText, setMessageText] = useState(""), [file, setFile] = useState<File | null>(null), [replyTo, setReplyTo] = useState<Msg | null>(null);`,
    `const [sendSatisfaction, setSendSatisfaction] = useState(true), [messageText, setMessageText] = useState(""), [file, setFile] = useState<File | null>(null), [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});`
  );
}

if (!src.includes("resolveMediaUrlsForMessages")) {
  src = src.replace(
    `useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, active?.id]);`,
    `useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, active?.id]);
  useEffect(() => { resolveMediaUrlsForMessages(msgs); }, [msgs]);`
  );
}

if (!src.includes("function templateVariableValues")) {
  src = src.replace(
    `async function sendTemplate(conv: Conv) { if (!startTemplate) return alert("Selecione um modelo aprovado."); setSending(true); try { const res = await fetch("/api/whatsapp/template", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: conv.id, to: phoneOf(conv), template_name: startTemplate, template_language: "pt_BR" }) }); const json = await res.json().catch(() => null); if (!res.ok || !json?.ok) throw new Error(json?.error?.error?.message || json?.error || "Falha ao enviar modelo"); await loadMessages(conv.id); await load(); } catch (e: any) { alert(e?.message || "Não foi possível enviar modelo."); } finally { setSending(false); } }`,
    `function templateVariableValues(conv: Conv) {
    const selected = templates.find((t) => t.name === startTemplate);
    const body = String(selected?.body || "");
    const count = Math.max(0, ...Array.from(body.matchAll(/{{\\s*(\\d+|[a-zA-Z0-9_]+)\\s*}}/g)).map((m) => Number.isNaN(Number(m[1])) ? 0 : Number(m[1])));
    const cliente = nameOf(conv).split(/\\s+/)[0] || nameOf(conv) || "cliente";
    const consultor = "Wesley";
    if (!count) return [];
    return Array.from({ length: count }).map((_, idx) => ({ type: "text", text: idx === 0 ? cliente : consultor }));
  }
  async function sendTemplate(conv: Conv) { if (!startTemplate) return alert("Selecione um modelo aprovado."); setSending(true); try { const res = await fetch("/api/whatsapp/template", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: conv.id, to: phoneOf(conv), template_name: startTemplate, template_language: "pt_BR", template_params: templateVariableValues(conv) }) }); const json = await res.json().catch(() => null); if (!res.ok || !json?.ok) throw new Error(json?.error?.error?.message || json?.error || "Falha ao enviar modelo"); await loadMessages(conv.id); await load(); } catch (e: any) { alert(e?.message || "Não foi possível enviar modelo."); } finally { setSending(false); } }`
  );
}

src = src.replace(
  `await load(true); await open(conv as Conv); if (startMessage.trim() && in24h(conv as Conv)) await sendPayload(conv as Conv, startMessage.trim());`,
  `await load(true); await open(conv as Conv); if (startTemplate) await sendTemplate(conv as Conv); else if (startMessage.trim() && in24h(conv as Conv)) await sendPayload(conv as Conv, startMessage.trim());`
);

if (!src.includes("function getMessageMedia")) {
  src = src.replace(
    `function Row({ c }: { c: Conv })`,
    `function getMessageMedia(m: Msg): any {
    return m.raw_payload?._consulmax_media || (m.raw_payload?.storage_path ? { bucket: m.raw_payload.bucket || "whatsapp-media", storage_path: m.raw_payload.storage_path, mime_type: m.raw_payload.mime_type, original_file_name: m.raw_payload.original_file_name } : null);
  }
  function extractBodyUrl(value?: string | null) {
    const raw = String(value || "");
    const start = raw.indexOf("http");
    return start >= 0 ? raw.slice(start).trim() : "";
  }
  async function resolveMediaUrlsForMessages(rows: Msg[]) {
    const missing = rows.map((m) => ({ m, media: getMessageMedia(m) })).filter(({ m, media }) => media?.storage_path && !mediaUrls[m.id]);
    if (!missing.length) return;
    const pairs = await Promise.all(missing.map(async ({ m, media }) => {
      const { data } = await supabase.storage.from(media.bucket || "whatsapp-media").createSignedUrl(media.storage_path, 60 * 60 * 24 * 7);
      return [m.id, data?.signedUrl || ""] as const;
    }));
    setMediaUrls((prev) => ({ ...prev, ...Object.fromEntries(pairs.filter(([, url]) => !!url)) }));
  }
  function renderMessageBody(m: Msg) {
    const media = getMessageMedia(m);
    const kind = String(m.message_type || media?.mime_type || "").toLowerCase();
    const url = mediaUrls[m.id] || extractBodyUrl(m.body);
    const body = String(m.body || "").trim();
    const fileName = media?.original_file_name || "arquivo";
    if (kind.includes("audio")) return <div className="space-y-1">{url ? <audio controls src={url} className="w-64 max-w-full" /> : <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">Carregando áudio...</div>}{body && !extractBodyUrl(body) && body.toLowerCase() !== "audio" && <p className="whitespace-pre-wrap">{body}</p>}</div>;
    if (kind.includes("image")) return <div className="space-y-1">{url ? <img src={url} alt={fileName} className="max-h-72 max-w-xs rounded-xl object-contain" /> : <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">Carregando imagem...</div>}{body && <p className="whitespace-pre-wrap">{body}</p>}</div>;
    if (kind.includes("video")) return <div className="space-y-1">{url ? <video controls src={url} className="max-h-72 max-w-xs rounded-xl" /> : <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">Carregando vídeo...</div>}{body && <p className="whitespace-pre-wrap">{body}</p>}</div>;
    if (kind.includes("document") || media?.storage_path) return <div className="space-y-1 rounded-xl bg-slate-50 p-2"><p className="text-xs font-black text-slate-700">📎 {fileName}</p>{url ? <a href={url} target="_blank" rel="noreferrer" className="text-xs font-black text-[#A11C27] underline">Abrir arquivo</a> : <p className="text-xs text-slate-500">Carregando arquivo...</p>}{body && <p className="whitespace-pre-wrap">{body}</p>}</div>;
    if (url && body.includes("Áudio enviado pela Consulmax")) return <audio controls src={url} className="w-64 max-w-full" />;
    return <p className="whitespace-pre-wrap">{body || m.message_type || "Mensagem"}</p>;
  }

  function Row({ c }: { c: Conv })`
  );
}

src = src.replace(
  `{String(m.message_type || "").toLowerCase().includes("audio") ? <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">🎧 Áudio recebido/enviado</div> : <p className="whitespace-pre-wrap">{m.body || m.message_type || "Mensagem"}</p>}`,
  `{renderMessageBody(m)}`
);
src = src.replace(
  `<p className="whitespace-pre-wrap">{m.body || m.message_type || "Mensagem"}</p>`,
  `{renderMessageBody(m)}`
);

fs.writeFileSync(file, src);
console.log("patch-whatsapp-atendimento-web-layout-v39: templates e mídias aplicados");
