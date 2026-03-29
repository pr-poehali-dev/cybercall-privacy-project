import { useState, useRef, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";

type Screen = "home" | "call" | "history" | "settings";

interface CallRecord {
  id: string;
  date: string;
  duration: string;
  status: "completed" | "missed" | "incoming";
  peer: string;
  protected: boolean;
}

const MOCK_HISTORY: CallRecord[] = [
  { id: "1", date: "2026-03-30 14:22", duration: "18:43", status: "completed", peer: "USR-4829", protected: true },
  { id: "2", date: "2026-03-30 09:11", duration: "—", status: "missed", peer: "USR-7731", protected: true },
  { id: "3", date: "2026-03-29 22:05", duration: "04:17", status: "incoming", peer: "USR-1156", protected: false },
  { id: "4", date: "2026-03-28 17:33", duration: "31:02", status: "completed", peer: "USR-9302", protected: true },
  { id: "5", date: "2026-03-27 11:45", duration: "07:58", status: "completed", peer: "USR-5544", protected: true },
];

function DataStream() {
  const chars = "01アイウエオ∂∑∏√∞≈≠±×÷";
  const [streams] = useState(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: 5 + i * 13,
      chars: Array.from({ length: 12 }, (_, j) => chars[(i * 7 + j * 3) % chars.length]),
      speed: 2 + (i % 4),
    }))
  );

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {streams.map((s) => (
        <div
          key={s.id}
          className="absolute top-0 font-mono-cyber text-xs"
          style={{
            left: `${s.x}%`,
            color: "var(--cyber-cyan)",
            opacity: 0.05,
            animation: `data-stream ${s.speed}s ease-in-out infinite`,
            animationDelay: `${s.id * 0.7}s`,
          }}
        >
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
      <div
        className="h-full"
        style={{
          background: "linear-gradient(90deg, transparent, var(--cyber-cyan), transparent)",
          width: "30%",
          animation: active ? "energy-line 2s linear infinite" : "none",
        }}
      />
    </div>
  );
}

function PulsingOrb({ color = "cyan", size = 80 }: { color?: "cyan" | "red" | "gold"; size?: number }) {
  const colorMap = {
    cyan: { c: "#00fff5", s: "rgba(0,255,245," },
    red: { c: "#ff0055", s: "rgba(255,0,85," },
    gold: { c: "#ffd60a", s: "rgba(255,214,10," },
  };
  const { c, s } = colorMap[color];
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full" style={{ border: `1px solid ${c}`, animation: "pulse-glow 2s ease-in-out infinite", boxShadow: `0 0 ${size / 3}px ${s}0.4)` }} />
      <div className="absolute rounded-full" style={{ inset: "18%", border: `1px solid ${c}`, opacity: 0.4, animation: "pulse-glow 2s ease-in-out infinite 0.5s" }} />
      <div className="rounded-full" style={{ width: size * 0.18, height: size * 0.18, background: c, boxShadow: `0 0 ${size / 4}px ${c}` }} />
      <div className="absolute inset-0 animate-rotate-slow" style={{ border: `1px dashed ${s}0.15)`, borderRadius: "50%" }} />
    </div>
  );
}

export default function Index() {
  const [screen, setScreen] = useState<Screen>("home");
  const [generatedLink, setGeneratedLink] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [frontCam, setFrontCam] = useState(true);
  const [privacy, setPrivacy] = useState({ hideIp: true, obfuscate: true, tunnel: true });
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const generateLink = async () => {
    setIsGenerating(true);
    await new Promise((r) => setTimeout(r, 1200));
    const id = Math.random().toString(36).substring(2, 10).toUpperCase();
    setGeneratedLink(`nexus.call/${id}`);
    setIsGenerating(false);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`https://${generatedLink}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startCamera = useCallback(async (useFront: boolean) => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: useFront ? "user" : "environment" },
        audio: true,
      });
      streamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    } catch (_e) { /* camera access denied */ }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (screen === "call") startCamera(frontCam);
    else stopCamera();
  }, [screen]);

  useEffect(() => {
    if (screen === "call") startCamera(frontCam);
  }, [frontCam]);

  useEffect(() => {
    if (inCall) {
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallDuration(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [inCall]);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const toggleMic = () => {
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !micOn; });
    setMicOn((v) => !v);
  };

  const toggleCam = () => {
    streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !camOn; });
    setCamOn((v) => !v);
  };

  return (
    <div className="min-h-screen bg-cyber-dark font-rajdhani relative overflow-hidden">
      <DataStream />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 cyber-panel border-b border-cyber-border">
        <div className="flex items-center gap-3">
          <HexDecor className="text-cyber-cyan" />
          <div>
            <h1 className="font-orbitron text-lg font-black text-cyber-cyan cyber-text-glow tracking-widest animate-flicker">
              NEXUS<span style={{ color: "rgba(255,255,255,0.5)" }}>CALL</span>
            </h1>
            <div className="flex items-center gap-1.5">
              <div className="status-dot" />
              <span className="font-mono-cyber text-[9px] text-muted-foreground">SECURE_CHANNEL_ACTIVE</span>
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
            <button
              key={id}
              onClick={() => setScreen(id)}
              className={`flex items-center gap-1.5 px-3 py-2 font-orbitron text-xs tracking-wider transition-all duration-200 corner-clip-sm ${
                screen === id
                  ? "text-cyber-cyan border border-cyber-cyan/50"
                  : "text-muted-foreground hover:text-cyber-cyan border border-transparent"
              }`}
              style={screen === id ? { background: "rgba(0,255,245,0.08)", boxShadow: "0 0 15px rgba(0,255,245,0.25)" } : {}}
            >
              <Icon name={icon} size={14} />
              <span className="hidden sm:block">{label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="relative z-10">
        {screen === "home" && (
          <HomeScreen
            onGenerate={generateLink}
            generatedLink={generatedLink}
            isGenerating={isGenerating}
            copied={copied}
            onCopy={copyLink}
            onStartCall={() => setScreen("call")}
            privacy={privacy}
          />
        )}
        {screen === "call" && (
          <CallScreen
            localVideoRef={localVideoRef}
            inCall={inCall}
            callDuration={callDuration}
            fmt={fmt}
            micOn={micOn}
            camOn={camOn}
            frontCam={frontCam}
            privacy={privacy}
            onMic={toggleMic}
            onCam={toggleCam}
            onFlip={() => setFrontCam((v) => !v)}
            onEnd={() => { setInCall(false); setScreen("home"); }}
            onStart={() => setInCall(true)}
          />
        )}
        {screen === "history" && <HistoryScreen records={MOCK_HISTORY} />}
        {screen === "settings" && <SettingsScreen privacy={privacy} setPrivacy={setPrivacy} />}
      </main>
    </div>
  );
}

function HomeScreen({ onGenerate, generatedLink, isGenerating, copied, onCopy, onStartCall, privacy }: {
  onGenerate: () => void;
  generatedLink: string;
  isGenerating: boolean;
  copied: boolean;
  onCopy: () => void;
  onStartCall: () => void;
  privacy: { hideIp: boolean; obfuscate: boolean; tunnel: boolean };
}) {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 animate-fade-in">
      {/* Hero */}
      <div className="text-center mb-14 relative">
        <div className="flex justify-center mb-8">
          <PulsingOrb color="cyan" size={110} />
        </div>
        <h2 className="font-orbitron text-4xl md:text-5xl font-black text-white mb-4 tracking-tight leading-tight">
          ЗАЩИЩЁННАЯ<br />
          <span className="text-cyber-cyan cyber-text-glow">СВЯЗЬ</span>
        </h2>
        <p className="font-rajdhani text-lg text-muted-foreground max-w-md mx-auto">
          Видеозвонки без следов. Анонимность. Шифрование. Никакой слежки.
        </p>
        <div className="flex justify-center gap-6 mt-5">
          {([
            { label: "IP СКРЫТ", active: privacy.hideIp, icon: "EyeOff" },
            { label: "ТРАФИК", active: privacy.obfuscate, icon: "Shield" },
            { label: "ТУННЕЛЬ", active: privacy.tunnel, icon: "Lock" },
          ] as const).map(({ label, active, icon }) => (
            <div key={label} className={`flex items-center gap-1.5 font-mono-cyber text-xs ${active ? "text-cyber-cyan" : "text-muted-foreground"}`}>
              <Icon name={icon} size={11} />
              <span>{label}</span>
              <div className={`w-1.5 h-1.5 rounded-full ${active ? "bg-cyber-cyan shadow-[0_0_5px_#00fff5]" : "bg-muted"}`} />
            </div>
          ))}
        </div>
      </div>

      {/* Generate */}
      <div className="cyber-panel corner-clip p-8 mb-6 scan-line">
        <div className="flex items-center gap-2 mb-4">
          <div className="status-dot" />
          <span className="font-orbitron text-xs text-cyber-cyan tracking-widest">ГЕНЕРАЦИЯ СЕССИИ</span>
        </div>
        <EnergyBar active={isGenerating} />
        <div className="mt-5 space-y-4">
          <button
            onClick={onGenerate}
            disabled={isGenerating}
            className="w-full py-4 cyber-btn font-orbitron text-sm tracking-widest font-bold disabled:opacity-50"
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-2">
                <Icon name="Loader2" size={16} className="animate-spin" />
                ГЕНЕРАЦИЯ КЛЮЧА...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Icon name="Zap" size={16} />
                СОЗДАТЬ ЗАЩИЩЁННУЮ ССЫЛКУ
              </span>
            )}
          </button>

          {generatedLink && (
            <div className="animate-scale-in space-y-3">
              <div className="p-4 corner-clip-sm flex items-center justify-between gap-4" style={{ border: "1px solid var(--cyber-cyan)", boxShadow: "var(--cyber-glow)" }}>
                <div>
                  <div className="font-mono-cyber text-[9px] text-muted-foreground mb-1">SESSION_LINK</div>
                  <div className="font-mono-cyber text-cyber-cyan cyber-text-glow text-sm">{generatedLink}</div>
                </div>
                <button
                  onClick={onCopy}
                  className={`px-4 py-2 font-orbitron text-xs transition-all corner-clip-sm ${copied ? "text-cyber-cyan border border-cyber-cyan bg-cyber-cyan/10" : "cyber-btn-gold"}`}
                >
                  {copied
                    ? <span className="flex items-center gap-1"><Icon name="Check" size={12} /> OK</span>
                    : <span className="flex items-center gap-1"><Icon name="Copy" size={12} /> КОПИРОВАТЬ</span>
                  }
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[{ l: "ШИФРОВАНИЕ", v: "AES-256" }, { l: "МАРШРУТ", v: "3 HOP" }, { l: "СТАТУС", v: "ГОТОВ" }].map(({ l, v }) => (
                  <div key={l} className="cyber-panel p-2 text-center corner-clip-sm">
                    <div className="font-mono-cyber text-[9px] text-muted-foreground">{l}</div>
                    <div className="font-mono-cyber text-xs text-cyber-cyan">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4">
        <button onClick={onStartCall} className="cyber-panel corner-clip p-6 text-left transition-all group hover:border-cyber-cyan/40" style={{ border: "1px solid var(--cyber-border)" }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 flex items-center justify-center" style={{ border: "1px solid var(--cyber-cyan)", background: "rgba(0,255,245,0.05)", clipPath: "polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)" }}>
              <Icon name="Video" size={18} className="text-cyber-cyan" />
            </div>
            <span className="font-orbitron text-sm text-white group-hover:text-cyber-cyan transition-colors">ВОЙТИ В ЗВОНОК</span>
          </div>
          <p className="font-rajdhani text-xs text-muted-foreground">Подключиться по ссылке</p>
        </button>

        <div className="cyber-panel corner-clip p-6" style={{ border: "1px solid var(--cyber-border)" }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 flex items-center justify-center" style={{ border: "1px solid var(--cyber-gold)", background: "rgba(255,214,10,0.05)", clipPath: "polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)" }}>
              <Icon name="ShieldCheck" size={18} className="text-cyber-gold" />
            </div>
            <span className="font-orbitron text-sm text-white">ЗАЩИТА АКТИВНА</span>
          </div>
          <p className="font-rajdhani text-xs text-muted-foreground">IP скрыт · Провайдер не видит</p>
        </div>
      </div>
    </div>
  );
}

function CallScreen({ localVideoRef, inCall, callDuration, fmt, micOn, camOn, frontCam, privacy, onMic, onCam, onFlip, onEnd, onStart }: {
  localVideoRef: React.RefObject<HTMLVideoElement>;
  inCall: boolean;
  callDuration: number;
  fmt: (s: number) => string;
  micOn: boolean;
  camOn: boolean;
  frontCam: boolean;
  privacy: { hideIp: boolean; obfuscate: boolean; tunnel: boolean };
  onMic: () => void;
  onCam: () => void;
  onFlip: () => void;
  onEnd: () => void;
  onStart: () => void;
}) {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Remote */}
          <div className="relative corner-clip overflow-hidden" style={{ aspectRatio: "16/9", background: "linear-gradient(135deg, #060d14, #0a1a24)", border: "1px solid var(--cyber-border)" }}>
            <div className="absolute inset-0 grid-bg" />
            <div className="absolute inset-0 flex items-center justify-center">
              {inCall
                ? <div className="text-center"><PulsingOrb color="cyan" size={80} /><p className="font-mono-cyber text-xs text-muted-foreground mt-4">PEER CONNECTED</p></div>
                : <div className="text-center"><PulsingOrb color="gold" size={80} /><p className="font-orbitron text-xs text-muted-foreground mt-4 tracking-widest">ОЖИДАНИЕ СОЕДИНЕНИЯ</p></div>
              }
            </div>
            {/* HUD top-left */}
            <div className="absolute top-3 left-3 font-mono-cyber text-[9px] text-cyber-cyan/50 space-y-0.5">
              <div>RES: 1080p</div><div>CODEC: VP9</div><div>LAT: 12ms</div>
            </div>
            {inCall && (
              <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/50 px-2 py-1 corner-clip-sm">
                <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_#ff0055]" style={{ animation: "pulse-glow 1s infinite" }} />
                <span className="font-mono-cyber text-xs text-white">{fmt(callDuration)}</span>
              </div>
            )}
            {/* Corners */}
            <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-cyber-cyan/30" />
            <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-cyber-cyan/30" />
            <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-cyber-cyan/30" />
            <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-cyber-cyan/30" />
            {/* Bottom bar */}
            <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between" style={{ background: "linear-gradient(transparent, rgba(6,10,16,0.8))" }}>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${privacy.hideIp ? "bg-cyber-cyan shadow-[0_0_5px_#00fff5]" : "bg-muted"}`} />
                <span className="font-mono-cyber text-[9px] text-cyber-cyan/70">IP: MASKED</span>
              </div>
              <div className="font-mono-cyber text-[9px] text-muted-foreground">E2E ENCRYPTED</div>
            </div>
          </div>

          {/* Local + stats */}
          <div className="flex gap-4">
            <div className="relative flex-shrink-0 overflow-hidden" style={{ width: 180, aspectRatio: "4/3", border: "1px solid var(--cyber-border)", clipPath: "polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px)", background: "#060d14" }}>
              <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" style={{ transform: frontCam ? "scaleX(-1)" : "none", opacity: camOn ? 1 : 0.2 }} />
              {!camOn && <div className="absolute inset-0 flex items-center justify-center bg-black/60"><Icon name="VideoOff" size={20} className="text-muted-foreground" /></div>}
              <div className="absolute top-1 left-1 font-mono-cyber text-[8px] text-cyber-cyan/50">{frontCam ? "FRONT" : "REAR"}</div>
              <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-cyber-cyan/30" />
              <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-cyber-cyan/30" />
              <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-cyber-cyan/30" />
              <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-cyber-cyan/30" />
            </div>
            <div className="flex-1 cyber-panel p-4 corner-clip-sm space-y-1.5">
              <div className="font-mono-cyber text-[9px] text-muted-foreground mb-2">ПАРАМЕТРЫ СЕССИИ</div>
              {[
                { l: "ВИДЕО", v: camOn ? "АКТИВЕН" : "ОТКЛ", ok: camOn },
                { l: "АУДИО", v: micOn ? "АКТИВЕН" : "МУТ", ok: micOn },
                { l: "КАМЕРА", v: frontCam ? "ФРОНТ" : "ОСНОВНАЯ", ok: true },
                { l: "МАРШРУТ", v: privacy.tunnel ? "TOR·3HOP" : "ПРЯМОЙ", ok: privacy.tunnel },
              ].map(({ l, v, ok }) => (
                <div key={l} className="flex justify-between">
                  <span className="font-mono-cyber text-[10px] text-muted-foreground">{l}</span>
                  <span className={`font-mono-cyber text-[10px] ${ok ? "text-cyber-cyan" : "text-red-400"}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <div className="cyber-panel corner-clip p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-orbitron text-xs text-cyber-cyan tracking-wider">СТАТУС</span>
              <div className={`w-2 h-2 rounded-full ${inCall ? "bg-cyber-cyan shadow-[0_0_6px_#00fff5]" : "bg-cyber-gold shadow-[0_0_6px_#ffd60a]"}`} style={{ animation: "pulse-glow 2s infinite" }} />
            </div>
            <div className="font-mono-cyber text-2xl text-white mb-1">{inCall ? fmt(callDuration) : "00:00"}</div>
            <div className="font-mono-cyber text-[9px] text-muted-foreground mb-2">{inCall ? "СОЕДИНЕНИЕ АКТИВНО" : "ОЖИДАНИЕ"}</div>
            <EnergyBar active={inCall} />
          </div>

          <div className="cyber-panel corner-clip p-4 space-y-2">
            <span className="font-orbitron text-xs text-cyber-cyan tracking-wider block mb-3">УПРАВЛЕНИЕ</span>
            <button onClick={onMic} className={`w-full py-3 font-orbitron text-xs tracking-wider flex items-center justify-center gap-2 corner-clip-sm transition-all ${micOn ? "cyber-btn" : "cyber-btn-danger"}`}>
              <Icon name={micOn ? "Mic" : "MicOff"} size={13} />
              {micOn ? "МИК АКТИВЕН" : "МИК ВЫКЛ"}
            </button>
            <button onClick={onCam} className={`w-full py-3 font-orbitron text-xs tracking-wider flex items-center justify-center gap-2 corner-clip-sm transition-all ${camOn ? "cyber-btn" : "cyber-btn-danger"}`}>
              <Icon name={camOn ? "Video" : "VideoOff"} size={13} />
              {camOn ? "КАМЕРА ВКЛ" : "КАМЕРА ВЫКЛ"}
            </button>
            <button onClick={onFlip} className="w-full py-3 cyber-btn-gold font-orbitron text-xs tracking-wider flex items-center justify-center gap-2 corner-clip-sm transition-all">
              <Icon name="RefreshCw" size={13} />
              {frontCam ? "→ ОСНОВНАЯ" : "→ ФРОНТАЛЬНАЯ"}
            </button>
          </div>

          <div className="cyber-panel corner-clip p-4">
            <span className="font-orbitron text-xs text-cyber-cyan tracking-wider block mb-3">ПРИВАТНОСТЬ</span>
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

          {!inCall ? (
            <button onClick={onStart} className="w-full py-4 cyber-btn font-orbitron text-sm tracking-widest font-bold animate-pulse-glow flex items-center justify-center gap-2">
              <Icon name="PhoneCall" size={15} />
              НАЧАТЬ ЗВОНОК
            </button>
          ) : (
            <button onClick={onEnd} className="w-full py-4 cyber-btn-danger font-orbitron text-sm tracking-widest font-bold flex items-center justify-center gap-2 transition-all hover:scale-105">
              <Icon name="PhoneOff" size={15} />
              ЗАВЕРШИТЬ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryScreen({ records }: { records: CallRecord[] }) {
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
        <button className="cyber-btn-danger px-4 py-2 font-orbitron text-xs tracking-wider flex items-center gap-2 corner-clip-sm">
          <Icon name="Trash2" size={12} />
          ОЧИСТИТЬ
        </button>
      </div>

      <div className="space-y-2">
        {records.map((r, i) => (
          <div key={r.id} className="cyber-panel corner-clip p-4 flex items-center gap-4 hover:border-cyber-cyan/20 transition-all group" style={{ border: "1px solid var(--cyber-border)", animationDelay: `${i * 0.06}s` }}>
            <div className={`flex-shrink-0 ${colors[r.status]}`}>
              <Icon name={icons[r.status]} size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono-cyber text-sm text-white">{r.peer}</span>
                {r.protected && (
                  <span className="font-mono-cyber text-[9px] px-1.5 py-0.5 text-cyber-cyan border border-cyber-cyan/30 bg-cyber-cyan/5">ENC</span>
                )}
              </div>
              <div className="font-mono-cyber text-[10px] text-muted-foreground mt-0.5">{r.date}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`font-mono-cyber text-xs ${colors[r.status]}`}>{labels[r.status]}</div>
              <div className="font-mono-cyber text-[10px] text-muted-foreground">{r.duration}</div>
            </div>
            <button className="opacity-0 group-hover:opacity-100 transition-opacity cyber-btn px-2 py-1.5 flex-shrink-0 corner-clip-sm">
              <Icon name="PhoneCall" size={11} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-3 gap-3">
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

function SettingsScreen({ privacy, setPrivacy }: {
  privacy: { hideIp: boolean; obfuscate: boolean; tunnel: boolean };
  setPrivacy: React.Dispatch<React.SetStateAction<{ hideIp: boolean; obfuscate: boolean; tunnel: boolean }>>;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState("default");
  const [selectedAudio, setSelectedAudio] = useState("default");

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(setDevices).catch(() => {});
  }, []);

  const toggle = (key: keyof typeof privacy) => setPrivacy((p) => ({ ...p, [key]: !p[key] }));
  const videoDevices = devices.filter((d) => d.kind === "videoinput");
  const audioInputs = devices.filter((d) => d.kind === "audioinput");

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 animate-fade-in space-y-6">
      <div>
        <h2 className="font-orbitron text-xl text-cyber-cyan cyber-text-glow tracking-widest">НАСТРОЙКИ СИСТЕМЫ</h2>
        <p className="font-mono-cyber text-[10px] text-muted-foreground mt-1">КОНФИГУРАЦИЯ ПРИВАТНОСТИ И УСТРОЙСТВ</p>
      </div>

      {/* Privacy */}
      <div className="cyber-panel corner-clip p-6 scan-line">
        <div className="flex items-center gap-2 mb-5">
          <Icon name="Shield" size={15} className="text-cyber-cyan" />
          <span className="font-orbitron text-sm text-cyber-cyan tracking-wider">ПРИВАТНОСТЬ</span>
        </div>
        <div className="space-y-1">
          {([
            { key: "hideIp" as const, label: "Скрыть IP-адрес", desc: "Реальный адрес заменяется выходным узлом сети", icon: "EyeOff" },
            { key: "obfuscate" as const, label: "Маскировать трафик", desc: "Данные выглядят как обычный HTTPS для провайдера", icon: "Activity" },
            { key: "tunnel" as const, label: "Многоуровневый туннель", desc: "3-hop маршрут скрывает активность от оператора", icon: "Lock" },
          ]).map(({ key, label, desc, icon }) => (
            <div key={key} className="flex items-start justify-between gap-4 py-4 border-b border-cyber-border/50 last:border-0">
              <div className="flex gap-3">
                <Icon name={icon} size={15} className={privacy[key] ? "text-cyber-cyan mt-0.5" : "text-muted-foreground mt-0.5"} />
                <div>
                  <div className={`font-rajdhani text-sm font-semibold ${privacy[key] ? "text-white" : "text-muted-foreground"}`}>{label}</div>
                  <div className="font-rajdhani text-xs text-muted-foreground">{desc}</div>
                </div>
              </div>
              <button
                onClick={() => toggle(key)}
                className="flex-shrink-0 w-12 h-6 relative corner-clip-sm transition-all duration-300"
                style={{
                  background: privacy[key] ? "rgba(0,255,245,0.15)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${privacy[key] ? "var(--cyber-cyan)" : "var(--cyber-border)"}`,
                  boxShadow: privacy[key] ? "0 0 10px rgba(0,255,245,0.25)" : "none",
                }}
              >
                <div
                  className="absolute top-0.5 bottom-0.5 w-5 transition-all duration-300"
                  style={{
                    [privacy[key] ? "right" : "left"]: "2px",
                    background: privacy[key] ? "var(--cyber-cyan)" : "rgba(255,255,255,0.3)",
                    boxShadow: privacy[key] ? "0 0 6px var(--cyber-cyan)" : "none",
                    clipPath: "polygon(2px 0%, 100% 0%, calc(100% - 2px) 100%, 0% 100%)",
                  }}
                />
              </button>
            </div>
          ))}
        </div>

        <div className={`mt-4 p-3 corner-clip-sm text-center font-mono-cyber text-xs border ${
          Object.values(privacy).every(Boolean)
            ? "border-cyber-cyan/30 bg-cyber-cyan/5 text-cyber-cyan"
            : "border-red-500/30 bg-red-500/5 text-red-400"
        }`}>
          {Object.values(privacy).every(Boolean)
            ? "✓ МАКСИМАЛЬНАЯ ЗАЩИТА АКТИВНА"
            : `⚠ ЗАЩИТА ЧАСТИЧНАЯ — ${Object.values(privacy).filter(Boolean).length}/3 УРОВНЕЙ`}
        </div>
      </div>

      {/* Devices */}
      <div className="cyber-panel corner-clip p-6">
        <div className="flex items-center gap-2 mb-5">
          <Icon name="Cpu" size={15} className="text-cyber-cyan" />
          <span className="font-orbitron text-sm text-cyber-cyan tracking-wider">УСТРОЙСТВА</span>
        </div>
        <div className="space-y-4">
          {[
            { label: "КАМЕРА", items: videoDevices, value: selectedVideo, set: setSelectedVideo, icon: "Camera" },
            { label: "МИКРОФОН", items: audioInputs, value: selectedAudio, set: setSelectedAudio, icon: "Mic" },
          ].map(({ label, items, value, set, icon }) => (
            <div key={label}>
              <div className="flex items-center gap-2 mb-2">
                <Icon name={icon} size={11} className="text-muted-foreground" />
                <span className="font-mono-cyber text-[10px] text-muted-foreground">{label}</span>
              </div>
              <select
                value={value}
                onChange={(e) => set(e.target.value)}
                className="w-full bg-cyber-dark border border-cyber-border text-white font-mono-cyber text-xs p-2.5 focus:outline-none focus:border-cyber-cyan transition-colors"
                style={{ clipPath: "polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)" }}
              >
                <option value="default">По умолчанию</option>
                {items.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Устройство ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="cyber-panel corner-clip p-4" style={{ borderColor: "rgba(157,78,221,0.3)" }}>
        <div className="flex items-start gap-3">
          <Icon name="Info" size={13} className="text-purple-400 mt-0.5 flex-shrink-0" />
          <p className="font-rajdhani text-xs text-muted-foreground leading-relaxed">
            Маскировка трафика использует обфускацию — данные выглядят как обычный веб-трафик. 
            IP скрывается через многоуровневую маршрутизацию, оператор видит только зашифрованный поток.
          </p>
        </div>
      </div>
    </div>
  );
}