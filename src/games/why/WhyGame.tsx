import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Loader2, RotateCcw, Send } from "lucide-react";
import {
  createGame,
  sendMessage,
  getGame,
  restartGame,
  type GameMessage,
} from "@/lib/api";

type Phase = "objective" | "debate" | "won" | "error";

interface StoredSession {
  gameId: string;
  sessionToken: string;
  objective: string;
}

const STORAGE_KEY = "why-game-session";

function loadStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export default function WhyGame() {
  const [phase, setPhase] = useState<Phase>("objective");
  const [objective, setObjective] = useState("");
  const [messages, setMessages] = useState<GameMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<StoredSession | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Restore session on mount
  useEffect(() => {
    const stored = loadStoredSession();
    if (!stored) return;

    setSession(stored);
    setObjective(stored.objective);
    setLoading(true);

    getGame(stored.gameId, stored.sessionToken)
      .then((state) => {
        setMessages(state.messages);
        if (state.game.status === "won") {
          setPhase("won");
        } else {
          setPhase("debate");
        }
      })
      .catch(() => {
        clearSession();
        setSession(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // Auto-scroll to newest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleStartGame = useCallback(async () => {
    const trimmed = objective.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError("");
    try {
      const res = await createGame(trimmed);
      const newSession: StoredSession = {
        gameId: res.game_id,
        sessionToken: res.session_token,
        objective: res.objective,
      };
      setSession(newSession);
      saveSession(newSession);
      setMessages([res.message]);
      setPhase("debate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the game");
      setPhase("error");
    } finally {
      setLoading(false);
    }
  }, [objective, loading]);

  const handleSendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading || !session || phase !== "debate") return;

    const userMessage: GameMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const res = await sendMessage(session.gameId, session.sessionToken, trimmed);
      setMessages((prev) => [...prev, res.message]);
      if (res.game_status === "won") {
        setPhase("won");
      }
    } catch (err) {
      setMessages((prev) => prev.slice(0, -1));
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [input, loading, session, phase]);

  const handleRestart = useCallback(async () => {
    if (!session || loading) return;

    setPhase("objective");
    setObjective("");
    setMessages([]);
    setError("");
    clearSession();
    setSession(null);
  }, [session, loading]);

  const handleFullRestart = useCallback(async () => {
    if (!session || loading) return;

    setLoading(true);
    setError("");
    try {
      const res = await restartGame(session.gameId, session.sessionToken);
      setMessages([res.message]);
      setPhase("debate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restart");
    } finally {
      setLoading(false);
    }
  }, [session, loading]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (phase === "objective") {
          handleStartGame();
        } else if (phase === "debate") {
          handleSendMessage();
        }
      }
    },
    [phase, handleStartGame, handleSendMessage],
  );

  // ─── Objective input phase ──────────────────────────────
  if (phase === "objective") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <a
          href="/"
          className="absolute top-6 left-6 flex items-center gap-2 text-stone-400 hover:text-stone-700 transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          back
        </a>

        <div className="w-full max-w-2xl text-center">
          <h1 className="text-6xl sm:text-7xl font-bold tracking-tighter text-stone-900 mb-12">
            WHY?
          </h1>

          <label htmlFor="objective" className="block text-stone-500 text-lg mb-4">
            What are you supposed to be doing?
          </label>

          <textarea
            id="objective"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            maxLength={500}
            autoFocus
            rows={3}
            placeholder="I should study chemistry."
            className="w-full text-center text-lg text-stone-800 bg-stone-50 border border-stone-200 rounded-lg px-4 py-4 focus:outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400 resize-none transition-colors placeholder:text-stone-300"
          />

          <button
            onClick={handleStartGame}
            disabled={loading || !objective.trim()}
            className="mt-6 inline-flex items-center gap-2 bg-stone-900 text-white px-8 py-3 rounded-lg font-medium hover:bg-stone-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                starting...
              </>
            ) : (
              "begin"
            )}
          </button>

          {error && (
            <p className="mt-4 text-red-600 text-sm">{error}</p>
          )}

          <p className="mt-8 text-stone-400 text-xs">
            press enter to begin
          </p>
        </div>
      </div>
    );
  }

  // ─── Won phase ──────────────────────────────────────────
  if (phase === "won") {
    const lastMessage = messages[messages.length - 1];
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <a
          href="/"
          className="absolute top-6 left-6 flex items-center gap-2 text-stone-400 hover:text-stone-700 transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          back
        </a>

        <div className="w-full max-w-2xl text-center">
          <h1 className="text-5xl font-bold text-stone-900 mb-2">You win.</h1>
          <p className="text-stone-400 text-sm mb-8">
            {session?.objective && (
              <>you were supposed to: {session.objective}</>
            )}
          </p>

          {lastMessage && (
            <div className="border border-stone-200 rounded-lg p-6 bg-white mb-8">
              <p className="text-stone-700 text-lg italic">
                {lastMessage.content}
              </p>
            </div>
          )}

          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handleRestart}
              className="inline-flex items-center gap-2 bg-stone-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-stone-700 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              play again
            </button>
            <a
              href="/"
              className="inline-flex items-center gap-2 text-stone-500 hover:text-stone-800 px-6 py-3 rounded-lg font-medium border border-stone-200 hover:border-stone-400 transition-colors"
            >
              return home
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ─── Debate phase ────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-stone-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <a
          href="/"
          className="flex items-center gap-2 text-stone-400 hover:text-stone-700 transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          back
        </a>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          WHY?
        </h1>
        <button
          onClick={handleRestart}
          className="flex items-center gap-2 text-stone-400 hover:text-stone-700 transition-colors text-sm"
        >
          <RotateCcw className="w-4 h-4" />
          new
        </button>
      </header>

      {/* Objective banner */}
      {session?.objective && (
        <div className="bg-stone-50 border-b border-stone-200 px-6 py-3 text-center">
          <span className="text-stone-500 text-sm">
            you should:{" "}
            <span className="text-stone-800 font-medium">
              {session.objective}
            </span>
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={
                msg.role === "assistant"
                  ? "flex justify-start"
                  : "flex justify-end"
              }
            >
              <div
                className={
                  msg.role === "assistant"
                    ? "max-w-[85%] bg-white border border-stone-200 rounded-lg px-5 py-4"
                    : "max-w-[85%] bg-stone-800 text-stone-50 rounded-lg px-5 py-4"
                }
              >
                <p className="whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </p>
                {msg.role === "assistant" && msg.argument_category && (
                  <span className="inline-block mt-2 text-xs text-stone-400 uppercase tracking-wide">
                    {msg.argument_category}
                  </span>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-stone-200 rounded-lg px-5 py-4">
                <div className="flex items-center gap-2 text-stone-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">
                    thinking of another reason...
                  </span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-center">
              <p className="text-red-600 text-sm mb-2">{error}</p>
              <button
                onClick={() => {
                  setError("");
                  if (phase === "debate") handleSendMessage();
                }}
                className="text-stone-500 hover:text-stone-800 text-sm underline"
              >
                try again
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-stone-200 px-6 py-4 flex-shrink-0 bg-white">
        <div className="max-w-2xl mx-auto flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={1}
            placeholder="your counterargument..."
            maxLength={1000}
            className="flex-1 bg-stone-50 border border-stone-200 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400 resize-none transition-colors placeholder:text-stone-300 disabled:opacity-50"
            style={{ maxHeight: "120px" }}
          />
          <button
            onClick={handleSendMessage}
            disabled={loading || !input.trim()}
            className="flex-shrink-0 bg-stone-900 text-white p-3 rounded-lg hover:bg-stone-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="send message"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-center text-stone-300 text-xs mt-2">
          enter to send &middot; shift+enter for new line
        </p>
      </div>
    </div>
  );
}
