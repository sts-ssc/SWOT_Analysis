// pages/index.jsx – SWOT-Analyse Builder v3
// Neue Features: URL-Analyse, Branchenanalyse-Screen, User-Einschätzung pro Kategorie

import { useState, useEffect } from "react";
import Head from "next/head";

const STEPS = [
  { id: "profile",       label: "Unternehmen"      },
  { id: "analysis",      label: "Branchenanalyse"  },
  { id: "strengths",     label: "Stärken"           },
  { id: "weaknesses",    label: "Schwächen"         },
  { id: "opportunities", label: "Chancen"           },
  { id: "threats",       label: "Risiken"           },
  { id: "matrix",        label: "Matrix"            },
  { id: "tows",          label: "TOWS"              },
  { id: "download",      label: "Download"          },
];

const CAT = {
  strengths:    { label: "Stärken (Strengths)",     short: "Stärken",   head: "#16a34a", bg: "#f0fdf4", text: "#14532d" },
  weaknesses:   { label: "Schwächen (Weaknesses)",  short: "Schwächen", head: "#dc2626", bg: "#fef2f2", text: "#7f1d1d" },
  opportunities:{ label: "Chancen (Opportunities)", short: "Chancen",   head: "#2563eb", bg: "#eff6ff", text: "#1e3a8a" },
  threats:      { label: "Risiken (Threats)",       short: "Risiken",   head: "#d97706", bg: "#fffbeb", text: "#78350f" },
};
const CAT_ORDER = ["strengths","weaknesses","opportunities","threats"];

const TOWS_DEF = [
  { k:"SO", t:"SO – Ausbauen",  s:"Stärken × Chancen",  bg:"#f0fdf4", tc:"#14532d" },
  { k:"WO", t:"WO – Aufholen",  s:"Schwächen × Chancen",bg:"#eff6ff", tc:"#1e3a8a" },
  { k:"ST", t:"ST – Absichern", s:"Stärken × Risiken",  bg:"#fffbeb", tc:"#78350f" },
  { k:"WT", t:"WT – Vermeiden", s:"Schwächen × Risiken",bg:"#fef2f2", tc:"#7f1d1d" },
];

const STORAGE_KEY = "swot_v3";

async function callClaude(prompt, maxTokens = 400, model = "claude-haiku-4-5-20251001") {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role:"user", content: prompt }] }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.slice(0,200)}`);
  return JSON.parse(raw).content?.[0]?.text || "";
}

function parseList(txt) {
  const lines = txt.split("\n").map(l => l.trim()).filter(l => /^\d+[\.\):]/.test(l));
  const result = lines.slice(0,6).map(l => {
    const c = l.replace(/^\d+[\.\):]\s*/,"").trim();
    const i = c.indexOf("|");
    return i > -1 ? { item: c.slice(0,i).trim(), reason: c.slice(i+1).trim() } : { item: c, reason: "" };
  });
  while (result.length < 6) result.push({ item: `Punkt ${result.length+1}`, reason: "" });
  return result;
}

async function fetchContext(p, siteData) {
  const land = p.country || "Schweiz";
  // Unterscheide zwischen echtem Website-Inhalt und nur URL als Hinweis
  const siteText = typeof siteData === "object" ? siteData.text : (siteData || "");
  const siteNote = typeof siteData === "object" ? siteData.note : "";
  
  const siteContext = siteText && siteText.length > 100
    ? `\nExtrahierter Website-Inhalt (${siteText.length} Zeichen):\n${siteText.slice(0, 700)}`
    : p.url
      ? `\nFirmenwebsite: ${p.url}\nHinweis: ${siteNote||"Nutze dein Trainingswissen ueber dieses Unternehmen aus deinen Trainingsdaten."}`
      : "";

  const FIELDS = ["MARKET","COMPETITION","COMPETITORS","CUSTOMERS","REGULATIONS","TRENDS"];

  const getField = (txt, key) => {
    const marker = key + ":";
    const idx = txt.indexOf(marker);
    if (idx === -1) return "";
    const after = txt.slice(idx + marker.length).trim();
    let end = after.length;
    for (const f of FIELDS) {
      if (f === key) continue;
      const ni = after.indexOf("\n" + f + ":");
      if (ni !== -1 && ni < end) end = ni;
    }
    return after.slice(0, end).replace(/\n+/g, " ").trim();
  };

  // Call 1: Markt, Wettbewerb, Konkurrenten, Kunden
  const txt1 = await callClaude(
`Du bist Senior-Unternehmensberater mit Fokus ${land}.
Nutze dein gesamtes Trainingswissen ueber das Unternehmen und die Branche.

Unternehmen: ${p.name}
Branche: ${p.industry}
Produkt/Service: ${p.product}
Groesse: ${p.size}${siteContext}

Antworte EXAKT in diesem Format (alle Felder vollstaendig ausfuellen):
MARKET: Marktgroesse CHF, Wachstumsrate, wichtigste Nachfragetreiber in ${land} (3 Saetze)
COMPETITION: Marktstruktur (fragmentiert/konsolidiert), Wettbewerbertypen, Preisdruck, Differenzierungsmerkmale (3 Saetze)
COMPETITORS: Die 6 wichtigsten direkten Konkurrenten von ${p.name} fuer "${p.product}" in ${land} – nur echte spezifische Firmennamen die exakt diese Leistungen anbieten, basierend auf deinem Wissen ueber den Markt
CUSTOMERS: Typische Kundensegmente, Entscheidungstraeger (Titel), wichtigste Kaufkriterien (2-3 Saetze)
Deutsch, Schweizer Stil (kein ss).`, 900, "claude-sonnet-4-6");

  // Call 2: TRENDS zuerst (verhindert Abschneiden), dann REGULATIONS
  const txt2 = await callClaude(
`Du bist Senior-Berater mit Fokus ${land}.
Nutze dein Trainingswissen fuer eine praezise, branchenspezifische Analyse.
Unternehmen: ${p.name} | Branche: ${p.industry} | Produkt: ${p.product}

Antworte EXAKT in diesem Format:
TRENDS: Die 4 wichtigsten Technologie- und Markttrends fuer ${p.industry} in ${land} in den naechsten 2-3 Jahren – konkret, benenne spezifische Technologien und Entwicklungen (3-4 Saetze)
REGULATIONS: Alle fuer ${p.industry} in ${land} relevanten Regulierungen und Standards – nur was tatsaechlich zutrifft, mit kurzer Erklaerung der Relevanz. Sei vollstaendig, lass keine wichtigen Standards aus.
Deutsch, Schweizer Stil (kein ss).`, 900, "claude-sonnet-4-6");

  return {
    market:          getField(txt1, "MARKET"),
    competitors:     getField(txt1, "COMPETITION"),
    competitorsList: getField(txt1, "COMPETITORS"),
    customers:       getField(txt1, "CUSTOMERS"),
    regulations:     getField(txt2, "REGULATIONS"),
    trends:          getField(txt2, "TRENDS"),
    siteNote:        siteNote,
  };
}

async function fetchCategory(cat, p, ctx, assessment) {
  const labels = { strengths:"Staerken", weaknesses:"Schwaechen", opportunities:"Chancen", threats:"Risiken" };
  const assessText = assessment ? `\nEinschaetzung des Nutzers: ${assessment}` : "";
  const txt = await callClaude(
`6 ${labels[cat]} fuer ${p.name} (${p.industry}, ${p.country||"Schweiz"}).
Markt: ${(ctx.market||"").slice(0,100)}${assessText}
Format exakt:
1. Bezeichnung | Begruendung
2. Bezeichnung | Begruendung
3. Bezeichnung | Begruendung
4. Bezeichnung | Begruendung
5. Bezeichnung | Begruendung
6. Bezeichnung | Begruendung
Deutsch, max 8+12 Woerter.`, 300);
  return parseList(txt);
}

const S = {
  page:  { fontFamily:"system-ui,-apple-system,sans-serif", background:"#f1f5f9", minHeight:"100vh", fontSize:14, color:"#1e293b" },
  hdr:   { background:"#0f172a", color:"white", padding:"11px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, zIndex:100 },
  snav:  { display:"flex", overflowX:"auto", background:"white", borderBottom:"0.5px solid #e2e8f0", padding:"0 12px" },
  main:  { maxWidth:960, margin:"0 auto", padding:"20px 16px" },
  card:  { background:"white", border:"0.5px solid #e2e8f0", borderRadius:12, padding:16, marginBottom:12 },
  g2:    { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 },
  g4:    { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 },
  input: { width:"100%", padding:"8px 10px", border:"0.5px solid #e2e8f0", borderRadius:6, fontSize:13, fontFamily:"inherit", background:"white", boxSizing:"border-box" },
  lbl:   { display:"block", fontSize:12, fontWeight:500, color:"#475569", marginBottom:5 },
  hint:  { fontSize:11, color:"#94a3b8", marginTop:3 },
  btnPri:{ background:"#2563eb", color:"white", border:"none", borderRadius:8, padding:"9px 20px", cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"inherit" },
  btnOut:{ background:"white", border:"0.5px solid #e2e8f0", borderRadius:8, padding:"9px 16px", cursor:"pointer", fontSize:13, fontFamily:"inherit", color:"#374151" },
  navr:  { display:"flex", justifyContent:"space-between", marginTop:18, paddingTop:14, borderTop:"0.5px solid #e2e8f0" },
  errBl: { background:"#fef2f2", border:"0.5px solid #fecaca", borderRadius:8, padding:12, marginBottom:14 },
  infoBl:{ background:"#eff6ff", border:"0.5px solid #bfdbfe", borderRadius:8, padding:12, marginBottom:14 },
  toast: { position:"fixed", bottom:20, right:20, background:"#0f172a", color:"#e2e8f0", padding:"9px 16px", borderRadius:8, fontSize:13, zIndex:300 },
};

function Field({ label, value, onChange, placeholder, hint, textarea, rows=3 }) {
  return (
    <div>
      <label style={S.lbl}>{label}</label>
      {textarea
        ? <textarea value={value} onChange={e=>onChange(e.target.value)} rows={rows} placeholder={placeholder} style={{...S.input, resize:"vertical", lineHeight:1.5}} />
        : <input type="text" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={S.input} />}
      {hint && <p style={S.hint}>{hint}</p>}
    </div>
  );
}

function NavRow({ onBack, onNext, nextLabel="Weiter →" }) {
  return (
    <div style={S.navr}>
      <button onClick={onBack} style={S.btnOut}>← Zurück</button>
      <button onClick={onNext} style={S.btnPri}>{nextLabel}</button>
    </div>
  );
}

function SugCard({ item, reason, accepted, onClick }) {
  return (
    <div onClick={onClick} style={{ display:"flex", gap:9, padding:"9px 10px", border:`0.5px solid ${accepted?"#bbf7d0":"#e2e8f0"}`, borderRadius:8, cursor:accepted?"default":"pointer", background:accepted?"#f0fdf4":"white" }}>
      <div style={{ flexShrink:0, width:22, height:22, borderRadius:"50%", background:accepted?"#16a34a":"#f1f5f9", border:`0.5px solid ${accepted?"#16a34a":"#d1d5db"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:accepted?"white":"#64748b", marginTop:1 }}>
        {accepted?"✓":"+"}
      </div>
      <div>
        <div style={{ fontSize:12, fontWeight:500, color:accepted?"#15803d":"#1e293b", lineHeight:1.3, marginBottom:2 }}>{item}</div>
        <div style={{ fontSize:11, color:"#94a3b8", lineHeight:1.5 }}>{reason}</div>
      </div>
    </div>
  );
}

export default function SWOTApp() {
  const [step, setStep]       = useState(0);
  const [profile, setProfile] = useState({
    name:"", industry:"", product:"", url:"", country:"Schweiz",
    size:"KMU (50–249 MA)", scope:"Gesamtes Unternehmen", goal:"",
    assessments:{ strengths:"", weaknesses:"", opportunities:"", threats:"" }
  });
  const [items, setItems]     = useState({ strengths:[], weaknesses:[], opportunities:[], threats:[] });
  const [strategies, setStrats]= useState({ SO:"", WO:"", ST:"", WT:"" });
  const [aiData, setAiData]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [catLoading, setCatLoading]   = useState({ strengths:false, weaknesses:false, opportunities:false, threats:false });
  const [genError, setGenError]= useState("");
  const [newText, setNewText] = useState({ strengths:"", weaknesses:"", opportunities:"", threats:"" });
  const [twLoading, setTwLoad]= useState(false);
  const [twText, setTwText]   = useState("");
  const [twError, setTwError] = useState("");
  const [toast, setToast]     = useState("");

  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) { const d=JSON.parse(s); if(d.profile)setProfile(d.profile); if(d.items)setItems(d.items); if(d.strategies)setStrats(d.strategies); if(d.aiData)setAiData(d.aiData); if(d.step)setStep(d.step); }
    } catch(e) {}
  }, []);

  const save = (ov={}) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({profile,items,strategies,aiData,step,...ov})); } catch(e){} };
  const showToast = (m) => { setToast(m); setTimeout(()=>setToast(""),3000); };
  const upProfile = (f,v) => setProfile(p=>({...p,[f]:v}));
  const upAssessment = (cat,v) => setProfile(p=>({...p,assessments:{...p.assessments,[cat]:v}}));

  const addItem = (cat) => {
    const v=(newText[cat]||"").trim(); if(!v) return;
    const u={...items,[cat]:[...items[cat],v]};
    setItems(u); setNewText(p=>({...p,[cat]:""})); save({items:u});
  };
  const removeItem = (cat,idx) => {
    const u={...items,[cat]:items[cat].filter((_,i)=>i!==idx)};
    setItems(u); save({items:u});
  };
  const acceptSug = (cat,idx) => {
    const item=aiData?.[cat]?.[idx]?.item;
    if(!item||items[cat].includes(item)) return;
    const u={...items,[cat]:[...items[cat],item]};
    setItems(u); save({items:u});
  };

  const startAnalysis = async () => {
    if(!profile.name||!profile.industry||!profile.product){ showToast("Bitte Name, Branche und Produkt ausfüllen"); return; }
    setGenError(""); setLoading(true);
    let siteData = { text: "", chars: 0, success: false, note: "" };
    try {
      if(profile.url) {
        setLoadingStep(1);
        try {
          const r=await fetch("/api/scrape",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:profile.url})});
          siteData=await r.json();
        } catch(e) { /* Website nicht erreichbar */ }
      }
      setLoadingStep(2);
      const ctx=await fetchContext(profile, siteData);
      const nd={context:ctx};
      setAiData(nd); save({aiData:nd,step:1}); setStep(1);
    } catch(e){ setGenError(e.message||String(e)); }
    setLoading(false); setLoadingStep(0);
  };

  const generateCategoryItems = async (cat) => {
    if(!aiData?.context) return;
    setCatLoading(l=>({...l,[cat]:true}));
    try {
      const assessment=profile.assessments?.[cat]||"";
      const sugs=await fetchCategory(cat,profile,aiData.context,assessment);
      const nd={...aiData,[cat]:sugs}; setAiData(nd); save({aiData:nd});
    } catch(e){ showToast("Fehler: "+(e.message||String(e))); }
    setCatLoading(l=>({...l,[cat]:false}));
  };

  const generateTOWS = async () => {
    setTwLoad(true); setTwText(""); setTwError("");
    try {
      const txt=await callClaude(
`TOWS-Strategien fuer ${profile.name} (${profile.industry}, ${profile.country||"Schweiz"}).
Staerken: ${items.strengths.join(" | ")||"–"}
Schwaechen: ${items.weaknesses.join(" | ")||"–"}
Chancen: ${items.opportunities.join(" | ")||"–"}
Risiken: ${items.threats.join(" | ")||"–"}
Format exakt:
SO:\n- Massnahme 1\n- Massnahme 2\n- Massnahme 3\n\nWO:\n- Massnahme 1\n- Massnahme 2\n- Massnahme 3\n\nST:\n- Massnahme 1\n- Massnahme 2\n- Massnahme 3\n\nWT:\n- Massnahme 1\n- Massnahme 2\n- Massnahme 3
Deutsch, kein ss.`,600,"claude-sonnet-4-6");
      const getSec=(key)=>{
        const idx=txt.indexOf("\n"+key+":"); if(idx===-1) return "";
        const after=txt.slice(idx+key.length+2).trimStart();
        const nk=["SO","WO","ST","WT"].filter(k=>k!==key);
        const nm=after.match(new RegExp("\\n(?:"+nk.join("|")+"):"));
        const c=nm?after.slice(0,nm.index):after;
        return c.split("\n").map(l=>l.replace(/^[-•*\d\.]+\s*/,"").trim()).filter(Boolean).join("\n");
      };
      setStrats({SO:getSec("SO"),WO:getSec("WO"),ST:getSec("ST"),WT:getSec("WT")});
      setTwText("✓ Strategien in Boxen eingetragen – bei Bedarf bearbeiten.");
    } catch(e){ setTwError(e.message||String(e)); }
    setTwLoad(false);
  };

  const exportWord = () => {
    showToast("Word-Dokument wird erstellt...");
    const date = new Date().toLocaleDateString("de-CH");
    const ctx = aiData?.context;
    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>SWOT-Analyse ${profile.name}</title>
<style>
body{font-family:Calibri,Arial,sans-serif;font-size:11pt;margin:2cm}
h1{color:#0f172a;font-size:18pt}h2{font-size:13pt;margin-top:16pt;border-bottom:1px solid #e2e8f0;padding-bottom:4pt}
.meta{color:#64748b;font-size:10pt}.lbl{font-weight:bold}
table{width:100%;border-collapse:collapse;margin:12pt 0}
td{border:1px solid #d1d5db;padding:8pt;vertical-align:top;width:50%}
.gr{background:#f0fdf4}.re{background:#fef2f2}.bl{background:#eff6ff}.am{background:#fffbeb}
ul{margin:4pt 0;padding-left:16pt}li{margin-bottom:3pt}
.sb{background:#f8fafc;border:1px solid #e2e8f0;padding:8pt;margin-bottom:8pt}
</style></head><body>
<h1>SWOT-Analyse: ${profile.name}</h1>
<p class="meta">Erstellt am ${date} &nbsp;|&nbsp; ${profile.country||"Schweiz"} &nbsp;|&nbsp; ${profile.industry}</p><hr>
<h2>1. Unternehmensprofil</h2>
<p><span class="lbl">Unternehmen:</span> ${profile.name}</p>
<p><span class="lbl">Branche:</span> ${profile.industry}</p>
<p><span class="lbl">Land:</span> ${profile.country||"Schweiz"}</p>
${profile.url?`<p><span class="lbl">Website:</span> ${profile.url}</p>`:""}
<p><span class="lbl">Produkt:</span> ${profile.product}</p>
<p><span class="lbl">Grösse:</span> ${profile.size}</p>
<p><span class="lbl">Analyseziel:</span> ${profile.goal}</p>
${ctx?`<h2>2. KI-Branchenanalyse</h2>
${ctx.market?`<p><span class="lbl">Markt:</span> ${ctx.market}</p>`:""}
${ctx.competitors?`<p><span class="lbl">Wettbewerb:</span> ${ctx.competitors}</p>`:""}
${ctx.competitorsList?`<p><span class="lbl">Konkurrenten:</span> ${ctx.competitorsList}</p>`:""}
${ctx.customers?`<p><span class="lbl">Kunden:</span> ${ctx.customers}</p>`:""}
${ctx.regulations?`<p><span class="lbl">Regulierung:</span> ${ctx.regulations}</p>`:""}
${ctx.trends?`<p><span class="lbl">Trends:</span> ${ctx.trends}</p>`:""}`:""} 
<h2>3. SWOT-Matrix</h2>
<table><tr>
<td class="gr"><strong style="color:#15803d">Stärken (${items.strengths.length})</strong>${items.strengths.length?`<ul>${items.strengths.map(i=>`<li>${i}</li>`).join("")}</ul>`:"<p><em>–</em></p>"}</td>
<td class="re"><strong style="color:#dc2626">Schwächen (${items.weaknesses.length})</strong>${items.weaknesses.length?`<ul>${items.weaknesses.map(i=>`<li>${i}</li>`).join("")}</ul>`:"<p><em>–</em></p>"}</td>
</tr><tr>
<td class="bl"><strong style="color:#1d4ed8">Chancen (${items.opportunities.length})</strong>${items.opportunities.length?`<ul>${items.opportunities.map(i=>`<li>${i}</li>`).join("")}</ul>`:"<p><em>–</em></p>"}</td>
<td class="am"><strong style="color:#b45309">Risiken (${items.threats.length})</strong>${items.threats.length?`<ul>${items.threats.map(i=>`<li>${i}</li>`).join("")}</ul>`:"<p><em>–</em></p>"}</td>
</tr></table>
<h2>4. TOWS-Strategien</h2>
${[["SO – Ausbauen","SO"],["WO – Aufholen","WO"],["ST – Absichern","ST"],["WT – Vermeiden","WT"]].map(([t,k])=>`<div class="sb"><strong>${t}</strong>${strategies[k]?`<ul>${strategies[k].split("\n").filter(Boolean).map(l=>`<li>${l}</li>`).join("")}</ul>`:"<p><em>–</em></p>"}</div>`).join("")}
</body></html>`;
    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `SWOT_${profile.name}_${date.replace(/\./g,"-")}.doc`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast("✓ Word-Dokument heruntergeladen!");
  };

  const stepId=STEPS[step]?.id;
  const currentCat=CAT_ORDER.includes(stepId)?stepId:null;

  return (
    <>
      <Head>
        <title>SWOT-Analyse Builder{profile.name?` – ${profile.name}`:""}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <div style={S.page}>
        {toast&&<div style={S.toast}>{toast}</div>}

        <div style={S.hdr}>
          <div>
            <div style={{fontWeight:600,fontSize:14}}>SWOT-Analyse Builder</div>
            <div style={{fontSize:11,opacity:0.5,marginTop:1}}>{profile.name||"Unternehmensname noch nicht erfasst"}</div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <button onClick={()=>{save();showToast("Gespeichert");}} style={{background:"rgba(255,255,255,0.1)",border:"0.5px solid rgba(255,255,255,0.2)",color:"white",padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>💾 Speichern</button>
            <div style={{fontSize:11,color:"#93c5fd",padding:"3px 10px",background:"rgba(147,197,253,0.1)",borderRadius:20,border:"0.5px solid rgba(147,197,253,0.3)"}}>KI-gestützt</div>
          </div>
        </div>

        <div style={S.snav}>
          {STEPS.map((s,i)=>(
            <button key={s.id} onClick={()=>setStep(i)} style={{padding:"10px 11px",border:"none",background:"none",cursor:"pointer",fontSize:12,fontFamily:"inherit",whiteSpace:"nowrap",borderBottom:i===step?"2px solid #2563eb":"2px solid transparent",color:i===step?"#2563eb":i<step?"#16a34a":"#94a3b8",fontWeight:i===step?600:400}}>
              {i>0&&i<step?"✓ ":""}{s.label}
            </button>
          ))}
        </div>

        <div style={S.main}>

          {/* ── STEP 0: Profil ── */}
          {step===0&&!loading&&(
            <div>
              <h2 style={{fontSize:16,fontWeight:600,marginBottom:4}}>Schritt 1 – Unternehmensprofil</h2>
              <p style={{fontSize:13,color:"#64748b",marginBottom:14,lineHeight:1.5}}>
                Die KI analysiert Ihre Website, identifiziert Konkurrenten und erstellt eine tiefe Branchenanalyse.
              </p>
              <div style={S.card}>
                <div style={S.g2}>
                  <Field label="Unternehmensname *" value={profile.name} onChange={v=>upProfile("name",v)} placeholder="z.B. Stefan Consulting..." />
                  <Field label="Branche / Sektor *" value={profile.industry} onChange={v=>upProfile("industry",v)} placeholder="z.B. IT-Security Beratung, Detailhandel..." />
                  <Field label="Hauptprodukt / Hauptleistung *" value={profile.product} onChange={v=>upProfile("product",v)} placeholder="z.B. FINMA-Compliance Audits, Cloud Security..." hint="Je spezifischer, desto präzisere KI-Vorschläge" />
                  <Field label="Website URL (optional)" value={profile.url} onChange={v=>upProfile("url",v)} placeholder="https://www.ihre-firma.ch" hint="KI analysiert Inhalt für bessere Brancheneinschätzung" />
                  <div>
                    <label style={S.lbl}>Land / Markt *</label>
                    <select value={profile.country} onChange={e=>upProfile("country",e.target.value)} style={S.input}>
                      {["Schweiz","Deutschland","Österreich","EU (allgemein)","USA","International"].map(o=><option key={o}>{o}</option>)}
                    </select>
                    <p style={S.hint}>Bestimmt Regulierungen, Markt und Wettbewerb</p>
                  </div>
                  <div>
                    <label style={S.lbl}>Unternehmensgrösse</label>
                    <select value={profile.size} onChange={e=>upProfile("size",e.target.value)} style={S.input}>
                      {["Einzelunternehmen / Freelancer","Mikrounternehmen (2–9 MA)","Kleinunternehmen (10–49 MA)","KMU (50–249 MA)","Grossunternehmen (250+ MA)"].map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.lbl}>Analysebereich</label>
                    <select value={profile.scope} onChange={e=>upProfile("scope",e.target.value)} style={S.input}>
                      {["Gesamtes Unternehmen","Einzelnes Produkt / Service","Einzelner Geschäftsbereich","Markteintrittsstrategie","Neues Geschäftsmodell"].map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div style={{gridColumn:"1/-1"}}>
                    <Field label="Ziel dieser SWOT-Analyse *" value={profile.goal} onChange={v=>upProfile("goal",v)} placeholder="z.B. Strategische Positionierung im Schweizer Finanzsektor – neue Dienstleistungen erschliessen." textarea />
                  </div>
                </div>
              </div>
              <div style={S.infoBl}>
                <p style={{fontSize:12,color:"#1e40af",margin:0,lineHeight:1.6}}>
                  <strong>Was die KI übernimmt:</strong> Website-Analyse · Tiefe Marktanalyse · Hauptkonkurrenten identifizieren · Regulatorisches Umfeld · Kundenprofil · Technologietrends
                </p>
              </div>
              {genError&&<div style={S.errBl}><p style={{fontSize:12,color:"#dc2626",margin:0}}><strong>Fehler:</strong> {genError}</p></div>}
              <div style={{display:"flex",justifyContent:"flex-end"}}>
                <button onClick={startAnalysis} style={S.btnPri}>Analyse starten →</button>
              </div>
            </div>
          )}

          {/* ── Loading ── */}
          {loading&&(
            <div style={{...S.card,padding:40,textAlign:"center"}}>
              <div style={{fontSize:28,marginBottom:14}}>⚙️</div>
              <div style={{fontSize:15,fontWeight:600,marginBottom:4}}>Analyse läuft</div>
              <div style={{fontSize:13,color:"#64748b",marginBottom:24}}>Schritt {loadingStep} von {profile.url?2:1}</div>
              <div style={{maxWidth:340,margin:"0 auto",textAlign:"left"}}>
                {[
                  profile.url?`Website analysieren: ${profile.url}`:"Website-Analyse (keine URL – wird übersprungen)",
                  "Branchenanalyse: Markt · Wettbewerb · Regulierungen · Trends",
                ].map((lbl,i)=>{
                  const idx=i+1;
                  const done=loadingStep>idx, active=loadingStep===idx;
                  return (
                    <div key={i} style={{display:"flex",gap:10,fontSize:13,padding:"8px 12px",borderRadius:8,marginBottom:6,background:done?"#f0fdf4":active?"#eff6ff":"#f8fafc",border:`0.5px solid ${done?"#bbf7d0":active?"#bfdbfe":"#e2e8f0"}`,color:done?"#15803d":active?"#1e40af":"#94a3b8"}}>
                      <span>{done?"✓":active?"⏳":"○"}</span>
                      <span style={{fontWeight:active?600:400}}>{lbl}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── STEP 1: Branchenanalyse ── */}
          {stepId==="analysis"&&aiData?.context&&(
            <div>
              <h2 style={{fontSize:16,fontWeight:600,marginBottom:4}}>Branchenanalyse – {profile.name}</h2>
              <p style={{fontSize:13,color:"#64748b",marginBottom:14}}>KI-gestützte Analyse von Markt, Wettbewerb, Kunden, Regulierung und Trends.</p>
              {profile.url && (
                <div style={{background: aiData.context.siteNote?.includes("Trainingswissen") ? "#fef9c3" : "#f0fdf4", border: `0.5px solid ${aiData.context.siteNote?.includes("Trainingswissen") ? "#fde68a" : "#bbf7d0"}`, borderRadius:8, padding:"8px 12px", marginBottom:12, fontSize:12, color: aiData.context.siteNote?.includes("Trainingswissen") ? "#92400e" : "#15803d"}}>
                  🌐 {aiData.context.siteNote?.includes("Trainingswissen")
                    ? `Website (${profile.url}): JavaScript-gerendert – KI nutzt Trainingswissen über das Unternehmen`
                    : `Website analysiert: ${aiData.context.siteNote}`}
                </div>
              )}
              <div style={S.g2}>
                {[["📊 Markt",aiData.context.market],["🏢 Wettbewerb",aiData.context.competitors],["👥 Kunden",aiData.context.customers],["📈 Trends",aiData.context.trends]].map(([t,v])=>(
                  <div key={t} style={S.card}>
                    <div style={{fontSize:12,fontWeight:600,color:"#475569",marginBottom:6}}>{t}</div>
                    <div style={{fontSize:13,color:"#1e293b",lineHeight:1.6}}>{v||"–"}</div>
                  </div>
                ))}
              </div>
              <div style={S.card}>
                <div style={{fontSize:12,fontWeight:600,color:"#475569",marginBottom:6}}>⚖️ Regulierung & Compliance</div>
                <div style={{fontSize:13,color:"#1e293b",lineHeight:1.6}}>{aiData.context.regulations||"–"}</div>
              </div>
              {aiData.context.competitorsList&&(
                <div style={{...S.card,background:"#fafafa"}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#475569",marginBottom:8}}>🎯 Identifizierte Hauptkonkurrenten</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {aiData.context.competitorsList.split(",").map(c=>c.trim()).filter(Boolean).map(c=>(
                      <span key={c} style={{padding:"4px 10px",background:"#e0e7ff",color:"#3730a3",borderRadius:20,fontSize:12,fontWeight:500}}>{c}</span>
                    ))}
                  </div>
                </div>
              )}
              <NavRow onBack={()=>setStep(0)} onNext={()=>setStep(2)} nextLabel="Weiter zu Stärken →" />
            </div>
          )}

          {/* ── SWOT Steps 2–5 ── */}
          {currentCat&&!loading&&(()=>{
            const cat=currentCat, m=CAT[cat], catItems=items[cat];
            const sugs=aiData?.[cat]||[];
            const si=CAT_ORDER.indexOf(cat)+2;
            const count=catItems.length, isLoading=catLoading[cat];
            const assessment=profile.assessments?.[cat]||"";
            return (
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <h2 style={{fontSize:16,fontWeight:600,margin:0}}>{m.label}</h2>
                  <span style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:count>=3?"#dcfce7":"#fef9c3",color:count>=3?"#15803d":"#a16207"}}>
                    {count>=3?`✓ ${count} erfasst`:`⚠ ${count} – mind. 3 empfohlen`}
                  </span>
                </div>

                {/* User Assessment */}
                <div style={S.card}>
                  <div style={{fontSize:12,fontWeight:600,color:"#475569",marginBottom:6}}>✏️ Ihre Einschätzung</div>
                  <p style={{fontSize:12,color:"#64748b",marginBottom:8,lineHeight:1.5}}>
                    Beschreiben Sie die Situation in Ihren eigenen Worten. Die KI nutzt diese Einschätzung für präzisere Vorschläge.
                  </p>
                  <textarea
                    value={assessment}
                    onChange={e=>upAssessment(cat,e.target.value)}
                    rows={4}
                    placeholder={`z.B. bei ${m.short}: "Wir sind bekannt als..." / "Unser grösster Vorteil ist..." / "Wir kämpfen mit der Herausforderung, dass..."`}
                    style={{...S.input,resize:"vertical",lineHeight:1.5,marginBottom:10}}
                  />
                  <button onClick={()=>generateCategoryItems(cat)} disabled={isLoading}
                    style={{...S.btnPri,background:m.head,opacity:isLoading?0.7:1}}>
                    {isLoading?"⏳ Wird generiert...":"✨ KI-Vorschläge generieren"}
                  </button>
                </div>

                {/* Suggestions + Selected */}
                {(sugs.length>0||count>0)&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                    <div style={S.card}>
                      <div style={{fontSize:12,fontWeight:500,color:"#475569",marginBottom:8}}>
                        ✨ KI-Vorschläge <span style={{fontSize:10,color:"#94a3b8"}}>(klicken zum Übernehmen)</span>
                      </div>
                      {sugs.length===0
                        ?<p style={{fontSize:12,color:"#94a3b8"}}>Einschätzung eingeben und Button drücken.</p>
                        :<div style={{display:"flex",flexDirection:"column",gap:5}}>
                          {sugs.map((sg,i)=><SugCard key={i} item={sg.item} reason={sg.reason} accepted={catItems.includes(sg.item)} onClick={()=>acceptSug(cat,i)} />)}
                        </div>}
                    </div>
                    <div>
                      <div style={{...S.card,border:`0.5px solid ${m.head}30`}}>
                        <div style={{fontSize:12,fontWeight:500,color:m.text,marginBottom:8,display:"flex",justifyContent:"space-between"}}>
                          <span>Ihre {m.short}</span>
                          <span style={{fontWeight:400,color:"#94a3b8"}}>{count} Punkt{count!==1?"e":""}</span>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}>
                          {count===0
                            ?<p style={{fontSize:12,color:"#94a3b8",margin:0}}>Vorschläge anklicken oder unten eingeben.</p>
                            :catItems.map((it,i)=>(
                              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",borderRadius:6,border:`0.5px solid ${m.head}20`,background:m.bg}}>
                                <span style={{fontSize:12,color:m.text}}>• {it}</span>
                                <button onClick={()=>removeItem(cat,i)} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:16,lineHeight:1,padding:"0 0 0 6px",fontFamily:"inherit"}}>×</button>
                              </div>
                            ))}
                        </div>
                        <div style={{borderTop:"0.5px solid #f1f5f9",paddingTop:10}}>
                          <div style={{fontSize:11,color:"#94a3b8",marginBottom:5}}>Eigenen Punkt hinzufügen:</div>
                          <div style={{display:"flex",gap:6}}>
                            <input type="text" value={newText[cat]} onChange={e=>setNewText(p=>({...p,[cat]:e.target.value}))}
                              onKeyDown={e=>e.key==="Enter"&&addItem(cat)} placeholder="Ergänzung..."
                              style={{flex:1,padding:"8px 10px",border:"0.5px solid #e2e8f0",borderRadius:6,fontSize:13,fontFamily:"inherit"}} />
                            <button onClick={()=>addItem(cat)} style={{...S.btnPri,background:m.head,padding:"8px 14px",fontSize:16}}>+</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <NavRow onBack={()=>setStep(si-1)} onNext={()=>{save({step:si+1});setStep(si+1);}} />
              </div>
            );
          })()}

          {/* ── STEP 6: Matrix ── */}
          {stepId==="matrix"&&(
            <div>
              <h2 style={{fontSize:16,fontWeight:600,marginBottom:12}}>SWOT-Matrix – Gesamtübersicht</h2>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                {CAT_ORDER.map(cat=>{const m=CAT[cat],its=items[cat];return(
                  <div key={cat} style={{borderRadius:12,overflow:"hidden",border:"0.5px solid #e2e8f0"}}>
                    <div style={{background:m.head,color:"white",padding:"8px 13px",fontSize:12,fontWeight:500}}>{m.short} ({its.length})</div>
                    <div style={{background:m.bg,padding:"11px 13px",minHeight:70}}>
                      {its.length===0?<p style={{fontSize:12,color:"#94a3b8"}}>Keine Punkte</p>
                        :<ul style={{paddingLeft:16}}>{its.map((it,i)=><li key={i} style={{fontSize:12,color:m.text,marginBottom:4,lineHeight:1.4}}>{it}</li>)}</ul>}
                    </div>
                  </div>
                );})}
              </div>
              <NavRow onBack={()=>setStep(5)} onNext={()=>setStep(7)} nextLabel="Zu den Strategien →" />
            </div>
          )}

          {/* ── STEP 7: TOWS ── */}
          {stepId==="tows"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <h2 style={{fontSize:16,fontWeight:600,marginBottom:3}}>TOWS-Matrix & Strategien</h2>
                  <p style={{fontSize:13,color:"#64748b"}}>KI leitet Handlungsstrategien ab und trägt diese in die Boxen ein.</p>
                </div>
                <button onClick={generateTOWS} style={{background:"#0f172a",color:"#93c5fd",border:"0.5px solid #1e293b",padding:"8px 14px",borderRadius:8,cursor:"pointer",fontSize:12,fontFamily:"inherit",flexShrink:0}}>
                  KI-Strategien generieren
                </button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                {TOWS_DEF.map(t=>(
                  <div key={t.k} style={{background:t.bg,border:"0.5px solid #e2e8f0",borderRadius:12,padding:12}}>
                    <div style={{fontSize:12,fontWeight:600,color:t.tc,marginBottom:1}}>{t.t}</div>
                    <div style={{fontSize:10,color:"#94a3b8",marginBottom:7}}>{t.s}</div>
                    <textarea rows={4} value={strategies[t.k]} onChange={e=>setStrats(p=>({...p,[t.k]:e.target.value}))}
                      placeholder="Massnahmen..."
                      style={{width:"100%",fontSize:12,border:"0.5px solid #e2e8f0",borderRadius:6,padding:"7px 9px",fontFamily:"inherit",resize:"vertical",background:"rgba(255,255,255,0.6)",lineHeight:1.5,boxSizing:"border-box"}} />
                  </div>
                ))}
              </div>
              {twLoading&&<div style={{background:"#0f172a",borderRadius:12,padding:20,textAlign:"center",color:"#64748b",fontSize:12,marginBottom:12}}>Strategien werden generiert...</div>}
              {twError&&!twLoading&&<div style={S.errBl}><p style={{fontSize:12,color:"#dc2626",margin:0}}>Fehler: {twError}</p><button onClick={generateTOWS} style={{marginTop:6,fontSize:11,padding:"3px 8px",border:"0.5px solid #fecaca",borderRadius:4,cursor:"pointer",background:"white",fontFamily:"inherit"}}>Retry</button></div>}
              {twText&&!twLoading&&<div style={{background:"#f0fdf4",border:"0.5px solid #bbf7d0",borderRadius:8,padding:10,fontSize:12,color:"#15803d",marginBottom:12}}>{twText}</div>}
              <NavRow onBack={()=>setStep(6)} onNext={()=>{save();setStep(8);}} nextLabel="Zum Download →" />
            </div>
          )}

          {/* ── STEP 8: Download ── */}
          {stepId==="download"&&(
            <div>
              <h2 style={{fontSize:16,fontWeight:600,marginBottom:12}}>Zusammenfassung & Download</h2>
              <div style={S.g4}>
                {[["Stärken",items.strengths.length,"#16a34a","#f0fdf4"],["Schwächen",items.weaknesses.length,"#dc2626","#fef2f2"],["Chancen",items.opportunities.length,"#2563eb","#eff6ff"],["Risiken",items.threats.length,"#d97706","#fffbeb"]].map(([l,n,c,b])=>(
                  <div key={l} style={{background:b,border:`0.5px solid ${c}25`,borderRadius:12,padding:12,textAlign:"center"}}>
                    <div style={{fontSize:24,fontWeight:600,color:c,marginBottom:2}}>{n}</div>
                    <div style={{fontSize:11,color:"#475569"}}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{background:"#f8fafc",border:"0.5px dashed #cbd5e1",borderRadius:12,padding:28,textAlign:"center",margin:"14px 0 12px"}}>
                <div style={{fontSize:32,marginBottom:10}}>📄</div>
                <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>Word-Dokument (.docx)</div>
                <div style={{fontSize:12,color:"#64748b",marginBottom:18,lineHeight:1.6}}>Enthält: Profil · Branchenanalyse · SWOT-Matrix · TOWS-Strategien · Datum</div>
                <button onClick={exportWord} style={S.btnPri}>📥 Als Word (.docx) herunterladen</button>
              </div>
              <div style={S.navr}>
                <button onClick={()=>setStep(7)} style={S.btnOut}>← Zurück</button>
                <button onClick={()=>{if(window.confirm("Neue Analyse starten?")){setItems({strengths:[],weaknesses:[],opportunities:[],threats:[]});setStrats({SO:"",WO:"",ST:"",WT:""});setAiData(null);setTwText("");save({step:0});setStep(0);}}}
                  style={{...S.btnOut,color:"#16a34a",borderColor:"#bbf7d0"}}>+ Neue Analyse</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
