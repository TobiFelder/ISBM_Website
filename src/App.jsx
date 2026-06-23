import { useState, useEffect, useRef } from "react";
import { Trophy, ListOrdered, ClipboardList, Lock, LogOut, Plus, Trash2, Pencil, X, Save, ChevronDown, ChevronUp, Users, ShieldCheck, Medal, AlertCircle, User, KeyRound, Download, Upload, DatabaseBackup } from "lucide-react";
import { supabase } from "./supabase";

const ROW_ID = "isbm";
const DEFAULT_PASSWORD = "isbm2026";

const DISCIPLINES = [
  { key: "de", label: "Dameneinzel" },
  { key: "he", label: "Herreneinzel" },
  { key: "dd", label: "Damendoppel", alt: "2. Herreneinzel" },
  { key: "hd", label: "Herrendoppel" },
  { key: "mx", label: "Mixed" },
];

const emptyGames = () =>
  DISCIPLINES.map((d) => ({ key: d.key, label: d.label, sets: [{ a: "", b: "" }, { a: "", b: "" }, { a: "", b: "" }] }));

const uid = () => Math.random().toString(36).slice(2, 10);
const num = (v) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };

function setStatus(s) {
  const ae = s.a === "" || s.a === undefined;
  const be = s.b === "" || s.b === undefined;
  if (ae && be) return { state: "empty", winner: null };
  if (ae || be) return { state: "incomplete", winner: null };
  const x = num(s.a), y = num(s.b);
  if (x === y) return { state: "invalid", winner: null };
  const w = Math.max(x, y), l = Math.min(x, y);
  let ok = false;
  if (w === 21 && l <= 19) ok = true;
  else if (w >= 22 && w <= 29 && w - l === 2) ok = true;
  else if (w === 30 && (l === 28 || l === 29)) ok = true;
  return { state: ok ? "valid" : "invalid", winner: ok ? (x > y ? "a" : "b") : null };
}

function normalizeGame(g) {
  const sets = g.sets.map((s) => ({ ...s }));
  const s1 = setStatus(sets[0]);
  if (s1.state !== "valid") { sets[1] = { a: "", b: "" }; sets[2] = { a: "", b: "" }; return { ...g, sets }; }
  const s2 = setStatus(sets[1]);
  const set3enabled = s2.state === "valid" && s1.winner !== s2.winner;
  if (!set3enabled) sets[2] = { a: "", b: "" };
  return { ...g, sets };
}

function gameSetEnabled(g) {
  const s1 = setStatus(g.sets[0]);
  const set2 = s1.state === "valid";
  const s2 = setStatus(g.sets[1]);
  const set3 = set2 && s2.state === "valid" && s1.winner !== s2.winner;
  return [true, set2, set3];
}

function gameValid(g) { return g.sets.every((s) => { const st = setStatus(s); return st.state === "empty" || st.state === "valid"; }); }

function computeEncounter(enc) {
  let aGames = 0, bGames = 0, aSets = 0, bSets = 0, aPts = 0, bPts = 0;
  const gameResults = (enc.games || []).map((g) => {
    let gaSets = 0, gbSets = 0, played = false;
    g.sets.forEach((s) => {
      const st = setStatus(s);
      if (st.state !== "valid") return;
      played = true;
      aPts += num(s.a); bPts += num(s.b);
      if (st.winner === "a") gaSets++; else gbSets++;
    });
    aSets += gaSets; bSets += gbSets;
    let winner = null;
    if (played) { if (gaSets > gbSets) { aGames++; winner = "a"; } else if (gbSets > gaSets) { bGames++; winner = "b"; } }
    return { ...g, gaSets, gbSets, winner, played };
  });
  const winner = aGames > bGames ? "a" : bGames > aGames ? "b" : null;
  return { aGames, bGames, aSets, bSets, aPts, bPts, gameResults, winner };
}

function computeStandings(teams, encounters) {
  const map = {};
  teams.forEach((t) => { map[t.id] = { id: t.id, name: t.name, beg: 0, begWon: 0, spW: 0, spL: 0, saW: 0, saL: 0, puW: 0, puL: 0 }; });
  encounters.forEach((enc) => {
    const r = computeEncounter(enc);
    if (!r.gameResults.some((g) => g.played)) return;
    const A = map[enc.teamAId], B = map[enc.teamBId];
    if (!A || !B) return;
    A.beg++; B.beg++;
    if (r.winner === "a") A.begWon++;
    if (r.winner === "b") B.begWon++;
    A.spW += r.aGames; A.spL += r.bGames; B.spW += r.bGames; B.spL += r.aGames;
    A.saW += r.aSets; A.saL += r.bSets; B.saW += r.bSets; B.saL += r.aSets;
    A.puW += r.aPts; A.puL += r.bPts; B.puW += r.bPts; B.puL += r.aPts;
  });
  return Object.values(map).sort((x, y) => {
    if (y.spW !== x.spW) return y.spW - x.spW;
    const sdx = x.saW - x.saL, sdy = y.saW - y.saL;
    if (sdy !== sdx) return sdy - sdx;
    const pdx = x.puW - x.puL, pdy = y.puW - y.puL;
    if (pdy !== pdx) return pdy - pdx;
    return x.name.localeCompare(y.name);
  });
}

function computeFinalRanking(teams, encounters) {
  const placeByTeam = {};
  encounters.filter((e) => e.phase === "final" && Array.isArray(e.places)).forEach((e) => {
    const r = computeEncounter(e);
    if (!r.winner) return;
    const winnerId = r.winner === "a" ? e.teamAId : e.teamBId;
    const loserId = r.winner === "a" ? e.teamBId : e.teamAId;
    placeByTeam[winnerId] = e.places[0];
    placeByTeam[loserId] = e.places[1];
  });
  return teams.map((t) => ({ ...t, place: placeByTeam[t.id] || null }))
    .sort((a, b) => (a.place || 999) - (b.place || 999) || a.name.localeCompare(b.name));
}

function makeDefaultUsers() {
  return [{ id: "admin0", username: "admin", password: DEFAULT_PASSWORD, role: "admin" }];
}

function Shuttle({ size = 24, className = "", style }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} style={style} fill="none">
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity="0.95">
        <path d="M32 42 L13 12" /><path d="M32 42 L22 7" /><path d="M32 42 L32 4" /><path d="M32 42 L42 7" /><path d="M32 42 L51 12" />
      </g>
      <path d="M19 24 Q32 30 45 24" stroke="currentColor" strokeWidth="2" opacity="0.45" fill="none" />
      <path d="M16 17 Q32 24 48 17" stroke="currentColor" strokeWidth="1.6" opacity="0.3" fill="none" />
      <circle cx="32" cy="48" r="8.5" fill="currentColor" />
      <circle cx="32" cy="45.5" r="3" fill="#0c1f1a" opacity="0.25" />
    </svg>
  );
}

function CourtLines({ className = "", opacity = 1, color = "white" }) {
  return (
    <svg className={className} viewBox="0 0 400 220" preserveAspectRatio="none" style={{ opacity }} fill="none">
      <g stroke={color} strokeWidth="1.2">
        <rect x="12" y="12" width="376" height="196" rx="2" />
        <line x1="200" y1="12" x2="200" y2="208" strokeWidth="2" />
        <line x1="46" y1="12" x2="46" y2="208" /><line x1="354" y1="12" x2="354" y2="208" />
        <line x1="12" y1="70" x2="388" y2="70" /><line x1="12" y1="150" x2="388" y2="150" />
        <line x1="120" y1="70" x2="120" y2="150" /><line x1="280" y1="70" x2="280" y2="150" />
      </g>
    </svg>
  );
}

const PAGE_BG = "linear-gradient(180deg, #04140f 0%, #062019 35%, #04130e 100%)";
const HERO_BG = "linear-gradient(125deg, #053b2c 0%, #0a7a55 45%, #84cc16 130%)";
const glass = "bg-white/[0.04] border border-white/10 backdrop-blur-md";
const inputDark = "bg-white/5 text-white rounded-xl px-3 py-2.5 outline-none border border-white/15 focus:ring-2 focus:ring-lime-400/40 focus:border-lime-400/40 placeholder:text-slate-500";

export default function App() {
  const [data, setData] = useState({ teams: [], encounters: [], groups: ["A", "B"], password: DEFAULT_PASSWORD, users: makeDefaultUsers() });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState("rangliste");
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data: row, error } = await supabase.from("app_state").select("data").eq("id", ROW_ID).maybeSingle();
        if (error) throw error;
        if (!cancelled) {
          if (row && row.data) {
            const parsed = row.data;
            const normalized = { password: DEFAULT_PASSWORD, teams: [], encounters: [], groups: ["A", "B"], users: [], ...parsed };
            if (!normalized.users || normalized.users.length === 0) normalized.users = makeDefaultUsers();
            setData(normalized);
          }
          setLoadError(false);
        }
      } catch (e) {
        console.error("Laden fehlgeschlagen", e);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 15000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; clearInterval(iv); window.removeEventListener("focus", onFocus); };
  }, []);

  const persist = async (next) => {
    setData(next);
    try {
      const { error } = await supabase.from("app_state").upsert({ id: ROW_ID, data: next, updated_at: new Date().toISOString() });
      if (error) throw error;
    } catch (e) {
      console.error("Speichern fehlgeschlagen", e);
      alert("Speichern fehlgeschlagen. Bitte Internetverbindung pruefen und erneut versuchen.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-lime-300" style={{ background: PAGE_BG }}>
        <Shuttle size={56} className="text-lime-300 isbm-float" />
        <div className="tracking-widest text-sm uppercase text-emerald-200/70">lädt</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-slate-100 relative" style={{ background: PAGE_BG, colorScheme: "dark" }}>
      <style>{`
        @keyframes isbmFloat { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-14px) } }
        .isbm-float{ animation: isbmFloat 6s ease-in-out infinite; }
        @keyframes isbmFloat2 { 0%,100%{ transform: translateY(0) rotate(18deg) } 50%{ transform: translateY(-20px) rotate(18deg) } }
        .isbm-float2{ animation: isbmFloat2 8s ease-in-out infinite; }
        .isbm-rise{ animation: isbmRise .5s ease both; }
        @keyframes isbmRise { from{ opacity:0; transform: translateY(10px) } to{ opacity:1; transform:none } }
        html,body,#root{ margin:0; background:#04130e; }
      `}</style>

      <CourtLines className="fixed inset-0 w-full h-full pointer-events-none" opacity={0.035} color="#7dd3a0" />

      <header className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: HERO_BG }} />
        <CourtLines className="absolute inset-0 w-full h-full" opacity={0.18} color="white" />
        <Shuttle size={150} className="absolute -right-6 -top-8 text-white/10 isbm-float2" />
        <Shuttle size={90} className="absolute right-32 top-16 text-white/10 isbm-float" />
        <div className="relative max-w-4xl mx-auto px-5 py-9">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl p-3 bg-white/15 border border-white/25 backdrop-blur-sm shadow-lg"><Shuttle size={34} className="text-white" /></div>
              <div>
                <div className="text-[11px] font-semibold tracking-[0.25em] uppercase text-lime-200/90 mb-1">Innerschweizer Meisterschaft</div>
                <h1 className="text-2xl sm:text-4xl font-black leading-none tracking-tight text-white" style={{ textShadow: "0 2px 20px rgba(0,0,0,0.25)" }}>
                  ISBM <span className="text-lime-300">Badminton</span>
                </h1>
                <p className="text-emerald-50/80 text-xs sm:text-sm mt-1.5">Rangliste · Resultate · Endrunde</p>
              </div>
            </div>
            {user && (
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2 bg-black/20 border border-white/15 rounded-xl px-3 py-1.5">
                  <User size={14} className="text-lime-300" />
                  <span className="text-sm font-semibold">{user.username}</span>
                  <span className="text-[10px] uppercase tracking-wider bg-white/10 rounded px-1.5 py-0.5">{user.role === "admin" ? "Admin" : "Bearb."}</span>
                </div>
                <button onClick={() => { setUser(null); setView("rangliste"); }} className="flex items-center gap-1.5 bg-black/20 hover:bg-black/30 transition rounded-xl px-3 py-1.5 text-xs font-medium border border-white/15">
                  <LogOut size={14} /> Abmelden
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="relative h-1.5" style={{ background: "linear-gradient(90deg,#bef264,#22c55e,#bef264)" }} />
      </header>

      <nav className="sticky top-0 z-20 bg-[#04140f]/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-4xl mx-auto px-3 flex gap-1">
          <Tab active={view === "rangliste"} onClick={() => setView("rangliste")} icon={<ListOrdered size={17} />} label="Rangliste" />
          <Tab active={view === "resultate"} onClick={() => setView("resultate")} icon={<ClipboardList size={17} />} label="Resultate" />
          <Tab active={view === "admin"} onClick={() => setView("admin")} icon={user ? <ShieldCheck size={17} /> : <Lock size={17} />} label={user ? "Verwaltung" : "Login"} />
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-7 relative isbm-rise">
        {loadError && (
          <div className="mb-4 bg-rose-500/15 border border-rose-500/30 text-rose-200 rounded-xl px-4 py-2.5 text-sm flex items-center gap-2">
            <AlertCircle size={16} /> Verbindung zur Datenbank fehlgeschlagen. Bitte Seite neu laden oder die Supabase-Einstellungen pruefen.
          </div>
        )}
        {view === "rangliste" && <Rangliste data={data} />}
        {view === "resultate" && <Resultate data={data} />}
        {view === "admin" && (user ? <Admin data={data} persist={persist} user={user} setUser={setUser} /> : <Login users={data.users} onSuccess={setUser} />)}
      </main>

      <footer className="max-w-4xl mx-auto px-4 py-10 text-center">
        <Shuttle size={20} className="text-emerald-700 mx-auto mb-2" />
        <p className="text-xs text-emerald-200/40">ISBM · Innerschweizer Badminton Meisterschaft</p>
      </footer>
    </div>
  );
}

function Tab({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold border-b-2 transition ${active ? "border-lime-400 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
      {icon} {label}
    </button>
  );
}

function Seg({ active, onClick, label }) {
  return (
    <button onClick={onClick} className={`flex-1 px-3 py-2 text-sm font-semibold rounded-lg transition ${active ? "bg-lime-400 text-emerald-950 shadow" : "text-slate-300 hover:bg-white/5"}`} style={active ? { boxShadow: "0 4px 18px rgba(163,230,53,0.35)" } : undefined}>
      {label}
    </button>
  );
}

function Card({ children, className = "" }) { return <div className={`${glass} rounded-3xl shadow-2xl ${className}`}>{children}</div>; }

function Rangliste({ data }) {
  const [phase, setPhase] = useState("group");
  const groups = data.groups || ["A", "B"];
  const groupEncs = data.encounters.filter((e) => (e.phase || "group") === "group");
  if (data.teams.length === 0) return <EmptyState text="Noch keine Teams erfasst. Melde dich in der Verwaltung an, um Teams und Resultate einzutragen." />;
  return (
    <div>
      <div className={`flex gap-1 ${glass} rounded-2xl p-1 mb-5`}>
        <Seg active={phase === "group"} onClick={() => setPhase("group")} label="Gruppenphase" />
        <Seg active={phase === "final"} onClick={() => setPhase("final")} label="Endrunde" />
      </div>
      {phase === "group" && (
        <div className="space-y-5">
          {groups.map((g) => {
            const teamsInGroup = data.teams.filter((t) => (t.group || groups[0]) === g);
            const standings = computeStandings(teamsInGroup, groupEncs);
            return <StandingsTable key={g} title={`Gruppe ${g}`} standings={standings} empty="Keine Teams in dieser Gruppe." />;
          })}
        </div>
      )}
      {phase === "final" && <FinalView data={data} />}
    </div>
  );
}

function RankBadge({ n, podium }) {
  const styles = {
    1: { background: "linear-gradient(135deg,#fde68a,#f59e0b)", boxShadow: "0 0 16px rgba(245,158,11,0.55)", color: "#3b2406" },
    2: { background: "linear-gradient(135deg,#f1f5f9,#94a3b8)", boxShadow: "0 0 12px rgba(148,163,184,0.4)", color: "#1e293b" },
    3: { background: "linear-gradient(135deg,#fdba74,#b45309)", boxShadow: "0 0 12px rgba(180,83,9,0.45)", color: "#fff" },
  };
  const s = podium ? styles[n] : null;
  return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-extrabold" style={s || { background: "rgba(255,255,255,0.06)", color: "#94a3b8" }}>{n}</span>;
}

function StandingsTable({ title, standings, empty }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-lime-400/15 flex items-center justify-center"><ListOrdered size={17} className="text-lime-300" /></div>
        <h2 className="font-bold text-lg tracking-tight">{title}</h2>
      </div>
      {standings.length === 0 ? <p className="px-5 py-6 text-sm text-slate-400">{empty}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-lime-300/60">
                <th className="px-4 py-3 w-12">#</th><th className="px-3 py-3">Team</th><th className="px-3 py-3 text-center">Beg.</th>
                <th className="px-3 py-3 text-center text-lime-300/80">Spiele</th><th className="px-3 py-3 text-center">Sätze</th><th className="px-4 py-3 text-center">Punkte</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((t, i) => (
                <tr key={t.id} className="border-t border-white/[0.06]" style={i < 2 ? { background: "rgba(163,230,53,0.06)" } : undefined}>
                  <td className="px-4 py-3.5"><RankBadge n={i + 1} podium={i < 2} /></td>
                  <td className="px-3 py-3.5 font-semibold text-white">{t.name}</td>
                  <td className="px-3 py-3.5 text-center text-slate-400">{t.begWon}/{t.beg}</td>
                  <td className="px-3 py-3.5 text-center font-extrabold text-lime-300 text-base tabular-nums">{t.spW}<span className="text-slate-600">:</span>{t.spL}</td>
                  <td className="px-3 py-3.5 text-center text-slate-300 tabular-nums">{t.saW}:{t.saL}</td>
                  <td className="px-4 py-3.5 text-center text-slate-400 tabular-nums">{t.puW}:{t.puL}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function FinalView({ data }) {
  const teamName = (id) => data.teams.find((t) => t.id === id)?.name || "?";
  const finals = data.encounters.filter((e) => e.phase === "final");
  const ranking = computeFinalRanking(data.teams, data.encounters);
  const anyPlace = ranking.some((t) => t.place);
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-400/15 flex items-center justify-center"><Medal size={17} className="text-amber-400" /></div>
          <h2 className="font-bold text-lg tracking-tight">Endrangliste</h2>
        </div>
        {!anyPlace ? <p className="px-5 py-6 text-sm text-slate-400">Noch keine Platzierungsspiele ausgewertet.</p> : (
          <table className="w-full text-sm">
            <tbody>
              {ranking.map((t) => (
                <tr key={t.id} className="border-t border-white/[0.06]" style={t.place && t.place <= 3 ? { background: "rgba(245,158,11,0.05)" } : undefined}>
                  <td className="px-4 py-3.5 w-14">{t.place ? <RankBadge n={t.place} podium={t.place <= 3} /> : <span className="text-slate-600 pl-2">-</span>}</td>
                  <td className="px-2 py-3.5 font-semibold text-white">{t.name}</td>
                  <td className="px-4 py-3.5 text-right text-xs text-slate-500">Gruppe {t.group || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 px-1">Platzierungsspiele</h3>
        {finals.length === 0 ? <p className="text-sm text-slate-500 px-1">Noch keine Endrunden-Begegnungen eingetragen.</p> : <EncounterList encounters={finals} teamName={teamName} />}
      </div>
    </div>
  );
}

function Resultate({ data }) {
  const teamName = (id) => data.teams.find((t) => t.id === id)?.name || "?";
  if (data.encounters.length === 0) return <EmptyState text="Noch keine Begegnungen eingetragen." />;
  return <EncounterList encounters={data.encounters} teamName={teamName} />;
}

function EncounterList({ encounters, teamName }) {
  const [open, setOpen] = useState(null);
  const sorted = [...encounters].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <div className="space-y-3">
      {sorted.map((enc) => {
        const r = computeEncounter(enc);
        const expanded = open === enc.id;
        const isFinal = enc.phase === "final";
        const tag = isFinal ? (Array.isArray(enc.places) ? `Platz ${enc.places[0]}/${enc.places[1]}` : "Endrunde") : `Gruppe ${enc.group || "?"}`;
        return (
          <Card key={enc.id} className="overflow-hidden">
            <button onClick={() => setOpen(expanded ? null : enc.id)} className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-white/[0.03] transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border" style={isFinal ? { background: "rgba(245,158,11,0.12)", color: "#fcd34d", borderColor: "rgba(245,158,11,0.25)" } : { background: "rgba(163,230,53,0.12)", color: "#bef264", borderColor: "rgba(163,230,53,0.25)" }}>{tag}</span>
                  {enc.round && <span className="text-xs text-slate-500">{enc.round}</span>}
                </div>
                <div className="flex items-center gap-2 font-semibold text-[15px]">
                  <span className={r.winner === "a" ? "text-lime-300" : "text-slate-200"}>{teamName(enc.teamAId)}</span>
                  <span className="text-slate-600 text-xs font-normal">vs</span>
                  <span className={r.winner === "b" ? "text-lime-300" : "text-slate-200"}>{teamName(enc.teamBId)}</span>
                </div>
                {enc.date && <div className="text-xs text-slate-500 mt-1">{enc.date}</div>}
              </div>
              <div className="text-2xl font-black tabular-nums">
                <span className={r.winner === "a" ? "text-lime-300" : "text-slate-400"}>{r.aGames}</span>
                <span className="text-slate-700 mx-1">:</span>
                <span className={r.winner === "b" ? "text-lime-300" : "text-slate-400"}>{r.bGames}</span>
              </div>
              <div className="text-slate-500">{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</div>
            </button>
            {expanded && (
              <div className="border-t border-white/10 px-5 py-3 bg-black/20">
                <table className="w-full text-sm">
                  <tbody>
                    {r.gameResults.map((g, i) => (
                      <tr key={i} className="border-b border-white/[0.06] last:border-0">
                        <td className="py-2.5 text-slate-300 w-40">{g.label}</td>
                        <td className="py-2.5">
                          <div className="flex gap-1.5 flex-wrap">
                            {g.sets.filter((s) => setStatus(s).state === "valid").map((s, j) => (
                              <span key={j} className="tabular-nums text-slate-200 bg-white/5 border border-white/10 rounded-md px-2 py-0.5 text-xs font-medium">{num(s.a)}-{num(s.b)}</span>
                            ))}
                            {!g.played && <span className="text-xs text-slate-600 italic">nicht gespielt</span>}
                          </div>
                        </td>
                        <td className="py-2.5 text-right font-bold w-12 tabular-nums">
                          {g.played && <span className={g.winner === "a" ? "text-lime-300" : g.winner === "b" ? "text-rose-400" : ""}>{g.gaSets}:{g.gbSets}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-xs text-slate-500 mt-2.5">Sätze {r.aSets}:{r.bSets} · Punkte {r.aPts}:{r.bPts}</div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function Login({ users, onSuccess }) {
  const [u, setU] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const submit = () => {
    const found = (users || []).find((x) => x.username.toLowerCase() === u.trim().toLowerCase() && x.password === pw);
    if (found) onSuccess(found); else setErr(true);
  };
  return (
    <Card className="max-w-sm mx-auto p-7 mt-6 relative overflow-hidden">
      <Shuttle size={80} className="absolute -right-3 -top-3 text-white/[0.04]" />
      <div className="relative">
        <div className="w-12 h-12 rounded-2xl bg-lime-400/15 flex items-center justify-center mb-3"><Lock size={22} className="text-lime-300" /></div>
        <h2 className="font-bold text-xl mb-1">Anmelden</h2>
        <p className="text-sm text-slate-400 mb-5">Zum Eintragen von Teams und Resultaten.</p>
        <label className="text-xs text-slate-400 mb-1 block">Benutzername</label>
        <input value={u} onChange={(e) => { setU(e.target.value); setErr(false); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="z.B. admin" className={`w-full mb-3 ${inputDark} ${err ? "border-rose-400" : ""}`} />
        <label className="text-xs text-slate-400 mb-1 block">Passwort</label>
        <input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(false); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Passwort" className={`w-full mb-3 ${inputDark} ${err ? "border-rose-400" : ""}`} />
        {err && <p className="text-rose-400 text-sm mb-3 flex items-center gap-1"><AlertCircle size={14} /> Benutzername oder Passwort falsch.</p>}
        <button onClick={submit} className="w-full bg-lime-400 hover:bg-lime-300 text-emerald-950 font-bold rounded-xl py-3 transition" style={{ boxShadow: "0 6px 24px rgba(163,230,53,0.3)" }}>Anmelden</button>
      </div>
    </Card>
  );
}

function Admin({ data, persist, user, setUser }) {
  const isAdmin = user.role === "admin";
  const [tab, setTab] = useState("encounters");
  return (
    <div>
      <div className="flex gap-2 mb-5 flex-wrap">
        <SubTab active={tab === "encounters"} onClick={() => setTab("encounters")} icon={<ClipboardList size={16} />} label="Begegnungen" />
        {isAdmin && <SubTab active={tab === "teams"} onClick={() => setTab("teams")} icon={<Users size={16} />} label="Teams" />}
        {isAdmin && <SubTab active={tab === "users"} onClick={() => setTab("users")} icon={<User size={16} />} label="Benutzer" />}
        <SubTab active={tab === "settings"} onClick={() => setTab("settings")} icon={<KeyRound size={16} />} label="Konto" />
      </div>
      {tab === "teams" && isAdmin && <TeamsAdmin data={data} persist={persist} />}
      {tab === "encounters" && <EncountersAdmin data={data} persist={persist} />}
      {tab === "users" && isAdmin && <UsersAdmin data={data} persist={persist} currentUser={user} />}
      {tab === "settings" && <SettingsAdmin data={data} persist={persist} user={user} setUser={setUser} isAdmin={isAdmin} />}
    </div>
  );
}

function SubTab({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition border ${active ? "bg-lime-400 text-emerald-950 border-transparent" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"}`}>{icon} {label}</button>
  );
}

function UsersAdmin({ data, persist, currentUser }) {
  const users = data.users || [];
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [role, setRole] = useState("editor");
  const [editId, setEditId] = useState(null);
  const [eName, setEName] = useState("");
  const [ePw, setEPw] = useState("");
  const [eRole, setERole] = useState("editor");
  const [msg, setMsg] = useState("");

  const adminCount = users.filter((u) => u.role === "admin").length;
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };

  const add = () => {
    const name = username.trim();
    if (!name || !pw.trim()) { flash("Benutzername und Passwort sind erforderlich."); return; }
    if (users.some((u) => u.username.toLowerCase() === name.toLowerCase())) { flash("Benutzername existiert bereits."); return; }
    persist({ ...data, users: [...users, { id: uid(), username: name, password: pw.trim(), role }] });
    setUsername(""); setPw(""); setRole("editor");
  };
  const remove = (id) => {
    const u = users.find((x) => x.id === id);
    if (u.role === "admin" && adminCount <= 1) { flash("Der letzte Admin kann nicht gelöscht werden."); return; }
    if (!confirm(`Benutzer "${u.username}" löschen?`)) return;
    persist({ ...data, users: users.filter((x) => x.id !== id) });
  };
  const startEdit = (u) => { setEditId(u.id); setEName(u.username); setEPw(u.password); setERole(u.role); };
  const saveEdit = () => {
    const name = eName.trim();
    if (!name || !ePw.trim()) { flash("Benutzername und Passwort sind erforderlich."); return; }
    if (users.some((u) => u.id !== editId && u.username.toLowerCase() === name.toLowerCase())) { flash("Benutzername existiert bereits."); return; }
    const target = users.find((u) => u.id === editId);
    if (target.role === "admin" && eRole !== "admin" && adminCount <= 1) { flash("Es muss mindestens ein Admin bleiben."); return; }
    persist({ ...data, users: users.map((u) => (u.id === editId ? { ...u, username: name, password: ePw.trim(), role: eRole } : u)) });
    setEditId(null);
  };

  const roleBadge = (r) => (
    <span className="text-[11px] font-bold rounded-full px-2.5 py-0.5" style={r === "admin" ? { background: "rgba(163,230,53,0.15)", color: "#bef264" } : { background: "rgba(255,255,255,0.06)", color: "#94a3b8" }}>
      {r === "admin" ? "Admin" : "Bearbeiter"}
    </span>
  );

  return (
    <Card className="p-5">
      <h3 className="font-bold text-lg mb-1 flex items-center gap-2"><User size={18} className="text-lime-300" /> Benutzer verwalten</h3>
      <p className="text-xs text-slate-400 mb-4">Admins verwalten alles · Bearbeiter tragen nur Resultate ein.</p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2">
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Benutzername" className={inputDark} />
        <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Passwort" className={inputDark} />
        <select value={role} onChange={(e) => setRole(e.target.value)} className={inputDark}>
          <option value="editor">Bearbeiter</option>
          <option value="admin">Admin</option>
        </select>
        <button onClick={add} className="bg-lime-400 hover:bg-lime-300 text-emerald-950 rounded-xl px-4 py-2.5 flex items-center justify-center gap-1 font-bold"><Plus size={16} /> Anlegen</button>
      </div>
      {msg && <p className="text-amber-300 text-sm mb-3 flex items-center gap-1"><AlertCircle size={14} /> {msg}</p>}
      <div className="space-y-2 mt-3">
        {users.map((u) => (
          <div key={u.id} className="bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5">
            {editId === u.id ? (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                <input value={eName} onChange={(e) => setEName(e.target.value)} className={`${inputDark} py-2`} />
                <input value={ePw} onChange={(e) => setEPw(e.target.value)} className={`${inputDark} py-2`} />
                <select value={eRole} onChange={(e) => setERole(e.target.value)} className={`${inputDark} py-2`}>
                  <option value="editor">Bearbeiter</option>
                  <option value="admin">Admin</option>
                </select>
                <div className="flex gap-1 justify-end">
                  <button onClick={saveEdit} className="text-lime-300 p-1.5"><Save size={16} /></button>
                  <button onClick={() => setEditId(null)} className="text-slate-400 p-1.5"><X size={16} /></button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <User size={15} className="text-slate-500" />
                <span className="flex-1 font-semibold text-white truncate">{u.username}{u.id === currentUser.id && <span className="text-slate-500 font-normal text-xs"> (du)</span>}</span>
                {roleBadge(u.role)}
                <button onClick={() => startEdit(u)} className="text-slate-400 hover:text-lime-300 p-1"><Pencil size={15} /></button>
                <button onClick={() => remove(u.id)} className="text-slate-400 hover:text-rose-400 p-1"><Trash2 size={15} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function SettingsAdmin({ data, persist, user, setUser, isAdmin }) {
  const [pw, setPw] = useState("");
  const [savedPw, setSavedPw] = useState(false);
  const [groupsText, setGroupsText] = useState((data.groups || ["A", "B"]).join(", "));
  const [savedGr, setSavedGr] = useState(false);
  const [impMsg, setImpMsg] = useState("");
  const [impOk, setImpOk] = useState(false);
  const fileRef = useRef(null);

  const saveOwnPw = () => {
    if (!pw.trim()) return;
    const users = (data.users || []).map((u) => (u.id === user.id ? { ...u, password: pw.trim() } : u));
    persist({ ...data, users });
    setUser({ ...user, password: pw.trim() });
    setSavedPw(true); setPw(""); setTimeout(() => setSavedPw(false), 2000);
  };
  const saveGroups = () => { const groups = groupsText.split(",").map((s) => s.trim()).filter(Boolean); if (!groups.length) return; persist({ ...data, groups }); setSavedGr(true); setTimeout(() => setSavedGr(false), 2000); };

  const exportData = () => {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `isbm-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setImpOk(false); setImpMsg("Export fehlgeschlagen."); }
  };

  const onFile = (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.teams) || !Array.isArray(parsed.encounters)) {
          setImpOk(false); setImpMsg("Ungültige Sicherungsdatei."); return;
        }
        if (!confirm("Aktuelle Daten durch die Sicherung ersetzen? Das kann nicht rückgängig gemacht werden.")) return;
        const normalized = { password: DEFAULT_PASSWORD, teams: [], encounters: [], groups: ["A", "B"], users: [], ...parsed };
        if (!normalized.users || normalized.users.length === 0) normalized.users = makeDefaultUsers();
        persist(normalized);
        setImpOk(true); setImpMsg("Sicherung erfolgreich geladen.");
      } catch (e) { setImpOk(false); setImpMsg("Datei konnte nicht gelesen werden."); }
    };
    reader.readAsText(file);
    ev.target.value = "";
  };

  return (
    <div className="space-y-4 max-w-sm">
      <Card className="p-5">
        <h3 className="font-bold text-lg mb-1 flex items-center gap-2"><KeyRound size={18} className="text-lime-300" /> Mein Passwort</h3>
        <p className="text-xs text-slate-400 mb-3">Angemeldet als <span className="text-slate-200 font-medium">{user.username}</span></p>
        <input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Neues Passwort" className={`w-full mb-3 ${inputDark}`} />
        <button onClick={saveOwnPw} className="w-full bg-lime-400 hover:bg-lime-300 text-emerald-950 font-bold rounded-xl py-2.5">{savedPw ? "Gespeichert ✓" : "Passwort ändern"}</button>
      </Card>
      {isAdmin && (
        <Card className="p-5">
          <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Users size={18} className="text-lime-300" /> Gruppen</h3>
          <p className="text-xs text-slate-400 mb-3">Gruppennamen mit Komma getrennt, z.B. A, B</p>
          <input value={groupsText} onChange={(e) => setGroupsText(e.target.value)} className={`w-full mb-3 ${inputDark}`} />
          <button onClick={saveGroups} className="w-full bg-lime-400 hover:bg-lime-300 text-emerald-950 font-bold rounded-xl py-2.5">{savedGr ? "Gespeichert ✓" : "Speichern"}</button>
        </Card>
      )}
      {isAdmin && (
        <Card className="p-5">
          <h3 className="font-bold text-lg mb-1 flex items-center gap-2"><DatabaseBackup size={18} className="text-lime-300" /> Sicherung</h3>
          <p className="text-xs text-slate-400 mb-3">Lade alle Daten als Datei herunter oder stelle sie aus einer Datei wieder her.</p>
          <div className="flex gap-2">
            <button onClick={exportData} className="flex-1 bg-lime-400 hover:bg-lime-300 text-emerald-950 font-bold rounded-xl py-2.5 flex items-center justify-center gap-2"><Download size={16} /> Export</button>
            <button onClick={() => fileRef.current && fileRef.current.click()} className="flex-1 border border-white/15 hover:bg-white/5 text-slate-200 font-semibold rounded-xl py-2.5 flex items-center justify-center gap-2"><Upload size={16} /> Laden</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} className="hidden" />
          {impMsg && <p className={`text-sm mt-3 flex items-center gap-1 ${impOk ? "text-lime-300" : "text-amber-300"}`}><AlertCircle size={14} /> {impMsg}</p>}
        </Card>
      )}
    </div>
  );
}

function TeamsAdmin({ data, persist }) {
  const groups = data.groups || ["A", "B"];
  const [name, setName] = useState("");
  const [grp, setGrp] = useState(groups[0]);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editGrp, setEditGrp] = useState(groups[0]);

  const add = () => { if (!name.trim()) return; persist({ ...data, teams: [...data.teams, { id: uid(), name: name.trim(), group: grp }] }); setName(""); };
  const remove = (id) => {
    if (!confirm("Team löschen? Begegnungen mit diesem Team werden ebenfalls entfernt.")) return;
    persist({ ...data, teams: data.teams.filter((t) => t.id !== id), encounters: data.encounters.filter((e) => e.teamAId !== id && e.teamBId !== id) });
  };
  const saveEdit = () => { persist({ ...data, teams: data.teams.map((t) => (t.id === editId ? { ...t, name: editName.trim(), group: editGrp } : t)) }); setEditId(null); };

  return (
    <Card className="p-5">
      <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Users size={18} className="text-lime-300" /> Teams verwalten</h3>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Teamname" className={`flex-1 ${inputDark}`} style={{ minWidth: 140 }} />
        <select value={grp} onChange={(e) => setGrp(e.target.value)} className={inputDark}>{groups.map((g) => <option key={g} value={g}>Gruppe {g}</option>)}</select>
        <button onClick={add} className="bg-lime-400 hover:bg-lime-300 text-emerald-950 rounded-xl px-4 flex items-center gap-1 font-bold"><Plus size={16} /> Hinzufügen</button>
      </div>
      <div className="space-y-2">
        {data.teams.length === 0 && <p className="text-sm text-slate-500">Noch keine Teams.</p>}
        {data.teams.map((t) => (
          <div key={t.id} className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5">
            {editId === t.id ? (
              <>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className={`flex-1 ${inputDark} py-1.5`} />
                <select value={editGrp} onChange={(e) => setEditGrp(e.target.value)} className={`${inputDark} py-1.5`}>{groups.map((g) => <option key={g} value={g}>Gr. {g}</option>)}</select>
                <button onClick={saveEdit} className="text-lime-300 p-1"><Save size={16} /></button>
                <button onClick={() => setEditId(null)} className="text-slate-400 p-1"><X size={16} /></button>
              </>
            ) : (
              <>
                <span className="flex-1 font-semibold text-white">{t.name}</span>
                <span className="text-[11px] font-medium bg-white/5 border border-white/10 text-slate-300 rounded-full px-2.5 py-0.5">Gruppe {t.group || "-"}</span>
                <button onClick={() => { setEditId(t.id); setEditName(t.name); setEditGrp(t.group || groups[0]); }} className="text-slate-400 hover:text-lime-300 p-1"><Pencil size={15} /></button>
                <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-rose-400 p-1"><Trash2 size={15} /></button>
              </>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function EncountersAdmin({ data, persist }) {
  const [editing, setEditing] = useState(null);
  const groups = data.groups || ["A", "B"];
  const teamName = (id) => data.teams.find((t) => t.id === id)?.name || "?";

  const startNew = () => setEditing({ id: uid(), phase: "group", group: groups[0], places: null, teamAId: "", teamBId: "", date: "", round: "", games: emptyGames() });
  const saveEnc = (enc) => {
    const exists = data.encounters.some((e) => e.id === enc.id);
    const encounters = exists ? data.encounters.map((e) => (e.id === enc.id ? enc : e)) : [...data.encounters, enc];
    persist({ ...data, encounters }); setEditing(null);
  };
  const removeEnc = (id) => { if (!confirm("Begegnung löschen?")) return; persist({ ...data, encounters: data.encounters.filter((e) => e.id !== id) }); };

  if (data.teams.length < 2) return <EmptyState text="Es sind noch keine 2 Teams angelegt. Ein Admin muss zuerst Teams erfassen." />;
  if (editing) return <EncounterEditor enc={editing} data={data} onSave={saveEnc} onCancel={() => setEditing(null)} />;

  return (
    <div>
      <button onClick={startNew} className="mb-4 bg-lime-400 hover:bg-lime-300 text-emerald-950 rounded-xl px-4 py-2.5 flex items-center gap-2 font-bold" style={{ boxShadow: "0 6px 20px rgba(163,230,53,0.25)" }}><Plus size={17} /> Neue Begegnung</button>
      <div className="space-y-2">
        {data.encounters.length === 0 && <p className="text-sm text-slate-500">Noch keine Begegnungen.</p>}
        {[...data.encounters].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((enc) => {
          const r = computeEncounter(enc);
          const isFinal = enc.phase === "final";
          const tag = isFinal ? (Array.isArray(enc.places) ? `Platz ${enc.places[0]}/${enc.places[1]}` : "Endrunde") : `Gruppe ${enc.group || "?"}`;
          return (
            <div key={enc.id} className="bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={isFinal ? { background: "rgba(245,158,11,0.12)", color: "#fcd34d" } : { background: "rgba(163,230,53,0.12)", color: "#bef264" }}>{tag}</span>
                  <span className="font-semibold text-white truncate">{teamName(enc.teamAId)} <span className="text-slate-600">vs</span> {teamName(enc.teamBId)}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{enc.round}{enc.date ? ` · ${enc.date}` : ""}</div>
              </div>
              <div className="font-black tabular-nums text-lg text-slate-200">{r.aGames}:{r.bGames}</div>
              <button onClick={() => setEditing(JSON.parse(JSON.stringify(enc)))} className="text-slate-400 hover:text-lime-300 p-1"><Pencil size={16} /></button>
              <button onClick={() => removeEnc(enc.id)} className="text-slate-400 hover:text-rose-400 p-1"><Trash2 size={16} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EncounterEditor({ enc, data, onSave, onCancel }) {
  const [e, setE] = useState(enc);
  const groups = data.groups || ["A", "B"];
  const placeOptions = [];
  const max = Math.max(2, data.teams.length);
  for (let p = 1; p < max; p += 2) placeOptions.push([p, p + 1]);
  if (!placeOptions.length) placeOptions.push([1, 2]);

  const setField = (k, v) => setE((prev) => ({ ...prev, [k]: v }));
  const setPhase = (phase) => {
    if (phase === "final") setE((prev) => ({ ...prev, phase, places: prev.places || placeOptions[0], teamAId: "", teamBId: "" }));
    else setE((prev) => ({ ...prev, phase, group: prev.group || groups[0], places: null, teamAId: "", teamBId: "" }));
  };
  const setSet = (gi, si, side, val) => {
    setE((prev) => {
      const games = prev.games.map((g, i) => {
        if (i !== gi) return g;
        const sets = g.sets.map((s, j) => (j === si ? { ...s, [side]: val.replace(/[^0-9]/g, "").slice(0, 2) } : s));
        return normalizeGame({ ...g, sets });
      });
      return { ...prev, games };
    });
  };
  const setGameLabel = (gi, label) => setE((prev) => ({ ...prev, games: prev.games.map((g, i) => (i === gi ? { ...g, label } : g)) }));

  const selectableTeams = e.phase === "final" ? data.teams : data.teams.filter((t) => (t.group || groups[0]) === e.group);
  const teamsValid = e.teamAId && e.teamBId && e.teamAId !== e.teamBId;
  const setsValid = e.games.every(gameValid);
  const valid = teamsValid && setsValid;
  const r = computeEncounter(e);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg flex items-center gap-2"><ClipboardList size={18} className="text-lime-300" /> Begegnung bearbeiten</h3>
        <button onClick={onCancel} className="text-slate-400 hover:text-white"><X size={20} /></button>
      </div>

      <div className="flex gap-1 bg-black/30 rounded-xl p-1 mb-4">
        <Seg active={e.phase === "group"} onClick={() => setPhase("group")} label="Gruppenphase" />
        <Seg active={e.phase === "final"} onClick={() => setPhase("final")} label="Endrunde" />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {e.phase === "group" ? (
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Gruppe</label>
            <select value={e.group} onChange={(ev) => setE((prev) => ({ ...prev, group: ev.target.value, teamAId: "", teamBId: "" }))} className={`w-full ${inputDark}`}>{groups.map((g) => <option key={g} value={g}>Gruppe {g}</option>)}</select>
          </div>
        ) : (
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Spiel um Platz</label>
            <select value={(e.places || placeOptions[0]).join("/")} onChange={(ev) => { const [a, b] = ev.target.value.split("/").map(Number); setField("places", [a, b]); }} className={`w-full ${inputDark}`}>{placeOptions.map((p) => <option key={p.join("/")} value={p.join("/")}>Platz {p[0]} / {p[1]}</option>)}</select>
          </div>
        )}
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Datum</label>
          <input type="date" value={e.date} onChange={(ev) => setField("date", ev.target.value)} className={`w-full ${inputDark}`} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Team A</label>
          <select value={e.teamAId} onChange={(ev) => setField("teamAId", ev.target.value)} className={`w-full ${inputDark}`}>
            <option value="">- wählen -</option>
            {selectableTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Team B</label>
          <select value={e.teamBId} onChange={(ev) => setField("teamBId", ev.target.value)} className={`w-full ${inputDark}`}>
            <option value="">- wählen -</option>
            {selectableTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-400 mb-1 block">Bezeichnung (optional)</label>
          <input value={e.round} onChange={(ev) => setField("round", ev.target.value)} placeholder="z.B. Runde 1" className={`w-full ${inputDark}`} />
        </div>
      </div>

      {!teamsValid && <p className="text-sm text-rose-400 mb-3 flex items-center gap-1"><AlertCircle size={14} /> Bitte zwei unterschiedliche Teams wählen.</p>}

      <div className="bg-black/20 rounded-2xl p-3 space-y-2.5 border border-white/10">
        <div className="grid grid-cols-12 gap-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold px-1">
          <div className="col-span-4">Disziplin</div><div className="col-span-2 text-center">Satz 1</div><div className="col-span-2 text-center">Satz 2</div><div className="col-span-2 text-center">Satz 3</div><div className="col-span-2 text-center">Sätze</div>
        </div>
        {e.games.map((g, gi) => {
          const gr = r.gameResults[gi];
          const disc = DISCIPLINES[gi];
          const enabled = gameSetEnabled(g);
          return (
            <div key={gi} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-4">
                {disc.alt ? (
                  <select value={g.label} onChange={(ev) => setGameLabel(gi, ev.target.value)} className={`w-full text-sm py-1.5 ${inputDark}`}>
                    <option value={disc.label}>{disc.label}</option>
                    <option value={disc.alt}>{disc.alt}</option>
                  </select>
                ) : <span className="text-sm font-medium text-slate-200">{g.label}</span>}
              </div>
              {[0, 1, 2].map((si) => {
                const st = setStatus(g.sets[si]);
                const isEnabled = enabled[si];
                const bad = st.state === "invalid" || st.state === "incomplete";
                const cls = `w-9 text-center rounded-lg px-1 py-1.5 text-sm outline-none border focus:ring-2 ${!isEnabled ? "bg-black/30 border-white/5 text-slate-700 cursor-not-allowed" : bad ? "border-rose-500/60 focus:ring-rose-500/30 bg-rose-500/10 text-rose-200" : "bg-white/5 border-white/15 text-white focus:ring-lime-400/40 focus:border-lime-400/40"}`;
                return (
                  <div key={si} className="col-span-2 flex items-center gap-1 justify-center">
                    <input value={g.sets[si].a} disabled={!isEnabled} onChange={(ev) => setSet(gi, si, "a", ev.target.value)} inputMode="numeric" className={cls} />
                    <span className="text-slate-600 text-xs">-</span>
                    <input value={g.sets[si].b} disabled={!isEnabled} onChange={(ev) => setSet(gi, si, "b", ev.target.value)} inputMode="numeric" className={cls} />
                  </div>
                );
              })}
              <div className="col-span-2 text-center text-sm font-bold tabular-nums">
                {gr.played ? <span className={gr.winner === "a" ? "text-lime-300" : gr.winner === "b" ? "text-rose-400" : "text-slate-500"}>{gr.gaSets}:{gr.gbSets}</span> : <span className="text-slate-700">-</span>}
              </div>
            </div>
          );
        })}
      </div>

      {!setsValid && (
        <p className="text-sm text-rose-400 mt-3 flex items-start gap-1.5"><AlertCircle size={15} className="mt-0.5 shrink-0" /> Ungültiges Satzergebnis. Ein Satz endet bei 21 mit 2 Punkten Vorsprung (Verlängerung exakt 2 Differenz, max. 30:29).</p>
      )}

      <div className="mt-4 p-4 rounded-2xl text-center border border-white/10" style={{ background: "rgba(163,230,53,0.06)" }}>
        <span className="text-xs uppercase tracking-wider text-slate-400">Zwischenstand</span>
        <div className="text-3xl font-black tabular-nums mt-1 text-white">{r.aGames} <span className="text-slate-600">:</span> {r.bGames}</div>
        <span className="text-xs text-slate-500">Sätze {r.aSets}:{r.bSets} · Punkte {r.aPts}:{r.bPts}</span>
      </div>

      <div className="flex gap-2 mt-4">
        <button disabled={!valid} onClick={() => onSave(e)} className="flex-1 bg-lime-400 hover:bg-lime-300 disabled:bg-white/10 disabled:text-slate-600 disabled:cursor-not-allowed text-emerald-950 font-bold rounded-xl py-3 flex items-center justify-center gap-2"><Save size={17} /> Speichern</button>
        <button onClick={onCancel} className="px-5 border border-white/15 rounded-xl font-semibold text-slate-300 hover:bg-white/5">Abbrechen</button>
      </div>
    </Card>
  );
}

function EmptyState({ text }) {
  return (
    <Card className="p-12 text-center border-dashed">
      <Shuttle size={40} className="mx-auto mb-4 text-lime-300/40 isbm-float" />
      <p className="text-sm text-slate-400 max-w-xs mx-auto">{text}</p>
    </Card>
  );
}
