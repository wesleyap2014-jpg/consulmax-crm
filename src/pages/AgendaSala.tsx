// src/pages/AgendaSala.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
} from "@livekit/components-react";
import "@livekit/components-styles";

type AgendaEvento = {
  id: string;
  tipo: string | null;
  titulo: string | null;
  cliente_id: string | null;
  lead_id: string | null;
  user_id: string | null;
  inicio_at: string | null;
  fim_at: string | null;
  videocall_url: string | null;
  video_status?: string | null;
  completion_notes?: string | null;
  completed_at?: string | null;
  cliente?: {
    id: string;
    nome: string | null;
    telefone: string | null;
    observacoes?: string | null;
  } | null;
  lead?: {
    id: string;
    nome: string | null;
    telefone: string | null;
    descricao?: string | null;
  } | null;
};

type ClientContext = {
  ok?: boolean;
  evento?: any;
  cliente?: any | null;
  lead?: any | null;
  carteira?: {
    qtd_total: number;
    qtd_ativas: number;
    qtd_canceladas: number;
    qtd_contempladas: number;
    qtd_inadimplentes: number;
    total_ativo: number;
    total_ativo_fmt: string;
    total_geral: number;
    total_geral_fmt: string;
    segmentos: string[];
    administradoras: string[];
    ultimas_cotas: Array<{
      id: string;
      administradora: string;
      segmento: string;
      grupo: string;
      cota: string;
      codigo: string;
      status: string;
      valor_venda: number;
      valor_venda_fmt: string;
      data_venda: string | null;
    }>;
  };
};

const C = {
  ruby: "#A11C27",
  navy: "#1E293F",
  gold: "#B5A573",
  goldLight: "#E0CE8C",
  off: "#F5F5F5",
  text: "#0f172a",
  muted: "#64748b",
  line: "#e2e8f0",
};

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function valueOrDash(value: any) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function onlyDigits(s: string) {
  return (s || "").replace(/\D+/g, "");
}

function whatsappUrl(raw?: string | null, text?: string) {
  const d = onlyDigits(String(raw || ""));
  if (!d) return null;
  const phone = d.startsWith("55") ? d : `55${d}`;
  const base = `https://wa.me/${phone}`;
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(String(text).normalize("NFC"))}`;
}

async function callLiveKitRoom(body: Record<string, any>) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  const res = await fetch("/api/livekit-room", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Falha ao acessar a sala.");
  return json;
}

async function saveMeetingNoteViaApi(body: Record<string, any>) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  const res = await fetch("/api/meeting-note", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Falha ao salvar a nota.");
  return json;
}

async function loadClientContextViaApi(agendaEventoId: string) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  const res = await fetch("/api/client-context", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ agenda_evento_id: agendaEventoId }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Falha ao carregar contexto do cliente.");
  return json as ClientContext;
}

function publicFallbackEvent(eventId: string): AgendaEvento {
  return {
    id: eventId,
    tipo: "videochamada",
    titulo: "Videochamada Consulmax",
    cliente_id: null,
    lead_id: null,
    user_id: null,
    inicio_at: null,
    fim_at: null,
    videocall_url: null,
    video_status: null,
  } as any;
}

function SmallInfo({ label, value }: { label: string; value: any }) {
  return (
    <div style={smallInfo}>
      <span>{label}</span>
      <strong>{valueOrDash(value)}</strong>
    </div>
  );
}

function KpiMini({ label, value }: { label: string; value: any }) {
  return (
    <div style={kpiMini}>
      <strong>{valueOrDash(value)}</strong>
      <span>{label}</span>
    </div>
  );
}

export default function AgendaSalaPage() {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const isClient = searchParams.get("cliente") === "1";

  const [evento, setEvento] = useState<AgendaEvento | null>(null);
  const [loadingEvento, setLoadingEvento] = useState(true);
  const [eventoError, setEventoError] = useState("");

  const [name, setName] = useState(isClient ? "Cliente" : "Consultor Consulmax");
  const [joining, setJoining] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [token, setToken] = useState("");

  const [notes, setNotes] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [clientContext, setClientContext] = useState<ClientContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [contextError, setContextError] = useState("");

  const personName = useMemo(() => {
    return evento?.cliente?.nome || evento?.lead?.nome || clientContext?.cliente?.nome || clientContext?.lead?.nome || (isClient ? name || "Cliente" : "Cliente");
  }, [evento, clientContext, isClient, name]);

  const personPhone = useMemo(() => {
    return evento?.cliente?.telefone || evento?.lead?.telefone || clientContext?.cliente?.telefone || clientContext?.lead?.telefone || null;
  }, [evento, clientContext]);

  const cliente = clientContext?.cliente || null;
  const lead = clientContext?.lead || null;
  const carteira = clientContext?.carteira || null;

  useEffect(() => {
    async function load() {
      if (!eventId) return;
      setLoadingEvento(true);
      setEventoError("");

      const { data, error } = await supabase
        .from("agenda_eventos")
        .select(`
          id,tipo,titulo,cliente_id,lead_id,user_id,inicio_at,fim_at,videocall_url,video_status,completion_notes,completed_at,
          cliente:clientes!agenda_eventos_cliente_id_fkey(id,nome,telefone,observacoes),
          lead:leads!agenda_eventos_lead_id_fkey(id,nome,telefone,descricao)
        `)
        .eq("id", eventId)
        .maybeSingle();

      if (error || !data) {
        if (isClient) {
          setEvento(publicFallbackEvent(eventId));
          setEventoError("");
        } else {
          setEvento(null);
          setEventoError(error?.message || "Evento não encontrado.");
        }
      } else {
        setEvento(data as any);
        const nome = (data as any)?.cliente?.nome || (data as any)?.lead?.nome;
        if (isClient && nome) setName(nome);
      }

      setLoadingEvento(false);
    }

    load();
  }, [eventId, isClient]);

  useEffect(() => {
    async function loadContext() {
      if (!eventId || isClient) return;
      setLoadingContext(true);
      setContextError("");
      try {
        const ctx = await loadClientContextViaApi(eventId);
        setClientContext(ctx);
      } catch (err: any) {
        setContextError(err?.message || "Não foi possível carregar dados do cliente.");
      } finally {
        setLoadingContext(false);
      }
    }

    loadContext();
  }, [eventId, isClient]);

  async function joinRoom() {
    if (!eventId) return;
    setJoining(true);

    try {
      const data = await callLiveKitRoom({
        agenda_evento_id: eventId,
        role: isClient ? "client" : "host",
        participant_name: name || (isClient ? "Cliente" : "Consultor Consulmax"),
      });

      setToken(data.token);
      setServerUrl(data.serverUrl);

      if (data?.clientUrl && !evento?.videocall_url) {
        setEvento((old) => (old ? { ...old, videocall_url: data.clientUrl } : old));
      }
    } catch (err: any) {
      alert("Erro ao entrar na sala: " + (err?.message || "erro desconhecido"));
    } finally {
      setJoining(false);
    }
  }

  async function finishMeeting() {
    if (!evento || isClient) return;
    const raw = notes.trim();
    if (!raw) return alert("Digite uma nota antes de finalizar.");

    setSavingNote(true);

    try {
      await saveMeetingNoteViaApi({
        agenda_evento_id: evento.id,
        raw_notes: raw,
        next_steps: "",
      });

      setEvento((old) => (old ? { ...old, video_status: "finished", completion_notes: raw, completed_at: new Date().toISOString() } : old));
      alert("Atendimento finalizado e nota registrada.");
    } catch (err: any) {
      alert("Erro ao salvar nota: " + (err?.message || "erro desconhecido"));
    } finally {
      setSavingNote(false);
    }
  }

  const clientMessage = useMemo(() => {
    if (!evento?.videocall_url) return "";
    return `Olá, ${personName}! Aqui é da Consulmax.\n\nSegue o link da nossa videochamada:\n\n${evento.videocall_url}\n\nAté já.`;
  }, [evento?.videocall_url, personName]);

  const waClient = whatsappUrl(personPhone, clientMessage);
  const isFinished = evento?.video_status === "finished";

  if (loadingEvento) {
    return (
      <div style={page}>
        <div style={card}>Carregando sala...</div>
      </div>
    );
  }

  if (!evento) {
    return (
      <div style={page}>
        <div style={card}>
          <h2>Evento não encontrado</h2>
          {eventoError && <p style={{ color: C.muted }}>{eventoError}</p>}
          <Link to="/agenda" style={btnSecondary}>Voltar para Agenda</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <header style={header}>
        <div>
          <p style={eyebrow}>Sala Consulmax</p>
          <h1 style={{ margin: "4px 0", color: C.navy }}>{evento.titulo || "Videochamada Consulmax"}</h1>
          <p style={{ margin: 0, color: C.muted }}>
            {isClient
              ? "Você está no ambiente seguro de atendimento por vídeo."
              : `${fmtDateTime(evento.inicio_at)} • ${personName}`}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!isClient && waClient && evento.videocall_url && !isFinished && (
            <a href={waClient} target="_blank" rel="noreferrer" style={btnSecondary}>
              Enviar link no WhatsApp
            </a>
          )}
          {!isClient && <Link to="/agenda" style={btnGhost}>Voltar</Link>}
        </div>
      </header>

      {!token ? (
        <section style={joinCard}>
          {isFinished ? (
            <>
              <div>
                <p style={eyebrow}>Atendimento finalizado</p>
                <h2 style={{ margin: "4px 0 8px", color: C.navy }}>Esta sala já foi encerrada</h2>
                <p style={{ margin: 0, color: C.muted }}>
                  Para uma nova videochamada, crie um novo evento na Agenda.
                </p>
              </div>
              {!isClient && evento.completion_notes && (
                <div style={finishedNoteBox}>
                  <strong>Nota registrada</strong>
                  <p>{evento.completion_notes}</p>
                  <small>{evento.completed_at ? `Finalizado em ${fmtDateTime(evento.completed_at)}` : ""}</small>
                </div>
              )}
              {!isClient && <Link to="/agenda" style={btnSecondary}>Voltar para Agenda</Link>}
            </>
          ) : (
            <>
              <div>
                <p style={eyebrow}>{isClient ? "Cliente" : "Consultor"}</p>
                <h2 style={{ margin: "4px 0 8px", color: C.navy }}>Entrar na videochamada</h2>
                <p style={{ margin: 0, color: C.muted }}>Informe o nome que aparecerá na sala.</p>
              </div>

              <label style={label}>
                Nome na sala
                <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
              </label>

              <button style={btnPrimary} onClick={joinRoom} disabled={joining}>
                {joining ? "Entrando..." : "Entrar na sala"}
              </button>
            </>
          )}
        </section>
      ) : (
        <main style={isClient ? clientLayout : layout}>
          <section style={videoCard}>
            <div style={videoTop}>
              <div>
                <p style={eyebrow}>Ao vivo</p>
                <strong style={{ color: C.navy }}>Sala conectada</strong>
              </div>
            </div>

            <div style={livekitBox}>
              <LiveKitRoom
                token={token}
                serverUrl={serverUrl}
                connect={true}
                video={true}
                audio={true}
                data-lk-theme="default"
                style={{ height: "100%" }}
              >
                <VideoConference />
                <RoomAudioRenderer />
              </LiveKitRoom>
            </div>
          </section>

          {!isClient && (
            <aside style={sideCard}>
              <p style={eyebrow}>Atendimento</p>
              <h3 style={{ marginTop: 4, marginBottom: 0, color: C.navy }}>Dados do cliente</h3>

              {loadingContext && <p style={{ color: C.muted, margin: 0 }}>Carregando dados completos...</p>}
              {contextError && <p style={{ color: C.ruby, margin: 0, fontSize: 12 }}>{contextError}</p>}

              <div style={infoBox}>
                <strong>{personName}</strong>
                <span>{personPhone || "Sem telefone"}</span>
                <span>{evento.tipo || "Evento"}</span>
              </div>

              <div style={sectionBox}>
                <h4 style={sectionTitle}>Cadastro</h4>
                <SmallInfo label="CPF" value={cliente?.cpf} />
                <SmallInfo label="Nascimento" value={fmtDate(cliente?.data_nascimento)} />
                <SmallInfo label="E-mail" value={cliente?.email || lead?.email} />
                <SmallInfo label="Cidade/UF" value={[cliente?.cidade, cliente?.uf].filter(Boolean).join("/")} />
                <SmallInfo label="CEP" value={cliente?.endereco_cep} />
                <SmallInfo label="Endereço" value={[cliente?.logradouro, cliente?.numero, cliente?.bairro].filter(Boolean).join(", ")} />
              </div>

              <div style={sectionBox}>
                <h4 style={sectionTitle}>Carteira</h4>
                <div style={kpiGrid}>
                  <KpiMini label="ativas" value={carteira?.qtd_ativas ?? 0} />
                  <KpiMini label="contempladas" value={carteira?.qtd_contempladas ?? 0} />
                  <KpiMini label="inad." value={carteira?.qtd_inadimplentes ?? 0} />
                  <KpiMini label="total" value={carteira?.qtd_total ?? 0} />
                </div>
                <SmallInfo label="Valor ativo" value={carteira?.total_ativo_fmt || "R$ 0,00"} />
                <SmallInfo label="Valor geral" value={carteira?.total_geral_fmt || "R$ 0,00"} />
                <SmallInfo label="Segmentos" value={carteira?.segmentos?.join(", ")} />
                <SmallInfo label="Administradoras" value={carteira?.administradoras?.join(", ")} />
              </div>

              {!!carteira?.ultimas_cotas?.length && (
                <div style={sectionBox}>
                  <h4 style={sectionTitle}>Cotas recentes</h4>
                  <div style={{ display: "grid", gap: 8 }}>
                    {carteira.ultimas_cotas.slice(0, 5).map((cota) => (
                      <div key={cota.id} style={cotaCard}>
                        <strong>{cota.administradora} • {cota.segmento}</strong>
                        <span>Grupo {cota.grupo} • Cota {cota.cota}</span>
                        <span>{cota.status} • {cota.valor_venda_fmt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <label style={label}>
                Notas da reunião
                <textarea
                  style={{ ...input, minHeight: 160, resize: "vertical" }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex.: Cliente quer simular imóvel de R$ 500 mil, possui renda de R$ 15 mil, principal objeção foi prazo..."
                />
              </label>

              <button style={btnPrimary} onClick={finishMeeting} disabled={savingNote}>
                {savingNote ? "Salvando..." : "Finalizar atendimento"}
              </button>

              <p style={{ margin: "4px 0 0", color: C.muted, fontSize: 12 }}>
                Depois vamos conectar aqui o resumo com IA, gravação e follow-up automático.
              </p>
            </aside>
          )}
        </main>
      )}
    </div>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: 18,
  background:
    "radial-gradient(circle at top left, rgba(161,28,39,.12), transparent 30%), radial-gradient(circle at bottom right, rgba(30,41,63,.14), transparent 34%), #f8fafc",
};

const header: React.CSSProperties = {
  maxWidth: 1280,
  margin: "0 auto 16px",
  background: "rgba(255,255,255,.78)",
  border: "1px solid rgba(255,255,255,.75)",
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 18px 50px rgba(15,23,42,.10)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  backdropFilter: "blur(14px)",
};

const layout: React.CSSProperties = {
  maxWidth: 1280,
  margin: "0 auto",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 380px",
  gap: 16,
};

const clientLayout: React.CSSProperties = {
  maxWidth: 980,
  margin: "0 auto",
  display: "grid",
  gap: 16,
};

const card: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  background: "#fff",
  borderRadius: 20,
  padding: 18,
  border: "1px solid #e2e8f0",
  boxShadow: "0 18px 50px rgba(15,23,42,.10)",
};

const joinCard: React.CSSProperties = { ...card, display: "grid", gap: 14 };

const videoCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: 22,
  padding: 14,
  border: "1px solid #e2e8f0",
  boxShadow: "0 18px 50px rgba(15,23,42,.10)",
  minHeight: 640,
};

const videoTop: React.CSSProperties = {
  padding: "4px 4px 12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const livekitBox: React.CSSProperties = {
  height: "600px",
  borderRadius: 18,
  overflow: "hidden",
  background: "#020617",
};

const sideCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: 22,
  padding: 16,
  border: "1px solid #e2e8f0",
  boxShadow: "0 18px 50px rgba(15,23,42,.10)",
  alignSelf: "start",
  display: "grid",
  gap: 12,
  maxHeight: "calc(100vh - 140px)",
  overflow: "auto",
};

const infoBox: React.CSSProperties = {
  display: "grid",
  gap: 6,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 12,
  color: C.text,
};

const sectionBox: React.CSSProperties = {
  display: "grid",
  gap: 8,
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 12,
  background: "#ffffff",
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  color: C.navy,
  fontSize: 13,
};

const smallInfo: React.CSSProperties = {
  display: "grid",
  gap: 2,
  borderTop: "1px solid #f1f5f9",
  paddingTop: 7,
};

const kpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
};

const kpiMini: React.CSSProperties = {
  display: "grid",
  gap: 2,
  alignContent: "center",
  justifyItems: "center",
  minHeight: 58,
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  color: C.navy,
  fontSize: 11,
};

const cotaCard: React.CSSProperties = {
  display: "grid",
  gap: 3,
  padding: 10,
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  fontSize: 12,
  color: C.text,
};

const finishedNoteBox: React.CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 14,
  borderRadius: 16,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
};

const eyebrow: React.CSSProperties = {
  margin: 0,
  color: C.ruby,
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 1.1,
};

const label: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  color: "#334155",
  fontWeight: 800,
};

const input: React.CSSProperties = {
  padding: 11,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  outline: "none",
  background: "#fff",
  color: C.text,
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 12,
  background: C.ruby,
  color: "#fff",
  border: 0,
  fontWeight: 900,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const btnSecondary: React.CSSProperties = {
  padding: "9px 13px",
  borderRadius: 11,
  background: "#f8fafc",
  color: C.navy,
  border: "1px solid #e2e8f0",
  fontWeight: 800,
  cursor: "pointer",
  textDecoration: "none",
};

const btnGhost: React.CSSProperties = { ...btnSecondary, background: "#fff" };
