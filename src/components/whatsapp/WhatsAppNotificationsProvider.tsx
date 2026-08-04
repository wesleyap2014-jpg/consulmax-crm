import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";

const SOUND_STORAGE_KEY = "consulmax-whatsapp-notification-sound";
const VOLUME_STORAGE_KEY = "consulmax-whatsapp-notification-volume";
export const WHATSAPP_VOLUME_MIN = 25;
export const WHATSAPP_VOLUME_MAX = 200;
const DEFAULT_VOLUME = 100;

type IncomingMessage = {
  id: string;
  direction?: string | null;
  created_at?: string | null;
};

type WhatsAppSoundContextValue = {
  soundEnabled: boolean;
  volume: number;
  toggleSound: () => void;
  setVolume: (value: number) => void;
  testSound: () => void;
};

type WhatsAppUnreadContextValue = {
  hasUnread: boolean;
  unreadCount: number;
};

const WhatsAppSoundContext =
  createContext<WhatsAppSoundContextValue | null>(null);
const WhatsAppUnreadContext =
  createContext<WhatsAppUnreadContextValue | null>(null);

let sharedAudioContext: AudioContext | null = null;

function clampVolume(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.min(
    WHATSAPP_VOLUME_MAX,
    Math.max(WHATSAPP_VOLUME_MIN, Math.round(value)),
  );
}

function readSoundPreference() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function readVolumePreference() {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  try {
    return clampVolume(
      Number(window.localStorage.getItem(VOLUME_STORAGE_KEY) || DEFAULT_VOLUME),
    );
  } catch {
    return DEFAULT_VOLUME;
  }
}

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return null;
  sharedAudioContext ||= new AudioContextClass();
  return sharedAudioContext;
}

function primeNotificationAudio() {
  const context = getAudioContext();
  if (context?.state === "suspended") void context.resume().catch(() => undefined);
}

function playNotificationTone(volume: number) {
  const context = getAudioContext();
  if (!context) return;

  const play = () => {
    const now = context.currentTime;
    const peak = 0.16 * (clampVolume(volume) / DEFAULT_VOLUME);

    [0, 0.13].forEach((delay, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(
        index === 0 ? 740 : 940,
        now + delay,
      );
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.01, peak),
        now + delay + 0.015,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + delay + 0.11,
      );
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + 0.12);
    });
  };

  if (context.state === "suspended") {
    void context
      .resume()
      .then(play)
      .catch((error) =>
        console.warn("Não foi possível liberar o som do WhatsApp.", error),
      );
    return;
  }

  play();
}

export function WhatsAppNotificationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [soundEnabled, setSoundEnabled] = useState(readSoundPreference);
  const [volume, setVolumeState] = useState(readVolumePreference);
  const [unreadCount, setUnreadCount] = useState(0);
  const soundEnabledRef = useRef(soundEnabled);
  const volumeRef = useRef(volume);
  const latestIncomingIdRef = useRef<string | null>(null);
  const baselineReadyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const unlock = () => primeNotificationAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const refreshUnread = useCallback(async () => {
    const { count, error } = await supabase
      .from("whatsapp_conversations")
      .select("id", { count: "exact", head: true })
      .gt("unread_count", 0);

    if (error) {
      console.warn("Não foi possível atualizar o alerta do WhatsApp.", error);
      return;
    }

    if (mountedRef.current) setUnreadCount(count || 0);
  }, []);

  const getLatestIncoming = useCallback(async () => {
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("id,direction,created_at")
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("Não foi possível verificar novas mensagens do WhatsApp.", error);
      return null;
    }

    return (data || null) as IncomingMessage | null;
  }, []);

  const notifyIncoming = useCallback((message: IncomingMessage) => {
    if (!message.id || message.id === latestIncomingIdRef.current) return;
    latestIncomingIdRef.current = message.id;
    setUnreadCount((current) => Math.max(1, current + 1));
    if (soundEnabledRef.current) playNotificationTone(volumeRef.current);
  }, []);

  const checkLatestIncoming = useCallback(async () => {
    const latest = await getLatestIncoming();
    if (!baselineReadyRef.current) {
      latestIncomingIdRef.current = latest?.id || null;
      baselineReadyRef.current = true;
      return;
    }

    if (!latest?.id) return;
    notifyIncoming(latest);
  }, [getLatestIncoming, notifyIncoming]);

  useEffect(() => {
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let reconnectTimer: number | null = null;
    let unreadRefreshTimer: number | null = null;
    let connecting = false;
    let subscribed = false;
    let reconnectAttempt = 0;

    const clearReconnect = () => {
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const scheduleUnreadRefresh = () => {
      if (unreadRefreshTimer !== null) window.clearTimeout(unreadRefreshTimer);
      unreadRefreshTimer = window.setTimeout(() => {
        unreadRefreshTimer = null;
        void refreshUnread();
      }, 250);
    };

    const scheduleReconnect = () => {
      if (disposed || connecting || reconnectTimer !== null) return;
      const delay = Math.min(30000, 2000 * 2 ** reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        void connectRealtime();
      }, delay);
    };

    async function connectRealtime() {
      if (disposed || connecting) return;
      connecting = true;
      subscribed = false;

      try {
        if (channel) {
          const previousChannel = channel;
          channel = null;
          await supabase.removeChannel(previousChannel);
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token)
          await supabase.realtime.setAuth(session.access_token);
        if (disposed) return;

        channel = supabase
          .channel("whatsapp-global-notifications")
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "whatsapp_messages",
              filter: "direction=eq.inbound",
            },
            (payload) => {
              notifyIncoming(payload.new as IncomingMessage);
              scheduleUnreadRefresh();
            },
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "whatsapp_conversations",
            },
            scheduleUnreadRefresh,
          )
          .subscribe((status, error) => {
            if (disposed) return;
            if (status === "SUBSCRIBED") {
              connecting = false;
              subscribed = true;
              reconnectAttempt = 0;
              clearReconnect();
              return;
            }

            if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              connecting = false;
              subscribed = false;
              console.warn("WHATSAPP_GLOBAL_REALTIME_STATUS", {
                status,
                error: error?.message || null,
              });
              scheduleReconnect();
            }
          });
      } catch (error) {
        connecting = false;
        subscribed = false;
        console.warn("WHATSAPP_GLOBAL_REALTIME_CONNECT_ERROR", error);
        scheduleReconnect();
      }
    }

    const syncFallback = async () => {
      await Promise.all([refreshUnread(), checkLatestIncoming()]);
    };

    const initialize = async () => {
      await Promise.all([refreshUnread(), checkLatestIncoming()]);
      if (!disposed) void connectRealtime();
    };

    const fallback = window.setInterval(() => void syncFallback(), 10000);
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      void syncFallback();
      if (!subscribed) void connectRealtime();
    };
    const handleOnline = () => {
      void syncFallback();
      if (!subscribed) void connectRealtime();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.access_token) return;
      void supabase.realtime.setAuth(session.access_token);
      if (!subscribed) scheduleReconnect();
    });

    void initialize();

    return () => {
      disposed = true;
      clearReconnect();
      window.clearInterval(fallback);
      if (unreadRefreshTimer !== null) window.clearTimeout(unreadRefreshTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      authSubscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [checkLatestIncoming, notifyIncoming, refreshUnread]);

  const toggleSound = useCallback(() => {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    try {
      window.localStorage.setItem(SOUND_STORAGE_KEY, next ? "on" : "off");
    } catch {}
    if (next) playNotificationTone(volumeRef.current);
  }, []);

  const setVolume = useCallback((value: number) => {
    const next = clampVolume(value);
    volumeRef.current = next;
    setVolumeState(next);
    try {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(next));
    } catch {}
  }, []);

  const testSound = useCallback(() => {
    if (soundEnabledRef.current) playNotificationTone(volumeRef.current);
  }, []);

  const soundValue = useMemo<WhatsAppSoundContextValue>(
    () => ({
      soundEnabled,
      volume,
      toggleSound,
      setVolume,
      testSound,
    }),
    [soundEnabled, testSound, toggleSound, volume, setVolume],
  );
  const unreadValue = useMemo<WhatsAppUnreadContextValue>(
    () => ({ hasUnread: unreadCount > 0, unreadCount }),
    [unreadCount],
  );

  return (
    <WhatsAppSoundContext.Provider value={soundValue}>
      <WhatsAppUnreadContext.Provider value={unreadValue}>
        {children}
      </WhatsAppUnreadContext.Provider>
    </WhatsAppSoundContext.Provider>
  );
}

export function useWhatsAppSound() {
  const value = useContext(WhatsAppSoundContext);
  if (!value) {
    throw new Error(
      "useWhatsAppSound precisa estar dentro de WhatsAppNotificationsProvider.",
    );
  }
  return value;
}

export function useWhatsAppUnread() {
  const value = useContext(WhatsAppUnreadContext);
  if (!value) {
    throw new Error(
      "useWhatsAppUnread precisa estar dentro de WhatsAppNotificationsProvider.",
    );
  }
  return value;
}
