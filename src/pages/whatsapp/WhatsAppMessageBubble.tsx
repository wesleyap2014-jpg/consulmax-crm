import {
  AlertCircle,
  Check,
  CheckCheck,
  Download,
  FileText,
  Image as ImageIcon,
  Mic,
  RefreshCw,
  Video,
} from "lucide-react";

export type WhatsAppMessage = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  body?: string | null;
  message_type?: string | null;
  created_at: string;
  raw_payload?: Record<string, any> | null;
  media_id?: string | null;
  media_mime_type?: string | null;
  meta_message_id?: string | null;
};

export type StoredMedia = {
  bucket?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  original_file_name?: string | null;
  link?: string | null;
  type?: string | null;
};

export function getStoredMedia(message: WhatsAppMessage): StoredMedia | null {
  const stored =
    message.raw_payload?._consulmax_media ||
    message.raw_payload?.consulmax_media ||
    message.raw_payload?.media;

  if (stored) return stored;

  const templateMedia = message.raw_payload?.template_header_media;
  if (templateMedia) {
    return {
      bucket: templateMedia.bucket || null,
      storage_path: templateMedia.storage_path || null,
      mime_type: templateMedia.mime_type || null,
      original_file_name:
        templateMedia.original_file_name || templateMedia.filename || null,
      link: templateMedia.link || null,
      type: templateMedia.type || null,
    };
  }

  if (message.raw_payload?.storage_path || message.raw_payload?.media_link) {
    return {
      bucket: message.raw_payload.bucket || "whatsapp-media",
      storage_path: message.raw_payload.storage_path || null,
      mime_type:
        message.raw_payload.mime_type || message.media_mime_type || null,
      original_file_name: message.raw_payload.original_file_name || null,
      link: message.raw_payload.media_link || null,
      type: message.raw_payload.media_type || null,
    };
  }

  return null;
}

export function getReplyMetaMessageId(message: WhatsAppMessage) {
  return (
    message.raw_payload?._reply_to?.meta_message_id ||
    message.raw_payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.context
      ?.id ||
    null
  );
}

export function messageSearchText(message: WhatsAppMessage) {
  const media = getStoredMedia(message);
  return [
    message.body,
    message.message_type,
    message.media_mime_type,
    media?.original_file_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("pt-BR");
}

function messageFallback(message: WhatsAppMessage) {
  const type = String(message.message_type || "text").toLowerCase();

  if (message.body) return message.body;
  if (type === "image") return "Imagem";
  if (type === "video") return "Vídeo";
  if (type === "audio" || type === "voice") return "Áudio";
  if (type === "document") return "Documento";
  if (type === "sticker") return "Figurinha";
  if (type === "template") return "Modelo enviado";

  return "Mensagem sem texto";
}

function MediaIcon({ type }: { type?: string | null }) {
  const value = String(type || "").toLowerCase();

  if (value === "image" || value === "sticker")
    return <ImageIcon className="h-4 w-4" />;
  if (value === "video") return <Video className="h-4 w-4" />;
  if (value === "audio" || value === "voice")
    return <Mic className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function ReplyPreview({
  message,
  outbound,
}: {
  message?: WhatsAppMessage | null;
  outbound: boolean;
}) {
  if (!message) return null;

  return (
    <div
      className={`mb-2 rounded-xl border-l-4 px-3 py-2 text-xs ${
        outbound
          ? "border-[#A11C27] bg-white/55 text-slate-700"
          : "border-[#1E293F] bg-slate-100 text-slate-600"
      }`}
    >
      <p className="font-black">Mensagem respondida</p>
      <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap">
        {message.body || messageFallback(message)}
      </p>
    </div>
  );
}

function MessageContent({
  message,
  mediaUrl,
}: {
  message: WhatsAppMessage;
  mediaUrl?: string;
}) {
  const storedMedia = getStoredMedia(message);
  const mime = storedMedia?.mime_type || message.media_mime_type || "";
  const messageType = String(message.message_type || "text").toLowerCase();
  const storedType = String(storedMedia?.type || "").toLowerCase();
  const mimeType = mime.toLowerCase();
  const inferredType =
    storedType ||
    (mimeType.startsWith("image/")
      ? "image"
      : mimeType.startsWith("video/")
        ? "video"
        : mimeType.startsWith("audio/")
          ? "audio"
          : mimeType
            ? "document"
            : "");
  const type =
    messageType === "template" && inferredType ? inferredType : messageType;
  const fileName = storedMedia?.original_file_name || messageFallback(message);
  const isMedia =
    ["audio", "voice", "image", "video", "document", "sticker"].includes(
      type,
    ) || !!storedMedia?.storage_path;

  if ((type === "audio" || type === "voice") && mediaUrl) {
    return (
      <div className="min-w-[240px] space-y-2">
        <div className="flex items-center gap-2 font-semibold">
          <Mic className="h-4 w-4" />
          <span>Áudio</span>
        </div>
        <audio
          controls
          preload="metadata"
          src={mediaUrl}
          className="w-full max-w-[360px]"
        />
        {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
      </div>
    );
  }

  if ((type === "image" || type === "sticker") && mediaUrl) {
    return (
      <div className="space-y-2">
        <a
          href={mediaUrl}
          target="_blank"
          rel="noreferrer"
          title="Abrir imagem em tamanho completo"
        >
          <img
            src={mediaUrl}
            alt={type === "sticker" ? "Figurinha recebida" : "Imagem recebida"}
            className={`max-h-[380px] max-w-full object-contain ${type === "sticker" ? "rounded-lg" : "rounded-2xl"}`}
          />
        </a>
        {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
      </div>
    );
  }

  if (type === "video" && mediaUrl) {
    return (
      <div className="space-y-2">
        <video
          controls
          preload="metadata"
          src={mediaUrl}
          className="max-h-[380px] max-w-full rounded-2xl"
        />
        {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
      </div>
    );
  }

  if (type === "document" && mediaUrl) {
    const isPdf =
      mime.toLowerCase().includes("pdf") ||
      fileName.toLowerCase().endsWith(".pdf");

    return (
      <div className="min-w-[260px] space-y-2">
        <div className="flex items-center gap-2 font-semibold">
          <FileText className="h-4 w-4" />
          <span className="max-w-[300px] truncate" title={fileName}>
            {fileName}
          </span>
        </div>
        {isPdf && (
          <iframe
            src={mediaUrl}
            title={fileName}
            className="h-72 w-full min-w-[300px] rounded-xl border bg-white"
          />
        )}
        <div className="flex flex-wrap gap-2">
          <a
            href={mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-xs font-black text-slate-700 ring-1 ring-slate-200 hover:bg-white"
          >
            <FileText className="h-4 w-4" />
            Visualizar
          </a>
          <a
            href={mediaUrl}
            download={fileName}
            className="inline-flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-xs font-black text-slate-700 ring-1 ring-slate-200 hover:bg-white"
          >
            <Download className="h-4 w-4" />
            Baixar
          </a>
        </div>
        {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
        {mime && <p className="text-[10px] text-slate-500">{mime}</p>}
      </div>
    );
  }

  if (isMedia && !mediaUrl) {
    return (
      <div className="flex items-start gap-2">
        <MediaIcon type={message.message_type} />
        <div>
          <p className="whitespace-pre-wrap">{messageFallback(message)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Arquivo ainda não disponível para reprodução.
          </p>
        </div>
      </div>
    );
  }

  return (
    <p className="whitespace-pre-wrap break-words">
      {messageFallback(message)}
    </p>
  );
}

function DeliveryStatus({ message }: { message: WhatsAppMessage }) {
  if (message.direction !== "outbound") return null;

  const status = String(
    message.raw_payload?.meta_status || "sent",
  ).toLowerCase();
  const label =
    status === "read"
      ? "Lida"
      : status === "delivered"
        ? "Entregue"
        : status === "failed"
          ? "Falhou"
          : "Enviada";

  if (status === "failed") {
    return (
      <AlertCircle className="h-3.5 w-3.5 text-red-600" aria-label={label} />
    );
  }

  if (status === "read") {
    return <CheckCheck className="h-4 w-4 text-sky-500" aria-label={label} />;
  }

  if (status === "delivered") {
    return <CheckCheck className="h-4 w-4 text-slate-500" aria-label={label} />;
  }

  return <Check className="h-4 w-4 text-slate-500" aria-label={label} />;
}

export function WhatsAppMessageBubble({
  message,
  mediaUrl,
  repliedMessage,
  onReply,
  onRetry,
  retrying,
}: {
  message: WhatsAppMessage;
  mediaUrl?: string;
  repliedMessage?: WhatsAppMessage | null;
  onReply: (message: WhatsAppMessage) => void;
  onRetry?: (message: WhatsAppMessage) => void;
  retrying?: boolean;
}) {
  const outbound = message.direction === "outbound";
  const status = String(
    message.raw_payload?.meta_status || "sent",
  ).toLowerCase();
  const retryable =
    status === "failed" &&
    String(message.message_type || "text").toLowerCase() !== "template";

  return (
    <div className={`group flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow ${
          outbound ? "bg-[#dcf8c6] text-slate-900" : "bg-white text-slate-900"
        }`}
      >
        <ReplyPreview message={repliedMessage} outbound={outbound} />
        <MessageContent message={message} mediaUrl={mediaUrl} />

        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">
          <span>
            {new Date(message.created_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <DeliveryStatus message={message} />
        </div>

        <div className="mt-1 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => onReply(message)}
            className="text-[10px] font-black text-[#A11C27] opacity-0 transition group-hover:opacity-100 focus:opacity-100"
          >
            Responder
          </button>
          {retryable && onRetry && (
            <button
              type="button"
              onClick={() => onRetry(message)}
              disabled={retrying}
              className="inline-flex items-center gap-1 text-[10px] font-black text-red-700 disabled:opacity-50"
              title={
                message.raw_payload?.meta_error?.title ||
                message.raw_payload?.meta_error?.message ||
                "Falha no envio"
              }
            >
              <RefreshCw
                className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`}
              />
              Reenviar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
