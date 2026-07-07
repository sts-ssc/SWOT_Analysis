// pages/index.jsx  –  SWOT-Analyse Builder
// Next.js + Vercel + Anthropic API Proxy
// 5 separate API-Calls statt einem grossen (verhindert JSON-Truncation)

import { useState, useEffect } from "react";
import Head from "next/head";

// ─── Config ───────────────────────────────────────────────────────────────────

const STEPS = [
  { id: "profile",       label: "Unternehmen" },
  { id: "strengths",     label: "Stärken"     },
  { id: "weaknesses",    label: "Schwächen"   },
  { id: "opportunities", label: "Chancen"     },
  { id: "threats",       label: "Risiken"     },
  { id: "matrix",        label: "Matrix"      },
  { id: "tows",          label: "TOWS"        },
  { id: "download",      label: "Download"    },
];

const CAT = {
  strengths:     { label: "Stärken (Strengths)",     short: "Stärken",   head: "#16a34a", bg: "#f0fdf4", text: "#14532d" },
  weaknesses:    { label: "Schwächen (Weaknesses)",  short: "Schwächen", head: "#dc2626", bg: "#fef2f2", text: "#7f1d1d" },
  opportunities: { label: "Chancen (Opportunities)", short: "Chancen",   head: "#2563eb", bg: "#eff6ff", text: "#1e3a8a" },
  threats:       { label: "Risiken (Threats)",       short: "Risiken",   head: "#d97706", bg: "#fffbeb", text: "#78350f" },
};
const CAT_ORDER = ["strengths", "weaknesses", "opportunities", "threats"];

const TOWS_DEF = [
  { k: "SO", t: "SO – Ausbauen",  s: "Stärken × Chancen",  bg: "#f0fdf4", tc: "#14532d" },
  { k: "WO", t: "WO – Aufholen", s: "Schwächen × Chancen", bg: "#eff6ff", tc: "#1e3a8a" },
  { k: "ST", t: "ST – Absichern", s: "Stärken × Risiken",  bg: "#fffbeb", tc: "#78350f" },
  { k: "WT", t: "WT – Vermeiden", s: "Schwächen × Risiken",bg: "#fef2f2", tc: "#7f1d1d" },
];

const TIPS = {
  strengths:     "Fokus auf Merkmale, die schwer zu kopieren sind: Know-how, Referenzen, Zertifizierungen, Netzwerk.",
  weaknesses:    "Nur erkannte Schwächen können behoben werden. Verlorene Aufträge und Kundenfeedback sind gute Quellen.",
  opportunities: "Denken Sie in Trends: Digitalisierung, neue Gesetze, Technologien, Marktveränderungen.",
  threats:       "Beurteilen Sie Wahrscheinlichkeit und Auswirkung. Nicht jedes Risiko muss aktiv bekämpft werden.",
};

const LOADING_STEPS = [
  { label: "Branchenanalyse & Marktkontext",       icon: "📊" },
  { label: "Stärken werden analysiert",            icon: "💪" },
  { label: "Schwächen werden analysiert",          icon: "⚠️" },
  { label: "Chancen werden identifiziert",         icon: "🚀" },
  { label: "Risiken werden bewertet",              icon: "🛡️" },
];

const STORAGE_KEY = "swot_analyse_v2";

// ─── AI helpers (5 separate calls) ────────────────────────────────────────────

async function callClaude(prompt, maxTokens = 400, model = "claude-haiku-4-5-20251001") {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.slice(0, 200)}`);
  const j = JSON.parse(raw);
  return j.content?.[0]?.text || "";
}

// ── 5 sequentielle Calls, einer nach dem anderen ──────────────────────────────

function parseList(txt) {
  const lines = txt.split("\n").map(l => l.trim()).filter(l => /^\d+[\.\):]/.test(l));
  const result = lines.slice(0, 6).map(l => {
    const content = l.replace(/^\d+[\.\):]\s*/, "").trim();
    const sepIdx  = content.indexOf("|");
    return sepIdx > -1
      ? { item: content.slice(0, sepIdx).trim(), reason: content.slice(sepIdx + 1).trim() }
      : { item: content, reason: "" };
  });
  while (result.length < 6) result.push({ item: `Punkt ${result.length + 1}`, reason: "" });
  return result;
}

// Call 1: Marktkontext
async function fetchContext(p) {
  const txt = await callClaude(
`Branchenanalyse fuer ${p.name} (${p.industry}, ${p.size}).
Format exakt:
MARKET: 1 Satz
COMPETITION: 1 Satz
CUSTOMERS: 1 Satz
REGULATIONS: 1 Satz
Deutsch, kein ss statt ss.`, 200);
  const get = (k) => { const m = txt.match(new RegExp(k + "[:\\s]+(.+?)(?=\\n|$)")); return m ? m[1].trim() : ""; };
  return { market: get("MARKET"), competitors: get("COMPETITION"), customers: get("CUSTOMERS"), regulations: get("REGULATIONS") };
}

// Calls 2-5: Je eine SWOT-Kategorie
async function fetchCategory(cat, p) {
  const labels = { strengths: "Staerken", weaknesses: "Schwaechen", opportunities: "Chancen", threats: "Risiken" };
  const txt = await callClaude(
`6 ${labels[cat]} fuer ${p.name} (${p.industry}). Format exakt:
1. Bezeichnung | Begruendung
2. Bezeichnung | Begruendung
3. Bezeichnung | Begruendung
4. Bezeichnung | Begruendung
5. Bezeichnung | Begruendung
6. Bezeichnung | Begruendung
Deutsch, max 8+12 Woerter pro Zeile.`, 300);
  return parseList(txt);
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page:   { fontFamily: "system-ui, -apple-system, sans-serif", background: "#f1f5f9", minHeight: "100vh", fontSize: 14, color: "#1e293b" },
  hdr:    { background: "#0f172a", color: "white", padding: "11px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 },
  snav:   { display: "flex", overflowX: "auto", background: "white", borderBottom: "0.5px solid #e2e8f0", padding: "0 12px" },
  main:   { maxWidth: 960, margin: "0 auto", padding: "20px 16px" },
  card:   { background: "white", border: "0.5px solid #e2e8f0", borderRadius: 12, padding: 16, marginBottom: 12 },
  g2:     { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  g4:     { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 },
  input:  { width: "100%", padding: "8px 10px", border: "0.5px solid #e2e8f0", borderRadius: 6, fontSize: 13, fontFamily: "inherit", background: "white", boxSizing: "border-box" },
  lbl:    { display: "block", fontSize: 12, fontWeight: 500, color: "#475569", marginBottom: 5 },
  hint:   { fontSize: 11, color: "#94a3b8", marginTop: 3 },
  btnPri: { background: "#2563eb", color: "white", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" },
  btnOut: { background: "white", border: "0.5px solid #e2e8f0", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#374151" },
  navr:   { display: "flex", justifyContent: "space-between", marginTop: 18, paddingTop: 14, borderTop: "0.5px solid #e2e8f0" },
  infoBl: { background: "#eff6ff", border: "0.5px solid #bfdbfe", borderRadius: 8, padding: 12, marginBottom: 14 },
  errBl:  { background: "#fef2f2", border: "0.5px solid #fecaca", borderRadius: 8, padding: 12, marginBottom: 14 },
  toast:  { position: "fixed", bottom: 20, right: 20, background: "#0f172a", color: "#e2e8f0", padding: "9px 16px", borderRadius: 8, fontSize: 13, zIndex: 300 },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, hint, textarea, rows = 3 }) {
  return (
    <div>
      <label style={S.lbl}>{label}</label>
      {textarea
        ? <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder} style={{ ...S.input, resize: "vertical", lineHeight: 1.5 }} />
        : <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={S.input} />}
      {hint && <p style={S.hint}>{hint}</p>}
    </div>
  );
}

function NavRow({ onBack, onNext, nextLabel = "Weiter →" }) {
  return (
    <div style={S.navr}>
      <button onClick={onBack} style={S.btnOut}>← Zurück</button>
      <button onClick={onNext} style={S.btnPri}>{nextLabel}</button>
    </div>
  );
}

function CtxPanel({ ctx, open, toggle }) {
  if (!ctx) return null;
  return (
    <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
      <div onClick={toggle} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", cursor: "pointer", background: "#f8fafc", userSelect: "none" }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "#475569" }}>KI-Branchenanalyse {open ? "▲" : "▼"}</span>
        <span style={{ fontSize: 10, color: "#94a3b8" }}>Basis aller Vorschläge</span>
      </div>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 14px 12px" }}>
          {[["Markt", ctx.market], ["Wettbewerb", ctx.competitors], ["Kunden", ctx.customers], ["Regulierung", ctx.regulations]].map(([lbl, val]) => (
            <div key={lbl} style={{ background: "#f8fafc", border: "0.5px solid #e2e8f0", borderRadius: 6, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 3 }}>{lbl}</div>
              <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{val}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SugCard({ item, reason, accepted, onClick }) {
  return (
    <div onClick={onClick} style={{ display: "flex", gap: 9, padding: "9px 10px", border: `0.5px solid ${accepted ? "#bbf7d0" : "#e2e8f0"}`, borderRadius: 8, cursor: accepted ? "default" : "pointer", background: accepted ? "#f0fdf4" : "white" }}>
      <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: accepted ? "#16a34a" : "#f1f5f9", border: `0.5px solid ${accepted ? "#16a34a" : "#d1d5db"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: accepted ? "white" : "#64748b", marginTop: 1 }}>
        {accepted ? "✓" : "+"}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: accepted ? "#15803d" : "#1e293b", lineHeight: 1.3, marginBottom: 2 }}>{item}</div>
        <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>{reason}</div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function SWOTApp() {
  const [step, setStep]         = useState(0);
  const [profile, setProfile]   = useState({ name: "", industry: "", product: "", competitors: "", size: "KMU (50–249 MA)", scope: "Gesamtes Unternehmen", goal: "" });
  const [items, setItems]       = useState({ strengths: [], weaknesses: [], opportunities: [], threats: [] });
  const [strategies, setStrats] = useState({ SO: "", WO: "", ST: "", WT: "" });
  const [aiData, setAiData]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [loadingStep, setLoadingStep] = useState(0); // 0=idle, 1-5=active step
  const [genError, setGenError] = useState("");
  const [ctxOpen, setCtxOpen]   = useState(true);
  const [newText, setNewText]   = useState({ strengths: "", weaknesses: "", opportunities: "", threats: "" });
  const [twLoading, setTwLoad]  = useState(false);
  const [twText, setTwText]     = useState("");
  const [twError, setTwError]   = useState("");
  const [toast, setToast]       = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const d = JSON.parse(saved);
        if (d.profile)    setProfile(d.profile);
        if (d.items)      setItems(d.items);
        if (d.strategies) setStrats(d.strategies);
        if (d.aiData)     setAiData(d.aiData);
        if (d.step)       setStep(d.step);
      }
    } catch(e) {}
  }, []);

  const save = (overrides = {}) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile, items, strategies, aiData, step, ...overrides })); } catch(e) {}
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2800); };
  const upProfile = (f, v) => setProfile(p => ({ ...p, [f]: v }));

  const addItem = (cat) => {
    const v = (newText[cat] || "").trim();
    if (!v) return;
    const updated = { ...items, [cat]: [...items[cat], v] };
    setItems(updated); setNewText(p => ({ ...p, [cat]: "" })); save({ items: updated });
  };
  const removeItem = (cat, idx) => {
    const updated = { ...items, [cat]: items[cat].filter((_, i) => i !== idx) };
    setItems(updated); save({ items: updated });
  };
  const acceptSug = (cat, idx) => {
    const item = aiData?.[cat]?.[idx]?.item;
    if (!item || items[cat].includes(item)) return;
    const updated = { ...items, [cat]: [...items[cat], item] };
    setItems(updated); save({ items: updated });
  };

  // ── Sequentielle Calls, einer nach dem anderen ───────────────────────────────
  const startAnalysis = async () => {
    if (!profile.name || !profile.industry || !profile.product) {
      showToast("Bitte Name, Branche und Produkt ausfüllen"); return;
    }
    setGenError(""); setLoading(true);

    try {
      setLoadingStep(1);
      const ctx = await fetchContext(profile);

      setLoadingStep(2);
      const strengths = await fetchCategory("strengths", profile);

      setLoadingStep(3);
      const weaknesses = await fetchCategory("weaknesses", profile);

      setLoadingStep(4);
      const opportunities = await fetchCategory("opportunities", profile);

      setLoadingStep(5);
      const threats = await fetchCategory("threats", profile);

      const parsed = { context: ctx, strengths, weaknesses, opportunities, threats };
      setAiData(parsed);
      save({ aiData: parsed, step: 1 });
      setStep(1);
    } catch(e) {
      setGenError(e.message || String(e));
    }
    setLoading(false);
    setLoadingStep(0);
  };

  // ── TOWS generation ──────────────────────────────────────────────────────────
  const generateTOWS = async () => {
    setTwLoad(true); setTwText(""); setTwError("");
    const prompt = `Du bist Senior-Strategieberater. TOWS-Strategien auf Deutsch (kein ß).
${profile.name} | ${profile.industry} | ${profile.product}
Stärken: ${items.strengths.join(" | ") || "–"}
Schwächen: ${items.weaknesses.join(" | ") || "–"}
Chancen: ${items.opportunities.join(" | ") || "–"}
Risiken: ${items.threats.join(" | ") || "–"}

## SO – Ausbauen (Stärken + Chancen): 3 konkrete Massnahmen.
## WO – Aufholen (Schwächen + Chancen): 3 Massnahmen.
## ST – Absichern (Stärken + Risiken): 3 Massnahmen.
## WT – Vermeiden (Schwächen + Risiken): 3 Massnahmen.`;
    try {
      const txt = await callClaude(prompt, 900, "claude-sonnet-4-6");
      setTwText(txt);
    } catch(e) { setTwError(e.message || String(e)); }
    setTwLoad(false);
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  const stepId = STEPS[step]?.id;
  const currentCat = CAT_ORDER.includes(stepId) ? stepId : null;

  return (
    <>
      <Head>
        <title>SWOT-Analyse Builder{profile.name ? ` – ${profile.name}` : ""}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={S.page}>
        {toast && <div style={S.toast}>{toast}</div>}

        {/* Header */}
        <div style={S.hdr}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>SWOT-Analyse Builder</div>
            <div style={{ fontSize: 11, opacity: 0.5, marginTop: 1 }}>{profile.name || "Unternehmensname noch nicht erfasst"}</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={() => { save(); showToast("Gespeichert"); }} style={{ background: "rgba(255,255,255,0.1)", border: "0.5px solid rgba(255,255,255,0.2)", color: "white", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
              💾 Speichern
            </button>
            <div style={{ fontSize: 11, color: "#93c5fd", padding: "3px 10px", background: "rgba(147,197,253,0.1)", borderRadius: 20, border: "0.5px solid rgba(147,197,253,0.3)" }}>KI-gestützt</div>
          </div>
        </div>

        {/* Step nav */}
        <div style={S.snav}>
          {STEPS.map((s, i) => (
            <button key={s.id} onClick={() => setStep(i)}
              style={{ padding: "10px 11px", border: "none", background: "none", cursor: "pointer", fontSize: 12, fontFamily: "inherit", whiteSpace: "nowrap", borderBottom: i === step ? "2px solid #2563eb" : "2px solid transparent", color: i === step ? "#2563eb" : i < step ? "#16a34a" : "#94a3b8", fontWeight: i === step ? 600 : 400 }}>
              {i > 0 && i < step ? "✓ " : ""}{s.label}
            </button>
          ))}
        </div>

        <div style={S.main}>

          {/* ── Profile ── */}
          {step === 0 && !loading && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Schritt 1 – Unternehmensprofil</h2>
              <p style={{ fontSize: 13, color: "#64748b", marginBottom: 14, lineHeight: 1.5 }}>
                Die KI analysiert danach Ihre Branche umfassend und erstellt branchenspezifische SWOT-Vorschläge – Markt, Wettbewerb und Regulierung müssen Sie <em>nicht</em> selbst recherchieren.
              </p>
              <div style={S.card}>
                <div style={S.g2}>
                  <Field label="Unternehmensname *" value={profile.name} onChange={v => upProfile("name", v)} placeholder="z.B. Muster AG..." />
                  <Field label="Branche / Sektor *" value={profile.industry} onChange={v => upProfile("industry", v)} placeholder="z.B. IT-Security Beratung, Detailhandel..." />
                  <Field label="Hauptprodukt / Hauptleistung *" value={profile.product} onChange={v => upProfile("product", v)} placeholder="z.B. FINMA-Compliance Audits, Cloud Security..." hint="Je spezifischer, desto präzisere Vorschläge" />
                  <Field label="Bekannte Hauptkonkurrenten (optional)" value={profile.competitors} onChange={v => upProfile("competitors", v)} placeholder="z.B. Deloitte, KPMG – oder leer lassen" hint="KI identifiziert weitere Wettbewerber automatisch" />
                  <div>
                    <label style={S.lbl}>Unternehmensgrösse</label>
                    <select value={profile.size} onChange={e => upProfile("size", e.target.value)} style={S.input}>
                      {["Einzelunternehmen / Freelancer", "Mikrounternehmen (2–9 MA)", "Kleinunternehmen (10–49 MA)", "KMU (50–249 MA)", "Grossunternehmen (250+ MA)"].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.lbl}>Analysebereich</label>
                    <select value={profile.scope} onChange={e => upProfile("scope", e.target.value)} style={S.input}>
                      {["Gesamtes Unternehmen", "Einzelnes Produkt / Service", "Einzelner Geschäftsbereich", "Markteintrittsstrategie", "Neues Geschäftsmodell"].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Field label="Ziel dieser SWOT-Analyse *" value={profile.goal} onChange={v => upProfile("goal", v)} placeholder="z.B. Strategische Positionierung im Schweizer Finanzsektor – neue Dienstleistungsbereiche erschliessen." textarea />
                  </div>
                </div>
              </div>
              <div style={S.infoBl}>
                <p style={{ fontSize: 12, color: "#1e40af", margin: 0, lineHeight: 1.6 }}>
                  <strong>Was die KI übernimmt:</strong> Markt- und Branchenanalyse · Wettbewerbslandschaft · Kundenbedürfnisse · Regulatorisches Umfeld · Technologietrends · Konkrete SWOT-Vorschläge mit Begründung
                </p>
              </div>
              {genError && <div style={S.errBl}><p style={{ fontSize: 12, color: "#dc2626", margin: 0 }}><strong>Fehler:</strong> {genError}</p></div>}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={startAnalysis} style={S.btnPri}>Analyse starten →</button>
              </div>
            </div>
          )}

          {/* ── Loading mit Fortschritt ── */}
          {loading && (
            <div style={{ ...S.card, padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 14 }}>⚙️</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Analyse läuft</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>Schritt {loadingStep} von 5</div>
              <div style={{ maxWidth: 320, margin: "0 auto", textAlign: "left" }}>
                {["Markt & Branchenkontext", "Stärken analysieren", "Schwächen analysieren", "Chancen identifizieren", "Risiken bewerten"].map((lbl, i) => {
                  const idx = i + 1;
                  const done = loadingStep > idx;
                  const active = loadingStep === idx;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, padding: "8px 12px", borderRadius: 8, marginBottom: 6, background: done ? "#f0fdf4" : active ? "#eff6ff" : "#f8fafc", border: `0.5px solid ${done ? "#bbf7d0" : active ? "#bfdbfe" : "#e2e8f0"}`, color: done ? "#15803d" : active ? "#1e40af" : "#94a3b8" }}>
                      <span>{done ? "✓" : active ? "⏳" : "○"}</span>
                      <span style={{ fontWeight: active ? 600 : 400 }}>{lbl}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── SWOT Steps 1–4 ── */}
          {currentCat && !loading && (() => {
            const cat = currentCat;
            const m = CAT[cat];
            const catItems = items[cat];
            const sugs = aiData?.[cat] || [];
            const si = CAT_ORDER.indexOf(cat) + 1;
            const count = catItems.length;
            return (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{m.label}</h2>
                  <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, background: count >= 3 ? "#dcfce7" : "#fef9c3", color: count >= 3 ? "#15803d" : "#a16207" }}>
                    {count >= 3 ? `✓ ${count} erfasst` : `⚠ ${count} – mind. 3 empfohlen`}
                  </span>
                </div>
                <CtxPanel ctx={aiData?.context} open={ctxOpen} toggle={() => setCtxOpen(o => !o)} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {/* Left: Suggestions */}
                  <div style={S.card}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#475569", marginBottom: 8 }}>
                      ✨ KI-Vorschläge <span style={{ fontSize: 10, color: "#94a3b8" }}>(klicken zum Übernehmen)</span>
                    </div>
                    {sugs.length === 0
                      ? <p style={{ fontSize: 12, color: "#94a3b8" }}>Keine Vorschläge verfügbar.</p>
                      : <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {sugs.map((sg, i) => (
                            <SugCard key={i} item={sg.item} reason={sg.reason} accepted={catItems.includes(sg.item)} onClick={() => acceptSug(cat, i)} />
                          ))}
                        </div>}
                  </div>
                  {/* Right: Accepted + manual */}
                  <div>
                    <div style={{ ...S.card, border: `0.5px solid ${m.head}30` }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: m.text, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                        <span>Ihre {m.short}</span>
                        <span style={{ fontWeight: 400, color: "#94a3b8" }}>{count} Punkt{count !== 1 ? "e" : ""}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
                        {count === 0
                          ? <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>Vorschläge anklicken oder unten eingeben.</p>
                          : catItems.map((it, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", borderRadius: 6, border: `0.5px solid ${m.head}20`, background: m.bg }}>
                              <span style={{ fontSize: 12, color: m.text }}>• {it}</span>
                              <button onClick={() => removeItem(cat, i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 16, lineHeight: 1, padding: "0 0 0 6px", fontFamily: "inherit" }}>×</button>
                            </div>
                          ))}
                      </div>
                      <div style={{ borderTop: "0.5px solid #f1f5f9", paddingTop: 10 }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 5 }}>Eigenen Punkt hinzufügen:</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="text" value={newText[cat]} onChange={e => setNewText(p => ({ ...p, [cat]: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && addItem(cat)} placeholder="Ergänzung..."
                            style={{ flex: 1, padding: "8px 10px", border: "0.5px solid #e2e8f0", borderRadius: 6, fontSize: 13, fontFamily: "inherit" }} />
                          <button onClick={() => addItem(cat)} style={{ ...S.btnPri, background: m.head, padding: "8px 14px", fontSize: 16 }}>+</button>
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: "8px 10px", background: "white", border: "0.5px solid #e2e8f0", borderRadius: 8 }}>
                      <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>Hinweis:</div>
                      <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.5 }}>{TIPS[cat]}</div>
                    </div>
                  </div>
                </div>
                <NavRow onBack={() => setStep(si - 1)} onNext={() => { save({ step: si + 1 }); setStep(si + 1); }} />
              </div>
            );
          })()}

          {/* ── Matrix ── */}
          {stepId === "matrix" && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>SWOT-Matrix – Gesamtübersicht</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                {CAT_ORDER.map(cat => {
                  const m = CAT[cat]; const its = items[cat];
                  return (
                    <div key={cat} style={{ borderRadius: 12, overflow: "hidden", border: "0.5px solid #e2e8f0" }}>
                      <div style={{ background: m.head, color: "white", padding: "8px 13px", fontSize: 12, fontWeight: 500 }}>{m.short} ({its.length})</div>
                      <div style={{ background: m.bg, padding: "11px 13px", minHeight: 70 }}>
                        {its.length === 0 ? <p style={{ fontSize: 12, color: "#94a3b8" }}>Keine Punkte</p>
                          : <ul style={{ paddingLeft: 16 }}>{its.map((it, i) => <li key={i} style={{ fontSize: 12, color: m.text, marginBottom: 4, lineHeight: 1.4 }}>{it}</li>)}</ul>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <NavRow onBack={() => setStep(4)} onNext={() => setStep(6)} nextLabel="Zu den Strategien →" />
            </div>
          )}

          {/* ── TOWS ── */}
          {stepId === "tows" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 3 }}>TOWS-Matrix & Strategien</h2>
                  <p style={{ fontSize: 13, color: "#64748b" }}>Leiten Sie aus Ihren SWOT-Feldern konkrete Handlungsstrategien ab.</p>
                </div>
                <button onClick={generateTOWS} style={{ background: "#0f172a", color: "#93c5fd", border: "0.5px solid #1e293b", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: "inherit", flexShrink: 0 }}>
                  KI-Strategien generieren
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                {TOWS_DEF.map(t => (
                  <div key={t.k} style={{ background: t.bg, border: "0.5px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: t.tc, marginBottom: 1 }}>{t.t}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 7 }}>{t.s}</div>
                    <textarea rows={4} value={strategies[t.k]} onChange={e => setStrats(p => ({ ...p, [t.k]: e.target.value }))}
                      placeholder="Massnahmen eintragen..."
                      style={{ width: "100%", fontSize: 12, border: "0.5px solid #e2e8f0", borderRadius: 6, padding: "7px 9px", fontFamily: "inherit", resize: "vertical", background: "rgba(255,255,255,0.6)", lineHeight: 1.5, boxSizing: "border-box" }} />
                  </div>
                ))}
              </div>
              {twLoading && <div style={{ background: "#0f172a", borderRadius: 12, padding: 20, textAlign: "center", color: "#64748b", fontSize: 12, marginBottom: 12 }}>Analyse läuft...</div>}
              {twError && !twLoading && <div style={S.errBl}><p style={{ fontSize: 12, color: "#dc2626", margin: 0 }}>Fehler: {twError}</p><button onClick={generateTOWS} style={{ marginTop: 6, fontSize: 11, padding: "3px 8px", border: "0.5px solid #fecaca", borderRadius: 4, cursor: "pointer", background: "white", fontFamily: "inherit" }}>Retry</button></div>}
              {twText && !twLoading && <div style={{ background: "#0f172a", borderRadius: 12, padding: 16, color: "#cbd5e1", fontSize: 12, lineHeight: 1.75, whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto", marginBottom: 12 }}>{twText}</div>}
              {!twLoading && !twText && !twError && <div style={{ background: "#f8fafc", border: "0.5px solid #e2e8f0", borderRadius: 8, padding: 12, fontSize: 12, color: "#94a3b8", textAlign: "center", marginBottom: 12 }}>KI-Strategien über den Button generieren oder Felder manuell ausfüllen.</div>}
              <NavRow onBack={() => setStep(5)} onNext={() => { save(); setStep(7); }} nextLabel="Zum Download →" />
            </div>
          )}

          {/* ── Download ── */}
          {stepId === "download" && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Zusammenfassung & Download</h2>
              <div style={S.g4}>
                {[["Stärken", items.strengths.length, "#16a34a", "#f0fdf4"], ["Schwächen", items.weaknesses.length, "#dc2626", "#fef2f2"], ["Chancen", items.opportunities.length, "#2563eb", "#eff6ff"], ["Risiken", items.threats.length, "#d97706", "#fffbeb"]].map(([l, n, c, b]) => (
                  <div key={l} style={{ background: b, border: `0.5px solid ${c}25`, borderRadius: 12, padding: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 600, color: c, marginBottom: 2 }}>{n}</div>
                    <div style={{ fontSize: 11, color: "#475569" }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: "#f8fafc", border: "0.5px dashed #cbd5e1", borderRadius: 12, padding: 28, textAlign: "center", margin: "14px 0 12px" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Word-Dokument (.docx)</div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 18, lineHeight: 1.6 }}>Enthält: SWOT-Matrix · KI-Branchenanalyse · TOWS-Strategien · Unternehmensangaben · Datum</div>
                <button onClick={() => showToast("Word-Export: npm install docx file-saver – nächster Schritt")} style={S.btnPri}>📥 Als Word (.docx) herunterladen</button>
              </div>
              <div style={S.infoBl}>
                <p style={{ fontSize: 12, color: "#1e40af", margin: 0 }}><strong>Word-Export:</strong> Nächster Schritt – <code>npm install docx file-saver</code> + exportWord() Funktion.</p>
              </div>
              <div style={{ ...S.navr }}>
                <button onClick={() => setStep(6)} style={S.btnOut}>← Zurück</button>
                <button onClick={() => { if (window.confirm("Neue Analyse starten?")) { setItems({ strengths: [], weaknesses: [], opportunities: [], threats: [] }); setStrats({ SO: "", WO: "", ST: "", WT: "" }); setAiData(null); setTwText(""); save({ step: 0 }); setStep(0); } }}
                  style={{ ...S.btnOut, color: "#16a34a", borderColor: "#bbf7d0" }}>+ Neue Analyse</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
