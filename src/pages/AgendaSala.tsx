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

  const personName = useMemo(() => {
    return evento?.cliente?.nome || evento?.lead?.nome || "Cliente";
  }, [evento]);

  const personPhone = useMemo(() => {
    return evento?.cliente?.telefone || evento?.lead?.telefone || null;
  }, [evento]);

  useEffect(() => {
    async function load() {
      if (!eventId) return;
      setLoadingEvento(true);
      setEventoError("");

      const { data, error } = await supabase
        .from("agenda_eventos")
        .select(`
          id,tipo,titulo,cliente_id,lead_id,user_id,inicio_at,fim_at,videocall_url,video_status,
          cliente:clientes!agenda_eventos_cliente_id_fkey(id,nome,telefone,observacoes),
          lead:leads!agenda_eventos_lead_id_fkey(id,nome,telefone,descricao)
        `)
        .eq("id", eventId)
        .maybeSingle();

      if (error) {
        setEventoError(error.message);
      } else {
        setEvento(data as any);
        const nome = (data as any)?.cliente?.nome || (data as any)?.lead?.nome;
        if (isClient && nome) setName(nome);
      }

      setLoadingEvento(false);
    }

    load();
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
    if (!evento) return;
    const raw = notes.trim();
    if (!raw) return alert("Digite uma nota antes de finalizar.");

    setSavingNote(true);

    try {
      const { error } = await supabase.from("meeting_notes").insert({
        agenda_evento_id: evento.id,
        cliente_id: evento.cliente_id,
        lead_id: evento.lead_id,
        raw_notes: raw,
        next_steps: "",
      });

      if (error) throw error;

      await supabase
        .from("agenda_eventos")
        .update({
          video_status: "finished",
          completed_at: new Date().toISOString(),
          completion_notes: raw,
        })
        .eq("id", evento.id);

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
          <h1 style={{ margin: "4px 0", color: C.navy }}>{evento.titulo || "Videochamada"}</h1>
          <p style={{ margin: 0, color: C.muted }}>{fmtDateTime(evento.inicio_at)} • {personName}</p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!isClient && waClient && evento.videocall_url && (
            <a href={waClient} target="_blank" rel="noreferrer" style={btnSecondary}>
              Enviar link no WhatsApp
            </a>
          )}
          <Link to="/agenda" style={btnGhost}>Voltar</Link>
        </div>
      </header>

      {!token ? (
        <section style={joinCard}>
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
        </section>
      ) : (
        <main style={layout}>
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
              <h3 style={{ marginTop: 4, color: C.navy }}>Dados do cliente</h3>

              <div style={infoBox}>
                <strong>{personName}</strong>
                <span>{personPhone || "Sem telefone"}</span>
                <span>{evento.tipo || "Evento"}</span>
              </div>

              <label style={label}>
                Notas da reunião
                <textarea
                  style={{ ...input, minHeight: 180, resize: "vertical" }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex.: Cliente quer simular imóvel de R$ 500 mil, possui renda de R$ 15 mil, principal objeção foi prazo..."
                />
              </label>

              <button style={btnPrimary} onClick={finishMeeting} disabled={savingNote}>
                {savingNote ? "Salvando..." : "Finalizar atendimento"}
              </button>

              <p style={{ margin: "12px 0 0", color: C.muted, fontSize: 12 }}>
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
  gridTemplateColumns: "minmax(0, 1fr) 360px",
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
