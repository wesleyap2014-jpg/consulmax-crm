// src/pages/AgendaSala.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { LiveKitRoom, RoomAudioRenderer, VideoConference } from "@livekit/components-react";
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
  cliente?: { id: string; nome: string | null; telefone: string | null; observacoes?: string | null } | null;
  lead?: { id: string; nome: string | null; telefone: string | null; descricao?: string | null } | null;
};

type CotaResumo = {
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
};

type MeetingNote = {
  id?: string;
  agenda_evento_id?: string;
  cliente_id?: string | null;
  lead_id?: string | null;
  raw_notes?: string | null;
  next_steps?: string | null;
  created_at?: string | null;
};

type ClientContext = {
  ok?: boolean;
  evento?: any;
  cliente?: any | null;
  lead?: any | null;
  meeting_notes?: MeetingNote[];
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
    ultimas_cotas: CotaResumo[];
  };
};

type PanelTab = "resumo" | "cadastro" | "carteira" | "notas";
type NoteAction = "save" | "finish";
type RecordingAction = "start" | "stop" | "status";

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

async function callRecordingViaApi(body: Record<string, any>) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  const res = await fetch("/api/livekit-recording", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Falha ao controlar a gravação.");
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

function PanelTabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" style={active ? panelTabActive : panelTab} onClick={onClick}>
      {children}
    </button>
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
  const [finishing, setFinishing] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [recordingEgressId, setRecordingEgressId] = useState("");
  const [recordingUrl, setRecordingUrl] = useState("");

  const [clientContext, setClientContext] = useState<ClientContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [contextError, setContextError] = useState("");
  const [activePanel, setActivePanel] = useState<PanelTab>("resumo");

  const personName = useMemo(() => {
    return (
      evento?.cliente?.nome ||
      evento?.lead?.nome ||
      clientContext?.cliente?.nome ||
      clientContext?.lead?.nome ||
      (isClient ? name || "Cliente" : "Cliente")
    );
  }, [evento, clientContext, isClient, name]);

  const personPhone = useMemo(() => {
    return (
      evento?.cliente?.telefone ||
      evento?.lead?.telefone ||
      clientContext?.cliente?.telefone ||
      clientContext?.lead?.telefone ||
      null
    );
  }, [evento, clientContext]);

  const cliente = clientContext?.cliente || null;
  const lead = clientContext?.lead || null;
  const carteira = clientContext?.carteira || null;
  const meetingNotes = clientContext?.meeting_notes || [];
  const isFinished = evento?.video_status === "finished";

  async function reloadEvent() {
    if (!eventId) return;

    const { data } = await supabase
      .from("agenda_eventos")
      .select(`
        id,tipo,titulo,cliente_id,lead_id,user_id,inicio_at,fim_at,videocall_url,video_status,completion_notes,completed_at,
        cliente:clientes!agenda_eventos_cliente_id_fkey(id,nome,telefone,observacoes),
        lead:leads!agenda_eventos_lead_id_fkey(id,nome,telefone,descricao)
      `)
      .eq("id", eventId)
      .maybeSingle();

    if (data) setEvento(data as any);
  }

  async function refreshContext() {
    if (!eventId || isClient) return;

    try {
      const ctx = await loadClientContextViaApi(eventId);
      setClientContext(ctx);
    } catch (err: any) {
      setContextError(err?.message || "Não foi possível carregar dados do cliente.");
    }
  }

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
    if (isFinished) return alert("Esta videochamada já foi finalizada. Crie um novo evento para uma nova chamada.");

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

      if (!isClient) {
        try {
          await controlRecording("status", false);
        } catch {
          // status é opcional; não bloqueia entrada na sala
        }
      }
    } catch (err: any) {
      alert("Erro ao entrar na sala: " + (err?.message || "erro desconhecido"));
    } finally {
      setJoining(false);
    }
  }

  async function controlRecording(action: RecordingAction, showConfirm = true) {
    if (!evento || !eventId || isClient) return;

    if (showConfirm && action === "start" && !confirm("Deseja iniciar a gravação desta videochamada?")) return;
    if (showConfirm && action === "stop" && !confirm("Deseja parar a gravação desta videochamada?")) return;

    setRecordingBusy(true);

    try {
      const data = await callRecordingViaApi({
        agenda_evento_id: eventId,
        action,
        egress_id: recordingEgressId || undefined,
      });

      if (action === "start") {
        const nextEgress = data?.egressId || data?.egress_id || data?.room?.recording_egress_id || "";
        const nextUrl = data?.recordingUrl || data?.recording_url || data?.room?.recording_url || "";

        setRecording(true);
        setRecordingEgressId(nextEgress);
        setRecordingUrl(nextUrl);

        if (showConfirm) {
          alert(data?.alreadyRecording ? "A gravação já estava em andamento." : "Gravação iniciada.");
        }
      }

      if (action === "stop") {
        setRecording(false);
        if (showConfirm) {
          alert("Gravação parada. O arquivo pode levar alguns minutos para aparecer no Supabase Storage.");
        }
      }

      if (action === "status") {
        const isRec = data?.recording === true || data?.room?.recording_status === "recording";
        setRecording(isRec);
        setRecordingEgressId(data?.room?.recording_egress_id || recordingEgressId || "");
        setRecordingUrl(data?.room?.recording_url || recordingUrl || "");
      }
    } catch (err: any) {
      if (showConfirm) alert("Erro na gravação: " + (err?.message || "erro desconhecido"));
      throw err;
    } finally {
      setRecordingBusy(false);
    }
  }

  async function saveNote(action: NoteAction) {
    if (!evento || isClient) return;

    const raw = notes.trim();
    if (!raw) {
      return alert(action === "finish" ? "Digite uma nota antes de finalizar." : "Digite uma nota antes de salvar.");
    }

    if (action === "finish") {
      if (!confirm("Deseja finalizar este atendimento? A sala será encerrada para este link.")) return;
      setFinishing(true);
    } else {
      setSavingNote(true);
    }

    try {
      if (action === "finish" && recording) {
        try {
          await controlRecording("stop", false);
        } catch {
          // não impede a finalização se falhar ao parar gravação
        }
      }

      const result = await saveMeetingNoteViaApi({
        agenda_evento_id: evento.id,
        raw_notes: raw,
        next_steps: "",
        action,
      });

      const nowIso = new Date().toISOString();

      setEvento((old) =>
        old
          ? {
              ...old,
              video_status: action === "finish" ? "finished" : old.video_status,
              completion_notes: raw,
              completed_at: nowIso,
            }
          : old
      );

      setClientContext((old) => {
        const current = old || {};
        const list = current.meeting_notes || [];
        return {
          ...current,
          meeting_notes: [result?.note, ...list].filter(Boolean),
        };
      });

      setNotes("");

      await reloadEvent();
      await refreshContext();

      if (action === "finish") {
        setToken("");
        setServerUrl("");
        setRecording(false);
        alert("Atendimento finalizado e nota registrada.");
      } else {
        alert("Nota salva no histórico.");
      }
    } catch (err: any) {
      alert("Erro ao salvar nota: " + (err?.message || "erro desconhecido"));
    } finally {
      setSavingNote(false);
      setFinishing(false);
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
        <div style={loadingCard}>Carregando sala...</div>
      </div>
    );
  }

  if (!evento) {
    return (
      <div style={page}>
        <div style={loadingCard}>
          <h2>Evento não encontrado</h2>
          {eventoError && <p style={{ color: C.muted }}>{eventoError}</p>}
          <Link to="/agenda" style={btnSecondary}>
            Voltar para Agenda
          </Link>
        </div>
      </div>
    );
  }

  const renderPanel = () => {
    if (loadingContext) return <p style={{ color: C.muted, margin: 0 }}>Carregando dados completos...</p>;
    if (contextError) return <p style={{ color: C.ruby, margin: 0, fontSize: 12 }}>{contextError}</p>;

    if (activePanel === "resumo") {
      return (
        <div style={panelBody}>
          <div style={clientHero}>
            <span style={avatarCircle}>{personName.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{personName}</strong>
              <span>{personPhone || "Sem telefone"}</span>
            </div>
          </div>

          <div style={quickStatsGrid}>
            <KpiMini label="ativas" value={carteira?.qtd_ativas ?? 0} />
            <KpiMini label="contempladas" value={carteira?.qtd_contempladas ?? 0} />
            <KpiMini label="inad." value={carteira?.qtd_inadimplentes ?? 0} />
            <KpiMini label="total" value={carteira?.qtd_total ?? 0} />
          </div>

          <div style={sectionBoxSoft}>
            <SmallInfo label="Valor ativo" value={carteira?.total_ativo_fmt || "R$ 0,00"} />
            <SmallInfo label="Valor geral" value={carteira?.total_geral_fmt || "R$ 0,00"} />
            <SmallInfo label="Segmentos" value={carteira?.segmentos?.join(", ")} />
            <SmallInfo label="Administradoras" value={carteira?.administradoras?.join(", ")} />
          </div>

          {!!meetingNotes.length && (
            <div style={sectionBoxSoft}>
              <h4 style={sectionTitle}>Última anotação</h4>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", color: C.text, fontSize: 12 }}>
                {meetingNotes[0]?.raw_notes || "—"}
              </p>
              <small style={{ color: C.muted }}>{fmtDateTime(meetingNotes[0]?.created_at)}</small>
            </div>
          )}
        </div>
      );
    }

    if (activePanel === "cadastro") {
      return (
        <div style={panelBody}>
          <SmallInfo label="Nome" value={cliente?.nome || lead?.nome || personName} />
          <SmallInfo label="CPF" value={cliente?.cpf} />
          <SmallInfo label="Nascimento" value={fmtDate(cliente?.data_nascimento)} />
          <SmallInfo label="Telefone" value={cliente?.telefone || lead?.telefone || personPhone} />
          <SmallInfo label="E-mail" value={cliente?.email || lead?.email} />
          <SmallInfo label="Cidade/UF" value={[cliente?.cidade, cliente?.uf].filter(Boolean).join("/")} />
          <SmallInfo label="CEP" value={cliente?.endereco_cep} />
          <SmallInfo label="Endereço" value={[cliente?.logradouro, cliente?.numero, cliente?.bairro].filter(Boolean).join(", ")} />
          <SmallInfo label="Observações" value={cliente?.observacoes || lead?.descricao} />
        </div>
      );
    }

    if (activePanel === "carteira") {
      return (
        <div style={panelBody}>
          <div style={quickStatsGrid}>
            <KpiMini label="ativas" value={carteira?.qtd_ativas ?? 0} />
            <KpiMini label="canceladas" value={carteira?.qtd_canceladas ?? 0} />
            <KpiMini label="contempladas" value={carteira?.qtd_contempladas ?? 0} />
            <KpiMini label="inad." value={carteira?.qtd_inadimplentes ?? 0} />
          </div>

          <SmallInfo label="Valor ativo" value={carteira?.total_ativo_fmt || "R$ 0,00"} />
          <SmallInfo label="Valor geral" value={carteira?.total_geral_fmt || "R$ 0,00"} />

          <div style={cotasList}>
            <h4 style={sectionTitle}>Cotas recentes</h4>
            {carteira?.ultimas_cotas?.length ? (
              carteira.ultimas_cotas.slice(0, 8).map((cota) => (
                <div key={cota.id} style={cotaCard}>
                  <strong>
                    {cota.administradora} • {cota.segmento}
                  </strong>
                  <span>
                    Grupo {cota.grupo} • Cota {cota.cota}
                  </span>
                  <span>
                    {cota.status} • {cota.valor_venda_fmt}
                  </span>
                </div>
              ))
            ) : (
              <p style={{ color: C.muted, margin: 0, fontSize: 12 }}>Nenhuma cota localizada.</p>
            )}
          </div>
        </div>
      );
    }

    return (
      <div style={panelBody}>
        <label style={label}>
          Notas da reunião
          <textarea
            style={notesInput}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex.: Cliente quer simular imóvel de R$ 500 mil, possui renda de R$ 15 mil, principal objeção foi prazo..."
          />
        </label>

        <button style={btnSecondary} onClick={() => saveNote("save")} disabled={savingNote || finishing || isFinished}>
          {savingNote ? "Salvando nota..." : "Salvar nota"}
        </button>

        <div style={sectionBoxSoft}>
          <h4 style={sectionTitle}>Histórico de anotações</h4>

          {meetingNotes.length ? (
            <div style={historyList}>
              {meetingNotes.map((n, idx) => (
                <div key={n.id || `${n.created_at}-${idx}`} style={historyItem}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong>Nota {meetingNotes.length - idx}</strong>
                    <small>{fmtDateTime(n.created_at)}</small>
                  </div>

                  <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{n.raw_notes || "—"}</p>

                  {n.next_steps && <small style={{ color: C.muted }}>Próximos passos: {n.next_steps}</small>}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: C.muted, margin: 0, fontSize: 12 }}>Nenhuma nota registrada ainda.</p>
          )}
        </div>

        {evento.completion_notes && !meetingNotes.length && (
          <div style={finishedNoteBox}>
            <strong>Última nota registrada</strong>
            <p>{evento.completion_notes}</p>
            <small>{evento.completed_at ? `Registrado em ${fmtDateTime(evento.completed_at)}` : ""}</small>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={page}>
      <div className="room-shell" style={roomShell}>
        <header style={header}>
          <div style={{ minWidth: 0 }}>
            <p style={eyebrow}>Sala Consulmax</p>
            <h1 style={title}>{evento.titulo || "Videochamada Consulmax"}</h1>
            <p style={subtitle}>
              {isClient ? "Você está no ambiente seguro de atendimento por vídeo." : `${fmtDateTime(evento.inicio_at)} • ${personName}`}
            </p>
          </div>

          <div style={headerActions}>
            {!isClient && recording && <span style={recordingPill}>● Gravando</span>}

            {!isClient && waClient && evento.videocall_url && !isFinished && (
              <a href={waClient} target="_blank" rel="noreferrer" style={btnSecondary}>
                Enviar link no WhatsApp
              </a>
            )}

            {!isClient && (
              <Link to="/agenda" style={btnGhost}>
                Voltar
              </Link>
            )}
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
                    Este atendimento foi finalizado. Para uma nova videochamada, crie um novo evento na Agenda.
                  </p>
                </div>

                {!isClient && evento.completion_notes && (
                  <div style={finishedNoteBox}>
                    <strong>Última nota registrada</strong>
                    <p>{evento.completion_notes}</p>
                    <small>{evento.completed_at ? `Registrado em ${fmtDateTime(evento.completed_at)}` : ""}</small>
                  </div>
                )}

                {!isClient && (
                  <Link to="/agenda" style={btnSecondary}>
                    Voltar para Agenda
                  </Link>
                )}
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
          <main className={isClient ? "room-main room-main-client" : "room-main"} style={isClient ? clientLayout : layout}>
            <section style={videoCard}>
              <div style={videoTop}>
                <div>
                  <p style={eyebrow}>Ao vivo</p>
                  <strong style={{ color: C.navy }}>Sala conectada</strong>
                </div>

                {!isClient && (
                  <span style={recording ? recordingPill : liveBadge}>
                    {recording ? "● Gravando" : "Atendimento em andamento"}
                  </span>
                )}
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
                <div style={sideHeader}>
                  <div>
                    <p style={eyebrow}>Atendimento</p>
                    <h3 style={{ margin: "4px 0 0", color: C.navy }}>Painel do cliente</h3>
                  </div>
                  <span style={smallStatus}>{loadingContext ? "Carregando" : "Online"}</span>
                </div>

                <div style={panelTabs}>
                  <PanelTabButton active={activePanel === "resumo"} onClick={() => setActivePanel("resumo")}>
                    Resumo
                  </PanelTabButton>
                  <PanelTabButton active={activePanel === "cadastro"} onClick={() => setActivePanel("cadastro")}>
                    Cadastro
                  </PanelTabButton>
                  <PanelTabButton active={activePanel === "carteira"} onClick={() => setActivePanel("carteira")}>
                    Carteira
                  </PanelTabButton>
                  <PanelTabButton active={activePanel === "notas"} onClick={() => setActivePanel("notas")}>
                    Notas
                  </PanelTabButton>
                </div>

                <div style={panelScroll}>{renderPanel()}</div>

                <div style={sideFooter}>
                  <div style={recordingBox}>
                    <div style={{ display: "grid", gap: 3 }}>
                      <strong>{recording ? "Gravação em andamento" : "Gravação da reunião"}</strong>
                      <span>
                        {recording
                          ? "Ao parar, o arquivo pode levar alguns minutos para aparecer no Supabase."
                          : "O vídeo será salvo no bucket recordings do Supabase."}
                      </span>
                    </div>

                    {!recording ? (
                      <button
                        type="button"
                        style={btnSecondary}
                        onClick={() => controlRecording("start")}
                        disabled={recordingBusy || isFinished}
                      >
                        {recordingBusy ? "Iniciando..." : "Iniciar gravação"}
                      </button>
                    ) : (
                      <button type="button" style={btnSecondary} onClick={() => controlRecording("stop")} disabled={recordingBusy}>
                        {recordingBusy ? "Parando..." : "Parar gravação"}
                      </button>
                    )}

                    {recordingUrl && (
                      <a href={recordingUrl} target="_blank" rel="noreferrer" style={recordingLink}>
                        Abrir gravação
                      </a>
                    )}
                  </div>

                  {activePanel !== "notas" && (
                    <button type="button" style={btnSecondary} onClick={() => setActivePanel("notas")}>
                      Escrever nota
                    </button>
                  )}

                  <button style={btnPrimary} onClick={() => saveNote("finish")} disabled={savingNote || finishing || isFinished}>
                    {finishing ? "Finalizando..." : isFinished ? "Finalizado" : "Finalizar atendimento"}
                  </button>
                </div>
              </aside>
            )}
          </main>
        )}
      </div>

      <style>{`
        .room-shell { width: min(96vw, 1640px); }
        .room-main { grid-template-columns: minmax(0, 1fr) 360px; }
        .room-main-client { grid-template-columns: 1fr; }
        @media (min-width: 1500px) {
          .room-main { grid-template-columns: minmax(0, 1fr) 340px; }
        }
        @media (max-width: 1100px) {
          .room-main { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: 14,
  background:
    "radial-gradient(circle at top left, rgba(161,28,39,.12), transparent 30%), radial-gradient(circle at bottom right, rgba(30,41,63,.14), transparent 34%), #f8fafc",
};

const roomShell: React.CSSProperties = {
  margin: "0 auto",
  display: "grid",
  gap: 12,
};

const header: React.CSSProperties = {
  background: "rgba(255,255,255,.82)",
  border: "1px solid rgba(255,255,255,.78)",
  borderRadius: 22,
  padding: "12px 16px",
  boxShadow: "0 14px 40px rgba(15,23,42,.08)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  backdropFilter: "blur(14px)",
};

const headerActions: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
  flexShrink: 0,
};

const title: React.CSSProperties = {
  margin: "2px 0 3px",
  color: C.navy,
  fontSize: 18,
  lineHeight: 1.12,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const subtitle: React.CSSProperties = {
  margin: 0,
  color: C.muted,
  fontSize: 13,
};

const layout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 360px",
  gap: 12,
  alignItems: "stretch",
};

const clientLayout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 12,
};

const loadingCard: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  background: "#fff",
  borderRadius: 20,
  padding: 18,
  border: "1px solid #e2e8f0",
  boxShadow: "0 18px 50px rgba(15,23,42,.10)",
};

const joinCard: React.CSSProperties = {
  ...loadingCard,
  display: "grid",
  gap: 14,
};

const videoCard: React.CSSProperties = {
  background: "rgba(255,255,255,.84)",
  borderRadius: 22,
  padding: 12,
  border: "1px solid rgba(226,232,240,.92)",
  boxShadow: "0 18px 50px rgba(15,23,42,.10)",
  minHeight: "calc(100vh - 122px)",
  display: "grid",
  gridTemplateRows: "auto minmax(520px, 1fr)",
};

const videoTop: React.CSSProperties = {
  padding: "2px 2px 10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const livekitBox: React.CSSProperties = {
  height: "100%",
  minHeight: 560,
  borderRadius: 18,
  overflow: "hidden",
  background: "#020617",
};

const liveBadge: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "#1E293F10",
  border: "1px solid #1E293F22",
  color: C.navy,
  fontSize: 12,
  fontWeight: 900,
};

const recordingPill: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "#A11C2714",
  border: "1px solid #A11C2750",
  color: C.ruby,
  fontSize: 12,
  fontWeight: 900,
};

const sideCard: React.CSSProperties = {
  background: "rgba(255,255,255,.88)",
  borderRadius: 22,
  padding: 12,
  border: "1px solid #e2e8f0",
  boxShadow: "0 18px 50px rgba(15,23,42,.10)",
  alignSelf: "stretch",
  display: "grid",
  gridTemplateRows: "auto auto minmax(0, 1fr) auto",
  gap: 10,
  height: "calc(100vh - 122px)",
  overflow: "hidden",
};

const sideHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "flex-start",
};

const smallStatus: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 999,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  color: C.muted,
  fontSize: 11,
  fontWeight: 900,
};

const panelTabs: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 6,
  padding: 4,
  borderRadius: 15,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
};

const panelTab: React.CSSProperties = {
  border: 0,
  borderRadius: 11,
  padding: "8px 5px",
  background: "transparent",
  color: C.muted,
  fontSize: 11,
  fontWeight: 900,
  cursor: "pointer",
};

const panelTabActive: React.CSSProperties = {
  ...panelTab,
  background: C.navy,
  color: "#fff",
  boxShadow: "0 8px 18px rgba(30,41,63,.16)",
};

const panelScroll: React.CSSProperties = {
  overflow: "auto",
  paddingRight: 2,
};

const panelBody: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const clientHero: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "44px 1fr",
  gap: 10,
  alignItems: "center",
  padding: 12,
  borderRadius: 16,
  background: "linear-gradient(135deg, rgba(30,41,63,.08), rgba(161,28,39,.06))",
  border: "1px solid #e2e8f0",
};

const avatarCircle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 16,
  display: "grid",
  placeItems: "center",
  color: "#fff",
  background: C.navy,
  fontWeight: 900,
  fontSize: 18,
};

const quickStatsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 7,
};

const sideFooter: React.CSSProperties = {
  display: "grid",
  gap: 8,
  paddingTop: 10,
  borderTop: "1px solid #e2e8f0",
};

const recordingBox: React.CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 10,
  borderRadius: 16,
  background: "#fff",
  border: "1px solid #e2e8f0",
  fontSize: 12,
  color: C.text,
};

const recordingLink: React.CSSProperties = {
  color: C.ruby,
  fontWeight: 900,
  fontSize: 12,
  textDecoration: "none",
};

const sectionBoxSoft: React.CSSProperties = {
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
  fontSize: 12,
};

const kpiMini: React.CSSProperties = {
  display: "grid",
  gap: 2,
  alignContent: "center",
  justifyItems: "center",
  minHeight: 54,
  borderRadius: 14,
  background: "#fff",
  border: "1px solid #e2e8f0",
  color: C.navy,
  fontSize: 10,
};

const cotasList: React.CSSProperties = {
  display: "grid",
  gap: 8,
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

const historyList: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const historyItem: React.CSSProperties = {
  display: "grid",
  gap: 4,
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
  fontSize: 10,
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

const notesInput: React.CSSProperties = {
  ...input,
  minHeight: 300,
  resize: "vertical",
  lineHeight: 1.5,
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
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const btnGhost: React.CSSProperties = { ...btnSecondary, background: "#fff" };
