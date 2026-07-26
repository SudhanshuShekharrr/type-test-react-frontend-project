import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "./styles.css";

const samples = [
  "The quick brown fox jumps over the lazy dog while the rain taps softly on the window.",
  "Typing gets easier when you keep your eyes on the words and let your hands find a steady pace.",
  "Small practice sessions every day can make your speed better without making the work feel heavy.",
  "I opened the laptop, made a cup of tea, and started typing until the page looked a little less empty."
];

const wordBank = [
  "quick", "brown", "fox", "jumps", "lazy", "dog", "window", "rain", "steady",
  "practice", "pace", "words", "eyes", "hands", "cup", "tea", "laptop", "empty",
  "page", "typing", "speed", "better", "heavy", "small", "session", "every",
  "day", "keep", "find", "started", "looked", "little", "opened", "made",
  "until", "while", "softly", "taps", "over", "gets", "when", "your", "make",
  "work", "feel", "without", "light", "bridge", "garden", "river", "mountain",
  "coffee", "keyboard", "screen", "focus", "rhythm", "finger", "sentence",
  "letter", "phrase", "paragraph", "accuracy", "mistake", "correct", "learn",
  "improve", "challenge", "quiet", "morning", "evening", "journey", "puzzle",
  "story", "voice", "music", "silence", "pattern", "habit", "routine"
];

const STATS_KEY = "typingWeakSpotStats";
const HISTORY_KEY = "typingTestHistory";
const MAX_HISTORY = 10;

// ---------- Real generative AI (Google Gemini) ----------

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

async function callGeminiAI(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing VITE_GEMINI_API_KEY — add it to your .env file.");
  }
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });
  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }
  return text.trim();
}

// Asks Gemini to act as a typing coach and give short, specific, encouraging feedback.
async function getAICoachFeedback({ wpm, accuracy, mistakes, weakChars }) {
  const prompt = `You are a friendly, encouraging typing coach. A student just finished a typing test with these results:
- Speed: ${wpm} WPM
- Accuracy: ${accuracy}%
- Mistakes: ${mistakes}
- Their weakest keys so far: ${weakChars.length > 0 ? weakChars.join(", ") : "not enough data yet"}

Write 2-3 short sentences of specific, encouraging feedback and one practical tip to improve. Keep it under 55 words. Do not use markdown formatting or headers, plain text only.`;
  return callGeminiAI(prompt);
}

// Asks Gemini to generate a natural paragraph that emphasizes the user's weak letters.
async function getAIGeneratedParagraph(weakChars) {
  const focusLetters = weakChars.length > 0 ? weakChars.join(", ") : "e, a, t, o, n";
  const prompt = `Write one natural-sounding English paragraph of about 25-30 words, suitable as typing practice text. Make sure it contains several words that include these letters: ${focusLetters}. Only output the paragraph itself, no quotation marks, no title, no explanation.`;
  const text = await callGeminiAI(prompt);
  return text.replace(/^["']|["']$/g, "").trim();
}

// ---------- Helpers ----------

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getMistakes(target, typed) {
  return typed.split("").reduce((total, char, index) => {
    return total + (char === target[index] ? 0 : 1);
  }, 0);
}

function loadJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage unavailable — fail silently, feature just won't persist
  }
}

// ---------- Local rule-based adaptive engine (offline, instant) ----------

function updateStats(prevStats, target, typed) {
  const next = { ...prevStats };
  typed.split("").forEach((char, index) => {
    const expected = target[index];
    if (!expected) return;
    const key = expected.toLowerCase();
    if (!/[a-z]/.test(key)) return;
    const existing = next[key] || { attempts: 0, mistakes: 0 };
    next[key] = {
      attempts: existing.attempts + 1,
      mistakes: existing.mistakes + (char === expected ? 0 : 1)
    };
  });
  return next;
}

function getWeakChars(stats, count = 5, minAttempts = 4) {
  return Object.entries(stats)
    .filter(([, s]) => s.attempts >= minAttempts)
    .map(([char, s]) => ({ char, rate: s.mistakes / s.attempts }))
    .filter((entry) => entry.rate > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, count)
    .map((entry) => entry.char);
}

function scoreWord(word, weakChars) {
  if (weakChars.length === 0) return 0;
  return word
    .toLowerCase()
    .split("")
    .filter((c) => weakChars.includes(c)).length;
}

function generateAdaptiveText(weakChars, wordCount = 16) {
  if (weakChars.length === 0) return null;
  const weighted = [];
  wordBank.forEach((word) => {
    const weight = scoreWord(word, weakChars) + 1;
    for (let i = 0; i < weight; i++) weighted.push(word);
  });
  const chosen = [];
  for (let i = 0; i < wordCount; i++) {
    chosen.push(weighted[Math.floor(Math.random() * weighted.length)]);
  }
  const sentence = chosen.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

function computeSummary(history) {
  if (history.length === 0) return null;
  const avgWpm = Math.round(history.reduce((s, h) => s + h.wpm, 0) / history.length);
  const avgAccuracy = Math.round(history.reduce((s, h) => s + h.accuracy, 0) / history.length);
  const bestWpm = Math.max(...history.map((h) => h.wpm));
  return { avgWpm, avgAccuracy, bestWpm, count: history.length };
}

// ---------- Presentational components ----------

function StatCard({ label, value, suffix }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>
        {value}
        {suffix && <small>{suffix}</small>}
      </strong>
    </div>
  );
}

function WpmChart({ history }) {
  if (history.length === 0) return null;
  const barWidth = 32;
  const gap = 14;
  const chartHeight = 110;
  const max = Math.max(...history.map((h) => h.wpm), 10);
  const width = history.length * (barWidth + gap);
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${chartHeight + 34}`} preserveAspectRatio="xMinYMin meet">
      {history.map((entry, index) => {
        const barHeight = Math.max((entry.wpm / max) * chartHeight, 2);
        const x = index * (barWidth + gap);
        const y = chartHeight - barHeight;
        return (
          <g key={entry.timestamp}>
            <rect x={x} y={y} width={barWidth} height={barHeight} rx="4" fill="#7c3aed" />
            <text x={x + barWidth / 2} y={y - 6} fontSize="11" textAnchor="middle" fill="#1b1f2e">
              {entry.wpm}
            </text>
            <text x={x + barWidth / 2} y={chartHeight + 18} fontSize="11" textAnchor="middle" fill="#9ca3af">
              #{index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function AlphabetHeatmap({ stats }) {
  const letters = "abcdefghijklmnopqrstuvwxyz".split("");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(13, 1fr)", gap: "6px" }}>
      {letters.map((letter) => {
        const s = stats[letter];
        let bg = "#e9ecef";
        let title = "No data yet";
        if (s && s.attempts > 0) {
          const rate = s.mistakes / s.attempts;
          if (rate === 0) bg = "#16a34a";
          else if (rate < 0.15) bg = "#f59e0b";
          else bg = "#dc2626";
          title = `${s.attempts} attempts, ${Math.round(rate * 100)}% error rate`;
        }
        return (
          <div
            key={letter}
            title={title}
            style={{
              backgroundColor: bg,
              color: "#fff",
              textAlign: "center",
              padding: "7px 0",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 700,
              textTransform: "uppercase"
            }}
          >
            {letter}
          </div>
        );
      })}
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span className="d-inline-flex align-items-center me-3">
      <span
        style={{ display: "inline-block", width: 10, height: 10, backgroundColor: color, borderRadius: 2, marginRight: 6 }}
      />
      {label}
    </span>
  );
}

// ---------- Main component ----------

function TypingSpeedChecker() {
  const [sampleIndex, setSampleIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [startedAt, setStartedAt] = useState(null);
  const [endedAt, setEndedAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef(null);

  const [charStats, setCharStats] = useState(() => loadJSON(STATS_KEY, {}));
  const [history, setHistory] = useState(() => loadJSON(HISTORY_KEY, []));
  const [mode, setMode] = useState("standard"); // "standard" | "adaptive"
  const [adaptiveText, setAdaptiveText] = useState(null);
  const [showExplainer, setShowExplainer] = useState(false);

  const [aiFeedback, setAiFeedback] = useState(null);
  const [aiFeedbackLoading, setAiFeedbackLoading] = useState(false);
  const [aiParagraphLoading, setAiParagraphLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  const weakChars = useMemo(() => getWeakChars(charStats), [charStats]);
  const summary = useMemo(() => computeSummary(history), [history]);

  const target = mode === "adaptive" && adaptiveText ? adaptiveText : samples[sampleIndex];
  const isComplete = typed.length >= target.length;

  useEffect(() => {
    if (!startedAt || endedAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [startedAt, endedAt]);

  // Fires once when a test finishes: updates local stats, history, and calls
  // the real Gemini AI for personalized coach feedback.
  useEffect(() => {
    if (isComplete && startedAt && !endedAt) {
      const finishTime = Date.now();
      setEndedAt(finishTime);

      setCharStats((prev) => {
        const next = updateStats(prev, target, typed);
        saveJSON(STATS_KEY, next);
        return next;
      });

      const finalElapsedSeconds = Math.max((finishTime - startedAt) / 1000, 0.001);
      const finalMistakes = getMistakes(target, typed);
      const finalCorrect = Math.max(typed.length - finalMistakes, 0);
      const finalAccuracy = typed.length ? Math.round((finalCorrect / typed.length) * 100) : 100;
      const finalWpm = Math.round((finalCorrect / 5 / finalElapsedSeconds) * 60);

      setHistory((prev) => {
        const entry = { timestamp: finishTime, wpm: finalWpm, accuracy: finalAccuracy, mistakes: finalMistakes, mode };
        const next = [...prev, entry].slice(-MAX_HISTORY);
        saveJSON(HISTORY_KEY, next);
        return next;
      });

      // Real AI call — ask Gemini for personalized coaching feedback.
      setAiFeedback(null);
      setAiFeedbackLoading(true);
      setAiError(null);
      getAICoachFeedback({ wpm: finalWpm, accuracy: finalAccuracy, mistakes: finalMistakes, weakChars })
        .then((feedback) => setAiFeedback(feedback))
        .catch(() => setAiError("AI Coach could not be reached. Check your API key or internet connection."))
        .finally(() => setAiFeedbackLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete, startedAt, endedAt]);

  const elapsedSeconds = useMemo(() => {
    if (!startedAt) return 0;
    return Math.max(((endedAt || now) - startedAt) / 1000, 0);
  }, [startedAt, endedAt, now]);

  const mistakes = getMistakes(target, typed);
  const correctChars = Math.max(typed.length - mistakes, 0);
  const accuracy = typed.length ? Math.round((correctChars / typed.length) * 100) : 100;
  const wpm = elapsedSeconds > 0 ? Math.round((correctChars / 5 / elapsedSeconds) * 60) : 0;
  const progress = Math.min(Math.round((typed.length / target.length) * 100), 100);

  function handleChange(event) {
    const value = event.target.value.slice(0, target.length);
    if (!startedAt && value.length > 0) {
      setStartedAt(Date.now());
      setNow(Date.now());
    }
    if (!endedAt) setTyped(value);
  }

  function resetTest(nextIndex = sampleIndex) {
    setSampleIndex(nextIndex);
    setTyped("");
    setStartedAt(null);
    setEndedAt(null);
    setNow(Date.now());
    setAiFeedback(null);
    setAiError(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function nextSample() {
    if (mode === "adaptive") {
      setAdaptiveText(generateAdaptiveText(weakChars));
      resetTest(sampleIndex);
    } else {
      resetTest((sampleIndex + 1) % samples.length);
    }
  }

  // Local, offline, rule-based adaptive practice (instant, no API call).
  function startAdaptiveRound() {
    const text = generateAdaptiveText(weakChars);
    setAdaptiveText(text);
    setMode("adaptive");
    resetTest(sampleIndex);
  }

  // Real generative AI practice text — calls Gemini.
  async function startAIAdaptiveRound() {
    setAiParagraphLoading(true);
    setAiError(null);
    try {
      const text = await getAIGeneratedParagraph(weakChars);
      setAdaptiveText(text);
      setMode("adaptive");
      resetTest(sampleIndex);
    } catch (err) {
      setAiError("Could not reach Gemini AI. Using local adaptive text instead.");
      startAdaptiveRound();
    } finally {
      setAiParagraphLoading(false);
    }
  }

  function backToStandard() {
    setMode("standard");
    setAdaptiveText(null);
    resetTest(sampleIndex);
  }

  function resetProgress() {
    setCharStats({});
    setHistory([]);
    saveJSON(STATS_KEY, {});
    saveJSON(HISTORY_KEY, []);
  }

  return (
    <main className="app-shell">
      <section className="container py-4">
        <div className="row justify-content-center">
          <div className="col-12 col-lg-9 col-xl-8">
            <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 mb-3">
              <div>
                <h1 className="h3 fw-semibold mb-1">
                  AI Adaptive Typing Coach{" "}
                  {mode === "adaptive" && <span className="badge bg-info text-dark ms-2">Adaptive Mode</span>}
                </h1>
                <p className="text-secondary mb-0">Start typing below. The timer begins after your first key.</p>
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-sm btn-outline-secondary" onClick={nextSample} type="button">
                  Change Text
                </button>
                <button className="btn btn-sm btn-outline-danger" onClick={resetProgress} type="button">
                  Reset AI Data
                </button>
              </div>
            </div>

            {aiError && <div className="alert alert-warning py-2 px-3 mb-3">{aiError}</div>}

            {weakChars.length > 0 && (
              <div className="mb-3 p-3 border rounded d-flex flex-wrap align-items-center gap-2">
                <span className="text-secondary">AI-detected weak keys:</span>
                {weakChars.map((c) => (
                  <span className="badge bg-danger" key={c}>
                    {c}
                  </span>
                ))}
                {mode === "standard" ? (
                  <div className="d-flex gap-2 ms-auto">
                    <button className="btn btn-sm btn-dark" onClick={startAdaptiveRound} type="button">
                      Practice (Local AI)
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={startAIAdaptiveRound}
                      type="button"
                      disabled={aiParagraphLoading}
                    >
                      {aiParagraphLoading ? "Asking Gemini..." : "Generate with Gemini AI"}
                    </button>
                  </div>
                ) : (
                  <button className="btn btn-sm btn-outline-secondary ms-auto" onClick={backToStandard} type="button">
                    Back to standard practice
                  </button>
                )}
              </div>
            )}

            <div className="stats-grid mb-4">
              <StatCard label="Speed" value={wpm} suffix="WPM" />
              <StatCard label="Accuracy" value={accuracy} suffix="%" />
              <StatCard label="Time" value={elapsedSeconds.toFixed(1)} suffix="sec" />
              <StatCard label="Mistakes" value={mistakes} suffix="" />
            </div>

            <div className="typing-panel">
              <div className="progress mb-4" role="progressbar" aria-label="Typing progress">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>

              <div className="sample-text mb-4" aria-label="Text to type">
                {target.split("").map((char, index) => {
                  let className = "";
                  if (typed[index]) {
                    className = typed[index] === char ? "correct" : "wrong";
                  } else if (index === typed.length) {
                    className = "current";
                  }
                  return (
                    <span className={className} key={`${char}-${index}`}>
                      {char}
                    </span>
                  );
                })}
              </div>

              <textarea
                ref={inputRef}
                className="form-control typing-input"
                value={typed}
                onChange={handleChange}
                placeholder="Start typing here..."
                rows="5"
                disabled={Boolean(endedAt)}
                autoFocus
              />

              <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 mt-4">
                <div className={`result-message ${endedAt ? "show" : ""}`} aria-live="polite">
                  {endedAt
                    ? `Done: ${countWords(target)} words at ${wpm} WPM.`
                    : `${target.length - typed.length} characters left`}
                </div>
                <button className="btn btn-dark" onClick={() => resetTest()} type="button">
                  Restart
                </button>
              </div>
            </div>

            {/* ---------- Real AI Coach feedback (Gemini) ---------- */}
            {(aiFeedbackLoading || aiFeedback) && (
              <div className="p-3 border rounded mt-4 ai-coach-card">
                <h5 className="mb-2">AI Coach (Gemini)</h5>
                {aiFeedbackLoading ? (
                  <p className="text-secondary mb-0">Analyzing your performance...</p>
                ) : (
                  <p className="mb-0">{aiFeedback}</p>
                )}
              </div>
            )}

            <div className="row mt-5">
              <div className="col-12 col-lg-6 mb-4">
                <div className="p-3 border rounded h-100">
                  <h5 className="mb-3">Speed progress {history.length > 0 && `(last ${history.length} tests)`}</h5>
                  {history.length > 0 ? (
                    <WpmChart history={history} />
                  ) : (
                    <p className="text-secondary mb-0">Complete a few tests to see your trend.</p>
                  )}
                </div>
              </div>
              <div className="col-12 col-lg-6 mb-4">
                <div className="p-3 border rounded h-100">
                  <h5 className="mb-3">Character accuracy map</h5>
                  <AlphabetHeatmap stats={charStats} />
                  <div className="d-flex flex-wrap mt-3 small text-secondary">
                    <LegendDot color="#16a34a" label="Strong" />
                    <LegendDot color="#f59e0b" label="Needs work" />
                    <LegendDot color="#dc2626" label="Weak" />
                    <LegendDot color="#e9ecef" label="No data" />
                  </div>
                </div>
              </div>
            </div>

            {summary && (
              <div className="p-3 border rounded mb-4 d-flex flex-wrap gap-4">
                <div>
                  <span className="text-secondary d-block small">Tests taken</span>
                  <strong>{summary.count}</strong>
                </div>
                <div>
                  <span className="text-secondary d-block small">Average WPM</span>
                  <strong>{summary.avgWpm}</strong>
                </div>
                <div>
                  <span className="text-secondary d-block small">Average accuracy</span>
                  <strong>{summary.avgAccuracy}%</strong>
                </div>
                <div>
                  <span className="text-secondary d-block small">Best WPM</span>
                  <strong>{summary.bestWpm}</strong>
                </div>
              </div>
            )}

            <div className="mb-5">
              <button className="btn btn-sm btn-link ps-0" onClick={() => setShowExplainer((v) => !v)} type="button">
                {showExplainer ? "Hide explanation" : "How does the AI in this project work?"}
              </button>
              {showExplainer && (
                <div className="p-3 border rounded bg-light text-dark">
                  <p className="fw-semibold mb-2">Two AI layers are used together:</p>
                  <ol className="mb-3">
                    <li><strong>Local rule-based AI (offline):</strong> tracks per-character accuracy across sessions, computes an error rate for every letter, and identifies weak keys. This powers instant adaptive practice text without needing internet access.</li>
                    <li><strong>Real generative AI (Google Gemini API):</strong> after every test, the app sends the user's stats (WPM, accuracy, mistakes, weak keys) to Gemini, which returns natural-language coaching feedback. A second Gemini call can generate a fresh practice paragraph built around the user's weak letters, in genuinely natural sentences rather than a scored word bank.</li>
                  </ol>
                  <p className="mb-0 text-secondary">Combining both means the app still works offline (local AI) but becomes noticeably smarter and more personalized when connected (generative AI).</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<TypingSpeedChecker />);