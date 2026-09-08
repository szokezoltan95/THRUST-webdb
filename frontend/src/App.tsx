import { FormEvent, useEffect, useState } from "react";

type PublicMetrics = {
  participant_count: number | null;
  measurement_count: number | null;
  minimum_group_size: number;
  publishable: boolean;
};

type User = { username: string; role: string; csrf_token: string };
type Overview = { participant_count: number; measurement_count: number };
type Participant = { id: string; participant_code: string; is_active: boolean; created_at: string };
type TestDefinition = { id: string; test_code: string; name: string; version: string; is_active: boolean };
type ParticipantDetail = { participant: Participant; measurements: { id: string; test_type: string; status: string; started_at: string }[] };

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  if (!response.ok) throw new Error(response.status === 401 ? "Nesprávne prihlasovacie údaje." : "Požiadavku sa nepodarilo dokončiť.");
  return response.status === 204 ? (undefined as T) : response.json();
}

export function App() {
  const [metrics, setMetrics] = useState<PublicMetrics | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantCode, setParticipantCode] = useState("");
  const [participantMessage, setParticipantMessage] = useState("");
  const [tests, setTests] = useState<TestDefinition[]>([]);
  const [testForm, setTestForm] = useState({ test_code: "", name: "", version: "1.0" });
  const [testMessage, setTestMessage] = useState("");
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantDetail | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    request<PublicMetrics>("/api/public/metrics").then(setMetrics).catch(() => setMetrics(null));
    request<User>("/api/auth/me").then(setUser).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (user) {
      request<Overview>("/api/admin/overview").then(setOverview).catch(() => setOverview(null));
      request<Participant[]>("/api/admin/participants").then(setParticipants).catch(() => setParticipants([]));
      request<TestDefinition[]>("/api/admin/tests").then(setTests).catch(() => setTests([]));
    }
  }, [user]);

  async function generateParticipantCode() {
    const result = await request<{ participant_code: string }>("/api/admin/participants/generate-code");
    setParticipantCode(result.participant_code);
    setParticipantMessage("");
  }

  async function createTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTestMessage("");
    try {
      const test = await request<TestDefinition>("/api/admin/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testForm),
      });
      setTests((current) => [...current, test]);
      setTestForm({ test_code: "", name: "", version: "1.0" });
      setTestMessage("Typ testu bol vytvorený.");
    } catch (reason) {
      setTestMessage(reason instanceof Error ? reason.message : "Test sa nepodarilo vytvoriť.");
    }
  }

  async function openParticipant(participant: Participant) {
    const detail = await request<ParticipantDetail>(`/api/admin/participants/${participant.id}`);
    setSelectedParticipant(detail);
  }

  async function createParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setParticipantMessage("");
    try {
      const participant = await request<Participant>("/api/admin/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_code: participantCode }),
      });
      setParticipants((current) => [participant, ...current]);
      setParticipantCode("");
      setParticipantMessage("Účastník bol vytvorený.");
      setOverview((current) => current ? { ...current, participant_count: current.participant_count + 1 } : current);
    } catch (reason) {
      setParticipantMessage(reason instanceof Error ? reason.message : "Účastníka sa nepodarilo vytvoriť.");
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const signedIn = await request<User>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: data.get("username"), password: data.get("password") }),
      });
      setUser(signedIn);
      setLoginOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Prihlásenie zlyhalo.");
    }
  }

  async function logout() {
    if (!user) return;
    await request<void>("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": user.csrf_token } });
    setUser(null);
    setOverview(null);
  }

  return (
    <main>
      <header>
        <div className="brand"><span className="mark">T</span><div><strong>THRUST</strong><small>UAV Human Performance Research</small></div></div>
        {user ? <button className="quiet" onClick={logout}>Odhlásiť {user.username}</button> : <button className="quiet" onClick={() => setLoginOpen(true)}>Administrácia</button>}
      </header>

      {user ? (
        <section className="workspace">
          <div className="eyebrow">ADMINISTRÁCIA · {user.role.toUpperCase()}</div>
          <h1>Prehľad meraní</h1>
          <div className="stats">
            <Metric label="Účastníci" value={overview?.participant_count ?? "—"} />
            <Metric label="Merania" value={overview?.measurement_count ?? "—"} />
            <Metric label="Čakajúce synchronizácie" value="0" />
          </div>
          <div className="empty"><span>01</span><div><h2>Databáza je pripravená</h2><p>Vytvor účastníkov a následne k nim priradíme jednotlivé merania.</p></div></div>
          <div className="admin-grid">
            <section className="panel">
              <div className="eyebrow">NOVÝ ÚČASTNÍK</div>
              <h2>Vytvoriť účastníka</h2>
              <p className="muted">Na serveri sa ukladá iba pseudonymné ID.</p>
              <form className="participant-form" onSubmit={createParticipant}>
                <label>Jedinečný kód<input value={participantCode} onChange={(event) => setParticipantCode(event.target.value.toUpperCase())} maxLength={5} pattern="[A-Za-z0-9]{5}" placeholder="ABCDE" required /></label>
                <div className="actions"><button type="button" className="quiet" onClick={generateParticipantCode}>Generovať ID</button><button type="submit" className="primary">Vytvoriť</button></div>
              </form>
              {participantMessage && <p className="notice">{participantMessage}</p>}
            </section>
            <section className="panel">
              <div className="eyebrow">EVIDENCIA</div>
              <h2>Účastníci</h2>
              {participants.length === 0 ? <p className="muted">Zatiaľ nie sú evidovaní žiadni účastníci.</p> : <div className="participant-list">{participants.map((participant) => <button className="participant-row" key={participant.id} onClick={() => openParticipant(participant)}><strong>{participant.participant_code}</strong><span>{participant.is_active ? "Aktívny" : "Archivovaný"}</span></button>)}</div>}
            </section>
          </div>
          <div className="admin-grid">
            <section className="panel">
              <div className="eyebrow">KATALÓG TESTOV</div>
              <h2>Nový typ testu</h2>
              <form className="participant-form" onSubmit={createTest}>
                <label>Kód testu<input value={testForm.test_code} onChange={(event) => setTestForm({ ...testForm, test_code: event.target.value.toUpperCase() })} placeholder="SCOPE_HARD" required /></label>
                <label>Názov<input value={testForm.name} onChange={(event) => setTestForm({ ...testForm, name: event.target.value })} placeholder="SCoPE HARD" required /></label>
                <label>Verzia<input value={testForm.version} onChange={(event) => setTestForm({ ...testForm, version: event.target.value })} required /></label>
                <button className="primary" type="submit">Pridať test</button>
              </form>
              {testMessage && <p className="notice">{testMessage}</p>}
            </section>
            <section className="panel">
              <div className="eyebrow">DOSTUPNÉ TESTY</div>
              <h2>Katalóg</h2>
              {tests.length === 0 ? <p className="muted">Zatiaľ nie sú definované žiadne testy.</p> : <div className="participant-list">{tests.map((test) => <div className="participant-row" key={test.id}><strong>{test.name}</strong><span>{test.test_code} · v{test.version}</span></div>)}</div>}
            </section>
          </div>
          {selectedParticipant && <section className="panel detail-panel"><div className="eyebrow">DETAIL ÚČASTNÍKA</div><h2>{selectedParticipant.participant.participant_code}</h2>{selectedParticipant.measurements.length === 0 ? <p className="muted">Účastník zatiaľ nemá evidované merania.</p> : <div className="participant-list">{selectedParticipant.measurements.map((measurement) => <div className="participant-row" key={measurement.id}><strong>{measurement.test_type}</strong><span>{new Date(measurement.started_at).toLocaleString("sk-SK")}</span></div>)}</div>}</section>}
        </section>
      ) : (
        <section className="public">
          <div className="eyebrow">TESTING HUB FOR RESEARCH IN UAV SIMULATION AND TRAINING</div>
          <h1>Merateľný pohľad na výkon pilotov UAV.</h1>
          <p className="lead">THRUST spája štandardizované experimenty, lokálne analytické modely a anonymizované skupinové výsledky.</p>
          <div className="stats">
            <Metric label="Účastníci" value={metrics?.participant_count ?? "—"} />
            <Metric label="Merania" value={metrics?.measurement_count ?? "—"} />
            <Metric label="Aktívne testy" value="SCoPE" />
          </div>
          {metrics && !metrics.publishable && <p className="privacy">Verejné štatistiky sa zobrazia po dosiahnutí minimálnej skupiny {metrics.minimum_group_size} účastníkov.</p>}
        </section>
      )}

      {loginOpen && <div className="backdrop" onMouseDown={() => setLoginOpen(false)}><form className="login" onSubmit={login} onMouseDown={(e) => e.stopPropagation()}><div className="eyebrow">CHRÁNENÝ PRÍSTUP</div><h2>Administrácia</h2><label>Používateľské meno<input name="username" autoComplete="username" required autoFocus /></label><label>Heslo<input name="password" type="password" autoComplete="current-password" required /></label>{error && <p className="error">{error}</p>}<div className="actions"><button type="button" className="quiet" onClick={() => setLoginOpen(false)}>Zrušiť</button><button type="submit" className="primary">Prihlásiť</button></div></form></div>}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}
