import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Room, RoomEvent, Track } from "livekit-client";
import {
  Bot,
  Camera,
  CameraOff,
  Check,
  ChevronLeft,
  CircleDot,
  ClipboardList,
  Copy,
  LogOut,
  Mic,
  MicOff,
  MonitorUp,
  PanelRightClose,
  PanelRightOpen,
  PhoneOff,
  Play,
  Save,
  ShieldCheck,
  Sparkles,
  Square,
  UserCheck,
  UserMinus,
  Users,
  Video,
  X,
} from "lucide-react";

const C = { navy: "#1E293F", ruby: "#A11C27", gold: "#B5A573", goldLight: "#E0CE8C", muted: "#64748b" };

type AiMode = "sales" | "service" | "success" | "internal" | "minutes";
type SideTab = "max" | "client" | "notes" | "people";
type EventInfo = {
  id: string;
  titulo: string;
  inicio_at: string;
  fim_at: string;
  organizer_name: string;
  waiting_room_enabled: boolean;
  ai_enabled: boolean;
  ai_mode: AiMode;
  recording_preference: "manual" | "auto" | "off";
  cancelled: boolean;
  finished: boolean;
};
type LobbyRequest = { id: string; display_name: string; email?: string | null; status: string; requested_at: string; recording_consent: boolean; ai_consent: boolean };
type AiState = { transcripts: any[]; insights: any[]; report: any | null; status: string };

type ContextData = {
  cliente?: any;
  lead?: any;
  carteira?: any;
  meeting_notes?: any[];
};

function fmt(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function initials(name: string) {
  return String(name || "P").trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("") || "P";
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function post(path: string, body: any, auth = false) {
  const headers = auth ? await authHeaders() : { "Content-Type": "application/json" };
  const res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Não foi possível concluir a operação.");
  return data;
}

function bestRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const choices = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  return choices.find((x) => MediaRecorder.isTypeSupported(x)) || "";
}

async function blobBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

function participantMetadata(participant: any) {
  try { return participant?.metadata ? JSON.parse(participant.metadata) : {}; } catch { return {}; }
}

function CameraView({ participant, source = Track.Source.Camera, mirror = false }: { participant: any; source?: any; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [, rerender] = useState(0);
  const pub = participant?.getTrackPublication?.(source);
  const mediaTrack = pub?.track;

  useEffect(() => {
    const video = ref.current;
    if (!video || !mediaTrack) return;
    mediaTrack.attach(video);
    return () => { try { mediaTrack.detach(video); } catch {} };
  }, [mediaTrack]);

  useEffect(() => {
    const bump = () => rerender((n) => n + 1);
    participant?.on?.("trackMuted", bump);
    participant?.on?.("trackUnmuted", bump);
    return () => { participant?.off?.("trackMuted", bump); participant?.off?.("trackUnmuted", bump); };
  }, [participant]);

  if (!mediaTrack || pub?.isMuted) return null;
  return <video ref={ref} autoPlay playsInline muted={participant?.isLocal === true} className="cm-video-el" style={{ transform: mirror ? "scaleX(-1)" : undefined }} />;
}

function ParticipantTile({ participant, large = false, screen = false, active = false }: { participant: any; large?: boolean; screen?: boolean; active?: boolean }) {
  const name = participant?.name || "Participante";
  const cameraPub = participant?.getTrackPublication?.(Track.Source.Camera);
  const micPub = participant?.getTrackPublication?.(Track.Source.Microphone);
  const hasVideo = screen ? Boolean(participant?.getTrackPublication?.(Track.Source.ScreenShare)?.track) : Boolean(cameraPub?.track && !cameraPub?.isMuted);
  const meta = participantMetadata(participant);
  return (
    <div className={`cm-tile ${large ? "large" : ""} ${active ? "active" : ""} ${screen ? "screen" : ""}`}>
      {hasVideo ? <CameraView participant={participant} source={screen ? Track.Source.ScreenShare : Track.Source.Camera} mirror={!screen && participant?.isLocal} /> : (
        <div className="cm-avatar"><span>{initials(name)}</span><small>{name}</small></div>
      )}
      <div className="cm-tile-foot">
        <span>{name}{participant?.isLocal ? " (você)" : ""}</span>
        <span className={micPub?.isMuted || !micPub?.track ? "muted" : ""}>{micPub?.isMuted || !micPub?.track ? <MicOff size={14} /> : <Mic size={14} />}</span>
      </div>
      {meta?.role === "host" && <span className="cm-host-pill">Organizador</span>}
    </div>
  );
}

function RemoteAudio({ room, version }: { room: Room; version: number }) {
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    root.innerHTML = "";
    const tracks: any[] = [];
    for (const p of Array.from(room.remoteParticipants.values())) {
      const pub: any = p.getTrackPublication(Track.Source.Microphone);
      if (pub?.track && !pub.isMuted) {
        const el = pub.track.attach() as HTMLAudioElement;
        el.autoplay = true;
        root.appendChild(el);
        tracks.push(pub.track);
      }
    }
    return () => tracks.forEach((t) => { try { t.detach(); } catch {} });
  }, [room, version]);
  return <div ref={host} style={{ display: "none" }} />;
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 760);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 760);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mobile;
}

function useParticipantTranscription(room: Room | null, enabled: boolean, eventId: string, version: number, onNewText: () => void) {
  const runners = useRef<Map<string, { stop: () => void }>>(new Map());
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!room || !enabled || !eventId) return;
    let disposed = false;
    const mime = bestRecorderMime();
    if (!mime) return;

    const participants = [room.localParticipant, ...Array.from(room.remoteParticipants.values())] as any[];
    for (const participant of participants) {
      const identity = String(participant.identity || "participant");
      const pub: any = participant.getTrackPublication(Track.Source.Microphone);
      const mst: MediaStreamTrack | undefined = pub?.track?.mediaStreamTrack;
      if (!mst || pub?.isMuted || runners.current.has(identity)) continue;

      let current: MediaRecorder | null = null;
      let timer: number | null = null;
      let stopped = false;
      let segment = 0;

      const run = () => {
        if (stopped || disposed || !enabledRef.current || mst.readyState !== "live") return;
        const chunks: BlobPart[] = [];
        const started = Date.now();
        try {
          current = new MediaRecorder(new MediaStream([mst]), { mimeType: mime });
        } catch { return; }
        current.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
        current.onstop = async () => {
          const ended = Date.now();
          if (chunks.length && enabledRef.current) {
            const blob = new Blob(chunks, { type: mime });
            if (blob.size > 800) {
              try {
                const audio = await blobBase64(blob);
                await post("/api/meeting-ai", {
                  action: "transcribe",
                  agenda_evento_id: eventId,
                  audio_base64: audio,
                  mime_type: mime,
                  participant_identity: identity,
                  participant_name: participant.name || (participant.isLocal ? "Organizador" : "Participante"),
                  participant_role: participantMetadata(participant)?.role === "host" || participant.isLocal ? "host" : "participant",
                  segment_index: segment++,
                  started_at_ms: started,
                  ended_at_ms: ended,
                }, true);
                onNewText();
              } catch (err) { console.warn("[meeting-ai] transcrição", err); }
            }
          }
          if (!stopped && !disposed && enabledRef.current) window.setTimeout(run, 250);
        };
        current.start();
        timer = window.setTimeout(() => { if (current?.state === "recording") current.stop(); }, 15000);
      };

      run();
      runners.current.set(identity, {
        stop: () => {
          stopped = true;
          if (timer) window.clearTimeout(timer);
          if (current?.state === "recording") { try { current.stop(); } catch {} }
        },
      });
    }

    for (const [identity, runner] of Array.from(runners.current.entries())) {
      if (!participants.some((p) => String(p.identity) === identity)) {
        runner.stop();
        runners.current.delete(identity);
      }
    }

    return () => { disposed = true; };
  }, [room, enabled, eventId, version, onNewText]);

  useEffect(() => () => {
    for (const runner of runners.current.values()) runner.stop();
    runners.current.clear();
  }, []);
}

export default function AgendaSalaV2() {
  const { eventId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const guestMode = searchParams.get("cliente") === "1";
  const isMobile = useIsMobile();

  const [info, setInfo] = useState<EventInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState("");
  const [name, setName] = useState(guestMode ? "" : "Organizador Consulmax");
  const [email, setEmail] = useState("");
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [cameraId, setCameraId] = useState("");
  const [micId, setMicId] = useState("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [previewError, setPreviewError] = useState("");
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const previewStream = useRef<MediaStream | null>(null);

  const [waitingEnabled, setWaitingEnabled] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode>("sales");
  const [recordingPreference, setRecordingPreference] = useState<"manual" | "auto" | "off">("manual");
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);

  const [lobbyRequest, setLobbyRequest] = useState<any>(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [roomVersion, setRoomVersion] = useState(0);
  const [activeSpeaker, setActiveSpeaker] = useState("");
  const [connected, setConnected] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [sharing, setSharing] = useState(false);

  const [panelOpen, setPanelOpen] = useState(!isMobile);
  const [sideTab, setSideTab] = useState<SideTab>("max");
  const [lobby, setLobby] = useState<LobbyRequest[]>([]);
  const [context, setContext] = useState<ContextData | null>(null);
  const [notes, setNotes] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState("");
  const [aiState, setAiState] = useState<AiState>({ transcripts: [], insights: [], report: null, status: "idle" });
  const [aiRefresh, setAiRefresh] = useState(0);
  const [copyOk, setCopyOk] = useState(false);

  const refreshAi = useCallback(() => setAiRefresh((n) => n + 1), []);
  useParticipantTranscription(room, Boolean(connected && !guestMode && aiEnabled && !finalizing), eventId, roomVersion, refreshAi);

  const stopPreview = useCallback(() => {
    previewStream.current?.getTracks().forEach((t) => t.stop());
    previewStream.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
  }, []);

  const startPreview = useCallback(async () => {
    stopPreview();
    setPreviewError("");
    if (!cameraOn && !micOn) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: cameraOn ? { deviceId: cameraId ? { exact: cameraId } : undefined } : false,
        audio: micOn ? { deviceId: micId ? { exact: micId } : undefined } : false,
      });
      previewStream.current = stream;
      if (previewRef.current) { previewRef.current.srcObject = stream; previewRef.current.muted = true; await previewRef.current.play().catch(() => {}); }
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((d) => d.kind === "videoinput"));
      setMics(devices.filter((d) => d.kind === "audioinput"));
    } catch (err: any) {
      setPreviewError("Não foi possível acessar câmera/microfone. Você ainda pode entrar com eles desligados.");
      setCameraOn(false);
      setMicOn(false);
    }
  }, [cameraOn, micOn, cameraId, micId, stopPreview]);

  useEffect(() => { if (!connected && info && !info.finished && !info.cancelled) void startPreview(); return stopPreview; }, [connected, info?.id, cameraOn, micOn, cameraId, micId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await post("/api/livekit-lobby", { action: "info", agenda_evento_id: eventId });
        if (!alive) return;
        const e = data.event as EventInfo;
        setInfo(e);
        setWaitingEnabled(e.waiting_room_enabled !== false);
        setAiEnabled(e.ai_enabled === true);
        setAiMode(e.ai_mode || "sales");
        setRecordingPreference(e.recording_preference || "manual");
        if (!guestMode) {
          const { data: session } = await supabase.auth.getUser();
          const uid = session?.user?.id;
          if (uid) {
            const { data: profile } = await supabase.from("users").select("nome,email").eq("auth_user_id", uid).maybeSingle();
            if (profile?.nome) setName(profile.nome);
            if (profile?.email) setEmail(profile.email);
          }
        }
      } catch (err: any) { setFatal(err?.message || "Reunião não encontrada."); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [eventId, guestMode]);

  useEffect(() => {
    if (guestMode || !eventId) return;
    (async () => {
      try {
        const data = await post("/api/client-context", { agenda_evento_id: eventId }, true);
        setContext(data);
      } catch {}
    })();
  }, [eventId, guestMode]);

  const wireRoom = useCallback((r: Room) => {
    const bump = () => setRoomVersion((n) => n + 1);
    r.on(RoomEvent.ParticipantConnected, bump);
    r.on(RoomEvent.ParticipantDisconnected, bump);
    r.on(RoomEvent.TrackSubscribed, bump);
    r.on(RoomEvent.TrackUnsubscribed, bump);
    r.on(RoomEvent.LocalTrackPublished, bump);
    r.on(RoomEvent.LocalTrackUnpublished, bump);
    r.on(RoomEvent.ActiveSpeakersChanged, (speakers: any[]) => { setActiveSpeaker(String(speakers?.[0]?.identity || "")); bump(); });
    r.on(RoomEvent.Disconnected, () => { setConnected(false); bump(); });
  }, []);

  const connectRoom = useCallback(async (serverUrl: string, token: string) => {
    stopPreview();
    const r = new Room({ adaptiveStream: true, dynacast: true });
    wireRoom(r);
    await r.connect(serverUrl, token);
    if (cameraId) await (r as any).switchActiveDevice?.("videoinput", cameraId).catch(() => {});
    if (micId) await (r as any).switchActiveDevice?.("audioinput", micId).catch(() => {});
    await r.localParticipant.setCameraEnabled(cameraOn).catch(() => setCamEnabled(false));
    await r.localParticipant.setMicrophoneEnabled(micOn).catch(() => setMicEnabled(false));
    setCamEnabled(cameraOn);
    setMicEnabled(micOn);
    setRoom(r);
    setConnected(true);
    setRoomVersion((n) => n + 1);
    return r;
  }, [cameraId, micId, cameraOn, micOn, stopPreview, wireRoom]);

  async function hostJoin() {
    if (!name.trim()) return alert("Informe seu nome na sala.");
    setJoinBusy(true);
    try {
      await post("/api/livekit-room", {
        action: "settings",
        agenda_evento_id: eventId,
        waiting_room_enabled: waitingEnabled,
        ai_enabled: aiEnabled,
        ai_mode: aiMode,
        recording_preference: recordingPreference,
      }, true);
      const data = await post("/api/livekit-room", { agenda_evento_id: eventId, participant_name: name.trim() }, true);
      await connectRoom(data.serverUrl, data.token);
      if (recordingPreference === "auto") window.setTimeout(() => void controlRecording("start", false), 1200);
    } catch (err: any) { alert(err?.message || "Não foi possível entrar na reunião."); }
    finally { setJoinBusy(false); }
  }

  async function guestRequest() {
    if (!name.trim()) return alert("Informe seu nome.");
    setJoinBusy(true);
    try {
      const data = await post("/api/livekit-lobby", {
        action: "request",
        agenda_evento_id: eventId,
        display_name: name.trim(),
        email: email.trim(),
        recording_consent: recordingConsent,
        ai_consent: aiConsent,
      });
      setLobbyRequest(data.request);
    } catch (err: any) { alert(err?.message || "Não foi possível solicitar entrada."); }
    finally { setJoinBusy(false); }
  }

  useEffect(() => {
    if (!guestMode || !lobbyRequest?.id || connected) return;
    let busy = false;
    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const data = await post("/api/livekit-lobby", {
          action: "status",
          agenda_evento_id: eventId,
          request_id: lobbyRequest.id,
          request_token: lobbyRequest.request_token,
        });
        setLobbyRequest((old: any) => ({ ...old, status: data.status }));
        if (data.status === "admitted" && data.token) await connectRoom(data.serverUrl, data.token);
      } catch (err) { console.warn("[lobby]", err); }
      finally { busy = false; }
    };
    void check();
    const timer = window.setInterval(check, 1800);
    return () => window.clearInterval(timer);
  }, [guestMode, lobbyRequest?.id, connected, eventId, connectRoom]);

  const refreshLobby = useCallback(async () => {
    if (guestMode || !connected) return;
    try {
      const data = await post("/api/livekit-lobby", { action: "list", agenda_evento_id: eventId }, true);
      setLobby(data.requests || []);
    } catch {}
  }, [guestMode, connected, eventId]);

  useEffect(() => {
    if (guestMode || !connected) return;
    void refreshLobby();
    const t = window.setInterval(refreshLobby, 2200);
    return () => window.clearInterval(t);
  }, [guestMode, connected, refreshLobby]);

  async function decide(requestId: string | null, decision: "admit" | "deny" | "admit_all") {
    try {
      await post("/api/livekit-lobby", { action: "decide", agenda_evento_id: eventId, request_id: requestId, decision }, true);
      await refreshLobby();
    } catch (err: any) { alert(err?.message || "Não foi possível atualizar a sala de espera."); }
  }

  async function removePerson(identity: string) {
    if (!confirm("Remover esta pessoa da reunião?")) return;
    try { await post("/api/livekit-participant", { action: "remove", agenda_evento_id: eventId, identity }, true); }
    catch (err: any) { alert(err?.message || "Não foi possível remover o participante."); }
  }

  async function controlRecording(action: "start" | "stop" | "status", showAlert = true) {
    if (guestMode) return;
    setRecordingBusy(true);
    try {
      const data = await post("/api/livekit-recording", { agenda_evento_id: eventId, action }, true);
      if (action === "start") { setRecording(true); setRecordingUrl(data.recordingUrl || ""); if (showAlert) alert(data.alreadyRecording ? "A gravação já estava em andamento." : "Gravação iniciada."); }
      if (action === "stop") { setRecording(false); if (showAlert) alert("Gravação encerrada. O arquivo será finalizado no armazenamento."); }
      if (action === "status") { setRecording(Boolean(data.recording)); setRecordingUrl(data.room?.recording_url || ""); }
    } catch (err: any) { if (showAlert) alert("Gravação: " + (err?.message || "falha")); }
    finally { setRecordingBusy(false); }
  }

  useEffect(() => { if (connected && !guestMode) void controlRecording("status", false); }, [connected, guestMode]);

  const loadAiState = useCallback(async () => {
    if (guestMode || !aiEnabled) return;
    try {
      const data = await post("/api/meeting-ai", { action: "state", agenda_evento_id: eventId }, true);
      setAiState({ transcripts: data.transcripts || [], insights: data.insights || [], report: data.report || null, status: data.status || "idle" });
    } catch (err) { console.warn("[meeting-ai] state", err); }
  }, [guestMode, aiEnabled, eventId]);

  useEffect(() => { if (!guestMode && aiEnabled && (connected || info?.finished)) void loadAiState(); }, [guestMode, aiEnabled, connected, info?.finished, aiRefresh, loadAiState]);
  useEffect(() => {
    if (guestMode || !connected || !aiEnabled) return;
    const s = window.setInterval(loadAiState, 10000);
    const c = window.setInterval(async () => {
      try { await post("/api/meeting-ai", { action: "coach", agenda_evento_id: eventId }, true); await loadAiState(); } catch {}
    }, 45000);
    return () => { window.clearInterval(s); window.clearInterval(c); };
  }, [guestMode, connected, aiEnabled, eventId, loadAiState]);

  async function saveNote() {
    if (!notes.trim()) return;
    setSavingNote(true);
    try {
      const data = await post("/api/meeting-note", { agenda_evento_id: eventId, raw_notes: notes.trim(), next_steps: "", action: "save" }, true);
      setNotes("");
      setContext((old) => ({ ...(old || {}), meeting_notes: [data.note, ...(old?.meeting_notes || [])].filter(Boolean) }));
    } catch (err: any) { alert(err?.message || "Não foi possível salvar a nota."); }
    finally { setSavingNote(false); }
  }

  async function finishMeeting() {
    if (!confirm("Finalizar esta reunião para todos? A gravação será encerrada e, se o Max IA estiver ativo, a análise final será gerada.")) return;
    setFinalizing(true);
    try {
      if (recording) await controlRecording("stop", false);
      if (aiEnabled) {
        await new Promise((r) => setTimeout(r, 1200));
        try {
          const ai = await post("/api/meeting-ai", { action: "finalize", agenda_evento_id: eventId }, true);
          if (ai.report) setAiState((old) => ({ ...old, report: ai.report, status: "completed" }));
        } catch (err: any) { console.warn("[meeting-ai] relatório final", err); }
      }
      await post("/api/meeting-note", { agenda_evento_id: eventId, raw_notes: notes.trim() || "Reunião finalizada.", next_steps: "", action: "finish" }, true);
      room?.disconnect();
      setConnected(false);
      setInfo((old) => old ? { ...old, finished: true } : old);
    } catch (err: any) { alert(err?.message || "Não foi possível finalizar a reunião."); }
    finally { setFinalizing(false); }
  }

  async function toggleMic() {
    if (!room) return;
    const next = !micEnabled;
    try { await room.localParticipant.setMicrophoneEnabled(next); setMicEnabled(next); setRoomVersion((n) => n + 1); } catch {}
  }
  async function toggleCam() {
    if (!room) return;
    const next = !camEnabled;
    try { await room.localParticipant.setCameraEnabled(next); setCamEnabled(next); setRoomVersion((n) => n + 1); } catch {}
  }
  async function toggleShare() {
    if (!room) return;
    const next = !sharing;
    try { await room.localParticipant.setScreenShareEnabled(next); setSharing(next); setRoomVersion((n) => n + 1); } catch (err: any) { alert(err?.message || "Não foi possível compartilhar a tela."); }
  }
  function leave() { room?.disconnect(); setConnected(false); setRoom(null); }

  const participants = useMemo(() => room ? [room.localParticipant, ...Array.from(room.remoteParticipants.values())] as any[] : [], [room, roomVersion]);
  const screenParticipant = participants.find((p) => p.getTrackPublication?.(Track.Source.ScreenShare)?.track && !p.getTrackPublication?.(Track.Source.ScreenShare)?.isMuted);
  const speaker = participants.find((p) => String(p.identity) === activeSpeaker) || participants.find((p) => !p.isLocal) || participants[0];
  const pendingLobby = lobby.filter((x) => x.status === "pending");
  const report = aiState.report?.report || aiState.report || null;
  const latestInsight = aiState.insights?.find((x: any) => !x.acknowledged_at) || aiState.insights?.[0];

  if (loading) return <div className="cm-page"><div className="cm-center-card">Carregando Consulmax Meet...</div><Styles /></div>;
  if (fatal || !info) return <div className="cm-page"><div className="cm-center-card"><h2>Não foi possível abrir a reunião</h2><p>{fatal}</p><Link to="/agenda">Voltar para Agenda</Link></div><Styles /></div>;
  if (info.cancelled) return <div className="cm-page"><div className="cm-center-card"><ShieldCheck size={34} /><h2>Reunião cancelada</h2><p>Este compromisso foi cancelado pelo organizador.</p></div><Styles /></div>;

  if (info.finished && !connected) {
    return <div className="cm-page"><div className="cm-report-shell">
      <div className="cm-report-head"><div><span className="cm-eyebrow">Consulmax Meet</span><h1>{info.titulo}</h1><p>Reunião encerrada • {fmt(info.inicio_at)}</p></div>{!guestMode && <Link className="cm-btn ghost" to="/agenda"><ChevronLeft size={16}/> Agenda</Link>}</div>
      {guestMode ? <div className="cm-center-card"><Check size={34}/><h2>Reunião encerrada</h2><p>Obrigado pela participação.</p></div> : aiEnabled ? (
        <div className="cm-final-report">
          <section><span className="cm-eyebrow">Max IA • análise privada</span><h2>{report ? "Análise da reunião" : aiState.status === "failed" ? "A análise não pôde ser concluída" : "Análise da reunião"}</h2>{!report && <p>Se a reunião possui transcrição, atualize esta página em instantes.</p>}</section>
          {report && <>
            <div className="cm-score"><strong>{Math.round(Number(report.score || 0))}</strong><span>Qualidade da condução</span></div>
            <ReportBlock title="Resumo executivo" text={report.executive_summary || aiState.report?.executive_summary}/>
            <ReportBlock title="Ata" text={report.minutes || aiState.report?.minutes_text}/>
            <ReportList title="Pontos fortes" items={report.strong_points}/><ReportList title="Pontos de atenção" items={report.attention_points}/>
            <ReportList title="Objeções" items={report.objections}/><ReportList title="Sinais de compra" items={report.buying_signals}/>
            <ReportBlock title="Próximo passo recomendado" text={report.recommended_next_step}/>
          </>}
        </div>
      ) : <div className="cm-center-card"><Check size={34}/><h2>Reunião encerrada</h2><p>O atendimento foi finalizado e registrado.</p></div>}
    </div><Styles /></div>;
  }

  if (!connected) {
    if (guestMode && lobbyRequest?.status && lobbyRequest.status !== "admitted") {
      return <div className="cm-page"><div className="cm-wait-card">
        <div className="cm-logo-mark"><Video size={24}/></div>
        {lobbyRequest.status === "denied" ? <><h1>Entrada não autorizada</h1><p>O organizador não autorizou sua entrada nesta reunião.</p></> : lobbyRequest.status === "expired" ? <><h1>Solicitação expirada</h1><p>Atualize o link para solicitar entrada novamente.</p></> : <><span className="cm-live-dot"><i/> Sala de espera</span><h1>Pronto! Avisamos o organizador.</h1><p>Você entrará automaticamente assim que sua participação for aprovada.</p><div className="cm-wait-person"><span>{initials(name)}</span><div><strong>{name}</strong><small>Aguardando aprovação...</small></div></div></>}
      </div><Styles /></div>;
    }

    return <div className="cm-page"><div className="cm-prejoin">
      <section className="cm-preview-side">
        <div className="cm-preview-top"><span className="cm-brand"><Video size={18}/> Consulmax Meet</span><span>{fmt(info.inicio_at)}</span></div>
        <div className="cm-preview-video">{cameraOn ? <video ref={previewRef} autoPlay playsInline muted /> : <div className="cm-avatar preview"><span>{initials(name || "Participante")}</span></div>}<div className="cm-preview-controls"><button onClick={() => setMicOn((v) => !v)} className={!micOn ? "off" : ""}>{micOn ? <Mic/> : <MicOff/>}</button><button onClick={() => setCameraOn((v) => !v)} className={!cameraOn ? "off" : ""}>{cameraOn ? <Camera/> : <CameraOff/>}</button></div></div>
        {previewError && <p className="cm-warning">{previewError}</p>}
        <div className="cm-device-row"><label>Microfone<select value={micId} onChange={(e) => setMicId(e.target.value)}><option value="">Padrão do dispositivo</option>{mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Microfone"}</option>)}</select></label><label>Câmera<select value={cameraId} onChange={(e) => setCameraId(e.target.value)}><option value="">Padrão do dispositivo</option>{cameras.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Câmera"}</option>)}</select></label></div>
      </section>
      <aside className="cm-prejoin-panel"><span className="cm-eyebrow">{guestMode ? "Você foi convidado" : "Preparar reunião"}</span><h1>{info.titulo}</h1><p className="cm-sub">Organizada por {info.organizer_name}</p>
        <label className="cm-field">Nome na sala<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" /></label>
        {guestMode && <label className="cm-field">E-mail <small>(opcional)</small><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="voce@email.com" /></label>}
        {!guestMode && <div className="cm-settings">
          <Toggle label="Sala de espera" detail="Você aprova quem entra" value={waitingEnabled} onChange={setWaitingEnabled}/>
          <Toggle label="Max IA" detail="Transcrição, coach e análise final privados" value={aiEnabled} onChange={setAiEnabled}/>
          {aiEnabled && <label className="cm-field compact">Tipo da reunião<select value={aiMode} onChange={(e) => setAiMode(e.target.value as AiMode)}><option value="sales">Venda</option><option value="service">Atendimento</option><option value="success">Sucesso do Cliente</option><option value="internal">Reunião interna</option><option value="minutes">Ata somente</option></select></label>}
          <label className="cm-field compact">Gravação<select value={recordingPreference} onChange={(e) => setRecordingPreference(e.target.value as any)}><option value="manual">Manual</option><option value="auto">Iniciar automaticamente</option><option value="off">Não gravar</option></select></label>
        </div>}
        {guestMode && <div className="cm-consents">
          {info.recording_preference !== "off" && <label><input type="checkbox" checked={recordingConsent} onChange={(e) => setRecordingConsent(e.target.checked)}/><span>Estou ciente de que esta reunião poderá ser gravada para registro do atendimento.</span></label>}
          {info.ai_enabled && <label><input type="checkbox" checked={aiConsent} onChange={(e) => setAiConsent(e.target.checked)}/><span>Estou ciente de que a reunião utiliza transcrição e IA para gerar apoio e análise ao organizador.</span></label>}
        </div>}
        <button className="cm-btn primary wide" disabled={joinBusy} onClick={guestMode ? guestRequest : hostJoin}>{joinBusy ? "Preparando..." : guestMode ? "Solicitar entrada" : "Entrar na reunião"}</button>
        {!guestMode && <Link to="/agenda" className="cm-back">Voltar para Agenda</Link>}
      </aside>
    </div><Styles /></div>;
  }

  return <div className="cm-meet">
    <header className="cm-meet-header"><div className="cm-meet-title"><span className="cm-brand"><Video size={17}/> Consulmax Meet</span><div><strong>{info.titulo}</strong><small>{participants.length} participante{participants.length === 1 ? "" : "s"}</small></div></div><div className="cm-head-pills">{recording && <span className="cm-pill rec"><CircleDot size={13}/> Gravando</span>}{!guestMode && aiEnabled && <span className="cm-pill ai"><Sparkles size={13}/> Max IA</span>}{!guestMode && pendingLobby.length > 0 && <button className="cm-pill wait" onClick={() => { setPanelOpen(true); setSideTab("people"); }}><Users size={13}/> {pendingLobby.length} aguardando</button>}</div></header>

    <main className={`cm-meet-main ${panelOpen && !guestMode ? "with-panel" : ""}`}>
      <section className="cm-stage">
        {screenParticipant ? <div className="cm-stage-main"><ParticipantTile participant={screenParticipant} screen large/><div className="cm-filmstrip">{participants.map((p) => <ParticipantTile key={p.identity} participant={p} active={p.identity === activeSpeaker}/>)}</div></div> : (isMobile && participants.length > 1) || participants.length > 4 ? <div className="cm-stage-main"><ParticipantTile participant={speaker} large active/><div className="cm-filmstrip">{participants.filter((p) => p !== speaker).map((p) => <ParticipantTile key={p.identity} participant={p} active={p.identity === activeSpeaker}/>)}</div></div> : <div className={`cm-grid count-${Math.min(participants.length, 4)}`}>{participants.map((p) => <ParticipantTile key={p.identity} participant={p} large active={p.identity === activeSpeaker}/>)}</div>}
        {room && <RemoteAudio room={room} version={roomVersion}/>} 
      </section>

      {!guestMode && panelOpen && <aside className="cm-side">
        <div className="cm-side-head"><div className="cm-side-tabs"><button className={sideTab === "max" ? "active" : ""} onClick={() => setSideTab("max")}><Bot size={16}/><span>Max IA</span></button><button className={sideTab === "client" ? "active" : ""} onClick={() => setSideTab("client")}><ShieldCheck size={16}/><span>Cliente</span></button><button className={sideTab === "notes" ? "active" : ""} onClick={() => setSideTab("notes")}><ClipboardList size={16}/><span>Notas</span></button><button className={sideTab === "people" ? "active" : ""} onClick={() => setSideTab("people")}><Users size={16}/><span>Pessoas</span>{pendingLobby.length > 0 && <i>{pendingLobby.length}</i>}</button></div><button className="cm-icon-btn" onClick={() => setPanelOpen(false)}><PanelRightClose size={18}/></button></div>
        <div className="cm-side-body">
          {sideTab === "max" && <MaxPanel enabled={aiEnabled} state={aiState} latest={latestInsight} report={report}/>} 
          {sideTab === "client" && <ClientPanel context={context}/>} 
          {sideTab === "notes" && <NotesPanel notes={notes} setNotes={setNotes} save={saveNote} busy={savingNote} history={context?.meeting_notes || []}/>} 
          {sideTab === "people" && <PeoplePanel participants={participants} lobby={lobby} decide={decide} remove={removePerson}/>} 
        </div>
      </aside>}
    </main>

    <footer className="cm-controls"><div className="cm-control-group"><button className={!micEnabled ? "off" : ""} onClick={toggleMic} title="Microfone">{micEnabled ? <Mic/> : <MicOff/>}</button><button className={!camEnabled ? "off" : ""} onClick={toggleCam} title="Câmera">{camEnabled ? <Camera/> : <CameraOff/>}</button><button className={sharing ? "active" : ""} onClick={toggleShare} title="Compartilhar tela"><MonitorUp/></button>{!guestMode && recordingPreference !== "off" && <button className={recording ? "recording" : ""} disabled={recordingBusy} onClick={() => controlRecording(recording ? "stop" : "start")} title={recording ? "Parar gravação" : "Gravar"}>{recording ? <Square/> : <CircleDot/>}</button>}{!guestMode && !panelOpen && <button onClick={() => setPanelOpen(true)} title="Abrir painel"><PanelRightOpen/></button>}</div><div className="cm-control-end">{!guestMode && <button className="cm-finish" disabled={finalizing} onClick={finishMeeting}>{finalizing ? "Finalizando..." : "Finalizar reunião"}</button>}<button className="cm-leave" onClick={leave} title="Sair"><PhoneOff/></button></div></footer>
    <Styles />
  </div>;
}

function Toggle({ label, detail, value, onChange }: { label: string; detail: string; value: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" className="cm-toggle-row" onClick={() => onChange(!value)}><span><strong>{label}</strong><small>{detail}</small></span><i className={value ? "on" : ""}><b/></i></button>;
}

function MaxPanel({ enabled, state, latest, report }: any) {
  if (!enabled) return <div className="cm-empty"><Bot size={28}/><strong>Max IA está desligado</strong><p>Ative o Max IA antes de entrar na reunião para receber transcrição, coach ao vivo e análise final.</p></div>;
  return <div className="cm-max-panel">
    <div className="cm-ai-status"><span><i/> Analisando a conversa</span><small>Privado para o organizador</small></div>
    {latest ? <div className={`cm-coach-card ${latest.priority || "medium"}`}><span className="cm-eyebrow">Momento da reunião • {latest.meeting_stage || "Em andamento"}</span><h3>{latest.title}</h3><p>{latest.insight}</p>{latest.suggested_phrase && <div className="cm-next-say"><small>Próxima fala sugerida</small><strong>“{latest.suggested_phrase}”</strong></div>}</div> : <div className="cm-empty compact"><Sparkles size={22}/><strong>Max está ouvindo</strong><p>As sugestões aparecem somente quando houver algo realmente útil para a conversa.</p></div>}
    <section className="cm-side-section"><div className="cm-section-title"><strong>Transcrição ao vivo</strong><span>{state.transcripts?.length || 0} trechos</span></div><div className="cm-transcript">{state.transcripts?.length ? state.transcripts.slice(-12).map((t: any) => <div key={t.id}><strong>{t.participant_name}</strong><p>{t.transcript_text}</p></div>) : <p className="cm-muted">A transcrição começará quando houver fala na reunião.</p>}</div></section>
    {report && <section className="cm-side-section"><div className="cm-section-title"><strong>Análise final</strong><span>{Math.round(Number(report.score || 0))}/100</span></div><p>{report.executive_summary}</p></section>}
  </div>;
}

function ClientPanel({ context }: { context: ContextData | null }) {
  const p = context?.cliente || context?.lead;
  const c = context?.carteira;
  return <div className="cm-client-panel"><div className="cm-client-hero"><span>{initials(p?.nome || "Cliente")}</span><div><strong>{p?.nome || "Sem cliente vinculado"}</strong><small>{p?.telefone || p?.email || ""}</small></div></div><div className="cm-kpis"><Kpi value={c?.qtd_ativas || 0} label="Ativas"/><Kpi value={c?.qtd_contempladas || 0} label="Contempladas"/><Kpi value={c?.qtd_inadimplentes || 0} label="Inad."/><Kpi value={c?.qtd_total || 0} label="Total"/></div><Info label="Carteira ativa" value={c?.total_ativo_fmt || "R$ 0,00"}/><Info label="Segmentos" value={c?.segmentos?.join(", ") || "—"}/><Info label="Administradoras" value={c?.administradoras?.join(", ") || "—"}/>{p?.observacoes && <Info label="Observações" value={p.observacoes}/>}</div>;
}
function Kpi({ value, label }: any) { return <div><strong>{value}</strong><span>{label}</span></div>; }
function Info({ label, value }: any) { return <div className="cm-info"><span>{label}</span><strong>{value}</strong></div>; }

function NotesPanel({ notes, setNotes, save, busy, history }: any) {
  return <div className="cm-notes"><label>Notas privadas<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Registre informações importantes da reunião..."/></label><button className="cm-btn secondary wide" disabled={busy || !notes.trim()} onClick={save}><Save size={15}/>{busy ? "Salvando..." : "Salvar nota"}</button><section className="cm-side-section"><div className="cm-section-title"><strong>Histórico</strong><span>{history.length}</span></div>{history.length ? history.slice(0, 8).map((n: any, i: number) => <div className="cm-history" key={n.id || i}><small>{fmt(n.created_at)}</small><p>{n.raw_notes || n.ai_summary || "—"}</p></div>) : <p className="cm-muted">Nenhuma nota registrada.</p>}</section></div>;
}

function PeoplePanel({ participants, lobby, decide, remove }: any) {
  const pending = lobby.filter((x: any) => x.status === "pending");
  return <div className="cm-people">{pending.length > 0 && <section><div className="cm-section-title"><strong>Sala de espera</strong><button onClick={() => decide(null, "admit_all")}>Admitir todos</button></div>{pending.map((r: any) => <div className="cm-person-row" key={r.id}><span className="cm-mini-avatar">{initials(r.display_name)}</span><div><strong>{r.display_name}</strong><small>{r.email || "Solicitando entrada"}</small></div><div className="cm-row-actions"><button className="ok" onClick={() => decide(r.id, "admit")}><UserCheck size={16}/></button><button onClick={() => decide(r.id, "deny")}><X size={16}/></button></div></div>)}</section>}<section className="cm-side-section"><div className="cm-section-title"><strong>Na reunião</strong><span>{participants.length}</span></div>{participants.map((p: any) => <div className="cm-person-row" key={p.identity}><span className="cm-mini-avatar">{initials(p.name)}</span><div><strong>{p.name || "Participante"}</strong><small>{participantMetadata(p)?.role === "host" ? "Organizador" : "Participante"}</small></div>{!p.isLocal && <button className="cm-remove" onClick={() => remove(p.identity)} title="Remover"><UserMinus size={16}/></button>}</div>)}</section></div>;
}

function ReportBlock({ title, text }: { title: string; text?: string }) { if (!text) return null; return <section className="cm-report-block"><h3>{title}</h3><p>{text}</p></section>; }
function ReportList({ title, items }: { title: string; items?: string[] }) { if (!items?.length) return null; return <section className="cm-report-block"><h3>{title}</h3><ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul></section>; }

function Styles() { return <style>{`
*{box-sizing:border-box}.cm-page,.cm-meet{min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1E293F}.cm-page{display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 10% 0%,rgba(181,165,115,.14),transparent 28%),radial-gradient(circle at 100% 100%,rgba(161,28,39,.10),transparent 32%),#f4f6f9}.cm-center-card,.cm-wait-card{width:min(560px,100%);background:#fff;border:1px solid #e7eaf0;border-radius:24px;padding:32px;box-shadow:0 24px 70px rgba(30,41,63,.12);text-align:center}.cm-center-card h2,.cm-wait-card h1{margin:12px 0 8px}.cm-center-card p,.cm-wait-card p{color:#64748b;line-height:1.6}.cm-center-card a{color:#A11C27;font-weight:800}.cm-prejoin{width:min(1180px,96vw);min-height:660px;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(360px,.65fr);background:#fff;border-radius:28px;overflow:hidden;box-shadow:0 28px 90px rgba(30,41,63,.16);border:1px solid #e7eaf0}.cm-preview-side{padding:26px;background:#121827;display:flex;flex-direction:column;gap:16px;color:#fff}.cm-preview-top{display:flex;justify-content:space-between;gap:12px;align-items:center;color:#cbd5e1;font-size:13px}.cm-brand{display:inline-flex;align-items:center;gap:8px;font-weight:850;letter-spacing:-.02em}.cm-preview-video{position:relative;flex:1;min-height:390px;border-radius:22px;overflow:hidden;background:#090d16;display:grid;place-items:center}.cm-preview-video video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}.cm-preview-controls{position:absolute;bottom:18px;display:flex;gap:10px}.cm-preview-controls button,.cm-controls button,.cm-icon-btn{border:0;cursor:pointer}.cm-preview-controls button{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.15);color:white;backdrop-filter:blur(8px)}.cm-preview-controls button.off{background:#A11C27}.cm-device-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cm-device-row label{font-size:11px;color:#94a3b8;display:grid;gap:5px}.cm-device-row select{background:#20283a;color:#fff;border:1px solid #344057;border-radius:10px;padding:10px;min-width:0}.cm-warning{margin:0;color:#fecaca;font-size:12px}.cm-prejoin-panel{padding:38px 34px;display:flex;flex-direction:column;justify-content:center;gap:14px}.cm-eyebrow{color:#A11C27;text-transform:uppercase;font-weight:900;font-size:10px;letter-spacing:.12em}.cm-prejoin-panel h1{font-size:27px;line-height:1.08;margin:0;letter-spacing:-.035em}.cm-sub{margin:-5px 0 4px;color:#64748b}.cm-field{display:grid;gap:6px;font-size:12px;font-weight:800;color:#475569}.cm-field small{font-weight:500}.cm-field input,.cm-field select,.cm-notes textarea{width:100%;border:1px solid #dfe4eb;border-radius:12px;padding:12px 13px;background:#fff;color:#1E293F;outline:none}.cm-field input:focus,.cm-field select:focus,.cm-notes textarea:focus{border-color:#B5A573;box-shadow:0 0 0 3px rgba(181,165,115,.12)}.cm-field.compact{margin-top:4px}.cm-settings{display:grid;gap:7px;padding:10px 0}.cm-toggle-row{width:100%;border:1px solid #e5e9ef;background:#fafbfc;border-radius:14px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;text-align:left}.cm-toggle-row span{display:grid;gap:2px}.cm-toggle-row strong{font-size:12px}.cm-toggle-row small{color:#64748b;font-size:10px}.cm-toggle-row i{width:38px;height:22px;background:#d8dee7;border-radius:20px;padding:3px;display:block;transition:.2s}.cm-toggle-row i b{display:block;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 2px 4px #0002;transition:.2s}.cm-toggle-row i.on{background:#1E293F}.cm-toggle-row i.on b{transform:translateX(16px)}.cm-consents{display:grid;gap:10px;background:#f8fafc;border-radius:14px;padding:12px}.cm-consents label{display:flex;align-items:flex-start;gap:9px;font-size:11px;line-height:1.45;color:#475569}.cm-consents input{margin-top:2px;accent-color:#A11C27}.cm-btn{border:0;border-radius:12px;padding:11px 15px;font-weight:850;display:inline-flex;gap:8px;align-items:center;justify-content:center;cursor:pointer;text-decoration:none}.cm-btn.primary{background:#A11C27;color:white}.cm-btn.secondary{background:#1E293F;color:white}.cm-btn.ghost{background:#f1f5f9;color:#1E293F}.cm-btn.wide{width:100%}.cm-btn:disabled{opacity:.55;cursor:not-allowed}.cm-back{text-align:center;color:#64748b;font-size:12px;text-decoration:none}.cm-logo-mark{width:56px;height:56px;margin:auto;border-radius:18px;background:#1E293F;color:#fff;display:grid;place-items:center}.cm-live-dot{display:inline-flex;gap:7px;align-items:center;color:#A11C27;font-size:11px;font-weight:900;text-transform:uppercase}.cm-live-dot i,.cm-ai-status i{width:8px;height:8px;border-radius:50%;background:#A11C27;box-shadow:0 0 0 5px rgba(161,28,39,.10)}.cm-wait-person{display:flex;align-items:center;gap:12px;text-align:left;background:#f8fafc;border-radius:16px;padding:12px 14px;margin-top:18px}.cm-wait-person>span,.cm-mini-avatar,.cm-client-hero>span{display:grid;place-items:center;border-radius:50%;background:#1E293F;color:#fff;font-weight:900}.cm-wait-person>span{width:44px;height:44px}.cm-wait-person div{display:grid}.cm-wait-person small{color:#64748b}.cm-meet{height:100dvh;background:#0c111d;color:white;display:grid;grid-template-rows:58px minmax(0,1fr) 76px;overflow:hidden}.cm-meet-header{display:flex;justify-content:space-between;align-items:center;padding:0 18px;border-bottom:1px solid #ffffff12;background:#111827}.cm-meet-title{display:flex;gap:18px;align-items:center;min-width:0}.cm-meet-title>div{display:grid;min-width:0}.cm-meet-title strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px}.cm-meet-title small{color:#94a3b8;font-size:10px}.cm-head-pills{display:flex;gap:7px}.cm-pill{border:1px solid #ffffff18;background:#ffffff0d;color:#cbd5e1;border-radius:999px;padding:6px 9px;display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:800}.cm-pill.rec{color:#fecaca;border-color:#A11C2766}.cm-pill.ai{color:#f5e9bd;border-color:#B5A57366}.cm-pill.wait{cursor:pointer;color:#fff}.cm-meet-main{min-height:0;display:grid;grid-template-columns:1fr;transition:.2s}.cm-meet-main.with-panel{grid-template-columns:minmax(0,1fr) 360px}.cm-stage{min-width:0;min-height:0;padding:12px;overflow:hidden}.cm-grid{height:100%;display:grid;gap:10px}.cm-grid.count-1{grid-template-columns:1fr}.cm-grid.count-2{grid-template-columns:1fr 1fr}.cm-grid.count-3,.cm-grid.count-4{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}.cm-stage-main{height:100%;display:grid;grid-template-rows:minmax(0,1fr) 122px;gap:10px}.cm-stage-main>.cm-tile{min-height:0}.cm-filmstrip{display:flex;gap:8px;overflow-x:auto;overflow-y:hidden}.cm-filmstrip .cm-tile{flex:0 0 190px}.cm-tile{position:relative;min-width:0;min-height:0;border-radius:16px;overflow:hidden;background:#171f30;border:1px solid #ffffff12;display:grid;place-items:center}.cm-tile.active{border-color:#B5A573;box-shadow:inset 0 0 0 1px #B5A57355}.cm-video-el{width:100%;height:100%;object-fit:cover;background:#080b12}.cm-tile.screen .cm-video-el{object-fit:contain}.cm-avatar{display:grid;place-items:center;gap:8px}.cm-avatar>span{width:72px;height:72px;border-radius:50%;background:linear-gradient(145deg,#263551,#1E293F);display:grid;place-items:center;font-size:24px;font-weight:900;color:#E0CE8C}.cm-avatar small{color:#cbd5e1}.cm-avatar.preview>span{width:92px;height:92px}.cm-tile-foot{position:absolute;bottom:8px;left:8px;right:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:10px}.cm-tile-foot>span:first-child{background:#080b12aa;padding:5px 8px;border-radius:8px;backdrop-filter:blur(6px);max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cm-tile-foot .muted{background:#A11C27;padding:5px;border-radius:50%;display:grid}.cm-host-pill{position:absolute;top:8px;left:8px;background:#B5A573;color:#1E293F;font-size:9px;font-weight:900;padding:5px 7px;border-radius:7px}.cm-side{min-height:0;background:#fff;color:#1E293F;border-left:1px solid #1f2937;display:grid;grid-template-rows:auto minmax(0,1fr)}.cm-side-head{padding:9px;border-bottom:1px solid #e6eaf0;display:flex;gap:6px;align-items:center}.cm-side-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;flex:1}.cm-side-tabs button{position:relative;border:0;background:transparent;border-radius:9px;padding:7px 3px;color:#64748b;display:grid;place-items:center;gap:2px;font-size:8px;cursor:pointer}.cm-side-tabs button.active{background:#f2f4f7;color:#A11C27}.cm-side-tabs button i{position:absolute;right:4px;top:2px;width:15px;height:15px;border-radius:50%;background:#A11C27;color:white;font-style:normal;display:grid;place-items:center;font-size:8px}.cm-icon-btn{background:#f1f5f9;color:#64748b;width:32px;height:32px;border-radius:9px;display:grid;place-items:center}.cm-side-body{min-height:0;overflow-y:auto;padding:14px}.cm-ai-status{display:flex;justify-content:space-between;gap:8px;align-items:center;padding-bottom:12px}.cm-ai-status span{display:flex;align-items:center;gap:8px;color:#A11C27;font-size:10px;font-weight:900}.cm-ai-status small{color:#94a3b8;font-size:9px}.cm-coach-card{border:1px solid #e6eaf0;border-left:4px solid #B5A573;border-radius:14px;padding:14px;background:#fffdf7}.cm-coach-card.high{border-left-color:#A11C27;background:#fff9f9}.cm-coach-card h3{margin:5px 0 6px;font-size:15px}.cm-coach-card p{margin:0;color:#475569;font-size:11px;line-height:1.55}.cm-next-say{margin-top:12px;background:#1E293F;color:white;border-radius:11px;padding:11px;display:grid;gap:4px}.cm-next-say small{color:#E0CE8C;font-size:9px;text-transform:uppercase;font-weight:900}.cm-next-say strong{font-size:12px;line-height:1.45}.cm-empty{display:grid;place-items:center;text-align:center;padding:28px 12px;color:#64748b}.cm-empty.compact{padding:20px 10px}.cm-empty strong{color:#1E293F;margin-top:8px}.cm-empty p{font-size:11px;line-height:1.5}.cm-side-section{margin-top:16px;padding-top:14px;border-top:1px solid #e9edf2}.cm-section-title{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:10px}.cm-section-title strong{font-size:11px;text-transform:uppercase;letter-spacing:.05em}.cm-section-title span{font-size:9px;color:#94a3b8}.cm-section-title button{border:0;background:transparent;color:#A11C27;font-size:9px;font-weight:900;cursor:pointer}.cm-transcript{display:grid;gap:8px}.cm-transcript>div{background:#f7f8fa;border-radius:10px;padding:9px}.cm-transcript strong{font-size:9px;color:#A11C27}.cm-transcript p,.cm-side-section p{font-size:10px;line-height:1.5;margin:3px 0 0;color:#475569}.cm-muted{color:#94a3b8!important}.cm-client-hero{display:flex;align-items:center;gap:10px;padding:8px 0 14px}.cm-client-hero>span{width:42px;height:42px}.cm-client-hero>div{display:grid}.cm-client-hero small{color:#64748b}.cm-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.cm-kpis>div{background:#f7f8fa;border-radius:10px;padding:9px 4px;text-align:center;display:grid}.cm-kpis strong{font-size:15px}.cm-kpis span{font-size:8px;color:#64748b}.cm-info{display:grid;gap:3px;padding:11px 0;border-bottom:1px solid #eef1f4}.cm-info span{font-size:9px;color:#64748b;text-transform:uppercase}.cm-info strong{font-size:11px;line-height:1.4}.cm-notes label{display:grid;gap:6px;font-size:10px;font-weight:800}.cm-notes textarea{min-height:140px;resize:vertical;font-family:inherit}.cm-history{padding:9px;background:#f8fafc;border-radius:9px;margin-bottom:7px}.cm-history small{font-size:8px;color:#94a3b8}.cm-history p{font-size:10px;margin:4px 0;white-space:pre-wrap}.cm-person-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid #eef1f4}.cm-mini-avatar{width:34px;height:34px;font-size:10px}.cm-person-row>div{display:grid;min-width:0}.cm-person-row strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cm-person-row small{font-size:8px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cm-row-actions{display:flex!important;grid-auto-flow:column;gap:4px}.cm-row-actions button,.cm-remove{border:0;width:30px;height:30px;border-radius:8px;background:#f2f4f7;color:#64748b;display:grid;place-items:center;cursor:pointer}.cm-row-actions button.ok{background:#ecfdf5;color:#047857}.cm-remove{background:#fff1f2;color:#A11C27}.cm-controls{display:flex;align-items:center;justify-content:center;position:relative;padding:9px 16px;background:#111827;border-top:1px solid #ffffff12}.cm-control-group{display:flex;gap:8px}.cm-control-group button{width:46px;height:46px;border-radius:14px;background:#252f42;color:#fff;display:grid;place-items:center}.cm-control-group button.off,.cm-control-group button.recording{background:#A11C27}.cm-control-group button.active{background:#B5A573;color:#1E293F}.cm-control-end{position:absolute;right:16px;display:flex;gap:8px}.cm-leave{width:48px!important;height:46px!important;border-radius:14px!important;background:#A11C27!important;color:white}.cm-finish{border:1px solid #ffffff20!important;background:#ffffff10!important;color:#fff;border-radius:12px!important;padding:0 14px!important;font-size:11px;font-weight:850}.cm-report-shell{width:min(1000px,96vw);display:grid;gap:14px}.cm-report-head{background:#fff;border-radius:20px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 14px 40px rgba(30,41,63,.08)}.cm-report-head h1{font-size:20px;margin:4px 0}.cm-report-head p{margin:0;color:#64748b;font-size:11px}.cm-final-report{background:#fff;border-radius:22px;padding:24px;display:grid;grid-template-columns:1fr 1fr;gap:14px;box-shadow:0 18px 50px rgba(30,41,63,.09)}.cm-final-report>section:first-child{grid-column:1/-1}.cm-score{grid-column:1/-1;background:#1E293F;color:white;border-radius:16px;padding:18px;display:flex;align-items:end;gap:12px}.cm-score strong{font-size:42px;color:#E0CE8C}.cm-score span{padding-bottom:7px}.cm-report-block{border:1px solid #e7eaf0;border-radius:14px;padding:15px}.cm-report-block h3{font-size:12px;margin:0 0 7px;color:#A11C27}.cm-report-block p,.cm-report-block li{font-size:11px;line-height:1.6;color:#475569;white-space:pre-wrap}.cm-report-block ul{padding-left:18px;margin:0}.cm-record-link{color:#E0CE8C}
@media(max-width:900px){.cm-prejoin{grid-template-columns:1fr;max-height:96vh;overflow:auto}.cm-preview-side{min-height:420px}.cm-preview-video{min-height:300px}.cm-meet-main.with-panel{grid-template-columns:minmax(0,1fr) 320px}.cm-control-end{position:static;margin-left:auto}}
@media(max-width:760px){.cm-page{padding:0;display:block;background:#fff}.cm-prejoin{width:100%;min-height:100dvh;border-radius:0;box-shadow:none;border:0}.cm-preview-side{padding:14px;min-height:46dvh}.cm-preview-top>span:last-child{display:none}.cm-preview-video{min-height:280px;border-radius:18px}.cm-device-row{grid-template-columns:1fr}.cm-prejoin-panel{padding:24px 18px 32px;justify-content:flex-start}.cm-prejoin-panel h1{font-size:23px}.cm-meet{grid-template-rows:52px minmax(0,1fr) 72px}.cm-meet-header{padding:0 10px}.cm-meet-title .cm-brand{font-size:0;gap:0}.cm-meet-title{gap:8px}.cm-head-pills .cm-pill span{display:none}.cm-pill{padding:6px}.cm-meet-main.with-panel{grid-template-columns:1fr}.cm-stage{padding:6px}.cm-stage-main{grid-template-rows:minmax(0,1fr) 104px;gap:6px}.cm-filmstrip{gap:6px}.cm-filmstrip .cm-tile{flex-basis:132px}.cm-tile{border-radius:12px}.cm-avatar>span{width:58px;height:58px}.cm-side{position:fixed;inset:52px 0 72px 0;z-index:30;border-left:0}.cm-controls{padding:8px}.cm-control-group{gap:5px}.cm-control-group button{width:42px;height:42px;border-radius:12px}.cm-finish{display:none}.cm-leave{width:44px!important;height:42px!important}.cm-control-end{position:static;margin-left:5px}.cm-final-report{grid-template-columns:1fr}.cm-report-head{border-radius:0}.cm-report-shell{width:100%}.cm-final-report{border-radius:0}.cm-wait-card,.cm-center-card{width:100%;min-height:100dvh;border-radius:0;display:flex;flex-direction:column;justify-content:center}.cm-grid.count-2,.cm-grid.count-3,.cm-grid.count-4{grid-template-columns:1fr}.cm-grid.count-3,.cm-grid.count-4{grid-template-rows:repeat(4,1fr)}}
`}</style>; }
