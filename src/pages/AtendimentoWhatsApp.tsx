import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Send,
  Bot,
  UserRound,
  MessageCircle,
  RefreshCw,
  Inbox,
  UserCheck,
  Users,
  CheckCircle2,
  Clock,
  Tag,
  ShieldCheck,
  ArrowRightLeft,
  Smile,
  Image as ImageIcon,
  Video,
  Mic,
  FileText,
  Lock,
  KanbanSquare,
  Download,
  Phone,
  Paperclip,
  Settings,
  X,
  Minus,
  Plus,
  Search,
  CalendarClock,
  Megaphone,
  Edit3,
  Trash2,
  Upload,
  Ban,
} from "lucide-react";

const C = {
  red: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  goldLight: "#E0CE8C",
  off: "#F5F5F5",
  green: "#0f766e",
  muted: "#64748b",
  soft: "#f8fafc",
};

const WESLEY_ID = "524f9d55-48c0-4c56-9ab8-7e6115e7c0b0";
const DEFAULT_MEDIA_BUCKET = "whatsapp-media";

type Conversation = {
  id: string;
  contact_id: string;
  lead_id: string | null;
  opportunity_id?: string | null;
  assigned_to: string | null;
  assigned_at?: string | null;
  closed_at?: string | null;
  queue?: string | null;
  status: string;
  stage: string;
  priority: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  whatsapp_contacts?: {
    id: string;
    nome: string | null;
    telefone: string | null;
    wa_id: string;
  } | null;
};

type StoredMedia = {
  bucket?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  media_id?: string | null;
  original_file_name?: string | null;
};

type Message = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  sender_type: string;
  user_id: string | null;
  message_type: string;
  body: string | null;
  media_id?: string | null;
  media_mime_type?: string | null;
  raw_payload?: any;
  created_at: string;
};

type UserProfile = {
  id: string;
  auth_user_id: string | null;
  nome: string | null;
  email: string | null;
  role: string | null;
  user_role: string | null;
  scopes: string[] | null;
  is_active: boolean | null;
};

type QueueDef = {
  key: string;
  label: string;
  area: "comercial" | "operacional" | "geral";
  color: string;
  description?: string;
  commercialResult?: "won" | "lost";
};

type ContactBook = {
  id: string;
  nome: string | null;
  telefone: string | null;
  telefone_digits?: string | null;
  email?: string | null;
  origem?: string | null;
  tags?: string[] | null;
  lead_id?: string | null;
  cliente_id?: string | null;
  opportunity_id?: string | null;
  _optOut?: boolean;
};

type Campaign = {
  id: string;
  name: string;
  status: string;
  campaign_type: string | null;
  audience_source: string | null;
  message_body: string | null;
  template_name?: string | null;
  template_language?: string | null;
  attachment_bucket?: string | null;
  attachment_path?: string | null;
  attachment_mime_type?: string | null;
  scheduled_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CampaignRecipient = {
  id?: string;
  campaign_id?: string;
  contact_book_id?: string | null;
  telefone_digits: string;
  nome?: string | null;
  status?: string | null;
};

const QUEUES: QueueDef[] = [
  { key: "novos_contatos", label: "Novos Contatos", area: "geral", color: C.red, description: "Entradas novas do WhatsApp" },
  { key: "triagem", label: "Triagem", area: "geral", color: C.gold, description: "Classificação inicial" },
  { key: "comercial", label: "Comercial", area: "comercial", color: C.navy, description: "Atendimento comercial inicial" },
  { key: "qualificacao", label: "Qualificação", area: "comercial", color: C.navy, description: "Diagnóstico e qualificação" },
  { key: "proposta", label: "Proposta", area: "comercial", color: C.navy, description: "Simulação e proposta enviada" },
  { key: "negociacao", label: "Negociação", area: "comercial", color: C.navy, description: "Follow-up e fechamento" },
  { key: "fechado_ganho", label: "Fechado Ganho", area: "comercial", color: C.green, description: "Oportunidade ganha", commercialResult: "won" },
  { key: "fechado_perdido", label: "Fechado Perdido", area: "comercial", color: C.muted, description: "Oportunidade perdida", commercialResult: "lost" },
  { key: "cliente_ativo", label: "Cliente Ativo", area: "operacional", color: C.green, description: "Clientes em andamento" },
  { key: "boleto", label: "Boleto", area: "operacional", color: C.green, description: "Segunda via, pagamentos e vencimentos" },
  { key: "contemplacao", label: "Contemplação", area: "operacional", color: C.green, description: "Pós-contemplação" },
  { key: "pos_venda", label: "Pós-venda", area: "operacional", color: C.green, description: "Acompanhamento e relacionamento" },
  { key: "suporte", label: "Suporte", area: "operacional", color: C.green, description: "Suporte geral" },
  { key: "financeiro", label: "Financeiro", area: "operacional", color: C.green, description: "Demandas financeiras" },
  { key: "finalizado", label: "Finalizado", area: "geral", color: C.muted, description: "Atendimentos encerrados" },
];

const CLOSED_STATUSES = new Set(["fechada", "finalizado", "finalizada", "closed", "fechado_ganho", "fechado_perdido"]);
const QUICK_EMOJIS = ["😊", "👍", "🙏", "🚀", "✅", "📌", "📄", "💰", "🏡", "🚗", "📞", "🤝"];

const EVALUATION_MESSAGE =
  "Atendimento finalizado ✅\n\nSua opinião é muito importante para a Consulmax. Como você avalia esse atendimento de 1 a 5?\n\n1️⃣ Ruim\n2️⃣ Regular\n3️⃣ Bom\n4️⃣ Muito bom\n5️⃣ Excelente";

const OPT_OUT_TEXT = "Para não receber mais mensagens da Consulmax, responda SAIR.";

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function hasScope(profile: UserProfile | null, scope: string) {
  return (profile?.scopes || []).includes(scope);
}

function profileRole(profile: UserProfile | null) {
  return String(profile?.role || profile?.user_role || "").toLowerCase();
}

function isManager(profile: UserProfile | null, authUserId: string | null) {
  const role = profileRole(profile);

  return (
    authUserId === WESLEY_ID ||
    role === "admin" ||
    role === "gestor" ||
    hasScope(profile, "atendimentos_admin") ||
    hasScope(profile, "atendimento_admin") ||
    hasScope(profile, "attendance:all")
  );
}

function isCommercialUser(profile: UserProfile | null) {
  const role = profileRole(profile);

  return (
    role === "vendedor" ||
    role === "gestor" ||
    role === "admin" ||
    hasScope(profile, "atendimentos_comercial") ||
    hasScope(profile, "atendimento_comercial") ||
    hasScope(profile, "attendance:commercial")
  );
}

function isOperationalUser(profile: UserProfile | null) {
  const role = profileRole(profile);

  return (
    role === "operacoes" ||
    role === "operacional" ||
    role === "viewer" ||
    role === "gestor" ||
    role === "admin" ||
    hasScope(profile, "atendimentos_operacoes") ||
    hasScope(profile, "atendimento_operacoes") ||
    hasScope(profile, "attendance:operations")
  );
}

function allowedQueuesFor(profile: UserProfile | null, authUserId: string | null) {
  if (isManager(profile, authUserId)) return QUEUES.map((q) => q.key);

  const allowed = new Set<string>();

  allowed.add("novos_contatos");
  allowed.add("triagem");

  if (isCommercialUser(profile)) {
    ["comercial", "qualificacao", "proposta", "negociacao", "fechado_ganho", "fechado_perdido"].forEach((q) => allowed.add(q));
  }

  if (isOperationalUser(profile)) {
    ["cliente_ativo", "boleto", "contemplacao", "pos_venda", "suporte", "financeiro"].forEach((q) => allowed.add(q));
  }

  return Array.from(allowed);
}

function isClosed(conv?: Pick<Conversation, "status" | "stage" | "queue"> | null) {
  if (!conv) return false;

  return (
    CLOSED_STATUSES.has(String(conv.status || "").toLowerCase()) ||
    CLOSED_STATUSES.has(String(conv.stage || "").toLowerCase()) ||
    CLOSED_STATUSES.has(String(conv.queue || "").toLowerCase())
  );
}

function queueFromConversation(conv?: Conversation | null) {
  if (!conv) return "novos_contatos";

  const raw = String(conv.queue || conv.stage || "novos_contatos").toLowerCase();

  if (raw === "entrada") return "novos_contatos";
  if (raw === "atendimento") return "triagem";
  if (raw === "fechada" || raw === "finalizado" || raw === "finalizada") return "finalizado";

  return raw;
}

function isUnassigned(conv: Conversation) {
  return !conv.assigned_to && !isClosed(conv);
}

function canViewConversation(conv: Conversation, profile: UserProfile | null, authUserId: string | null) {
  if (isManager(profile, authUserId)) return true;
  if (conv.assigned_to === authUserId) return true;

  const allowed = allowedQueuesFor(profile, authUserId);
  return allowed.includes(queueFromConversation(conv));
}

function fmtTime(value?: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function fmtRelative(value?: string | null) {
  if (!value) return "Sem horário";

  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const min = Math.max(0, Math.floor(diff / 60000));

  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;

  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h`;

  const days = Math.floor(hours / 24);
  return `${days} d`;
}

function formatPhoneBR(value?: string | null) {
  const digits = onlyDigits(value);

  if (!digits) return "Telefone não identificado";

  if (digits.startsWith("55") && digits.length >= 12) {
    const local = digits.slice(2);
    const ddd = local.slice(0, 2);
    const rest = local.slice(2);

    if (rest.length === 9) return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }

  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;

  return digits;
}

function initials(name?: string | null) {
  const clean = String(name || "Cliente").trim();

  return clean
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function conversationName(conv?: Conversation | null) {
  return conv?.whatsapp_contacts?.nome || "Cliente WhatsApp";
}

function makeTicketNumber(conv?: Conversation | null) {
  if (!conv?.id) return "ATD-000000";
  const year = new Date(conv.last_message_at || new Date()).getFullYear();
  return `ATD-${year}-${conv.id.slice(0, 8).toUpperCase()}`;
}

function statusLabel(status?: string | null) {
  const value = String(status || "novo").toLowerCase();

  const map: Record<string, string> = {
    bot: "Bot",
    humano: "Humano",
    novo: "Novo",
    entrada: "Entrada",
    aguardando_cliente: "Aguard. cliente",
    aguardando_interno: "Aguard. interno",
    fechada: "Finalizado",
    finalizado: "Finalizado",
    finalizada: "Finalizado",
    fechado_ganho: "Fechado Ganho",
    fechado_perdido: "Fechado Perdido",
  };

  return map[value] || status || "Novo";
}

function queueLabel(value?: string | null) {
  const normalized = String(value || "novos_contatos").toLowerCase();

  const found = QUEUES.find((q) => q.key === normalized);
  if (found) return found.label;

  return value || "Novos Contatos";
}

function badgeStyleForStatus(status?: string | null): React.CSSProperties {
  const value = String(status || "").toLowerCase();

  if (value === "bot" || value === "novo") return { background: C.gold, color: C.navy };
  if (value === "humano") return { background: C.navy, color: "white" };
  if (value === "fechado_ganho") return { background: C.green, color: "white" };
  if (value === "fechado_perdido") return { background: C.muted, color: "white" };
  if (CLOSED_STATUSES.has(value)) return { background: C.green, color: "white" };

  return { background: "#e2e8f0", color: C.navy };
}

function queueColor(queue?: string | null) {
  const found = QUEUES.find((q) => q.key === String(queue || "").toLowerCase());
  return found?.color || C.muted;
}

function messageFallback(msg: Message) {
  const type = String(msg.message_type || "text").toLowerCase();

  if (msg.body) return msg.body;
  if (type === "image") return "Imagem recebida";
  if (type === "video") return "Vídeo recebido";
  if (type === "audio" || type === "voice") return "Áudio recebido";
  if (type === "document") return "Documento recebido";
  if (type === "sticker") return "Figurinha recebida";

  return "Mensagem sem texto";
}

function MediaIcon({ type }: { type?: string | null }) {
  const value = String(type || "").toLowerCase();

  if (value === "image") return <ImageIcon className="h-4 w-4" />;
  if (value === "video") return <Video className="h-4 w-4" />;
  if (value === "audio" || value === "voice") return <Mic className="h-4 w-4" />;
  if (value === "document") return <FileText className="h-4 w-4" />;

  return null;
}

function getStoredMedia(msg: Message): StoredMedia | null {
  return (
    msg.raw_payload?._consulmax_media ||
    msg.raw_payload?.consulmax_media ||
    msg.raw_payload?.media ||
    null
  );
}

function isMediaMessage(msg: Message) {
  const type = String(msg.message_type || "").toLowerCase();
  return ["audio", "voice", "image", "video", "document", "sticker"].includes(type) || !!getStoredMedia(msg)?.storage_path;
}

function firstName(nome?: string | null) {
  return String(nome || "").trim().split(/\s+/)[0] || "";
}

function renderCampaignText(template: string, contact: ContactBook | CampaignRecipient) {
  const name = String(contact.nome || "");
  const phone = onlyDigits((contact as ContactBook).telefone_digits || (contact as ContactBook).telefone || contact.telefone_digits);

  let body = String(template || "")
    .replace(/{{\s*nome\s*}}/gi, name)
    .replace(/{{\s*primeiro_nome\s*}}/gi, firstName(name))
    .replace(/{{\s*telefone\s*}}/gi, phone);

  if (!/\b(SAIR|PARAR|CANCELAR|DESCADASTRAR|STOP)\b/i.test(body)) {
    body += `\n\n${OPT_OUT_TEXT}`;
  }

  return body.trim();
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Erro ao ler arquivo."));

    reader.readAsDataURL(file);
  });
}

function detectMediaType(file: File) {
  const mime = file.type || "";

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";

  return "document";
}

function statusPill(status?: string | null) {
  const value = String(status || "draft").toLowerCase();

  const map: Record<string, string> = {
    draft: "Rascunho",
    scheduled: "Agendada",
    running: "Enviando",
    finished: "Finalizada",
    paused: "Pausada",
    cancelled: "Cancelada",
  };

  return map[value] || value;
}

function MessageContent({ msg, mediaUrl, outbound }: { msg: Message; mediaUrl?: string; outbound: boolean }) {
  const type = String(msg.message_type || "text").toLowerCase();
  const storedMedia = getStoredMedia(msg);
  const mime = storedMedia?.mime_type || msg.media_mime_type || "";
  const label = messageFallback(msg);
  const linkClass = outbound ? "text-white/90 underline" : "text-slate-700 underline";

  if ((type === "audio" || type === "voice") && mediaUrl) {
    return (
      <div className="min-w-[260px] space-y-2">
        <div className="flex items-center gap-2 font-semibold">
          <Mic className="h-4 w-4" />
          <span>Áudio</span>
        </div>
        <audio controls preload="metadata" src={mediaUrl} className="w-full max-w-[360px]" />
        <a href={mediaUrl} target="_blank" rel="noreferrer" className={linkClass}>
          Abrir áudio
        </a>
      </div>
    );
  }

  if (type === "image" && mediaUrl) {
    return (
      <div className="space-y-2">
        <img src={mediaUrl} alt="Imagem recebida" className="max-h-[360px] max-w-full rounded-2xl object-contain" />
        {msg.body && <p className="whitespace-pre-wrap">{msg.body}</p>}
        <a href={mediaUrl} target="_blank" rel="noreferrer" className={linkClass}>
          Abrir imagem
        </a>
      </div>
    );
  }

  if (type === "video" && mediaUrl) {
    return (
      <div className="space-y-2">
        <video controls preload="metadata" src={mediaUrl} className="max-h-[360px] max-w-full rounded-2xl" />
        {msg.body && <p className="whitespace-pre-wrap">{msg.body}</p>}
        <a href={mediaUrl} target="_blank" rel="noreferrer" className={linkClass}>
          Abrir vídeo
        </a>
      </div>
    );
  }

  if ((type === "document" || type === "sticker" || isMediaMessage(msg)) && mediaUrl) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 font-semibold">
          <MediaIcon type={type} />
          <span>{label}</span>
        </div>
        <a href={mediaUrl} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${outbound ? "bg-white/10 text-white" : "bg-slate-100 text-slate-800"}`}>
          <Download className="h-4 w-4" />
          Abrir arquivo
        </a>
        {mime && <p className={outbound ? "text-xs text-white/70" : "text-xs text-slate-400"}>{mime}</p>}
      </div>
    );
  }

  if (isMediaMessage(msg) && !mediaUrl) {
    return (
      <div className="flex items-start gap-2">
        <MediaIcon type={msg.message_type} />
        <div>
          <p className="whitespace-pre-wrap">{label}</p>
          <p className={outbound ? "mt-1 text-xs text-white/70" : "mt-1 text-xs text-slate-400"}>
            Arquivo ainda não disponível para reprodução.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <MediaIcon type={msg.message_type} />
      <p className="whitespace-pre-wrap">{label}</p>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: "gold" | "navy" | "red" | "green" }) {
  const colorMap = {
    gold: C.gold,
    navy: C.navy,
    red: C.red,
    green: C.green,
  };

  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold" style={{ color: colorMap[tone] }}>
        {value}
      </p>
    </div>
  );
}

function OverlayShell({ title, subtitle, onClose, children, max = "max-w-6xl" }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; max?: string }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className={`max-h-[92vh] w-full ${max} overflow-auto rounded-3xl bg-white p-5 shadow-2xl`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Central WhatsApp</p>
            <h2 className="text-2xl font-black" style={{ color: C.navy }}>{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <Button variant="ghost" onClick={onClose} className="rounded-full">
            <X className="h-5 w-5" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AtendimentoWhatsApp() {
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingConversation, setUpdatingConversation] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [drawerMinimized, setDrawerMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  const [boardArea, setBoardArea] = useState<"todos" | "comercial" | "operacional" | "geral">("todos");
  const [boardSearch, setBoardSearch] = useState("");

  const [startOpen, setStartOpen] = useState(false);
  const [startSearch, setStartSearch] = useState("");
  const [startResults, setStartResults] = useState<ContactBook[]>([]);
  const [startSearching, setStartSearching] = useState(false);
  const [startSelected, setStartSelected] = useState<ContactBook | null>(null);
  const [startName, setStartName] = useState("");
  const [startPhone, setStartPhone] = useState("");
  const [startQueue, setStartQueue] = useState("triagem");
  const [startMessage, setStartMessage] = useState("");

  const [queuesOpen, setQueuesOpen] = useState(false);

  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [sendingCampaignId, setSendingCampaignId] = useState<string | null>(null);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [campaignMessage, setCampaignMessage] = useState("");
  const [campaignScheduledAt, setCampaignScheduledAt] = useState("");
  const [campaignAudienceSearch, setCampaignAudienceSearch] = useState("");
  const [campaignAudienceResults, setCampaignAudienceResults] = useState<ContactBook[]>([]);
  const [campaignAudienceLoading, setCampaignAudienceLoading] = useState(false);
  const [selectedCampaignContacts, setSelectedCampaignContacts] = useState<ContactBook[]>([]);
  const [campaignFile, setCampaignFile] = useState<File | null>(null);
  const [campaignAttachmentName, setCampaignAttachmentName] = useState<string | null>(null);
  const [campaignAttachmentPath, setCampaignAttachmentPath] = useState<string | null>(null);
  const [campaignAttachmentMime, setCampaignAttachmentMime] = useState<string | null>(null);

  const activeRef = useRef<Conversation | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const manager = isManager(profile, authUserId);
  const allowedQueues = useMemo(() => allowedQueuesFor(profile, authUserId), [profile, authUserId]);

  const userNameByAuthId = useMemo(() => {
    const map = new Map<string, string>();

    users.forEach((u) => {
      if (u.auth_user_id) map.set(u.auth_user_id, u.nome || u.email || "Usuário");
    });

    if (authUserId && profile?.nome) map.set(authUserId, profile.nome);

    return map;
  }, [authUserId, profile?.nome, users]);

  const activeContact = active?.whatsapp_contacts;
  const activePhone = onlyDigits(activeContact?.telefone || activeContact?.wa_id);
  const activeQueue = queueFromConversation(active);
  const activeIsMine = !!active?.assigned_to && active.assigned_to === authUserId;
  const activeIsClosed = isClosed(active);
  const canSend = !!active && !activeIsClosed && !!text.trim() && !sending;
  const canAssumeActive = !!active && !activeIsClosed && canViewConversation(active, profile, authUserId);
  const ticketNumber = makeTicketNumber(active);

  const visibleConversations = useMemo(
    () => conversations.filter((conv) => canViewConversation(conv, profile, authUserId)),
    [authUserId, conversations, profile]
  );

  const boardQueues = useMemo(() => {
    const base = QUEUES.filter((q) => q.key !== "finalizado" || boardArea === "todos");
    const byPermission = manager ? base : base.filter((q) => allowedQueues.includes(q.key));
    const byArea = boardArea === "todos" ? byPermission : byPermission.filter((q) => q.area === boardArea);
    return byArea;
  }, [allowedQueues, boardArea, manager]);

  const boardSearchDigits = onlyDigits(boardSearch);

  const boardConversations = useMemo(() => {
    return visibleConversations.filter((conv) => {
      const name = conversationName(conv).toLowerCase();
      const phone = onlyDigits(conv.whatsapp_contacts?.telefone || conv.whatsapp_contacts?.wa_id);
      const last = String(conv.last_message || "").toLowerCase();
      const q = boardSearch.trim().toLowerCase();

      if (!q) return true;
      return name.includes(q) || last.includes(q) || phone.includes(boardSearchDigits);
    });
  }, [boardSearch, boardSearchDigits, visibleConversations]);

  const conversationsByQueue = useMemo(() => {
    const map = new Map<string, Conversation[]>();
    boardQueues.forEach((queue) => map.set(queue.key, []));

    boardConversations.forEach((conv) => {
      const queue = queueFromConversation(conv);
      const key = map.has(queue) ? queue : "novos_contatos";
      map.get(key)?.push(conv);
    });

    return map;
  }, [boardConversations, boardQueues]);

  const counts = useMemo(() => {
    const novos = visibleConversations.filter((conv) => isUnassigned(conv)).length;
    const meus = conversations.filter((conv) => conv.assigned_to === authUserId && !isClosed(conv)).length;
    const abertos = visibleConversations.filter((conv) => !isClosed(conv)).length;
    const finalizados = visibleConversations.filter((conv) => isClosed(conv)).length;
    const ganhos = visibleConversations.filter((conv) => queueFromConversation(conv) === "fechado_ganho").length;
    const perdidos = visibleConversations.filter((conv) => queueFromConversation(conv) === "fechado_perdido").length;

    return { novos, meus, abertos, finalizados, ganhos, perdidos };
  }, [authUserId, conversations, visibleConversations]);

  const commercialSummary = useMemo(() => {
    const commercial = visibleConversations.filter((conv) => {
      const queue = queueFromConversation(conv);
      const def = QUEUES.find((q) => q.key === queue);
      return def?.area === "comercial";
    });

    const won = commercial.filter((conv) => queueFromConversation(conv) === "fechado_ganho").length;
    const lost = commercial.filter((conv) => queueFromConversation(conv) === "fechado_perdido").length;
    const open = commercial.length - won - lost;
    const totalClosed = won + lost;
    const winRate = totalClosed > 0 ? Math.round((won / totalClosed) * 100) : 0;

    return { open, won, lost, winRate };
  }, [visibleConversations]);

  const transferQueues = useMemo(() => {
    const list = manager ? QUEUES : QUEUES.filter((q) => allowedQueues.includes(q.key));
    return list.filter((q) => q.key !== "novos_contatos");
  }, [allowedQueues, manager]);

  async function loadAuth() {
    const { data } = await supabase.auth.getUser();
    const userId = data?.user?.id ?? null;

    setAuthUserId(userId);

    if (!userId) return;

    const { data: profileData, error } = await supabase
      .from("users")
      .select("id, auth_user_id, nome, email, role, user_role, scopes, is_active")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Erro ao carregar usuário:", error);
      return;
    }

    setProfile((profileData || null) as UserProfile | null);
  }

  async function loadUsers() {
    const { data, error } = await supabase
      .from("users")
      .select("id, auth_user_id, nome, email, role, user_role, scopes, is_active")
      .eq("is_active", true)
      .limit(500);

    if (error) {
      console.error("Erro ao carregar usuários:", error);
      setUsers([]);
      return;
    }

    setUsers((data || []) as UserProfile[]);
  }

  async function loadConversations(options?: { showLoading?: boolean; silent?: boolean }) {
    const showLoading = options?.showLoading ?? false;
    const silent = options?.silent ?? false;

    if (showLoading) setLoading(true);
    if (!silent && !showLoading) setRefreshing(true);

    const { data, error } = await supabase
      .from("whatsapp_conversations")
      .select(`
        *,
        whatsapp_contacts (
          id,
          nome,
          telefone,
          wa_id
        )
      `)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(300);

    if (error) {
      console.error("Erro ao carregar conversas WhatsApp:", error);
      setConversations([]);
    } else {
      const next = (data || []) as Conversation[];
      setConversations(next);

      const currentActive = activeRef.current;

      if (currentActive?.id) {
        const refreshedActive = next.find((c) => c.id === currentActive.id);
        if (refreshedActive) setActive(refreshedActive);
      }

      // Não abrir conversa automaticamente quando active estiver null.
      // O usuário deve escolher o card no Kanban.
    }

    if (showLoading) setLoading(false);
    if (!silent && !showLoading) setRefreshing(false);
  }

  async function loadMessages(conversationId: string, options?: { markRead?: boolean }) {
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Erro ao carregar mensagens WhatsApp:", error);
      setMessages([]);
      return;
    }

    setMessages((data || []) as Message[]);

    if (options?.markRead !== false) {
      await supabase.from("whatsapp_conversations").update({ unread_count: 0 }).eq("id", conversationId);
    }
  }

  async function openConversation(conv: Conversation) {
    setActive(conv);
    setDrawerMinimized(false);
    await loadMessages(conv.id);
  }

  useEffect(() => {
    (async () => {
      await loadAuth();
      await loadUsers();
      await loadConversations({ showLoading: true });
    })();
  }, []);

  useEffect(() => {
    if (active?.id) {
      loadMessages(active.id);
    } else {
      setMessages([]);
    }
  }, [active?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadMediaUrls() {
      const entries = messages
        .map((msg) => ({ msg, media: getStoredMedia(msg) }))
        .filter(({ msg, media }) => !!media?.storage_path && !mediaUrls[msg.id]);

      if (entries.length === 0) return;

      const next: Record<string, string> = {};

      await Promise.all(
        entries.map(async ({ msg, media }) => {
          const bucket = media?.bucket || DEFAULT_MEDIA_BUCKET;
          const path = media?.storage_path;

          if (!bucket || !path) return;

          const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);

          if (error) {
            console.error("Erro ao gerar URL assinada da mídia WhatsApp:", error);
            return;
          }

          if (data?.signedUrl) next[msg.id] = data.signedUrl;
        })
      );

      if (!cancelled && Object.keys(next).length > 0) {
        setMediaUrls((prev) => ({ ...prev, ...next }));
      }
    }

    loadMediaUrls();

    return () => {
      cancelled = true;
    };
  }, [messages, mediaUrls]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, active?.id]);

  useEffect(() => {
    const channel = supabase
      .channel("whatsapp-central-atendimentos")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages" }, (payload) => {
        const currentActive = activeRef.current;
        const row = payload.new as Message | null;

        if (currentActive?.id && row?.conversation_id === currentActive.id) {
          loadMessages(currentActive.id);
        }

        loadConversations({ silent: true });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversations" }, () => {
        loadConversations({ silent: true });
      })
      .subscribe();

    const fallback = window.setInterval(() => {
      loadConversations({ silent: true });
    }, 20000);

    return () => {
      window.clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [authUserId, profile]);

  useEffect(() => {
    if (!active) return;

    const canStillView = canViewConversation(active, profile, authUserId);
    const stillExists = conversations.some((conv) => conv.id === active.id);

    if (!canStillView || !stillExists) {
      setActive(null);
      setDrawerMinimized(false);
    }

    // Não selecionar outro atendimento automaticamente.
  }, [active, authUserId, conversations, profile]);

  useEffect(() => {
    if (!startOpen) return;

    const handle = window.setTimeout(() => {
      searchContactBookForStart(startSearch);
    }, 250);

    return () => window.clearTimeout(handle);
  }, [startSearch, startOpen]);

  useEffect(() => {
    if (!campaignOpen) return;
    loadCampaigns();
  }, [campaignOpen]);

  useEffect(() => {
    if (!campaignOpen) return;

    const handle = window.setTimeout(() => {
      searchCampaignAudience(campaignAudienceSearch);
    }, 250);

    return () => window.clearTimeout(handle);
  }, [campaignAudienceSearch, campaignOpen]);

  async function sendMessage(customBody?: string) {
    const body = String(customBody ?? text).trim();

    if (!active || !activePhone || !body) return false;

    setSending(true);

    try {
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: active.id, to: activePhone, body, user_id: authUserId }),
      });

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        const metaMessage =
          result?.error?.error?.error_data?.details ||
          result?.error?.error?.message ||
          result?.error?.message ||
          result?.error ||
          "Não foi possível enviar a mensagem.";

        alert(String(metaMessage));
        console.error("WHATSAPP_SEND_FRONT_ERROR", result);
        return false;
      }

      if (!customBody) setText("");

      await loadMessages(active.id);
      await loadConversations({ silent: true });

      return true;
    } finally {
      setSending(false);
    }
  }

  async function sendMediaFile(file: File) {
    if (!active || !activePhone || !file) return false;

    const maxSizeMb = 20;
    const sizeMb = file.size / 1024 / 1024;

    if (sizeMb > maxSizeMb) {
      alert(`Arquivo muito grande. Envie arquivos de até ${maxSizeMb}MB.`);
      return false;
    }

    setSending(true);

    try {
      const file_base64 = await fileToBase64(file);
      const media_type = detectMediaType(file);
      const caption = text.trim();

      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: active.id,
          to: activePhone,
          user_id: authUserId,
          file_base64,
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          media_type,
          caption,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        const metaMessage =
          result?.error?.error?.error_data?.details ||
          result?.error?.error?.message ||
          result?.error?.message ||
          result?.error ||
          "Não foi possível enviar a mídia.";

        alert(String(metaMessage));
        console.error("WHATSAPP_SEND_MEDIA_FRONT_ERROR", result);
        return false;
      }

      if (caption) setText("");

      await loadMessages(active.id);
      await loadConversations({ silent: true });

      return true;
    } catch (error: any) {
      console.error("WHATSAPP_SEND_MEDIA_FRONT_EXCEPTION", error);
      alert(error?.message || "Erro ao enviar mídia.");
      return false;
    } finally {
      setSending(false);
    }
  }

  async function updateConversationPatch(convId: string, patch: Partial<Conversation>) {
    setUpdatingConversation(true);

    const { error } = await supabase
      .from("whatsapp_conversations")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", convId);

    setUpdatingConversation(false);

    if (error) {
      console.error("Erro ao atualizar conversa WhatsApp:", error);
      alert("Não foi possível atualizar a conversa.");
      return false;
    }

    await loadConversations({ silent: true });
    return true;
  }

  async function updateActiveConversationPatch(patch: Partial<Conversation>) {
    if (!active) return false;

    const ok = await updateConversationPatch(active.id, patch);

    if (ok) {
      setActive((prev) => (prev ? { ...prev, ...patch } : prev));
    }

    return ok;
  }

  async function assumirConversa() {
    if (!active || !authUserId) return;

    if (!canViewConversation(active, profile, authUserId)) {
      alert("Você não tem acesso à fila deste atendimento.");
      return;
    }

    const now = new Date().toISOString();
    const queue = queueFromConversation(active);
    const nextQueue = queue === "novos_contatos" ? "triagem" : queue;

    const ok = await updateActiveConversationPatch({
      assigned_to: authUserId,
      assigned_at: now,
      status: "humano",
      stage: nextQueue,
      queue: nextQueue,
    });

    if (ok) setDrawerMinimized(false);
  }

  async function finalizarConversa() {
    if (!active) return;

    const sent = await sendMessage(EVALUATION_MESSAGE);

    const ok = await updateActiveConversationPatch({
      status: "fechada",
      stage: "finalizado",
      queue: "finalizado",
      closed_at: new Date().toISOString(),
    });

    if (ok && !sent) alert("Atendimento finalizado, mas não foi possível enviar a mensagem de avaliação.");
  }

  async function reabrirConversa() {
    if (!active) return;

    await updateActiveConversationPatch({
      status: "humano",
      stage: "triagem",
      queue: "triagem",
      closed_at: null,
      assigned_to: active.assigned_to || authUserId,
      assigned_at: active.assigned_at || new Date().toISOString(),
    });
  }

  async function transferirFila(queue: string, conv?: Conversation) {
    const target = conv || active;
    if (!target) return;

    if (!manager && !allowedQueues.includes(queue)) {
      alert("Você não tem acesso para mover atendimentos para esta fila.");
      return;
    }

    const closed = queue === "finalizado" || queue === "fechado_ganho" || queue === "fechado_perdido";
    const status = closed ? queue : target.assigned_to ? "humano" : "novo";

    const ok = await updateConversationPatch(target.id, {
      queue,
      stage: queue,
      status,
      closed_at: closed ? new Date().toISOString() : null,
    });

    if (ok && active?.id === target.id) {
      setActive((prev) => (prev ? { ...prev, queue, stage: queue, status, closed_at: closed ? new Date().toISOString() : null } : prev));
    }
  }

  function addEmoji(emoji: string) {
    setText((prev) => `${prev}${emoji}`);
    setEmojiOpen(false);
  }

  function callSoon() {
    alert("Ligação pelo WhatsApp Business exige configuração própria da Meta/Calling API. Vamos tratar isso em uma etapa separada.");
  }

  function closeDrawer() {
    setActive(null);
    setDrawerMinimized(false);
  }

  function minimizeDrawer() {
    setDrawerMinimized(true);
  }

  async function searchContactBookForStart(term: string) {
    const q = term.trim();

    if (!q || q.length < 2) {
      setStartResults([]);
      return;
    }

    setStartSearching(true);

    const digits = onlyDigits(q);
    const filters = [`nome.ilike.%${q}%`, `telefone.ilike.%${q}%`];

    if (digits) {
      filters.push(`telefone_digits.ilike.%${digits}%`);
      filters.push(`telefone.ilike.%${digits}%`);
    }

    const { data, error } = await supabase
      .from("whatsapp_contact_book")
      .select("id,nome,telefone,telefone_digits,email,origem,tags,lead_id,cliente_id,opportunity_id")
      .or(filters.join(","))
      .order("nome", { ascending: true })
      .limit(15);

    if (error) {
      console.warn("Erro ao buscar agenda WhatsApp:", error);
      setStartResults([]);
    } else {
      setStartResults((data || []) as ContactBook[]);
    }

    setStartSearching(false);
  }

  function selectStartContact(contact: ContactBook) {
    setStartSelected(contact);
    setStartName(contact.nome || "");
    setStartPhone(contact.telefone || contact.telefone_digits || "");
    setStartSearch(contact.nome || contact.telefone || contact.telefone_digits || "");
    setStartResults([]);
  }

  function clearStartForm() {
    setStartSelected(null);
    setStartName("");
    setStartPhone("");
    setStartMessage("");
    setStartSearch("");
    setStartResults([]);
    setStartQueue("triagem");
  }

  async function startConversationFromCrm() {
    const name = startName.trim();
    const phone = onlyDigits(startPhone);
    const queue = startQueue || "triagem";

    if (!name) return alert("Informe o nome do contato.");
    if (!phone) return alert("Informe o telefone com DDD.");

    setSending(true);

    try {
      const now = new Date().toISOString();

      const contactBookPayload: any = {
        nome: name,
        telefone: phone,
        origem: startSelected?.origem || "manual",
        updated_at: now,
        created_by: authUserId,
      };

      if (startSelected?.id) contactBookPayload.id = startSelected.id;

      await supabase.from("whatsapp_contact_book").upsert(contactBookPayload, { onConflict: "telefone_digits" });

      const { data: contact, error: contactError } = await supabase
        .from("whatsapp_contacts")
        .upsert(
          {
            wa_id: phone,
            telefone: phone,
            nome: name,
            updated_at: now,
          },
          { onConflict: "wa_id" }
        )
        .select("id,lead_id")
        .single();

      if (contactError || !contact?.id) throw contactError || new Error("Não foi possível criar contato WhatsApp.");

      const { data: existing } = await supabase
        .from("whatsapp_conversations")
        .select(`
          *,
          whatsapp_contacts (
            id,
            nome,
            telefone,
            wa_id
          )
        `)
        .eq("contact_id", contact.id)
        .neq("queue", "finalizado")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let conversation = existing as Conversation | null;

      if (!conversation) {
        const { data: created, error: convError } = await supabase
          .from("whatsapp_conversations")
          .insert({
            contact_id: contact.id,
            lead_id: contact.lead_id,
            assigned_to: authUserId,
            assigned_at: now,
            status: "humano",
            stage: queue,
            queue,
            priority: "normal",
            last_message: startMessage.trim() || "Atendimento iniciado pelo CRM",
            last_message_at: now,
            unread_count: 0,
          })
          .select(`
            *,
            whatsapp_contacts (
              id,
              nome,
              telefone,
              wa_id
            )
          `)
          .single();

        if (convError || !created) throw convError || new Error("Não foi possível criar conversa.");

        conversation = created as Conversation;
      }

      if (startMessage.trim()) {
        const response = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation.id,
            to: phone,
            body: startMessage.trim(),
            user_id: authUserId,
          }),
        });

        const result = await response.json();

        if (!response.ok || !result?.ok) {
          console.warn("Não foi possível enviar mensagem inicial:", result);
          alert("Ticket criado, mas não foi possível enviar a mensagem inicial.");
        }
      }

      await loadConversations({ silent: true });
      await openConversation(conversation);
      setStartOpen(false);
      clearStartForm();
    } catch (error: any) {
      console.error("Erro ao iniciar conversa:", error);
      alert(error?.message || "Não foi possível iniciar conversa.");
    } finally {
      setSending(false);
    }
  }

  async function loadCampaigns() {
    setLoadingCampaigns(true);

    const { data, error } = await supabase
      .from("whatsapp_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) {
      console.warn("Erro ao carregar campanhas:", error);
      setCampaigns([]);
    } else {
      setCampaigns((data || []) as Campaign[]);
    }

    setLoadingCampaigns(false);
  }

  async function searchCampaignAudience(term: string) {
    const q = term.trim();

    if (!q || q.length < 2) {
      setCampaignAudienceResults([]);
      return;
    }

    setCampaignAudienceLoading(true);

    const digits = onlyDigits(q);
    const filters = [`nome.ilike.%${q}%`, `telefone.ilike.%${q}%`];

    if (digits) {
      filters.push(`telefone_digits.ilike.%${digits}%`);
      filters.push(`telefone.ilike.%${digits}%`);
    }

    const { data, error } = await supabase
      .from("whatsapp_contact_book")
      .select("id,nome,telefone,telefone_digits,email,origem,tags,lead_id,cliente_id,opportunity_id")
      .or(filters.join(","))
      .order("nome", { ascending: true })
      .limit(30);

    if (error) {
      console.warn("Erro ao pesquisar público:", error);
      setCampaignAudienceResults([]);
      setCampaignAudienceLoading(false);
      return;
    }

    const rows = (data || []) as ContactBook[];
    const phones = rows.map((row) => onlyDigits(row.telefone_digits || row.telefone)).filter(Boolean);

    const { data: optRows } = phones.length
      ? await supabase.from("whatsapp_opt_outs").select("telefone_digits").in("telefone_digits", phones)
      : { data: [] as any[] };

    const blocked = new Set((optRows || []).map((row: any) => onlyDigits(row.telefone_digits)));

    setCampaignAudienceResults(
      rows.map((row) => ({
        ...row,
        _optOut: blocked.has(onlyDigits(row.telefone_digits || row.telefone)),
      }))
    );

    setCampaignAudienceLoading(false);
  }

  function toggleCampaignContact(contact: ContactBook) {
    if (contact._optOut) {
      alert("Este contato está descadastrado e não pode receber campanhas.");
      return;
    }

    const phone = onlyDigits(contact.telefone_digits || contact.telefone);
    if (!phone) return;

    setSelectedCampaignContacts((prev) => {
      const exists = prev.some((item) => onlyDigits(item.telefone_digits || item.telefone) === phone);
      if (exists) return prev.filter((item) => onlyDigits(item.telefone_digits || item.telefone) !== phone);
      return [...prev, contact];
    });
  }

  function clearCampaignForm() {
    setEditingCampaignId(null);
    setCampaignName("");
    setCampaignMessage("");
    setCampaignScheduledAt("");
    setCampaignAudienceSearch("");
    setCampaignAudienceResults([]);
    setSelectedCampaignContacts([]);
    setCampaignFile(null);
    setCampaignAttachmentName(null);
    setCampaignAttachmentPath(null);
    setCampaignAttachmentMime(null);
  }

  async function loadCampaignRecipients(campaignId: string) {
    const { data, error } = await supabase
      .from("whatsapp_campaign_recipients")
      .select("id,campaign_id,contact_book_id,telefone_digits,nome,status")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("Erro ao carregar destinatários:", error);
      setSelectedCampaignContacts([]);
      return;
    }

    const contacts = ((data || []) as CampaignRecipient[]).map((row) => ({
      id: row.contact_book_id || row.id || row.telefone_digits,
      nome: row.nome || row.telefone_digits,
      telefone: row.telefone_digits,
      telefone_digits: row.telefone_digits,
      origem: "campanha",
      tags: [],
    }));

    setSelectedCampaignContacts(contacts);
  }

  async function editCampaign(campaign: Campaign) {
    setEditingCampaignId(campaign.id);
    setCampaignName(campaign.name || "");
    setCampaignMessage(campaign.message_body || "");
    setCampaignScheduledAt(campaign.scheduled_at ? new Date(campaign.scheduled_at).toISOString().slice(0, 16) : "");
    setCampaignAttachmentPath(campaign.attachment_path || null);
    setCampaignAttachmentMime(campaign.attachment_mime_type || null);
    setCampaignAttachmentName(campaign.attachment_path ? campaign.attachment_path.split("/").pop() || "Anexo salvo" : null);
    setCampaignFile(null);

    await loadCampaignRecipients(campaign.id);
  }

  async function saveCampaign() {
    const name = campaignName.trim();
    const body = campaignMessage.trim();

    if (!name) return alert("Informe o nome da campanha.");
    if (!body) return alert("Escreva a mensagem da campanha.");
    if (selectedCampaignContacts.length === 0) return alert("Vincule pelo menos um contato à campanha.");

    setSavingCampaign(true);

    try {
      const status = campaignScheduledAt ? "scheduled" : "draft";
      let attachmentPath = campaignAttachmentPath;
      let attachmentMime = campaignAttachmentMime;

      if (campaignFile) {
        const cleanName = campaignFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        attachmentPath = `campaigns/${Date.now()}-${cleanName}`;
        attachmentMime = campaignFile.type || "application/octet-stream";

        const { error: uploadError } = await supabase.storage
          .from(DEFAULT_MEDIA_BUCKET)
          .upload(attachmentPath, campaignFile, {
            contentType: attachmentMime,
            upsert: true,
          });

        if (uploadError) throw uploadError;
      }

      const payload: any = {
        name,
        campaign_type: "free_text",
        status,
        audience_source: "selected_contacts",
        message_body: body,
        scheduled_at: campaignScheduledAt ? new Date(campaignScheduledAt).toISOString() : null,
        updated_at: new Date().toISOString(),
        attachment_bucket: attachmentPath ? DEFAULT_MEDIA_BUCKET : null,
        attachment_path: attachmentPath,
        attachment_mime_type: attachmentMime,
      };

      let campaignId = editingCampaignId;

      if (editingCampaignId) {
        const { error } = await supabase.from("whatsapp_campaigns").update(payload).eq("id", editingCampaignId);
        if (error) throw error;

        await supabase.from("whatsapp_campaign_recipients").delete().eq("campaign_id", editingCampaignId);
      } else {
        const { data, error } = await supabase
          .from("whatsapp_campaigns")
          .insert({ ...payload, created_by: authUserId })
          .select("id")
          .single();

        if (error || !data?.id) throw error || new Error("Não foi possível criar campanha.");
        campaignId = data.id;
      }

      const recipients = selectedCampaignContacts
        .map((contact) => {
          const phone = onlyDigits(contact.telefone_digits || contact.telefone);

          return {
            campaign_id: campaignId,
            contact_book_id: contact.id?.length === 36 ? contact.id : null,
            telefone_digits: phone,
            nome: contact.nome || null,
            status: "pending",
          };
        })
        .filter((row) => !!row.telefone_digits);

      if (recipients.length > 0) {
        const { error: recError } = await supabase
          .from("whatsapp_campaign_recipients")
          .upsert(recipients, { onConflict: "campaign_id,telefone_digits" });

        if (recError) throw recError;
      }

      await loadCampaigns();
      clearCampaignForm();
      alert(status === "scheduled" ? "Campanha salva e agendada." : "Campanha salva como rascunho.");
    } catch (error: any) {
      console.error("Erro ao salvar campanha:", error);
      alert(error?.message || "Não foi possível salvar a campanha.");
    } finally {
      setSavingCampaign(false);
    }
  }

  async function downloadCampaignAttachment(campaign: Campaign) {
    if (!campaign.attachment_path) return null;

    const { data, error } = await supabase.storage
      .from(campaign.attachment_bucket || DEFAULT_MEDIA_BUCKET)
      .download(campaign.attachment_path);

    if (error || !data) throw error || new Error("Não foi possível baixar o anexo da campanha.");

    const name = campaign.attachment_path.split("/").pop() || "anexo";
    const file = new File([data], name, { type: campaign.attachment_mime_type || data.type || "application/octet-stream" });
    const file_base64 = await fileToBase64(file);

    return {
      file_base64,
      file_name: name,
      mime_type: file.type || "application/octet-stream",
      media_type: detectMediaType(file),
    };
  }

  async function ensureCampaignConversation(contact: CampaignRecipient | ContactBook) {
    const phone = onlyDigits(contact.telefone_digits || (contact as ContactBook).telefone);
    const now = new Date().toISOString();

    const { data: waContact, error: contactError } = await supabase
      .from("whatsapp_contacts")
      .upsert(
        {
          wa_id: phone,
          telefone: phone,
          nome: contact.nome || null,
          updated_at: now,
        },
        { onConflict: "wa_id" }
      )
      .select("id,lead_id")
      .single();

    if (contactError || !waContact?.id) throw contactError || new Error("Contato não encontrado.");

    const { data: existing } = await supabase
      .from("whatsapp_conversations")
      .select("id")
      .eq("contact_id", waContact.id)
      .neq("queue", "finalizado")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) return existing.id;

    const { data: conv, error } = await supabase
      .from("whatsapp_conversations")
      .insert({
        contact_id: waContact.id,
        lead_id: waContact.lead_id,
        assigned_to: authUserId,
        assigned_at: now,
        status: "humano",
        stage: "triagem",
        queue: "triagem",
        priority: "normal",
        last_message: "Campanha iniciada",
        last_message_at: now,
        unread_count: 0,
      })
      .select("id")
      .single();

    if (error || !conv?.id) throw error || new Error("Conversa não criada.");
    return conv.id;
  }

  async function sendCampaignNow(campaign: Campaign) {
    if (!confirm("Iniciar envio manual desta campanha para os contatos vinculados?")) return;

    setSendingCampaignId(campaign.id);

    try {
      const { data: recipients, error } = await supabase
        .from("whatsapp_campaign_recipients")
        .select("id,campaign_id,contact_book_id,telefone_digits,nome,status")
        .eq("campaign_id", campaign.id)
        .in("status", ["pending", "failed"]);

      if (error) throw error;
      if (!recipients || recipients.length === 0) {
        alert("Esta campanha ainda não tem contatos pendentes.");
        return;
      }

      const attachment = await downloadCampaignAttachment(campaign).catch((error) => {
        console.warn("Campanha sem anexo ou anexo indisponível:", error);
        return null;
      });

      let sent = 0;
      let failed = 0;
      let skipped = 0;

      for (const recipient of recipients as CampaignRecipient[]) {
        const phone = onlyDigits(recipient.telefone_digits);

        try {
          const { data: blocked } = await supabase.from("whatsapp_opt_outs").select("id").eq("telefone_digits", phone).limit(1);

          if (blocked && blocked.length > 0) {
            await supabase
              .from("whatsapp_campaign_recipients")
              .update({ status: "skipped", error_message: "Contato descadastrado." })
              .eq("id", recipient.id);

            skipped++;
            continue;
          }

          const conversationId = await ensureCampaignConversation(recipient);
          const body = renderCampaignText(campaign.message_body || "", recipient);

          const payload: any = {
            conversation_id: conversationId,
            to: phone,
            body,
            user_id: authUserId,
          };

          if (attachment) {
            payload.file_base64 = attachment.file_base64;
            payload.file_name = attachment.file_name;
            payload.mime_type = attachment.mime_type;
            payload.media_type = attachment.media_type;
            payload.caption = body;
          }

          const response = await fetch("/api/whatsapp/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          const result = await response.json();

          if (!response.ok || !result?.ok) throw new Error(JSON.stringify(result?.error || result).slice(0, 800));

          await supabase
            .from("whatsapp_campaign_recipients")
            .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
            .eq("id", recipient.id);

          sent++;
        } catch (error: any) {
          await supabase
            .from("whatsapp_campaign_recipients")
            .update({ status: "failed", error_message: String(error?.message || error).slice(0, 800) })
            .eq("id", recipient.id);

          failed++;
        }

        await new Promise((resolve) => setTimeout(resolve, 600));
      }

      await supabase
        .from("whatsapp_campaigns")
        .update({
          status: "finished",
          started_at: campaign.started_at || new Date().toISOString(),
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaign.id);

      await loadCampaigns();
      await loadConversations({ silent: true });
      alert(`Envio concluído. Enviadas: ${sent}. Falhas: ${failed}. Ignoradas: ${skipped}.`);
    } catch (error: any) {
      console.error("Erro ao enviar campanha:", error);
      alert(error?.message || "Não foi possível enviar a campanha.");
    } finally {
      setSendingCampaignId(null);
    }
  }

  async function deleteCampaign(campaign: Campaign) {
    if (!manager) return alert("Apenas gestores podem excluir campanhas.");
    if (!confirm(`Excluir a campanha "${campaign.name}"?`)) return;

    const { error } = await supabase.from("whatsapp_campaigns").delete().eq("id", campaign.id);

    if (error) {
      console.error("Erro ao excluir campanha:", error);
      alert("Não foi possível excluir a campanha.");
      return;
    }

    await loadCampaigns();
  }

  function CampaignOverlay() {
    return (
      <OverlayShell
        title="Campanhas WhatsApp"
        subtitle="Selecione contatos, edite campanhas, inclua anexo e dispare manualmente ou deixe agendada para o runner."
        onClose={() => setCampaignOpen(false)}
        max="max-w-7xl"
      >
        <div className="grid gap-4 lg:grid-cols-[430px_1fr]">
          <div className="space-y-3 rounded-3xl bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black uppercase tracking-wide text-slate-500">
                {editingCampaignId ? "Editando campanha" : "Nova campanha"}
              </p>
              {editingCampaignId && (
                <Button variant="outline" size="sm" onClick={clearCampaignForm}>
                  Nova
                </Button>
              )}
            </div>

            <label className="text-sm font-bold text-slate-700">Nome da campanha</label>
            <input
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Ex.: Reativação de leads"
              className="w-full rounded-xl border px-3 py-3 text-sm"
            />

            <label className="text-sm font-bold text-slate-700">Data e hora de envio</label>
            <input
              type="datetime-local"
              value={campaignScheduledAt}
              onChange={(e) => setCampaignScheduledAt(e.target.value)}
              className="w-full rounded-xl border px-3 py-3 text-sm"
            />

            <label className="text-sm font-bold text-slate-700">Mensagem</label>
            <Textarea
              value={campaignMessage}
              onChange={(e) => setCampaignMessage(e.target.value)}
              placeholder="Use {{nome}}, {{primeiro_nome}} ou {{telefone}}."
              className="min-h-[150px] resize-none rounded-xl border bg-white px-3 py-3 text-sm"
            />

            <label className="text-sm font-bold text-slate-700">Anexo opcional</label>
            <input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setCampaignFile(file);
                setCampaignAttachmentName(file?.name || campaignAttachmentName);
                setCampaignAttachmentMime(file?.type || campaignAttachmentMime);
              }}
              className="w-full rounded-xl border bg-white px-3 py-3 text-sm"
            />
            {campaignAttachmentName && (
              <div className="rounded-xl bg-white px-3 py-2 text-xs text-slate-600">
                Anexo: <b>{campaignAttachmentName}</b>
              </div>
            )}

            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
              O CRM mantém controle de descadastro. Recomendação: terminar campanhas com “{OPT_OUT_TEXT}”.
            </div>

            <div className="rounded-2xl border bg-white p-3">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Contatos vinculados</p>
              <p className="mt-1 text-sm font-black text-slate-800">{selectedCampaignContacts.length} selecionado(s)</p>

              <div className="mt-2 max-h-36 space-y-1 overflow-auto">
                {selectedCampaignContacts.length === 0 ? (
                  <p className="text-xs text-slate-400">Pesquise e clique em Vincular.</p>
                ) : (
                  selectedCampaignContacts.map((contact) => {
                    const phone = onlyDigits(contact.telefone_digits || contact.telefone);
                    return (
                      <div key={phone} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2 py-1 text-xs">
                        <span className="truncate">{contact.nome || formatPhoneBR(phone)}</span>
                        <button type="button" onClick={() => toggleCampaignContact(contact)} className="font-bold text-red-700">
                          remover
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={clearCampaignForm}>
                Limpar
              </Button>
              <Button onClick={saveCampaign} disabled={savingCampaign} className="text-white" style={{ background: C.red }}>
                {savingCampaign ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editingCampaignId ? "Atualizar" : "Salvar"}
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-800">Público e campanhas recentes</p>
                <p className="text-xs text-slate-500">Pesquise, selecione contatos e vincule à campanha.</p>
              </div>
              <Button variant="outline" onClick={loadCampaigns} disabled={loadingCampaigns}>
                {loadingCampaigns ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Atualizar
              </Button>
            </div>

            <div className="mb-3 rounded-2xl bg-slate-50 p-3">
              <label className="text-xs font-black uppercase tracking-wide text-slate-400">Pesquisar contato</label>
              <div className="mt-2 flex gap-2">
                <input
                  value={campaignAudienceSearch}
                  onChange={(e) => setCampaignAudienceSearch(e.target.value)}
                  placeholder="Digite nome ou telefone..."
                  className="w-full rounded-xl border px-3 py-3 text-sm"
                />
              </div>

              <div className="mt-3 max-h-56 space-y-2 overflow-auto">
                {campaignAudienceLoading && <div className="text-xs text-slate-400">Buscando contatos...</div>}
                {!campaignAudienceLoading && campaignAudienceSearch.trim().length >= 2 && campaignAudienceResults.length === 0 && (
                  <div className="text-xs text-slate-400">Nenhum contato encontrado.</div>
                )}

                {campaignAudienceResults.map((contact) => {
                  const phone = onlyDigits(contact.telefone_digits || contact.telefone);
                  const selected = selectedCampaignContacts.some((item) => onlyDigits(item.telefone_digits || item.telefone) === phone);

                  return (
                    <div key={contact.id} className="flex items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">{contact.nome || "Sem nome"}</p>
                        <p className="text-xs text-slate-500">
                          {formatPhoneBR(contact.telefone || contact.telefone_digits)} {contact.origem ? `• ${contact.origem}` : ""}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={contact._optOut}
                        onClick={() => toggleCampaignContact(contact)}
                        className={
                          contact._optOut
                            ? "rounded-full bg-red-50 px-2 py-1 text-[10px] font-black text-red-700"
                            : selected
                              ? "rounded-full bg-slate-800 px-2 py-1 text-[10px] font-black text-white"
                              : "rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700"
                        }
                      >
                        {contact._optOut ? "Descadastrado" : selected ? "Selecionado" : "Vincular"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="max-h-[380px] space-y-2 overflow-auto">
              {loadingCampaigns && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Carregando campanhas...</div>}
              {!loadingCampaigns && campaigns.length === 0 && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Nenhuma campanha criada ainda.</div>}

              {campaigns.map((campaign) => (
                <div key={campaign.id} className="rounded-2xl border bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-800">{campaign.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{campaign.message_body || "Sem mensagem"}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{statusPill(campaign.status)}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                    <span>Tipo: {campaign.campaign_type || "free_text"}</span>
                    <span>• Público: {campaign.audience_source || "selected_contacts"}</span>
                    {campaign.scheduled_at && <span>• Agendada: {fmtTime(campaign.scheduled_at)}</span>}
                    {campaign.attachment_path && <span>• Com anexo</span>}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => editCampaign(campaign)}>
                      <Edit3 className="mr-1 h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <Button size="sm" disabled={sendingCampaignId === campaign.id} onClick={() => sendCampaignNow(campaign)} style={{ background: C.red }} className="text-white">
                      {sendingCampaignId === campaign.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                      Enviar agora
                    </Button>
                    {manager && (
                      <Button variant="outline" size="sm" onClick={() => deleteCampaign(campaign)} className="text-red-700">
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Excluir
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </OverlayShell>
    );
  }

  function StartConversationOverlay() {
    return (
      <OverlayShell
        title="Iniciar conversa"
        subtitle="Busque um contato existente ou crie um novo ticket informando nome e telefone."
        onClose={() => setStartOpen(false)}
        max="max-w-4xl"
      >
        <div className="grid gap-4 md:grid-cols-[1fr_320px]">
          <div className="space-y-3 rounded-3xl bg-slate-50 p-4">
            <label className="text-sm font-bold text-slate-700">Pesquisar contato</label>
            <div className="relative">
              <input
                value={startSearch}
                onChange={(e) => {
                  setStartSearch(e.target.value);
                  setStartSelected(null);
                }}
                placeholder="Digite nome ou telefone..."
                className="w-full rounded-xl border px-3 py-3 text-sm"
              />

              {(startResults.length > 0 || startSearching) && (
                <div className="absolute left-0 right-0 top-[52px] z-[90] max-h-72 overflow-auto rounded-2xl border bg-white p-2 shadow-2xl">
                  {startSearching && <div className="px-3 py-2 text-xs text-slate-400">Buscando...</div>}

                  {startResults.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => selectStartContact(contact)}
                      className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-800">{contact.nome || "Sem nome"}</span>
                        <span className="block text-xs text-slate-500">
                          {formatPhoneBR(contact.telefone || contact.telefone_digits)} {contact.origem ? `• ${contact.origem}` : ""}
                        </span>
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Selecionar</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {startSelected && (
              <div className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                <span>Contato selecionado da agenda.</span>
                <button type="button" onClick={clearStartForm} className="font-bold underline">
                  Trocar
                </button>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-bold text-slate-700">Nome</label>
                <input value={startName} onChange={(e) => setStartName(e.target.value)} placeholder="Nome do cliente" className="mt-1 w-full rounded-xl border px-3 py-3 text-sm" />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700">Telefone</label>
                <input value={startPhone} onChange={(e) => setStartPhone(e.target.value)} placeholder="Telefone com DDD" className="mt-1 w-full rounded-xl border px-3 py-3 text-sm" />
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-slate-700">Fila</label>
              <select value={startQueue} onChange={(e) => setStartQueue(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3 text-sm">
                {transferQueues
                  .filter((queue) => queue.key !== "finalizado" && queue.key !== "fechado_ganho" && queue.key !== "fechado_perdido")
                  .map((queue) => (
                    <option key={queue.key} value={queue.key}>
                      {queue.label}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-bold text-slate-700">Mensagem inicial</label>
              <Textarea
                value={startMessage}
                onChange={(e) => setStartMessage(e.target.value)}
                placeholder="Digite a primeira mensagem..."
                className="mt-1 min-h-[120px] resize-none rounded-xl border bg-white px-3 py-3 text-sm"
              />
            </div>

            <Button onClick={startConversationFromCrm} disabled={sending} className="w-full text-white" style={{ background: C.red }}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Criar ticket e enviar
            </Button>
          </div>

          <div className="rounded-3xl border p-4">
            <p className="text-sm font-black text-slate-800">Como funciona</p>
            <div className="mt-3 space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl bg-slate-50 p-3">1. Pesquise o contato pelo nome ou telefone.</div>
              <div className="rounded-2xl bg-slate-50 p-3">2. Se não existir, preencha nome e telefone manualmente.</div>
              <div className="rounded-2xl bg-slate-50 p-3">3. Escolha a fila e envie a primeira mensagem.</div>
              <div className="rounded-2xl bg-slate-50 p-3">4. O ticket abrirá na lateral apenas após sua ação.</div>
            </div>
          </div>
        </div>
      </OverlayShell>
    );
  }

  function QueuesOverlay() {
    return (
      <OverlayShell
        title="Configurar filas"
        subtitle="Visualização das filas operacionais da Central. A edição persistente pode ser ligada ao banco em uma próxima etapa."
        onClose={() => setQueuesOpen(false)}
        max="max-w-5xl"
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {QUEUES.map((queue) => (
            <div key={queue.key} className="rounded-3xl border bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 rounded-full" style={{ background: queue.color }} />
                <div>
                  <p className="font-black text-slate-800">{queue.label}</p>
                  <p className="text-xs uppercase tracking-wide text-slate-400">{queue.area}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-500">{queue.description || "Fila da Central de Atendimentos."}</p>
            </div>
          ))}
        </div>
      </OverlayShell>
    );
  }

  function ConversationCard({ conv }: { conv: Conversation }) {
    const contact = conv.whatsapp_contacts;
    const queue = queueFromConversation(conv);
    const unassigned = isUnassigned(conv);

    return (
      <div
        onClick={() => openConversation(conv)}
        className="group cursor-pointer rounded-3xl border bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-black text-white" style={{ background: unassigned ? C.red : queueColor(queue) }}>
            {initials(contact?.nome)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900">{contact?.nome || "Cliente WhatsApp"}</p>
                <p className="truncate text-xs text-slate-500">{formatPhoneBR(contact?.telefone || contact?.wa_id)}</p>
              </div>
              <span className="shrink-0 text-[11px] font-bold text-slate-400">{fmtRelative(conv.last_message_at)}</span>
            </div>

            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">{conv.last_message || "—"}</p>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[10px]">{makeTicketNumber(conv)}</Badge>
              <Badge style={badgeStyleForStatus(conv.status)} className="text-[10px]">{statusLabel(conv.status)}</Badge>
              {conv.unread_count > 0 && <Badge style={{ background: C.red, color: "white" }} className="text-[10px]">{conv.unread_count}</Badge>}
            </div>

            <div className="mt-3">
              <select
                value={queue}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  transferirFila(e.target.value, conv);
                }}
                className="w-full rounded-xl border bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-600"
              >
                {transferQueues.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function ConversationDrawer() {
    if (!active || drawerMinimized) return null;

    return (
      <div className="fixed bottom-0 right-0 top-0 z-[70] flex w-full max-w-[720px] flex-col border-l bg-white shadow-2xl">
        <div className="border-b bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-sm" style={{ background: activeIsClosed ? C.green : queueColor(activeQueue) }}>
                {initials(activeContact?.nome)}
              </div>

              <div className="min-w-0">
                <CardTitle className="truncate text-xl text-slate-900">{conversationName(active)}</CardTitle>
                <p className="mt-0.5 text-base text-slate-500">{formatPhoneBR(activeContact?.telefone || activeContact?.wa_id)}</p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{ticketNumber}</Badge>
                  <Badge className="gap-1" style={badgeStyleForStatus(active.status)}>
                    {active.status === "bot" ? <Bot className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                    {statusLabel(active.status)}
                  </Badge>
                  <Badge variant="secondary" className="gap-1"><Tag className="h-3.5 w-3.5" />{queueLabel(activeQueue)}</Badge>
                  {active.assigned_to ? (
                    <Badge variant="outline" className="gap-1"><UserCheck className="h-3.5 w-3.5" />{activeIsMine ? "Seu atendimento" : "Assumido"}</Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700"><Clock className="h-3.5 w-3.5" />Novo</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={minimizeDrawer}>
                <Minus className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={closeDrawer}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            {!activeIsClosed && !active.assigned_to && (
              <Button onClick={assumirConversa} disabled={updatingConversation || !canAssumeActive} style={{ background: C.red }} className="gap-2 text-white hover:opacity-95">
                {updatingConversation ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                Assumir
              </Button>
            )}

            {!activeIsClosed && active.assigned_to && !activeIsMine && manager && (
              <Button variant="outline" onClick={assumirConversa} disabled={updatingConversation} className="gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                Assumir
              </Button>
            )}

            {!activeIsClosed && (
              <Button variant="outline" onClick={finalizarConversa} disabled={updatingConversation || sending} className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Finalizar
              </Button>
            )}

            {activeIsClosed && (
              <Button variant="outline" onClick={reabrirConversa} disabled={updatingConversation} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Reabrir
              </Button>
            )}

            {!activeIsClosed && (
              <select
                value={activeQueue}
                onChange={(e) => transferirFila(e.target.value)}
                disabled={updatingConversation}
                className="rounded-xl border px-3 py-2 text-sm font-semibold text-slate-600"
              >
                {transferQueues.map((queue) => (
                  <option key={queue.key} value={queue.key}>
                    Mover para: {queue.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-auto bg-slate-50 p-5">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-base text-slate-500">Nenhuma mensagem neste atendimento.</div>
          ) : (
            messages.map((msg) => {
              const outbound = msg.direction === "outbound";
              const isBot = msg.sender_type === "bot";
              const signature = outbound && msg.user_id ? userNameByAuthId.get(msg.user_id) || "Usuário" : outbound && isBot ? "Max" : null;

              return (
                <div key={msg.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[84%] rounded-3xl px-4 py-3 text-base leading-relaxed shadow-sm ${outbound ? "rounded-br-md text-white" : "rounded-bl-md border border-slate-100 bg-white text-slate-900"}`}
                    style={{ background: outbound ? (isBot ? C.gold : C.navy) : "white", color: outbound && isBot ? C.navy : undefined }}
                  >
                    <MessageContent msg={msg} mediaUrl={mediaUrls[msg.id]} outbound={outbound} />
                    <p className={`mt-2 text-[11px] ${outbound ? "text-white/70" : "text-slate-400"}`}>
                      {signature ? `${signature} • ` : ""}{fmtTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t bg-white p-4">
          {activeIsClosed ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500">
              Este atendimento foi finalizado. Reabra a conversa para responder novamente.
            </div>
          ) : (
            <div className="space-y-3">
              {emojiOpen && (
                <div className="flex flex-wrap gap-2 rounded-2xl border bg-slate-50 p-3">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => addEmoji(emoji)} className="rounded-xl bg-white px-3 py-2 text-xl shadow-sm transition hover:scale-105">
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) sendMediaFile(file);
                  }}
                />

                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) sendMediaFile(file);
                  }}
                />

                <Button type="button" variant="outline" onClick={() => setEmojiOpen((prev) => !prev)} className="h-auto min-w-[48px]" title="Enviar emoji">
                  <Smile className="h-5 w-5" />
                </Button>
                <Button type="button" variant="outline" onClick={() => audioInputRef.current?.click()} disabled={sending} className="h-auto min-w-[48px]" title="Enviar áudio">
                  <Mic className="h-5 w-5" />
                </Button>
                <Button type="button" variant="outline" onClick={callSoon} className="h-auto min-w-[48px]" title="Fazer ligação">
                  <Phone className="h-5 w-5" />
                </Button>
                <Button type="button" variant="outline" onClick={() => attachmentInputRef.current?.click()} disabled={sending} className="h-auto min-w-[48px]" title="Anexar arquivo">
                  <Paperclip className="h-5 w-5" />
                </Button>

                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Digite sua mensagem... Use Enter para enviar e Shift + Enter para quebrar linha."
                  className="min-h-[72px] resize-none text-base leading-relaxed"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />

                <Button onClick={() => sendMessage()} disabled={!canSend} className="min-w-[60px] px-4 text-white" style={{ background: C.red }}>
                  {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </Button>
              </div>

              <p className="text-xs text-slate-400">Assinatura automática: as mensagens enviadas pelo CRM exibem o nome do usuário responsável.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: "#f7f7f8" }}>
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
            <ShieldCheck className="h-3.5 w-3.5" style={{ color: C.red }} />
            WhatsApp oficial conectado ao CRM
          </div>

          <h1 className="text-3xl font-bold tracking-tight" style={{ color: C.navy }}>
            Central de Atendimentos
          </h1>

          <p className="mt-1 max-w-3xl text-base text-slate-500">
            Operação por tickets/Kanban para atendimento, campanhas, triagem, vendas e pós-venda.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[560px]">
          <MetricCard label="Novos" value={counts.novos} tone="gold" />
          <MetricCard label="Meus" value={counts.meus} tone="navy" />
          <MetricCard label="Abertos" value={counts.abertos} tone="red" />
          <MetricCard label="Finalizados" value={counts.finalizados} tone="green" />
        </div>
      </div>

      <Card className="mb-4 overflow-hidden border-0 shadow-sm">
        <CardHeader className="p-4" style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.red})`, color: "white" }}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KanbanSquare className="h-5 w-5" />
                Kanban de Atendimento
              </CardTitle>
              <p className="mt-1 text-sm text-white/80">Clique em um card para abrir a conversa na lateral.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setCampaignOpen(true)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                <Megaphone className="mr-2 h-4 w-4" />
                Campanhas
              </Button>
              <Button variant="outline" onClick={() => setStartOpen(true)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                <Plus className="mr-2 h-4 w-4" />
                Iniciar conversa
              </Button>
              <Button variant="outline" onClick={() => setQueuesOpen(true)} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                <Settings className="mr-2 h-4 w-4" />
                Configurar filas
              </Button>
              <Button variant="outline" onClick={() => loadConversations()} disabled={refreshing} className="h-9 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="border-b bg-white p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {(["todos", "geral", "comercial", "operacional"] as const).map((area) => (
                <button
                  key={area}
                  type="button"
                  onClick={() => setBoardArea(area)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition ${boardArea === area ? "text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  style={boardArea === area ? { background: C.navy } : undefined}
                >
                  {area === "todos" ? "Todas" : area.charAt(0).toUpperCase() + area.slice(1)}
                </button>
              ))}
            </div>

            <div className="relative w-full xl:w-[420px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={boardSearch}
                onChange={(e) => setBoardSearch(e.target.value)}
                placeholder="Buscar por nome, telefone ou mensagem..."
                className="w-full rounded-2xl border bg-slate-50 py-3 pl-10 pr-3 text-sm"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-400">Comercial em aberto</p>
              <p className="text-2xl font-black" style={{ color: C.navy }}>{commercialSummary.open}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-3">
              <p className="text-xs font-bold uppercase text-emerald-700">Fechado ganho</p>
              <p className="text-2xl font-black text-emerald-700">{commercialSummary.won}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-3">
              <p className="text-xs font-bold uppercase text-slate-500">Fechado perdido</p>
              <p className="text-2xl font-black text-slate-600">{commercialSummary.lost}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-3">
              <p className="text-xs font-bold uppercase text-amber-700">Conversão</p>
              <p className="text-2xl font-black text-amber-700">{commercialSummary.winRate}%</p>
            </div>
          </div>

          {!manager && (
            <div className="mt-3 flex items-start gap-2 rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              Você visualiza apenas conversas das suas filas ou assumidas por você.
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex h-[60vh] items-center justify-center rounded-3xl bg-white shadow-sm">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      ) : (
        <div className="flex min-h-[62vh] gap-4 overflow-x-auto pb-5">
          {boardQueues.map((queue) => {
            const items = conversationsByQueue.get(queue.key) || [];

            return (
              <div key={queue.key} className="w-[320px] shrink-0">
                <div className="sticky top-0 z-10 mb-3 rounded-3xl border bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ background: queue.color }} />
                        <p className="truncate font-black text-slate-800">{queue.label}</p>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{queue.description || queue.area}</p>
                    </div>
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                </div>

                <div className="space-y-3">
                  {items.length === 0 ? (
                    <div className="rounded-3xl border border-dashed bg-white/70 p-5 text-center text-sm text-slate-400">
                      Nenhum ticket nesta etapa.
                    </div>
                  ) : (
                    items.map((conv) => <ConversationCard key={conv.id} conv={conv} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {drawerMinimized && active && (
        <button
          type="button"
          onClick={() => setDrawerMinimized(false)}
          className="fixed bottom-5 right-5 z-[60] flex items-center gap-3 rounded-3xl px-4 py-3 text-white shadow-2xl"
          style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.red})` }}
        >
          <MessageCircle className="h-5 w-5" />
          <span className="font-bold">{conversationName(active)}</span>
        </button>
      )}

      <ConversationDrawer />

      {startOpen && <StartConversationOverlay />}
      {queuesOpen && <QueuesOverlay />}
      {campaignOpen && <CampaignOverlay />}
    </div>
  );
}
