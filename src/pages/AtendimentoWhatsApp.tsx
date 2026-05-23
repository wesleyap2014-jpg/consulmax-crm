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
} from "lucide-react";

const C = {
  red: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  off: "#F5F5F5",
  green: "#0f766e",
  muted: "#64748b",
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

type TabKey = "new" | "mine" | "queues" | "all" | "closed";

type TabDef = {
  key: TabKey;
  label: string;
  short: string;
  icon: React.ElementType;
  managerOnly?: boolean;
};

type QueueDef = {
  key: string;
  label: string;
  area: "comercial" | "operacional" | "geral";
  color: string;
};

const QUEUES: QueueDef[] = [
  { key: "novos_contatos", label: "Novos Contatos", area: "geral", color: C.red },
  { key: "triagem", label: "Triagem", area: "geral", color: C.gold },
  { key: "comercial", label: "Comercial", area: "comercial", color: C.navy },
  { key: "qualificacao", label: "Qualificação", area: "comercial", color: C.navy },
  { key: "proposta", label: "Proposta", area: "comercial", color: C.navy },
  { key: "negociacao", label: "Negociação", area: "comercial", color: C.navy },
  { key: "cliente_ativo", label: "Cliente Ativo", area: "operacional", color: C.green },
  { key: "boleto", label: "Boleto", area: "operacional", color: C.green },
  { key: "contemplacao", label: "Contemplação", area: "operacional", color: C.green },
  { key: "pos_venda", label: "Pós-venda", area: "operacional", color: C.green },
  { key: "suporte", label: "Suporte", area: "operacional", color: C.green },
  { key: "financeiro", label: "Financeiro", area: "operacional", color: C.green },
  { key: "finalizado", label: "Finalizado", area: "geral", color: C.muted },
];

const TABS: TabDef[] = [
  { key: "new", label: "Novos por Fila", short: "Novos", icon: Inbox },
  { key: "mine", label: "Meus Atendimentos", short: "Meus", icon: UserCheck },
  { key: "queues", label: "Minhas Filas", short: "Filas", icon: KanbanSquare },
  { key: "all", label: "Gestão Geral", short: "Gestão", icon: Users, managerOnly: true },
  { key: "closed", label: "Finalizados", short: "Finalizados", icon: CheckCircle2 },
];

const CLOSED_STATUSES = new Set(["fechada", "finalizado", "finalizada", "closed"]);
const QUICK_EMOJIS = ["😊", "👍", "🙏", "🚀", "✅", "📌", "📄", "💰", "🏡", "🚗", "📞", "🤝"];

const EVALUATION_MESSAGE =
  "Atendimento finalizado ✅\n\nSua opinião é muito importante para a Consulmax. Como você avalia esse atendimento de 1 a 5?\n\n1️⃣ Ruim\n2️⃣ Regular\n3️⃣ Bom\n4️⃣ Muito bom\n5️⃣ Excelente";

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
    ["comercial", "qualificacao", "proposta", "negociacao"].forEach((q) => allowed.add(q));
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
          <span>Áudio recebido</span>
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
            Arquivo ainda não disponível para reprodução. Envie um novo áudio após o último deploy ou atualize a página.
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

export default function AtendimentoWhatsApp() {
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingConversation, setUpdatingConversation] = useState(false);

  const [tab, setTab] = useState<TabKey>("new");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

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

  const availableTabs = useMemo(() => TABS.filter((item) => !item.managerOnly || manager), [manager]);

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
      .limit(150);

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
      } else if (next.length > 0) {
        const firstVisible = next.find((c) => canViewConversation(c, profile, authUserId));
        if (firstVisible) setActive(firstVisible);
      }
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
    if (!availableTabs.some((item) => item.key === tab)) setTab("new");
  }, [availableTabs, tab]);

  const activeContact = active?.whatsapp_contacts;
  const activePhone = onlyDigits(activeContact?.telefone || activeContact?.wa_id);

  const visibleConversations = useMemo(() => conversations.filter((conv) => canViewConversation(conv, profile, authUserId)), [authUserId, conversations, profile]);

  const counts = useMemo(() => {
    const newCount = visibleConversations.filter((conv) => isUnassigned(conv)).length;
    const mineCount = conversations.filter((conv) => conv.assigned_to === authUserId && !isClosed(conv)).length;
    const queueCount = visibleConversations.filter((conv) => !isClosed(conv) && queueFromConversation(conv) !== "finalizado").length;
    const allOpenCount = manager ? conversations.filter((conv) => !isClosed(conv)).length : 0;
    const closedCount = manager ? conversations.filter(isClosed).length : conversations.filter((conv) => conv.assigned_to === authUserId && isClosed(conv)).length;

    return { new: newCount, mine: mineCount, queues: queueCount, all: allOpenCount, closed: closedCount } satisfies Record<TabKey, number>;
  }, [authUserId, conversations, manager, visibleConversations]);

  const filteredConversations = useMemo(() => {
    if (tab === "new") return visibleConversations.filter((conv) => isUnassigned(conv));
    if (tab === "mine") return conversations.filter((conv) => conv.assigned_to === authUserId && !isClosed(conv));
    if (tab === "queues") return visibleConversations.filter((conv) => !isClosed(conv));
    if (tab === "closed") return manager ? conversations.filter(isClosed) : conversations.filter((conv) => conv.assigned_to === authUserId && isClosed(conv));
    if (tab === "all" && manager) return conversations.filter((conv) => !isClosed(conv));
    return [];
  }, [authUserId, conversations, manager, tab, visibleConversations]);

  useEffect(() => {
    if (!active) return;

    const canStillView = canViewConversation(active, profile, authUserId);
    const existsInTab = filteredConversations.some((conv) => conv.id === active.id);

    if ((!canStillView || !existsInTab) && filteredConversations.length > 0) setActive(filteredConversations[0]);
    if ((!canStillView || !existsInTab) && filteredConversations.length === 0) setActive(null);
  }, [active, authUserId, filteredConversations, profile]);

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

  async function updateConversationPatch(patch: Partial<Conversation>) {
    if (!active) return false;

    setUpdatingConversation(true);

    const { error } = await supabase
      .from("whatsapp_conversations")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", active.id);

    setUpdatingConversation(false);

    if (error) {
      console.error("Erro ao atualizar conversa WhatsApp:", error);
      alert("Não foi possível atualizar a conversa.");
      return false;
    }

    await loadConversations({ silent: true });
    return true;
  }

  async function assumirConversa() {
    if (!active || !authUserId) return;

    if (!canViewConversation(active, profile, authUserId)) {
      alert("Você não tem acesso à fila deste atendimento.");
      return;
    }

    const now = new Date().toISOString();
    const queue = queueFromConversation(active);

    const ok = await updateConversationPatch({
      assigned_to: authUserId,
      assigned_at: now,
      status: "humano",
      stage: queue === "novos_contatos" ? "triagem" : queue,
      queue: queue === "novos_contatos" ? "triagem" : queue,
    });

    if (ok) {
      setActive((prev) =>
        prev
          ? {
              ...prev,
              assigned_to: authUserId,
              assigned_at: now,
              status: "humano",
              stage: queue === "novos_contatos" ? "triagem" : queue,
              queue: queue === "novos_contatos" ? "triagem" : queue,
            }
          : prev
      );
      setTab("mine");
    }
  }

  async function finalizarConversa() {
    if (!active) return;

    const sent = await sendMessage(EVALUATION_MESSAGE);

    const ok = await updateConversationPatch({
      status: "fechada",
      stage: "finalizado",
      queue: "finalizado",
      closed_at: new Date().toISOString(),
    });

    if (ok) {
      if (!sent) alert("Atendimento finalizado, mas não foi possível enviar a mensagem de avaliação.");
      setTab("closed");
    }
  }

  async function reabrirConversa() {
    if (!active) return;

    const ok = await updateConversationPatch({
      status: "humano",
      stage: "triagem",
      queue: "triagem",
      closed_at: null,
      assigned_to: active.assigned_to || authUserId,
      assigned_at: active.assigned_at || new Date().toISOString(),
    });

    if (ok) setTab("mine");
  }

  async function transferirFila(queue: string) {
    if (!active) return;

    if (!manager && !allowedQueues.includes(queue)) {
      alert("Você não tem acesso para mover atendimentos para esta fila.");
      return;
    }

    const ok = await updateConversationPatch({ queue, stage: queue, status: active.assigned_to ? "humano" : "novo" });

    if (ok) setActive((prev) => (prev ? { ...prev, queue, stage: queue, status: prev.assigned_to ? "humano" : "novo" } : prev));
  }

  function addEmoji(emoji: string) {
    setText((prev) => `${prev}${emoji}`);
    setEmojiOpen(false);
  }

  function callSoon() {
    alert("Ligação pelo WhatsApp Business exige configuração própria da Meta/Calling API. Vamos tratar isso em uma etapa separada.");
  }

  const activeIsMine = !!active?.assigned_to && active.assigned_to === authUserId;
  const activeIsClosed = isClosed(active);
  const canSend = !!active && !activeIsClosed && !!text.trim() && !sending;
  const canAssumeActive = !!active && !activeIsClosed && canViewConversation(active, profile, authUserId);
  const activeQueue = queueFromConversation(active);
  const ticketNumber = makeTicketNumber(active);

  const transferQueues = useMemo(() => {
    const list = manager ? QUEUES : QUEUES.filter((q) => allowedQueues.includes(q.key));
    return list.filter((q) => q.key !== "finalizado" && q.key !== "novos_contatos");
  }, [allowedQueues, manager]);

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
            Atendimento integrado da Consulmax para WhatsApp, triagem, suporte, pós-venda e oportunidades comerciais.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[520px]">
          <MetricCard label="Novos" value={counts.new} tone="gold" />
          <MetricCard label="Meus" value={counts.mine} tone="navy" />
          <MetricCard label={manager ? "Abertos" : "Filas"} value={manager ? counts.all : counts.queues} tone="red" />
          <MetricCard label="Finalizados" value={counts.closed} tone="green" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[430px_1fr]">
        <Card className="overflow-hidden border-0 shadow-sm">
          <CardHeader className="border-b p-4" style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.red})`, color: "white" }}>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageCircle className="h-5 w-5" />
                Atendimentos
              </CardTitle>

              <Button variant="outline" onClick={() => loadConversations()} disabled={refreshing} className="h-9 gap-2 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {availableTabs.map((item) => {
                const Icon = item.icon;
                const selected = tab === item.key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTab(item.key)}
                    className={`flex items-center justify-between rounded-2xl px-3 py-2 text-left text-sm font-semibold transition ${selected ? "bg-white text-slate-900 shadow-sm" : "bg-white/10 text-white hover:bg-white/20"}`}
                    title={item.label}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {item.short}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${selected ? "bg-slate-100 text-slate-700" : "bg-white/15 text-white"}`}>{counts[item.key]}</span>
                  </button>
                );
              })}
            </div>

            {!manager && (
              <div className="mt-3 flex items-start gap-2 rounded-2xl bg-white/10 p-3 text-xs text-white/90">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                Você visualiza apenas conversas das suas filas ou assumidas por você.
              </div>
            )}
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="flex h-72 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex h-[430px] flex-col items-center justify-center p-8 text-center text-slate-500">
                <Inbox className="mb-3 h-10 w-10 text-slate-300" />
                <p className="text-base font-semibold text-slate-700">Nenhum atendimento nesta visão.</p>
                <p className="mt-1 text-sm">Quando uma conversa entrar ou mudar de fila, ela aparecerá automaticamente aqui.</p>
              </div>
            ) : (
              <div className="max-h-[calc(100vh-305px)] overflow-auto">
                {filteredConversations.map((conv) => {
                  const contact = conv.whatsapp_contacts;
                  const selected = active?.id === conv.id;
                  const unassigned = isUnassigned(conv);
                  const queue = queueFromConversation(conv);

                  return (
                    <button key={conv.id} onClick={() => setActive(conv)} className={`w-full border-b p-4 text-left transition hover:bg-slate-50 ${selected ? "bg-[#fff7ed]" : "bg-white"}`}>
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold text-white shadow-sm" style={{ background: unassigned ? C.red : queueColor(queue) }}>
                          {initials(contact?.nome)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-base font-bold text-slate-900">{contact?.nome || "Cliente WhatsApp"}</p>
                              <p className="truncate text-sm text-slate-500">{formatPhoneBR(contact?.telefone || contact?.wa_id)}</p>
                            </div>
                            <span className="shrink-0 text-xs font-medium text-slate-400">{fmtRelative(conv.last_message_at)}</span>
                          </div>

                          <div className="mt-2 flex items-center gap-2">
                            <Badge variant="outline" className="text-[11px]">{makeTicketNumber(conv)}</Badge>
                          </div>

                          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-700">{conv.last_message || "—"}</p>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Badge style={badgeStyleForStatus(conv.status)}>{statusLabel(conv.status)}</Badge>
                            <Badge variant="secondary" className="gap-1"><Tag className="h-3 w-3" />{queueLabel(queue)}</Badge>
                            {conv.unread_count > 0 && <Badge style={{ background: C.red, color: "white" }}>{conv.unread_count} nova(s)</Badge>}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 shadow-sm">
          {!active ? (
            <div className="flex h-[70vh] items-center justify-center text-base text-slate-500">Selecione um atendimento para começar.</div>
          ) : (
            <>
              <CardHeader className="border-b bg-white p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-sm" style={{ background: activeIsClosed ? C.green : queueColor(activeQueue) }}>
                      {initials(activeContact?.nome)}
                    </div>

                    <div className="min-w-0">
                      <CardTitle className="text-xl text-slate-900">{conversationName(active)}</CardTitle>
                      <p className="mt-0.5 text-base text-slate-500">{formatPhoneBR(activeContact?.telefone || activeContact?.wa_id)}</p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{ticketNumber}</Badge>
                        <Badge className="gap-1" style={badgeStyleForStatus(active.status)}>
                          {active.status === "bot" ? <Bot className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                          {statusLabel(active.status)}
                        </Badge>
                        <Badge variant="secondary" className="gap-1"><Tag className="h-3.5 w-3.5" />Fila: {queueLabel(activeQueue)}</Badge>
                        {active.assigned_to ? (
                          <Badge variant="outline" className="gap-1"><UserCheck className="h-3.5 w-3.5" />{activeIsMine ? "Seu atendimento" : "Assumido"}</Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700"><Clock className="h-3.5 w-3.5" />Novo nesta fila</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!activeIsClosed && !active.assigned_to && (
                      <Button onClick={assumirConversa} disabled={updatingConversation || !canAssumeActive} style={{ background: C.red }} className="gap-2 text-white hover:opacity-95">
                        {updatingConversation ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                        Assumir conversa
                      </Button>
                    )}

                    {!activeIsClosed && active.assigned_to && !activeIsMine && manager && (
                      <Button variant="outline" onClick={assumirConversa} disabled={updatingConversation} className="gap-2"><ArrowRightLeft className="h-4 w-4" />Assumir de outro usuário</Button>
                    )}

                    {!activeIsClosed && <Button variant="outline" onClick={finalizarConversa} disabled={updatingConversation || sending} className="gap-2"><CheckCircle2 className="h-4 w-4" />Finalizar</Button>}
                    {activeIsClosed && <Button variant="outline" onClick={reabrirConversa} disabled={updatingConversation} className="gap-2"><RefreshCw className="h-4 w-4" />Reabrir</Button>}
                  </div>
                </div>

                {!activeIsClosed && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                    <span className="mr-1 flex items-center text-sm font-semibold text-slate-500">Mover para:</span>
                    {transferQueues.map((queue) => (
                      <Button key={queue.key} type="button" size="sm" variant={activeQueue === queue.key ? "default" : "outline"} onClick={() => transferirFila(queue.key)} disabled={updatingConversation} style={activeQueue === queue.key ? { background: queue.color } : undefined}>
                        {queue.label}
                      </Button>
                    ))}
                  </div>
                )}
              </CardHeader>

              <CardContent className="flex h-[calc(100vh-335px)] min-h-[520px] flex-col p-0">
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
                            className={`max-w-[82%] rounded-3xl px-4 py-3 text-base leading-relaxed shadow-sm ${outbound ? "rounded-br-md text-white" : "rounded-bl-md border border-slate-100 bg-white text-slate-900"}`}
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
                    <div className="rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500">Este atendimento foi finalizado. Reabra a conversa para responder novamente.</div>
                  ) : (
                    <div className="space-y-3">
                      {emojiOpen && (
                        <div className="flex flex-wrap gap-2 rounded-2xl border bg-slate-50 p-3">
                          {QUICK_EMOJIS.map((emoji) => (
                            <button key={emoji} type="button" onClick={() => addEmoji(emoji)} className="rounded-xl bg-white px-3 py-2 text-xl shadow-sm transition hover:scale-105">{emoji}</button>
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

                        <Button type="button" variant="outline" onClick={() => setEmojiOpen((prev) => !prev)} className="h-auto min-w-[52px]" title="Enviar emoji"><Smile className="h-5 w-5" /></Button>
                        <Button type="button" variant="outline" onClick={() => audioInputRef.current?.click()} disabled={sending} className="h-auto min-w-[52px]" title="Enviar áudio"><Mic className="h-5 w-5" /></Button>
                        <Button type="button" variant="outline" onClick={callSoon} className="h-auto min-w-[52px]" title="Fazer ligação"><Phone className="h-5 w-5" /></Button>
                        <Button type="button" variant="outline" onClick={() => attachmentInputRef.current?.click()} disabled={sending} className="h-auto min-w-[52px]" title="Anexar arquivo"><Paperclip className="h-5 w-5" /></Button>

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

                        <Button onClick={() => sendMessage()} disabled={!canSend} className="min-w-[64px] px-4" style={{ background: C.red }}>
                          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                        </Button>
                      </div>

                      <p className="text-xs text-slate-400">Assinatura automática: as mensagens enviadas pelo CRM exibem o nome do usuário responsável.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
