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

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getMistakes(target, typed) {
  return typed.split("").reduce((total, char, index) => {
    return total + (char === target[index] ? 0 : 1);
  }, 0);
}

function TypingSpeedChecker() {
  const [sampleIndex, setSampleIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [startedAt, setStartedAt] = useState(null);
  const [endedAt, setEndedAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef(null);

  const target = samples[sampleIndex];
  const isComplete = typed.length >= target.length;

  useEffect(() => {
    if (!startedAt || endedAt) {
      return undefined;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [startedAt, endedAt]);

  useEffect(() => {
    if (isComplete && startedAt && !endedAt) {
      setEndedAt(Date.now());
    }
  }, [isComplete, startedAt, endedAt]);

  const elapsedSeconds = useMemo(() => {
    if (!startedAt) {
      return 0;
    }

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

    if (!endedAt) {
      setTyped(value);
    }
  }

  function resetTest(nextIndex = sampleIndex) {
    setSampleIndex(nextIndex);
    setTyped("");
    setStartedAt(null);
    setEndedAt(null);
    setNow(Date.now());
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function nextSample() {
    resetTest((sampleIndex + 1) % samples.length);
  }

  return (
    <main className="app-shell">
      <section className="container py-4">
        <div className="row justify-content-center">
          <div className="col-12 col-lg-9 col-xl-8">
            <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 mb-3">
              <div>
                <h1 className="h3 fw-semibold mb-1">Typing test</h1>
                <p className="text-secondary mb-0">Start typing below. The timer begins after your first key.</p>
              </div>
              <button className="btn btn-sm btn-outline-secondary" onClick={nextSample} type="button">
                Change Text
              </button>
            </div>

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
                  {endedAt ? `Done: ${countWords(target)} words at ${wpm} WPM.` : `${target.length - typed.length} characters left`}
                </div>
                <button className="btn btn-dark" onClick={() => resetTest()} type="button">
                  Restart
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

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

createRoot(document.getElementById("root")).render(<TypingSpeedChecker />);
