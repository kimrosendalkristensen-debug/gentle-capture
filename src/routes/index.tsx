import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/")({
  component: CaptureApp,
});

// ─── Types ───────────────────────────────────────────────

interface Item {
  id: string;
  text: string;
  timestamp: number;
  done?: boolean;
  source: "voice" | "text";
}

type Tab = "capture" | "list";

// ─── Storage ─────────────────────────────────────────────

const LS_ITEMS = "openloops_items";

function loadItems(): Item[] {
  try {
    const raw = localStorage.getItem(LS_ITEMS);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return [];
}

function saveItems(items: Item[]) {
  localStorage.setItem(LS_ITEMS, JSON.stringify(items));
}

// ─── Speech Recognition (Web Speech API — native, no external calls) ─

type SR = typeof window extends { SpeechRecognition: infer T } ? T : any;

function getSpeechRecognition(): any {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

// ─── Main ────────────────────────────────────────────────

function CaptureApp() {
  const [activeTab, setActiveTab] = useState<Tab>("capture");
  const [items, setItems] = useState<Item[]>(loadItems);

  useEffect(() => saveItems(items), [items]);

  const addItem = useCallback((text: string, source: "voice" | "text") => {
    const t = text.trim();
    if (!t) return;
    setItems((prev) => [
      { id: crypto.randomUUID?.() ?? String(Date.now()), text: t, timestamp: Date.now(), source },
      ...prev,
    ]);
  }, []);

  const toggleDone = useCallback((id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const openCount = items.filter((i) => !i.done).length;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground font-sans selection:bg-primary/15 selection:text-primary overflow-hidden">
      <main className="relative min-h-[100dvh] pb-28">
        <AnimatePresence mode="wait">
          {activeTab === "capture" ? (
            <CaptureView key="capture" onSave={addItem} />
          ) : (
            <ListView key="list" items={items} onToggle={toggleDone} onRemove={removeItem} />
          )}
        </AnimatePresence>
      </main>
      <BottomNav activeTab={activeTab} onChange={setActiveTab} openCount={openCount} />
    </div>
  );
}

// ─── Capture View ────────────────────────────────────────

type CaptureMode = "voice" | "text";

function CaptureView({ onSave }: { onSave: (text: string, source: "voice" | "text") => void }) {
  const [mode, setMode] = useState<CaptureMode>("voice");
  const [supported, setSupported] = useState<boolean>(true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [textInput, setTextInput] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const recogRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const countdownTimerRef = useRef<number | null>(null);
  const stoppedByUserRef = useRef(false);

  // Detect support
  useEffect(() => {
    const SR = getSpeechRecognition();
    if (!SR) {
      setSupported(false);
      setMode("text");
    }
  }, []);

  // Keep transcript ref in sync
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const clearCountdown = () => {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
  };

  const startListening = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) return;
    clearCountdown();
    stoppedByUserRef.current = false;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";

    r.onresult = (e: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      if (finalText) {
        setTranscript((prev) => (prev ? prev + " " : "") + finalText.trim());
      }
      setInterim(interimText);
    };

    r.onerror = (e: any) => {
      console.warn("speech error", e?.error);
      setListening(false);
    };

    r.onend = () => {
      setListening(false);
      setInterim("");
      // If user didn't manually stop, try to restart (some browsers auto-end)
      if (!stoppedByUserRef.current && recogRef.current === r) {
        try {
          r.start();
          setListening(true);
        } catch {
          /* ignore */
        }
      }
    };

    try {
      r.start();
      recogRef.current = r;
      setListening(true);
    } catch {
      /* already started */
    }
  }, []);

  const stopListening = useCallback(() => {
    stoppedByUserRef.current = true;
    if (recogRef.current) {
      try { recogRef.current.stop(); } catch { /* ignore */ }
      recogRef.current = null;
    }
    setListening(false);
  }, []);

  // Auto-start voice on mount if supported
  useEffect(() => {
    if (supported && mode === "voice") {
      // small delay so the UI settles
      const t = window.setTimeout(() => startListening(), 250);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [supported, mode, startListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stoppedByUserRef.current = true;
      if (recogRef.current) {
        try { recogRef.current.stop(); } catch { /* ignore */ }
      }
      clearCountdown();
    };
  }, []);

  const triggerSavedFlash = () => {
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1400);
  };

  const startCountdownToRestart = () => {
    clearCountdown();
    setCountdown(3);
    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((c) => {
        if (c === null) return null;
        if (c <= 1) {
          clearCountdown();
          startListening();
          return null;
        }
        return c - 1;
      });
    }, 1000);
  };

  const handleSaveVoice = () => {
    const text = transcriptRef.current.trim();
    if (!text) return;
    onSave(text, "voice");
    setTranscript("");
    setInterim("");
    triggerSavedFlash();
    // stop current session, then restart in 3s unless user cancels
    stoppedByUserRef.current = true;
    if (recogRef.current) {
      try { recogRef.current.stop(); } catch { /* ignore */ }
      recogRef.current = null;
    }
    setListening(false);
    startCountdownToRestart();
  };

  const handleStopVoice = () => {
    stopListening();
    clearCountdown();
    // Switch to text mode as requested
    setMode("text");
  };

  const handleSaveText = () => {
    if (!textInput.trim()) return;
    onSave(textInput, "text");
    setTextInput("");
    triggerSavedFlash();
  };

  // ─── Render ───
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      className="flex flex-col min-h-[calc(100dvh-7rem)] px-5 pt-10"
    >
      {/* Header */}
      <header className="mb-6 animate-drift">
        <p className="font-mono-label text-muted-foreground">Open Loops</p>
        <h1 className="mt-2 font-serif text-2xl leading-tight text-pretty">
          Say it before you forget.
        </h1>
      </header>

      {/* Mode toggle */}
      <div className="flex items-center gap-2 mb-6 animate-drift" style={{ animationDelay: "80ms" }}>
        <button
          disabled={!supported}
          onClick={() => { setMode("voice"); }}
          className={`flex-1 py-2 rounded-full text-sm font-medium transition-all ${
            mode === "voice"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-card text-muted-foreground ring-1 ring-border"
          } ${!supported ? "opacity-40 cursor-not-allowed" : ""}`}
        >
          {supported ? "Voice" : "Voice (unsupported)"}
        </button>
        <button
          onClick={() => { stopListening(); clearCountdown(); setMode("text"); }}
          className={`flex-1 py-2 rounded-full text-sm font-medium transition-all ${
            mode === "text"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-card text-muted-foreground ring-1 ring-border"
          }`}
        >
          Text
        </button>
      </div>

      {/* Capture surface */}
      <div className="flex-1 flex flex-col">
        {mode === "voice" ? (
          <VoiceCapture
            listening={listening}
            transcript={transcript}
            interim={interim}
            countdown={countdown}
            justSaved={justSaved}
            onStart={startListening}
            onStop={handleStopVoice}
            onSave={handleSaveVoice}
            onCancelCountdown={clearCountdown}
          />
        ) : (
          <TextCapture
            value={textInput}
            setValue={setTextInput}
            onSave={handleSaveText}
            justSaved={justSaved}
            onSwitchVoice={supported ? () => setMode("voice") : undefined}
          />
        )}
      </div>
    </motion.section>
  );
}

// ─── Voice Capture ───────────────────────────────────────

function VoiceCapture({
  listening,
  transcript,
  interim,
  countdown,
  justSaved,
  onStart,
  onStop,
  onSave,
  onCancelCountdown,
}: {
  listening: boolean;
  transcript: string;
  interim: string;
  countdown: number | null;
  justSaved: boolean;
  onStart: () => void;
  onStop: () => void;
  onSave: () => void;
  onCancelCountdown: () => void;
}) {
  const hasText = (transcript + " " + interim).trim().length > 0;

  return (
    <div className="flex-1 flex flex-col">
      {/* Transcript area */}
      <div className="flex-1 min-h-[12rem] rounded-3xl bg-card ring-1 ring-border p-5 mb-6">
        {hasText ? (
          <p className="text-xl leading-relaxed text-pretty">
            <span>{transcript}</span>
            {interim && (
              <span className="text-muted-foreground italic"> {interim}</span>
            )}
          </p>
        ) : (
          <p className="text-muted-foreground italic">
            {listening ? "Listening… start speaking your open loop." : "Tap the mic to start."}
          </p>
        )}
      </div>

      {/* Mic + actions */}
      <div className="flex flex-col items-center gap-4 pb-2">
        <button
          onClick={listening ? onStop : onStart}
          aria-label={listening ? "Stop listening" : "Start listening"}
          className={`relative h-20 w-20 rounded-full flex items-center justify-center transition-all ${
            listening
              ? "bg-accent text-accent-foreground animate-pulse-ring"
              : "bg-primary text-primary-foreground"
          }`}
        >
          <MicIcon className="h-8 w-8" />
        </button>

        <div className="h-5 font-mono-label text-muted-foreground">
          {countdown !== null ? (
            <button onClick={onCancelCountdown} className="text-primary">
              Next entry in {countdown}s — tap to cancel
            </button>
          ) : justSaved ? (
            <span className="text-primary">Saved</span>
          ) : listening ? (
            <span>Tap to stop · Speak naturally</span>
          ) : (
            <span>Tap to start</span>
          )}
        </div>

        <div className="flex items-center gap-3 w-full max-w-sm">
          <button
            onClick={onSave}
            disabled={!transcript.trim()}
            className="flex-1 h-12 rounded-full bg-foreground text-background text-sm font-medium disabled:opacity-30 transition-opacity"
          >
            Save loop
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Text Capture ────────────────────────────────────────

function TextCapture({
  value,
  setValue,
  onSave,
  justSaved,
  onSwitchVoice,
}: {
  value: string;
  setValue: (v: string) => void;
  onSave: () => void;
  justSaved: boolean;
  onSwitchVoice?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 min-h-[12rem] rounded-3xl bg-card ring-1 ring-border p-5 mb-6">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSave();
            }
          }}
          rows={6}
          placeholder="What can't be forgotten?"
          className="w-full h-full bg-transparent text-xl leading-relaxed placeholder:text-muted-foreground/60 border-none focus:ring-0 resize-none outline-none"
        />
      </div>

      <div className="flex flex-col items-center gap-3 pb-2">
        <div className="h-5 font-mono-label text-muted-foreground">
          {justSaved ? <span className="text-primary">Saved</span> : <span>⌘ + Enter to save</span>}
        </div>
        <div className="flex items-center gap-3 w-full max-w-sm">
          {onSwitchVoice && (
            <button
              onClick={onSwitchVoice}
              className="h-12 w-12 rounded-full bg-card ring-1 ring-border flex items-center justify-center text-foreground"
              aria-label="Switch to voice"
            >
              <MicIcon className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={onSave}
            disabled={!value.trim()}
            className="flex-1 h-12 rounded-full bg-foreground text-background text-sm font-medium disabled:opacity-30 transition-opacity"
          >
            Save loop
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── List View ───────────────────────────────────────────

function ListView({
  items,
  onToggle,
  onRemove,
}: {
  items: Item[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-xl mx-auto pt-10 pb-6 px-5"
    >
      <header className="mb-6 animate-drift">
        <p className="font-mono-label text-muted-foreground">Open Loops</p>
        <h2 className="mt-2 font-serif text-2xl">
          {open.length === 0 ? "All caught up." : `${open.length} thing${open.length === 1 ? "" : "s"} not to forget`}
        </h2>
      </header>

      {open.length === 0 && done.length === 0 ? (
        <p className="text-muted-foreground italic mt-8">
          Nothing yet. Speak something on the Capture tab.
        </p>
      ) : (
        <ul className="space-y-3">
          {open.map((item, i) => (
            <ItemRow key={item.id} item={item} index={i} onToggle={onToggle} onRemove={onRemove} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <div className="mt-12">
          <p className="font-mono-label text-muted-foreground mb-3">Done</p>
          <ul className="space-y-2 opacity-50">
            {done.map((item, i) => (
              <ItemRow key={item.id} item={item} index={i} onToggle={onToggle} onRemove={onRemove} />
            ))}
          </ul>
        </div>
      )}
    </motion.section>
  );
}

function ItemRow({
  item,
  index,
  onToggle,
  onRemove,
}: {
  item: Item;
  index: number;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.04, ease: [0.32, 0.72, 0, 1] }}
      className="group rounded-2xl bg-card ring-1 ring-border p-4 flex items-start gap-3"
    >
      <button
        onClick={() => onToggle(item.id)}
        aria-label={item.done ? "Mark as open" : "Mark as done"}
        className={`mt-1 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${
          item.done
            ? "bg-primary border-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-primary"
        }`}
      >
        {item.done && <CheckIcon className="h-3 w-3" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-base leading-relaxed text-pretty ${item.done ? "line-through text-muted-foreground" : ""}`}>
          {item.text}
        </p>
        <div className="mt-1.5 flex items-center gap-2 font-mono-label text-muted-foreground">
          <span>{item.source === "voice" ? "Voice" : "Text"}</span>
          <span>·</span>
          <span>{formatRelative(item.timestamp)}</span>
        </div>
      </div>
      <button
        onClick={() => onRemove(item.id)}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all text-xs"
        aria-label="Remove"
      >
        ✕
      </button>
    </motion.li>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ─── Bottom Navigation ───────────────────────────────────

function BottomNav({
  activeTab,
  onChange,
  openCount,
}: {
  activeTab: Tab;
  onChange: (t: Tab) => void;
  openCount: number;
}) {
  const tabs: { key: Tab; label: string }[] = [
    { key: "capture", label: "Capture" },
    { key: "list", label: "Loops" },
  ];
  return (
    <nav className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-card/90 backdrop-blur-xl ring-1 ring-border rounded-full px-1.5 py-1.5 flex items-center gap-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
              activeTab === tab.key
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.key === "list" && openCount > 0 && (
              <span
                className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] font-mono flex items-center justify-center ${
                  activeTab === "list"
                    ? "bg-background text-foreground"
                    : "bg-accent text-accent-foreground"
                }`}
              >
                {openCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}

// ─── Icons ───────────────────────────────────────────────

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
