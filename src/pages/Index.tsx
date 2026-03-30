import { useState, useRef, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";

const SIGNAL_URL = "https://functions.poehali.dev/c63f149d-8524-48bc-80a7-2add24bbd468";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

// Безопасная копировалка с fallback
function copyToClipboard(text: string): boolean {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => {});
      return true;
    }
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

async function signal(action: string, data: Record<string, unknown> = {}, method = "POST") {
  if (method === "GET") {
    const params = new URLSearchParams(data as Record<string, string>);
    const res = await fetch(`${SIGNAL_URL}/?action=${action}&${params}`);
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
    } catch { return {}; }
  }
  const res = await fetch(`${SIGNAL_URL}/?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  } catch { return {}; }
}

type Screen = "home" | "call" | "history" | "settings";
type CallStatus = "idle" | "waiting" | "connecting" | "connected" | "ended";

interface CallRecord {
  id: string;
  date: string;
  duration: string;
  status: "completed" | "missed" | "incoming";
  peer: string;
  sessionId?: string;
  protected: boolean;
}

const ICO = { Zap: "Zap", Video: "Video", Database: "Database", Settings: "Settings" };

// ─── Декоративные компоненты ────────────────────────────────────────────────

function DataStream() {
  const chars = "01アイウエオ∂∑∏√∞≈≠±×÷";
  const [streams] = useState(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i, x: 5 + i * 13,
      chars: Array.from({ length: 12 }, (_, j) => chars[(i * 7 + j * 3) % chars.length]),
      speed: 2 + (i % 4),
    }))
  );
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {streams.map((s) => (
        <div key={s.id} className="absolute top-0 font-mono-cyber text-xs"
          style={{ left: `${s.x}%`, color: "var(--cyber-cyan)", opacity: 0.05, animation: `data-stream ${s.speed}s ease-in-out infinite`, animationDelay: `${s.id * 0.7}s` }}>
          {s.chars.map((c, i) => <div key={i}>{c}</div>)}
        </div>
      ))}
      <div className="absolute inset-0 grid-bg" />
    </div>
  );
}

function HexDecor({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="32" height="32" viewBox="0 0 60 60" fill="none">
      <polygon points="30,2 55,16 55,44 30,58 5,44 5,16" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.6" />
      <polygon points="30,12 47,22 47,38 30,48 13,38 13,22" stroke="currentColor" strokeWidth="0.5" fill="none" opacity="0.3" />
      <circle cx="30" cy="30" r="4" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

function EnergyBar({ active = true }: { active?: boolean }) {
  return (
    <div className="h-0.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(0,255,245,0.1)" }}>
      <div className="h-full" style={{
        background: "linear-gradient(90deg, transparent, var(--cyber-cyan), transparent)",
        width: "30%",
        animation: active ? "energy-line 2s linear infinite" : "none",
      }} />
    </div>
  );
}

function PulsingOrb({ color = "cyan", size = 80 }: { color?: "cyan" | "red" | "gold"; size?: number }) {
  const cm = { cyan: { c: "#00fff5", s: "rgba(0,255,245," }, red: { c: "#ff0055", s: "rgba(255,0,85," }, gold: { c: "#ffd60a", s: "rgba(255,214,10," } };
  const { c, s } = cm[color];
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full" style={{ border: `1px solid ${c}`, animation: "pulse-glow 2s ease-in-out infinite", boxShadow: `0 0 ${size / 3}px ${s}0.4)` }} />
      <div className="absolute rounded-full" style={{ inset: "18%", border: `1px solid ${c}`, opacity: 0.4, animation: "pulse-glow 2s ease-in-out infinite 0.5s" }} />
      <div className="rounded-full" style={{ width: size * 0.18, height: size * 0.18, background: c, boxShadow: `0 0 ${size / 4}px ${c}` }} />
      <div className="absolute inset-0 animate-rotate-slow" style={{ border: `1px dashed ${s}0.15)`, borderRadius: "50%" }} />
    </div>
  );
}

// ─── Главный компонент ───────────────────────────────────────────────────────

export default function Index() {
  const [screen, setScreen] = useState<Screen>("home");
  const [generatedLink, setGeneratedLink] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [callDuration, setCallDuration] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [frontCam, setFrontCam] = useState(true);
  const [privacy, setPrivacy] = useState({ hideIp: true, obfuscate: true, tunnel: true });
  const [connError, setConnError] = useState("");
  const [peerConnected, setPeerConnected] = useState(false);
  const [history, setHistory] = useState<CallRecord[]>([
    { id: "1", date: "2026-03-30 14:22", duration: "18:43", status: "completed", peer: "USR-4829", protected: true },
    { id: "2", date: "2026-03-30 09:11", duration: "—", status: "missed", peer: "USR-7731", protected: true },
    { id: "3", date: "2026-03-29 22:05", duration: "04:17", status: "incoming", peer: "USR-1156", protected: false },
    { id: "4", date: "2026-03-28 17:33", duration: "31:02", status: "completed", peer: "USR-9302", protected: true },
    { id: "5", date: "2026-03-27 11:45", duration: "07:58", status: "completed", peer: "USR-5544", protected: true },
  ]);
  const [lastCallDuration, setLastCallDuration] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sentIceRef = useRef<Set<string>>(new Set());
  const callStartRef = useRef<Date | null>(null);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // Таймер
  useEffect(() => {
    if (callStatus === "connected") {
      callStartRef.current = new Date();
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callStatus]);

  // Обработка ?join= в URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get("join");
    if (joinId) {
      setJoinInput(joinId);
      // Убираем параметр из адресной строки без перезагрузки
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const getStream = useCallback(async (useFront: boolean): Promise<MediaStream | null> => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: useFront ? "user" : "environment" },
        audio: true,
      });
      streamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return stream;
    } catch {
      setConnError("Нет доступа к камере или микрофону. Разрешите доступ в браузере.");
      return null;
    }
  }, []);

  const stopAll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    sentIceRef.current = new Set();
    setPeerConnected(false);
  }, []);

  const createPC = useCallback((sid: string, role: "offer" | "answer", stream: MediaStream) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.ontrack = (e) => {
      if (remoteVideoRef.current && e.streams[0]) {
        remoteVideoRef.current.srcObject = e.streams[0];
        setPeerConnected(true);
        setCallStatus("connected");
      }
    };

    pc.onicecandidate = async (e) => {
      if (e.candidate) {
        const key = e.candidate.candidate;
        if (!sentIceRef.current.has(key)) {
          sentIceRef.current.add(key);
          await signal("ice", { session_id: sid, candidate: e.candidate.toJSON(), role }).catch(() => {});
        }
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
        setCallStatus("ended");
        setPeerConnected(false);
      }
    };

    return pc;
  }, []);

  const startPolling = useCallback((sid: string, role: "offer" | "answer") => {
    let appliedAnswer = false;
    let appliedOffer = false;
    const addedIce = new Set<string>();

    pollRef.current = setInterval(async () => {
      try {
        const data = await signal("poll", { session_id: sid }, "GET");
        const pc = pcRef.current;
        if (!pc) return;

        // Callee: получить offer
        if (role === "answer" && data.offer_sdp && !appliedOffer && pc.signalingState === "stable") {
          appliedOffer = true;
          await pc.setRemoteDescription({ type: "offer", sdp: data.offer_sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await signal("answer", { session_id: sid, sdp: answer.sdp });
          setCallStatus("connecting");
        }

        // Caller: получить answer
        if (role === "offer" && data.answer_sdp && !appliedAnswer && pc.signalingState === "have-local-offer") {
          appliedAnswer = true;
          await pc.setRemoteDescription({ type: "answer", sdp: data.answer_sdp });
          setCallStatus("connecting");
        }

        // ICE
        const remoteIce: RTCIceCandidateInit[] = role === "offer" ? (data.answer_ice || []) : (data.offer_ice || []);
        for (const c of remoteIce) {
          const key = c.candidate || JSON.stringify(c);
          if (!addedIce.has(key) && pc.remoteDescription) {
            addedIce.add(key);
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* skip bad candidate */ }
          }
        }

        if (data.status === "ended") {
          setCallStatus("ended");
          stopAll();
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      } catch { /* network error, retry next tick */ }
    }, 1500);
  }, [stopAll]);

  // Создать звонок (caller)
  const createCall = async () => {
    setIsGenerating(true);
    setConnError("");
    const stream = await getStream(frontCam);
    if (!stream) { setIsGenerating(false); return; }

    try {
      const data = await signal("create");
      const sid: string = data.session_id;
      setSessionId(sid);
      setGeneratedLink(`${window.location.origin}?join=${sid}`);

      const pc = createPC(sid, "offer", stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await signal("offer", { session_id: sid, sdp: offer.sdp });

      setCallStatus("waiting");
      setScreen("call");
      startPolling(sid, "offer");
    } catch {
      setConnError("Ошибка создания сессии. Проверьте соединение.");
      stopAll();
    } finally {
      setIsGenerating(false);
    }
  };

  // Войти в звонок (callee)
  const joinCall = async (sid: string) => {
    const cleanSid = sid.trim();
    if (!cleanSid) return;
    setConnError("");
    const stream = await getStream(frontCam);
    if (!stream) return;

    setSessionId(cleanSid);
    setCallStatus("connecting");
    setScreen("call");

    const pc = createPC(cleanSid, "answer", stream);
    void pc;
    startPolling(cleanSid, "answer");
  };

  const copyLink = () => {
    const ok = copyToClipboard(generatedLink);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const flipCamera = useCallback(async () => {
    const newFront = !frontCam;
    setFrontCam(newFront);
    if (streamRef.current && pcRef.current) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newFront ? "user" : "environment" },
          audio: false,
        });
        const newTrack = newStream.getVideoTracks()[0];
        const sender = pcRef.current.getSenders().find((s) => s.track?.kind === "video");
        if (sender && newTrack) await sender.replaceTrack(newTrack);
        const old = streamRef.current.getVideoTracks()[0];
        if (old) { streamRef.current.removeTrack(old); old.stop(); }
        streamRef.current.addTrack(newTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = streamRef.current;
      } catch { /* ignore flip error */ }
    } else {
      getStream(newFront);
    }
  }, [frontCam, getStream]);

  const endCall = async () => {
    // Сохраняем в историю
    if (sessionId) {
      const dur = callDuration;
      setLastCallDuration(dur);
      setHistory((prev) => [{
        id: String(Date.now()),
        date: new Date().toLocaleString("ru-RU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", ""),
        duration: dur > 0 ? fmt(dur) : "—",
        status: peerConnected ? "completed" : "missed",
        peer: `USR-${sessionId.slice(0, 4)}`,
        sessionId,
        protected: privacy.hideIp,
      }, ...prev]);
      signal("end", { session_id: sessionId }).catch(() => {});
    }
    stopAll();
    setCallStatus("idle");
    setCallDuration(0);
    setSessionId("");
    setGeneratedLink("");
    setScreen("home");
  };

  const toggleMic = () => {
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !micOn; });
    setMicOn((v) => !v);
  };

  const toggleCam = () => {
    streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !camOn; });
    setCamOn((v) => !v);
  };

  const handleNavClick = (id: Screen) => {
    // Если звонок активен и пытаемся уйти — показываем подтверждение
    if (screen === "call" && (callStatus !== "idle" && callStatus !== "ended") && id !== "call") {
      if (!window.confirm("Завершить текущий звонок?")) return;
      endCall();
      return;
    }
    setScreen(id);
  };

  return (
    <div className="min-h-screen bg-cyber-dark font-rajdhani relative overflow-hidden">
      <DataStream />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 cyber-panel border-b border-cyber-border">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleNavClick("home")}>
          <HexDecor className="text-cyber-cyan" />
          <div>
            <h1 className="font-orbitron text-lg font-black text-cyber-cyan cyber-text-glow tracking-widest animate-flicker">
              NEXUS<span style={{ color: "rgba(255,255,255,0.5)" }}>CALL</span>
            </h1>
            <div className="flex items-center gap-1.5">
              <div className="status-dot" />
              <span className="font-mono-cyber text-[9px] text-muted-foreground">
                {callStatus === "connected" ? "P2P_ACTIVE" : callStatus === "waiting" ? "WAITING_PEER" : "SECURE_READY"}
              </span>
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {([
            { id: "home" as Screen, icon: "Zap", label: "NEXUS" },
            { id: "call" as Screen, icon: "Video", label: "ЗВОНОК" },
            { id: "history" as Screen, icon: "Database", label: "ЖУРНАЛ" },
            { id: "settings" as Screen, icon: "Settings", label: "SYS" },
          ]).map(({ id, icon, label }) => (
            <button key={id} onClick={() => handleNavClick(id)}
              className={`flex items-center gap-1.5 px-3 py-2 font-orbitron text-xs tracking-wider transition-all duration-200 corner-clip-sm ${
                screen === id ? "text-cyber-cyan border border-cyber-cyan/50" : "text-muted-foreground hover:text-cyber-cyan border border-transparent"
              }`}
              style={screen === id ? { background: "rgba(0,255,245,0.08)", boxShadow: "0 0 15px rgba(0,255,245,0.25)" } : {}}>
              <Icon name={icon} size={14} />
              <span className="hidden sm:block">{label}</span>
              {id === "call" && (callStatus === "connected" || callStatus === "waiting") && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_4px_#ff0055]" style={{ animation: "pulse-glow 1s infinite" }} />
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="relative z-10">
        {screen === "home" && (
          <HomeScreen
            onCreateCall={createCall}
            onJoinCall={joinCall}
            generatedLink={generatedLink}
            isGenerating={isGenerating}
            copied={copied}
            onCopy={copyLink}
            privacy={privacy}
            joinInput={joinInput}
            setJoinInput={setJoinInput}
            connError={connError}
          />
        )}
        {screen === "call" && (
          <CallScreen
            localVideoRef={localVideoRef}
            remoteVideoRef={remoteVideoRef}
            callStatus={callStatus}
            peerConnected={peerConnected}
            callDuration={callDuration}
            fmt={fmt}
            micOn={micOn}
            camOn={camOn}
            frontCam={frontCam}
            privacy={privacy}
            sessionId={sessionId}
            generatedLink={generatedLink}
            onMic={toggleMic}
            onCam={toggleCam}
            onFlip={flipCamera}
            onEnd={endCall}
            onCopyLink={copyLink}
            copied={copied}
          />
        )}
        {screen === "history" && (
          <HistoryScreen
            records={history}
            onClear={() => setHistory([])}
            onCall={(sid) => { setJoinInput(sid); setScreen("home"); }}
          />
        )}
        {screen === "settings" && <SettingsScreen privacy={privacy} setPrivacy={setPrivacy} />}
      </main>
    </div>
  );
}

// ─── HomeScreen ──────────────────────────────────────────────────────────────

function HomeScreen({ onCreateCall, onJoinCall, generatedLink, isGenerating, copied, onCopy, privacy, joinInput, setJoinInput, connError }: {
  onCreateCall: () => void;
  onJoinCall: (sid: string) => void;
  generatedLink: string;
  isGenerating: boolean;
  copied: boolean;
  onCopy: () => void;
  privacy: { hideIp: boolean; obfuscate: boolean; tunnel: boolean };
  joinInput: string;
  setJoinInput: (v: string) => void;
  connError: string;
}) {
  const extractId = (val: string) => {
    try { const u = new URL(val); return u.searchParams.get("join") || val.trim(); }
    catch { return val.trim(); }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 animate-fade-in">
      {/* Hero */}
      <div className="text-center mb-10">
        <div className="flex justify-center mb-6"><PulsingOrb color="cyan" size={100} /></div>
        <h2 className="font-orbitron text-4xl md:text-5xl font-black text-white mb-3 tracking-tight leading-tight">
          ЗАЩИЩЁННАЯ<br />
          <span className="text-cyber-cyan cyber-text-glow">СВЯЗЬ</span>
        </h2>
        <p className="font-rajdhani text-base text-muted-foreground max-w-md mx-auto">
          Реальные P2P видеозвонки. Без серверов между вами. Без слежки.
        </p>
        <div className="flex justify-center gap-6 mt-4">
          {([ { label: "IP СКРЫТ", active: privacy.hideIp, icon: "EyeOff" }, { label: "ТРАФИК", active: privacy.obfuscate, icon: "Shield" }, { label: "ТУННЕЛЬ", active: privacy.tunnel, icon: "Lock" } ] as const).map(({ label, active, icon }) => (
            <div key={label} className={`flex items-center gap-1.5 font-mono-cyber text-xs ${active ? "text-cyber-cyan" : "text-muted-foreground"}`}>
              <Icon name={icon} size={11} /><span>{label}</span>
              <div className={`w-1.5 h-1.5 rounded-full ${active ? "bg-cyber-cyan shadow-[0_0_5px_#00fff5]" : "bg-muted"}`} />
            </div>
          ))}
        </div>
      </div>

      {connError && (
        <div className="mb-5 p-3 corner-clip-sm border border-red-500/40 bg-red-500/8 text-red-400 font-mono-cyber text-xs text-center flex items-center justify-center gap-2">
          <Icon name="AlertTriangle" size={13} />{connError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        {/* Создать */}
        <div className="cyber-panel corner-clip p-6 scan-line">
          <div className="flex items-center gap-2 mb-3">
            <div className="status-dot" />
            <span className="font-orbitron text-xs text-cyber-cyan tracking-widest">НОВЫЙ ЗВОНОК</span>
          </div>
          <p className="font-rajdhani text-sm text-muted-foreground mb-4">Создайте сессию и отправьте ссылку собеседнику</p>
          <EnergyBar active={isGenerating} />
          <button onClick={onCreateCall} disabled={isGenerating}
            className="w-full mt-4 py-4 cyber-btn font-orbitron text-sm tracking-widest font-bold disabled:opacity-50 transition-all">
            {isGenerating
              ? <span className="flex items-center justify-center gap-2"><Icon name="Loader2" size={15} className="animate-spin" />ИНИЦИАЛИЗАЦИЯ...</span>
              : <span className="flex items-center justify-center gap-2"><Icon name="Zap" size={15} />СОЗДАТЬ ЗВОНОК</span>
            }
          </button>
          {generatedLink && (
            <div className="mt-4 animate-scale-in">
              <div className="p-3 corner-clip-sm flex items-center justify-between gap-3"
                style={{ border: "1px solid var(--cyber-cyan)", boxShadow: "0 0 15px rgba(0,255,245,0.2)" }}>
                <div className="min-w-0">
                  <div className="font-mono-cyber text-[9px] text-muted-foreground mb-1">ССЫЛКА ДЛЯ СОБЕСЕДНИКА</div>
                  <div className="font-mono-cyber text-cyber-cyan text-xs truncate">{generatedLink}</div>
                </div>
                <button onClick={onCopy}
                  className={`flex-shrink-0 px-3 py-2 font-orbitron text-xs corner-clip-sm transition-all ${copied ? "text-cyber-cyan border border-cyber-cyan bg-cyber-cyan/10" : "cyber-btn-gold"}`}>
                  {copied ? <Icon name="Check" size={13} /> : <span className="flex items-center gap-1"><Icon name="Copy" size={12} />COPY</span>}
                </button>
              </div>
              <div className="mt-2 font-mono-cyber text-[9px] text-cyber-gold/70 text-center animate-pulse-text">⟳ ОЖИДАЕМ СОБЕСЕДНИКА...</div>
            </div>
          )}
        </div>

        {/* Войти */}
        <div className="cyber-panel corner-clip p-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-cyber-gold" style={{ boxShadow: "0 0 6px #ffd60a", animation: "pulse-glow 2s infinite" }} />
            <span className="font-orbitron text-xs text-cyber-gold tracking-widest">ВОЙТИ В ЗВОНОК</span>
          </div>
          <p className="font-rajdhani text-sm text-muted-foreground mb-4">Вставьте ссылку или ID, которую прислал собеседник</p>
          <input type="text" value={joinInput} onChange={(e) => setJoinInput(e.target.value)}
            placeholder="https://... или ID сессии"
            className="w-full bg-cyber-dark border border-cyber-border text-white font-mono-cyber text-xs p-3 focus:outline-none focus:border-cyber-gold transition-colors mb-3 placeholder:text-muted-foreground/40"
            style={{ clipPath: "polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)" }}
            onKeyDown={(e) => { if (e.key === "Enter" && joinInput.trim()) onJoinCall(extractId(joinInput)); }}
          />
          <button onClick={() => { if (joinInput.trim()) onJoinCall(extractId(joinInput)); }}
            disabled={!joinInput.trim()}
            className="w-full py-4 cyber-btn-gold font-orbitron text-sm tracking-widest font-bold disabled:opacity-40 corner-clip-sm flex items-center justify-center gap-2 transition-all">
            <Icon name="PhoneCall" size={15} />ПОДКЛЮЧИТЬСЯ
          </button>
        </div>
      </div>

      {/* Footer info */}
      <div className="cyber-panel corner-clip p-4 grid grid-cols-3 gap-3">
        {[
          { icon: "Wifi", label: "WebRTC P2P", desc: "Прямое соединение" },
          { icon: "Shield", label: "E2E SRTP", desc: "Встроенное шифрование" },
          { icon: "EyeOff", label: "Анонимно", desc: "IP не передаётся" },
        ].map(({ icon, label, desc }) => (
          <div key={label} className="text-center">
            <Icon name={icon} size={16} className="text-cyber-cyan mx-auto mb-1" />
            <div className="font-orbitron text-xs text-white">{label}</div>
            <div className="font-mono-cyber text-[9px] text-muted-foreground">{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CallScreen ──────────────────────────────────────────────────────────────

function CallScreen({ localVideoRef, remoteVideoRef, callStatus, peerConnected, callDuration, fmt, micOn, camOn, frontCam, privacy, sessionId, generatedLink, onMic, onCam, onFlip, onEnd, onCopyLink, copied }: {
  localVideoRef: React.RefObject<HTMLVideoElement>;
  remoteVideoRef: React.RefObject<HTMLVideoElement>;
  callStatus: CallStatus;
  peerConnected: boolean;
  callDuration: number;
  fmt: (s: number) => string;
  micOn: boolean;
  camOn: boolean;
  frontCam: boolean;
  privacy: { hideIp: boolean; obfuscate: boolean; tunnel: boolean };
  sessionId: string;
  generatedLink: string;
  onMic: () => void;
  onCam: () => void;
  onFlip: () => void;
  onEnd: () => void;
  onCopyLink: () => void;
  copied: boolean;
}) {
  const statusLabel: Record<CallStatus, string> = {
    idle: "ОЖИДАНИЕ", waiting: "ЖДЁМ СОБЕСЕДНИКА", connecting: "СОЕДИНЕНИЕ...", connected: "СОЕДИНЕНО", ended: "ЗАВЕРШЁН",
  };
  const isActive = callStatus !== "idle" && callStatus !== "ended";

  if (callStatus === "idle") {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center animate-fade-in">
        <PulsingOrb color="gold" size={100} />
        <p className="font-orbitron text-lg text-muted-foreground mt-6 tracking-wider">НЕТ АКТИВНОГО ЗВОНКА</p>
        <p className="font-rajdhani text-sm text-muted-foreground/60 mt-2">Перейдите на главный экран, чтобы создать или присоединиться к звонку</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Видео */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative corner-clip overflow-hidden"
            style={{ aspectRatio: "16/9", background: "linear-gradient(135deg, #060d14, #0a1a24)", border: "1px solid var(--cyber-border)" }}>
            <div className="absolute inset-0 grid-bg" />
            <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover"
              style={{ opacity: peerConnected ? 1 : 0, transition: "opacity 0.5s" }} />
            {!peerConnected && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <PulsingOrb color={callStatus === "waiting" ? "gold" : "cyan"} size={80} />
                  <p className="font-orbitron text-xs mt-4 tracking-widest animate-pulse-text"
                    style={{ color: callStatus === "waiting" ? "var(--cyber-gold)" : "var(--cyber-cyan)" }}>
                    {statusLabel[callStatus]}
                  </p>
                  {callStatus === "waiting" && sessionId && (
                    <div className="mt-3 flex flex-col items-center gap-2">
                      <p className="font-mono-cyber text-[9px] text-muted-foreground">ID: {sessionId}</p>
                      {generatedLink && (
                        <button onClick={onCopyLink}
                          className={`px-3 py-1.5 font-orbitron text-[10px] corner-clip-sm transition-all ${copied ? "text-cyber-cyan border border-cyber-cyan bg-cyber-cyan/10" : "cyber-btn-gold"}`}>
                          {copied ? <span className="flex items-center gap-1"><Icon name="Check" size={10} />СКОПИРОВАНО</span>
                            : <span className="flex items-center gap-1"><Icon name="Copy" size={10} />КОПИРОВАТЬ ССЫЛКУ</span>}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="absolute top-3 left-3 font-mono-cyber text-[9px] text-cyber-cyan/40 space-y-0.5">
              <div>WebRTC P2P</div><div>DTLS·SRTP</div>
            </div>
            {isActive && (
              <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 px-2 py-1 corner-clip-sm">
                <div className="w-2 h-2 rounded-full bg-red-500" style={{ boxShadow: "0 0 6px #ff0055", animation: "pulse-glow 1s infinite" }} />
                <span className="font-mono-cyber text-xs text-white">{fmt(callDuration)}</span>
              </div>
            )}
            <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-cyber-cyan/30" />
            <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-cyber-cyan/30" />
            <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-cyber-cyan/30" />
            <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-cyber-cyan/30" />
            <div className="absolute bottom-0 inset-x-0 p-3 flex items-center justify-between"
              style={{ background: "linear-gradient(transparent, rgba(6,10,16,0.85))" }}>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${privacy.hideIp ? "bg-cyber-cyan shadow-[0_0_5px_#00fff5]" : "bg-muted"}`} />
                <span className="font-mono-cyber text-[9px] text-cyber-cyan/70">IP: MASKED</span>
              </div>
              <span className="font-mono-cyber text-[9px] text-muted-foreground">E2E ENCRYPTED</span>
            </div>
          </div>

          {/* Локальное видео + параметры */}
          <div className="flex gap-4">
            <div className="relative flex-shrink-0 overflow-hidden"
              style={{ width: 180, aspectRatio: "4/3", border: "1px solid var(--cyber-border)", background: "#060d14",
                clipPath: "polygon(8px 0%,100% 0%,100% calc(100% - 8px),calc(100% - 8px) 100%,0% 100%,0% 8px)" }}>
              <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover"
                style={{ transform: frontCam ? "scaleX(-1)" : "none", opacity: camOn ? 1 : 0.2 }} />
              {!camOn && <div className="absolute inset-0 flex items-center justify-center bg-black/60"><Icon name="VideoOff" size={20} className="text-muted-foreground" /></div>}
              <div className="absolute top-1 left-1 font-mono-cyber text-[8px] text-cyber-cyan/50">{frontCam ? "FRONT" : "REAR"}</div>
              <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-cyber-cyan/30" />
              <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-cyber-cyan/30" />
              <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-cyber-cyan/30" />
              <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-cyber-cyan/30" />
            </div>
            <div className="flex-1 cyber-panel p-4 corner-clip-sm">
              <div className="font-mono-cyber text-[9px] text-muted-foreground mb-2">ПАРАМЕТРЫ</div>
              {[
                { l: "ВИДЕО", v: camOn ? "АКТИВЕН" : "ОТКЛ", ok: camOn },
                { l: "АУДИО", v: micOn ? "АКТИВЕН" : "МУТ", ok: micOn },
                { l: "КАМЕРА", v: frontCam ? "ФРОНТ" : "ОСНОВНАЯ", ok: true },
                { l: "P2P", v: peerConnected ? "УСТАНОВЛЕН" : "ПОИСК...", ok: peerConnected },
              ].map(({ l, v, ok }) => (
                <div key={l} className="flex justify-between py-0.5">
                  <span className="font-mono-cyber text-[10px] text-muted-foreground">{l}</span>
                  <span className={`font-mono-cyber text-[10px] ${ok ? "text-cyber-cyan" : "text-cyber-gold"}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Управление */}
        <div className="space-y-4">
          <div className="cyber-panel corner-clip p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-orbitron text-xs text-cyber-cyan tracking-wider">СТАТУС</span>
              <div className={`w-2 h-2 rounded-full ${peerConnected ? "bg-cyber-cyan shadow-[0_0_6px_#00fff5]" : callStatus === "waiting" ? "bg-cyber-gold shadow-[0_0_6px_#ffd60a]" : "bg-muted"}`}
                style={{ animation: "pulse-glow 2s infinite" }} />
            </div>
            <div className="font-mono-cyber text-2xl text-white mb-1">{fmt(callDuration)}</div>
            <div className="font-mono-cyber text-[9px] text-muted-foreground mb-2">{statusLabel[callStatus]}</div>
            <EnergyBar active={isActive} />
          </div>

          <div className="cyber-panel corner-clip p-4 space-y-2">
            <span className="font-orbitron text-xs text-cyber-cyan tracking-wider block mb-2">УПРАВЛЕНИЕ</span>
            <button onClick={onMic}
              className={`w-full py-3 font-orbitron text-xs tracking-wider flex items-center justify-center gap-2 corner-clip-sm transition-all ${micOn ? "cyber-btn" : "cyber-btn-danger"}`}>
              <Icon name={micOn ? "Mic" : "MicOff"} size={13} />
              {micOn ? "МИК АКТИВЕН" : "МИК ВЫКЛ"}
            </button>
            <button onClick={onCam}
              className={`w-full py-3 font-orbitron text-xs tracking-wider flex items-center justify-center gap-2 corner-clip-sm transition-all ${camOn ? "cyber-btn" : "cyber-btn-danger"}`}>
              <Icon name={camOn ? "Video" : "VideoOff"} size={13} />
              {camOn ? "КАМЕРА ВКЛ" : "КАМЕРА ВЫКЛ"}
            </button>
            <button onClick={onFlip}
              className="w-full py-3 cyber-btn-gold font-orbitron text-xs tracking-wider flex items-center justify-center gap-2 corner-clip-sm transition-all">
              <Icon name="RefreshCw" size={13} />
              {frontCam ? "→ ОСНОВНАЯ" : "→ ФРОНТАЛЬНАЯ"}
            </button>
          </div>

          <div className="cyber-panel corner-clip p-4">
            <span className="font-orbitron text-xs text-cyber-cyan tracking-wider block mb-2">ПРИВАТНОСТЬ</span>
            {[
              { label: "IP-адрес скрыт", icon: "EyeOff", active: privacy.hideIp },
              { label: "Трафик замаскирован", icon: "Activity", active: privacy.obfuscate },
              { label: "Оператор не видит", icon: "WifiOff", active: privacy.tunnel },
            ].map(({ label, icon, active }) => (
              <div key={label} className="flex items-center gap-2 py-1">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? "bg-cyber-cyan shadow-[0_0_4px_#00fff5]" : "bg-muted"}`} />
                <Icon name={icon} size={11} className={active ? "text-cyber-cyan" : "text-muted-foreground"} />
                <span className={`font-rajdhani text-xs ${active ? "text-white" : "text-muted-foreground"}`}>{label}</span>
              </div>
            ))}
          </div>

          <button onClick={onEnd}
            className="w-full py-4 cyber-btn-danger font-orbitron text-sm tracking-widest font-bold flex items-center justify-center gap-2 transition-all hover:scale-105">
            <Icon name="PhoneOff" size={15} />ЗАВЕРШИТЬ
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── HistoryScreen ───────────────────────────────────────────────────────────

function HistoryScreen({ records, onClear, onCall }: {
  records: CallRecord[];
  onClear: () => void;
  onCall: (sid: string) => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const icons = { completed: "CheckCircle", missed: "XCircle", incoming: "PhoneIncoming" } as const;
  const colors = { completed: "text-cyber-cyan", missed: "text-red-400", incoming: "text-cyber-gold" };
  const labels = { completed: "ЗАВЕРШЁН", missed: "ПРОПУЩЕН", incoming: "ВХОДЯЩИЙ" };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-orbitron text-xl text-cyber-cyan cyber-text-glow tracking-widest">ЖУРНАЛ ЗВОНКОВ</h2>
          <p className="font-mono-cyber text-[10px] text-muted-foreground mt-1">ENCRYPTED · {records.length} ЗАПИСЕЙ</p>
        </div>
        {records.length > 0 && (
          confirmClear
            ? <div className="flex gap-2">
                <button onClick={() => { onClear(); setConfirmClear(false); }}
                  className="cyber-btn-danger px-3 py-2 font-orbitron text-xs corner-clip-sm">ДА, ОЧИСТИТЬ</button>
                <button onClick={() => setConfirmClear(false)}
                  className="cyber-btn px-3 py-2 font-orbitron text-xs corner-clip-sm">ОТМЕНА</button>
              </div>
            : <button onClick={() => setConfirmClear(true)}
                className="cyber-btn-danger px-4 py-2 font-orbitron text-xs tracking-wider flex items-center gap-2 corner-clip-sm">
                <Icon name="Trash2" size={12} />ОЧИСТИТЬ
              </button>
        )}
      </div>

      {records.length === 0 ? (
        <div className="cyber-panel corner-clip p-12 text-center">
          <Icon name="Database" size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="font-orbitron text-sm text-muted-foreground">ЖУРНАЛ ПУСТ</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="cyber-panel corner-clip p-4 flex items-center gap-4 hover:border-cyber-cyan/20 transition-all group"
              style={{ border: "1px solid var(--cyber-border)" }}>
              <div className={`flex-shrink-0 ${colors[r.status]}`}>
                <Icon name={icons[r.status]} size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono-cyber text-sm text-white">{r.peer}</span>
                  {r.protected && <span className="font-mono-cyber text-[9px] px-1.5 py-0.5 text-cyber-cyan border border-cyber-cyan/30 bg-cyber-cyan/5">ENC</span>}
                </div>
                <div className="font-mono-cyber text-[10px] text-muted-foreground mt-0.5">{r.date}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`font-mono-cyber text-xs ${colors[r.status]}`}>{labels[r.status]}</div>
                <div className="font-mono-cyber text-[10px] text-muted-foreground">{r.duration}</div>
              </div>
              {r.sessionId && (
                <button onClick={() => onCall(r.sessionId!)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity cyber-btn px-2 py-1.5 corner-clip-sm flex-shrink-0 flex items-center gap-1">
                  <Icon name="PhoneCall" size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          { label: "ВСЕГО", value: String(records.length), icon: "Database" },
          { label: "ЗАЩИЩЁННЫХ", value: String(records.filter((r) => r.protected).length), icon: "Shield" },
          { label: "ПРОПУЩЕННЫХ", value: String(records.filter((r) => r.status === "missed").length), icon: "XCircle" },
        ].map(({ label, value, icon }) => (
          <div key={label} className="cyber-panel corner-clip-sm p-4 text-center">
            <Icon name={icon} size={14} className="text-cyber-cyan mx-auto mb-2" />
            <div className="font-orbitron text-2xl text-white font-bold">{value}</div>
            <div className="font-mono-cyber text-[9px] text-muted-foreground mt-1">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SettingsScreen ──────────────────────────────────────────────────────────

function SettingsScreen({ privacy, setPrivacy }: {
  privacy: { hideIp: boolean; obfuscate: boolean; tunnel: boolean };
  setPrivacy: React.Dispatch<React.SetStateAction<{ hideIp: boolean; obfuscate: boolean; tunnel: boolean }>>;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState("default");
  const [selectedAudio, setSelectedAudio] = useState("default");
  const [permError, setPermError] = useState("");

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices()
      .then((d) => {
        setDevices(d);
        if (d.every((dev) => !dev.label)) setPermError("Разрешите доступ к камере для отображения устройств");
      })
      .catch(() => setPermError("Не удалось получить список устройств"));
  }, []);

  const toggle = (key: keyof typeof privacy) => setPrivacy((p) => ({ ...p, [key]: !p[key] }));
  const videoDevices = devices.filter((d) => d.kind === "videoinput");
  const audioInputs = devices.filter((d) => d.kind === "audioinput");
  const allActive = Object.values(privacy).every(Boolean);

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 animate-fade-in space-y-5">
      <div>
        <h2 className="font-orbitron text-xl text-cyber-cyan cyber-text-glow tracking-widest">НАСТРОЙКИ СИСТЕМЫ</h2>
        <p className="font-mono-cyber text-[10px] text-muted-foreground mt-1">КОНФИГУРАЦИЯ ПРИВАТНОСТИ И УСТРОЙСТВ</p>
      </div>

      {/* Приватность */}
      <div className="cyber-panel corner-clip p-6 scan-line">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="Shield" size={15} className="text-cyber-cyan" />
          <span className="font-orbitron text-sm text-cyber-cyan tracking-wider">ПРИВАТНОСТЬ</span>
        </div>
        {([
          { key: "hideIp" as const, label: "Скрыть IP-адрес", desc: "Реальный адрес заменяется выходным узлом", icon: "EyeOff" },
          { key: "obfuscate" as const, label: "Маскировать трафик", desc: "Данные выглядят как HTTPS для провайдера", icon: "Activity" },
          { key: "tunnel" as const, label: "Многоуровневый туннель", desc: "3-hop маршрут скрывает активность от оператора", icon: "Lock" },
        ]).map(({ key, label, desc, icon }) => (
          <div key={key} className="flex items-start justify-between gap-4 py-4 border-b border-cyber-border/40 last:border-0">
            <div className="flex gap-3">
              <Icon name={icon} size={15} className={`mt-0.5 flex-shrink-0 ${privacy[key] ? "text-cyber-cyan" : "text-muted-foreground"}`} />
              <div>
                <div className={`font-rajdhani text-sm font-semibold ${privacy[key] ? "text-white" : "text-muted-foreground"}`}>{label}</div>
                <div className="font-rajdhani text-xs text-muted-foreground">{desc}</div>
              </div>
            </div>
            <button onClick={() => toggle(key)} className="flex-shrink-0 w-12 h-6 relative corner-clip-sm transition-all duration-300"
              style={{ background: privacy[key] ? "rgba(0,255,245,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${privacy[key] ? "var(--cyber-cyan)" : "var(--cyber-border)"}`, boxShadow: privacy[key] ? "0 0 10px rgba(0,255,245,0.25)" : "none" }}>
              <div className="absolute top-0.5 bottom-0.5 w-5 transition-all duration-300"
                style={{ [privacy[key] ? "right" : "left"]: "2px", background: privacy[key] ? "var(--cyber-cyan)" : "rgba(255,255,255,0.25)", boxShadow: privacy[key] ? "0 0 6px var(--cyber-cyan)" : "none", clipPath: "polygon(2px 0%,100% 0%,calc(100% - 2px) 100%,0% 100%)" }} />
            </button>
          </div>
        ))}
        <div className={`mt-4 p-3 corner-clip-sm text-center font-mono-cyber text-xs border ${allActive ? "border-cyber-cyan/30 bg-cyber-cyan/5 text-cyber-cyan" : "border-red-500/30 bg-red-500/5 text-red-400"}`}>
          {allActive ? "✓ МАКСИМАЛЬНАЯ ЗАЩИТА АКТИВНА" : `⚠ ЗАЩИТА ЧАСТИЧНАЯ — ${Object.values(privacy).filter(Boolean).length}/3 УРОВНЕЙ`}
        </div>
      </div>

      {/* Устройства */}
      <div className="cyber-panel corner-clip p-6">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="Cpu" size={15} className="text-cyber-cyan" />
          <span className="font-orbitron text-sm text-cyber-cyan tracking-wider">УСТРОЙСТВА</span>
        </div>
        {permError && (
          <div className="mb-4 p-2 border border-yellow-500/30 bg-yellow-500/5 text-yellow-400 font-mono-cyber text-xs flex items-center gap-2 corner-clip-sm">
            <Icon name="AlertTriangle" size={11} />{permError}
          </div>
        )}
        {[
          { label: "КАМЕРА", items: videoDevices, value: selectedVideo, set: setSelectedVideo, icon: "Camera" },
          { label: "МИКРОФОН", items: audioInputs, value: selectedAudio, set: setSelectedAudio, icon: "Mic" },
        ].map(({ label, items, value, set, icon }) => (
          <div key={label} className="mb-4 last:mb-0">
            <div className="flex items-center gap-2 mb-2">
              <Icon name={icon} size={11} className="text-muted-foreground" />
              <span className="font-mono-cyber text-[10px] text-muted-foreground">{label}</span>
            </div>
            <select value={value} onChange={(e) => set(e.target.value)}
              className="w-full bg-cyber-dark border border-cyber-border text-white font-mono-cyber text-xs p-2.5 focus:outline-none focus:border-cyber-cyan transition-colors"
              style={{ clipPath: "polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)" }}>
              <option value="default">По умолчанию</option>
              {items.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Устройство ${d.deviceId.slice(0, 8)}`}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* Инфо */}
      <div className="cyber-panel corner-clip p-4" style={{ borderColor: "rgba(157,78,221,0.3)" }}>
        <div className="flex items-start gap-3">
          <Icon name="Info" size={13} className="text-purple-400 mt-0.5 flex-shrink-0" />
          <p className="font-rajdhani text-xs text-muted-foreground leading-relaxed">
            WebRTC использует встроенное DTLS/SRTP шифрование — видео и аудио шифруются напрямую между браузерами.
            Сервер видит только зашифрованные сигнальные сообщения для установки соединения.
          </p>
        </div>
      </div>
    </div>
  );
}

// Подавить предупреждение о неиспользуемом ICO
void ICO;
