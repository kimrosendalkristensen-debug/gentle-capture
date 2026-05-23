import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import leafWater from "@/assets/leaf-water.jpg";

export const Route = createFileRoute("/")({
  component: CaptureApp,
});

// ─── Types ───────────────────────────────────────────────

interface Entry {
  id: string;
  text: string;
  timestamp: number;
  archivedAt?: number;
  refined?: boolean;
}

type Tab = "capture" | "stream" | "archive";

// ─── Demo Data ───────────────────────────────────────────

const DEMO_ENTRIES: Entry[] = [
  {
    id: "demo-1",
    text: "The way the light hits the studio floor at 4pm makes everything look like a Renaissance painting. Remind myself to buy more linen.",
    timestamp: Date.now() - 2 * 60 * 60 * 1000,
  },
  {
    id: "demo-2",
    text: "tom monday",
    timestamp: Date.now() - 24 * 60 * 60 * 1000,
  },
  {
    id: "demo-3",
    text: "Ideas for the modular shelving unit: use raw aluminum for the brackets and reclaimed cedar for the planks. Keep the fixings visible.",
    timestamp: Date.now() - 48 * 60 * 60 * 1000,
  },
];

const DEMO_ARCHIVE: Entry[] = [
  {
    id: "demo-4",
    text: "Check if the subscription for the design magazine renewed.",
    timestamp: new Date("2024-10-12").getTime(),
    archivedAt: new Date("2024-10-12").getTime(),
  },
  {
    id: "demo-5",
    text: "The sound of the train at night is a low C sharp.",
    timestamp: new Date("2024-10-10").getTime(),
    archivedAt: new Date("2024-10-10").getTime(),
  },
];

// ─── Utilities ───────────────────────────────────────────

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - ts;
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays === 0) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) + " \u00b7 Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return d.toLocaleDateString("en-US", { weekday: "long" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatArchiveDate(ts: number): string {
  const d = new Date(ts);
  return "Archived " + d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function needsRefinement(text: string): boolean {
  return text.length < 20 || text.split(" ").length < 4;
}

// ─── Local Storage ───────────────────────────────────────

const LS_ENTRIES = "capture_entries";
const LS_ARCHIVE = "capture_archive";

function loadEntries(): Entry[] {
  try {
    const raw = localStorage.getItem(LS_ENTRIES);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return DEMO_ENTRIES;
}

function loadArchive(): Entry[] {
  try {
    const raw = localStorage.getItem(LS_ARCHIVE);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return DEMO_ARCHIVE;
}

function saveEntries(entries: Entry[]) {
  localStorage.setItem(LS_ENTRIES, JSON.stringify(entries));
}

function saveArchive(archive: Entry[]) {
  localStorage.setItem(LS_ARCHIVE, JSON.stringify(archive));
}

// ─── Main Component ──────────────────────────────────────

function CaptureApp() {
  const [activeTab, setActiveTab] = useState<Tab>("capture");
  const [entries, setEntries] = useState<Entry[]>(loadEntries);
  const [archive, setArchive] = useState<Entry[]>(loadArchive);
  const [input, setInput] = useState("");
  const [justCaptured, setJustCaptured] = useState(false);

  useEffect(() => saveEntries(entries), [entries]);
  useEffect(() => saveArchive(archive), [archive]);

  const handleCapture = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const newEntry: Entry = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      text: trimmed,
      timestamp: Date.now(),
    };
    setEntries((prev) => [newEntry, ...prev]);
    setInput("");
    setJustCaptured(true);
    setTimeout(() => setJustCaptured(false), 1500);
  }, [input]);

  const handleArchive = useCallback((id: string) => {
    setEntries((prev) => {
      const entry = prev.find((e) => e.id === id);
      if (!entry) return prev;
      setArchive((a) => [{ ...entry, archivedAt: Date.now() }, ...a]);
      return prev.filter((e) => e.id !== id);
    });
  }, []);

  const handleRefine = useCallback(
    (id: string, newText: string) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, text: newText, refined: true } : e))
      );
    },
    []
  );

  return (
    <div className="min-h-[100dvh] bg-background text-foreground font-sans selection:bg-primary/10 selection:text-primary overflow-hidden">
      <main className="relative min-h-[100dvh] pb-24">
        <AnimatePresence mode="wait">
          {activeTab === "capture" && (
            <CaptureView
              key="capture"
              input={input}
              setInput={setInput}
              onCapture={handleCapture}
              justCaptured={justCaptured}
            />
          )}
          {activeTab === "stream" && (
            <StreamView
              key="stream"
              entries={entries}
              onArchive={handleArchive}
              onRefine={handleRefine}
            />
          )}
          {activeTab === "archive" && <ArchiveView key="archive" archive={archive} />}
        </AnimatePresence>
      </main>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}

// ─── Capture View ────────────────────────────────────────

function CaptureView({
  input,
  setInput,
  onCapture,
  justCaptured,
}: {
  input: string;
  setInput: (v: string) => void;
  onCapture: () => void;
  justCaptured: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onCapture();
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
      className="flex flex-col items-center justify-center min-h-[calc(100dvh-6rem)] px-6"
    >
      <div className="w-full max-w-2xl">
        <div className="mb-4 animate-drift">
          <span className="font-mono-label text-muted-foreground">New Entry</span>
        </div>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          className="w-full bg-transparent text-3xl md:text-4xl font-tight placeholder:text-foreground/10 border-none focus:ring-0 resize-none outline-none leading-tight animate-drift"
          style={{ animationDelay: "100ms" }}
          placeholder="What's on your mind?"
        />
        <div
          className="mt-8 flex items-center gap-4 text-muted-foreground animate-drift"
          style={{ animationDelay: "200ms" }}
        >
          {justCaptured ? (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-xs text-primary font-medium"
            >
              Thought captured. Let it drift...
            </motion.span>
          ) : (
            <span className="text-xs">Press enter to let it drift...</span>
          )}
        </div>
      </div>
    </motion.section>
  );
}

// ─── Stream View ─────────────────────────────────────────

function StreamView({
  entries,
  onArchive,
  onRefine,
}: {
  entries: Entry[];
  onArchive: (id: string) => void;
  onRefine: (id: string, text: string) => void;
}) {
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [refineInput, setRefineInput] = useState("");

  const startRefine = (entry: Entry) => {
    setRefiningId(entry.id);
    setRefineInput(entry.text);
  };

  const submitRefine = () => {
    if (refiningId && refineInput.trim()) {
      onRefine(refiningId, refineInput.trim());
    }
    setRefiningId(null);
    setRefineInput("");
  };

  const cancelRefine = () => {
    setRefiningId(null);
    setRefineInput("");
  };

  const renderEntry = (entry: Entry, index: number) => {
    const isRefining = refiningId === entry.id;
    const showRefinement = !entry.refined && needsRefinement(entry.text) && !isRefining;

    return (
      <div key={entry.id}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.6,
            ease: [0.32, 0.72, 0, 1],
            delay: index * 0.08,
          }}
          className="group relative"
        >
          {isRefining ? (
            <div className="space-y-4">
              <textarea
                value={refineInput}
                onChange={(e) => setRefineInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitRefine();
                  }
                }}
                autoFocus
                className="w-full bg-transparent text-xl leading-relaxed border-none focus:ring-0 resize-none outline-none"
                rows={2}
              />
              <div className="flex gap-3">
                <button
                  onClick={submitRefine}
                  className="px-4 py-2 bg-card rounded-lg text-sm border border-border shadow-sm hover:shadow-md transition-all"
                >
                  Save
                </button>
                <button
                  onClick={cancelRefine}
                  className="px-4 py-2 text-muted-foreground text-sm hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-xl leading-relaxed text-pretty">{entry.text}</div>
              <div className="mt-4 flex items-center gap-6">
                <span className="font-mono-label text-muted-foreground">
                  {formatTimestamp(entry.timestamp)}
                </span>
                <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  {showRefinement && (
                    <button
                      onClick={() => startRefine(entry)}
                      className="font-mono-label text-primary hover:text-primary/80 transition-colors"
                    >
                      Clarify
                    </button>
                  )}
                  <button
                    onClick={() => onArchive(entry.id)}
                    className="font-mono-label text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Archive
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.div>

        {showRefinement && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1], delay: 0.15 }}
            className="bg-primary/5 rounded-2xl p-8 ring-1 ring-primary/10"
          >
            <span className="font-mono-label text-primary mb-4 block">Refinement</span>
            <p className="text-lg mb-6">
              You wrote <span className="italic font-medium">&ldquo;{entry.text}&rdquo;</span> — would you like
              to clarify this?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => startRefine(entry)}
                className="px-4 py-2 bg-card rounded-lg text-sm border border-border shadow-sm hover:shadow-md transition-all"
              >
                Clarify
              </button>
              <button
                onClick={() => onRefine(entry.id, entry.text)}
                className="px-4 py-2 text-muted-foreground text-sm hover:text-foreground transition-colors"
              >
                Skip for now
              </button>
            </div>
          </motion.div>
        )}
      </div>
    );
  };

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-xl mx-auto py-16 md:py-24 px-6"
    >
      <header className="mb-16 animate-drift">
        <h2 className="font-mono-label text-muted-foreground">Recent Thoughts</h2>
      </header>

      {entries.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-muted-foreground text-lg italic">Your stream is quiet right now.</p>
          <p className="text-muted-foreground text-sm mt-2">Capture a thought and it will appear here.</p>
        </div>
      ) : (
        <div className="space-y-24">
          {entries.map((entry, i) => renderEntry(entry, i))}
        </div>
      )}
    </motion.section>
  );
}

// ─── Archive View ────────────────────────────────────────

function ArchiveView({ archive }: { archive: Entry[] }) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-xl mx-auto py-16 md:py-24 px-6"
    >
      <h2 className="font-mono-label text-muted-foreground mb-16 text-center animate-drift">
        Released Thoughts
      </h2>

      {archive.length === 0 ? (
        <div className="text-center py-24 opacity-40">
          <p className="text-lg italic">Nothing archived yet.</p>
          <p className="text-sm mt-2">Thoughts you archive will rest here gently.</p>
        </div>
      ) : (
        <>
          <div className="space-y-16 opacity-40">
            {archive.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  ease: [0.32, 0.72, 0, 1],
                  delay: i * 0.06,
                }}
                className="group"
              >
                <div className="text-lg leading-relaxed line-through decoration-foreground/20">
                  {entry.text}
                </div>
                <div className="mt-2 font-mono-label text-muted-foreground">
                  {formatArchiveDate(entry.archivedAt ?? entry.timestamp)}
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-24 flex flex-col items-center animate-drift" style={{ animationDelay: "400ms" }}>
            <div className="w-full aspect-[2/1] rounded-2xl overflow-hidden ring-1 ring-border">
              <img
                src={leafWater}
                alt="A single leaf floating on still water"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            <p className="mt-8 text-muted-foreground text-sm text-center max-w-xs text-balance italic">
              &ldquo;Capturing a thought is not about holding on; it&apos;s about letting go once it has
              been heard.&rdquo;
            </p>
          </div>
        </>
      )}
    </motion.section>
  );
}

// ─── Bottom Navigation ───────────────────────────────────

function BottomNav({ activeTab, onChange }: { activeTab: Tab; onChange: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: "capture", label: "Capture" },
    { key: "stream", label: "Stream" },
    { key: "archive", label: "Archive" },
  ];

  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-card/80 backdrop-blur-xl ring-1 ring-border rounded-full px-1.5 py-1.5 flex items-center gap-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
              activeTab === tab.key
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
