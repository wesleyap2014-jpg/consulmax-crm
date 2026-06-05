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

if (!src.includes("function getMessageMedia")) {
  src = src.replace(
    `function Row({ c }: { c: Conv })`,
    `function getMessageMedia(m: Msg): any {
    return m.raw_payload?._consulmax_media || (m.raw_payload?.storage_path ? { bucket: m.raw_payload.bucket || "whatsapp-media", storage_path: m.raw_payload.storage_path, mime_type: m.raw_payload.mime_type } : null);
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
    if (kind.includes("audio")) {
      return <div className="space-y-1">{url ? <audio controls src={url} className="w-64 max-w-full" /> : <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">Carregando áudio...</div>}{body && !extractBodyUrl(body) && body.toLowerCase() !== "audio" && <p className="whitespace-pre-wrap">{body}</p>}</div>;
    }
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
console.log("patch-whatsapp-atendimento-web-layout-v39: áudio com player aplicado");
