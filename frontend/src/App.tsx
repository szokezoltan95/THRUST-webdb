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
type TestDefinition = { id: string; test_code: string; name: string; version: string; status: string; analysis_profile: string; configuration: Record<string, unknown>; is_active: boolean };
type Measurement = { id: string; participant_id: string; test_definition_id: string | null; test_type: string; status: string; started_at: string; source_file_name: string | null; raw_sha256: string | null; raw_size_bytes: number | null; analysis_data: Record<string, unknown> | null };
type ParticipantDetail = { participant: Participant; measurements: { id: string; test_type: string; status: string; started_at: string; raw_data_available?: boolean }[] };
type AdminSection = "overview" | "participants" | "tests" | "measurements";

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
  const defaultTestConfiguration = `{
  "sampling_hz": 100,
  "difficulty": "hard",
  "timeout_s": 5.0,
  "hold_time_s": 1.0,
  "joystick_test_required": true,
  "axes": ["AILE", "ELEV", "THRO", "RUDD"],
  "tasks": [],
  "visual": {
    "screen_bg": "#000000",
    "gimbal_bg": "#808080",
    "stick_outline": "#1e2cff",
    "stick_fill": "#ffffff",
    "zone_idle_outline": "#ff0000",
    "zone_idle_fill": "#ff0000",
    "zone_ok_outline": "#00cc00",
    "zone_ok_fill": "#00cc00",
    "grid": "#ffffff",
    "label": "#ffffff",
    "prompt": "#ff0000"
  }
}`;
  const [testForm, setTestForm] = useState({ test_code: "", name: "", version: "1.0", analysis_profile: "SCOPE_STEP_RESPONSE_V1", configuration: defaultTestConfiguration });
  const [testMessage, setTestMessage] = useState("");
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantDetail | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [uploadMessage, setUploadMessage] = useState("");
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [selectedMeasurementIds, setSelectedMeasurementIds] = useState<string[]>([]);
  const [measurementSearch, setMeasurementSearch] = useState("");
  const [measurementParticipantFilter, setMeasurementParticipantFilter] = useState("");
  const [measurementTestFilter, setMeasurementTestFilter] = useState("");
  const [measurementDateFrom, setMeasurementDateFrom] = useState("");
  const [measurementDateTo, setMeasurementDateTo] = useState("");
  const [manualUploadOpen, setManualUploadOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");

  useEffect(() => {
    request<PublicMetrics>("/api/public/metrics").then(setMetrics).catch(() => setMetrics(null));
    request<User>("/api/auth/me").then(setUser).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (user) {
      request<Overview>("/api/admin/overview").then(setOverview).catch(() => setOverview(null));
      request<Participant[]>("/api/admin/participants").then(setParticipants).catch(() => setParticipants([]));
      request<TestDefinition[]>("/api/admin/tests").then(setTests).catch(() => setTests([]));
      request<Measurement[]>("/api/admin/measurements").then(setMeasurements).catch(() => setMeasurements([]));
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
      const configuration = JSON.parse(testForm.configuration);
      const test = await request<TestDefinition>("/api/admin/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...testForm, configuration }),
      });
      setTests((current) => [...current, test]);
      setTestForm({ test_code: "", name: "", version: "1.0", analysis_profile: "SCOPE_STEP_RESPONSE_V1", configuration: defaultTestConfiguration });
      setTestMessage("Typ testu bol vytvorený.");
    } catch (reason) {
      setTestMessage(reason instanceof SyntaxError ? "Konfigurácia testu nie je platný JSON." : reason instanceof Error ? reason.message : "Test sa nepodarilo vytvoriť.");
    }
  }

  async function openParticipant(participant: Participant) {
    const detail = await request<ParticipantDetail>(`/api/admin/participants/${participant.id}`);
    setSelectedParticipant(detail);
  }

  async function uploadMeasurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadMessage("");
    const form = new FormData(event.currentTarget);
    const file = form.get("raw_file");
    if (!(file instanceof File) || !file.size) {
      setUploadMessage("Vyber raw dátový súbor.");
      return;
    }
    const buffer = await file.arrayBuffer();
    let binary = "";
    for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
    try {
      const uploaded = await request<Measurement>("/api/admin/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": user?.csrf_token ?? "" },
        body: JSON.stringify({
          participant_id: form.get("participant_id"),
          test_definition_id: form.get("test_definition_id"),
          started_at: new Date(String(form.get("started_at"))).toISOString(),
          source_file_name: file.name,
          raw_content_type: "text/tab-separated-values",
          raw_log_base64: btoa(binary),
          status: "recorded",
        }),
      });
      setMeasurements((current) => [uploaded, ...current]);
      setOverview((current) => current ? { ...current, measurement_count: current.measurement_count + 1 } : current);
      setUploadMessage("Dátový súbor bol nahraný.");
      event.currentTarget.reset();
    } catch (reason) {
      setUploadMessage(reason instanceof Error ? reason.message : "Súbor sa nepodarilo nahrať.");
    }
  }

  function filteredMeasurements() {
    const query = measurementSearch.trim().toLowerCase();
    return measurements.filter((measurement) => {
      if (!measurement.raw_sha256 || !measurement.raw_size_bytes) return false;
      if (measurementParticipantFilter && measurement.participant_id !== measurementParticipantFilter) return false;
      if (measurementTestFilter && measurement.test_definition_id !== measurementTestFilter) return false;
      const date = new Date(measurement.started_at);
      if (measurementDateFrom && date < new Date(measurementDateFrom)) return false;
      if (measurementDateTo && date > new Date(measurementDateTo + "T23:59:59")) return false;
      if (query && ![measurement.test_type, measurement.source_file_name ?? "", measurement.id].join(" ").toLowerCase().includes(query)) return false;
      return true;
    });
  }

  function toggleMeasurementSelection(id: string) {
    setSelectedMeasurementIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function deleteSelectedMeasurements() {
    if (!selectedMeasurementIds.length) return;
    if (!window.confirm(`Naozaj chceš odstrániť ${selectedMeasurementIds.length} vybraných meraní? Odstránia sa aj archivované raw súbory.`)) return;
    try {
      for (const id of selectedMeasurementIds) {
        await request<void>(`/api/admin/measurements/${id}`, { method: "DELETE", headers: { "X-CSRF-Token": user?.csrf_token ?? "" } });
      }
      setMeasurements((current) => current.filter((measurement) => !selectedMeasurementIds.includes(measurement.id)));
      if (selectedMeasurementId && selectedMeasurementIds.includes(selectedMeasurementId)) setSelectedMeasurementId(null);
      setSelectedMeasurementIds([]);
      setOverview((current) => current ? { ...current, measurement_count: Math.max(0, current.measurement_count - selectedMeasurementIds.length) } : current);
    } catch (reason) {
      setUploadMessage(reason instanceof Error ? reason.message : "Merania sa nepodarilo odstrániť.");
    }
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

  function participantCodeFor(participantId: string) {
    return participants.find((participant) => participant.id === participantId)?.participant_code ?? participantId.slice(0, 8);
  }

  return (
    <main>
      {user ? (
        <div className="app-shell">
          <aside className="sidebar">
            <div className="brand"><span className="mark">T</span><div><strong>THRUST</strong><small>UAV Human Performance Research</small></div></div>
            <nav className="side-nav" aria-label="Administrácia">
              <button className={activeSection === "overview" ? "nav-item active" : "nav-item"} onClick={() => setActiveSection("overview")}><span>⌂</span>Prehľad</button>
              <button className={activeSection === "participants" ? "nav-item active" : "nav-item"} onClick={() => setActiveSection("participants")}><span>◎</span>Účastníci</button>
              <button className={activeSection === "tests" ? "nav-item active" : "nav-item"} onClick={() => setActiveSection("tests")}><span>▣</span>Testy a konfigurácie</button>
              <button className={activeSection === "measurements" ? "nav-item active" : "nav-item"} onClick={() => setActiveSection("measurements")}><span>↗</span>Merania a výsledky</button>
            </nav>
            <div className="sidebar-footer"><span>{user.username} · {user.role}</span><button className="quiet" onClick={logout}>Odhlásiť</button></div>
          </aside>
          <div className="app-main">
            <header className="topbar"><div><div className="eyebrow">ADMINISTRÁCIA · {user.role.toUpperCase()}</div><h1>{activeSection === "overview" ? "Prehľad meraní" : activeSection === "participants" ? "Účastníci" : activeSection === "tests" ? "Testy a konfigurácie" : "Merania a výsledky"}</h1></div><span className="status-dot">Systém online</span></header>
            <section className="workspace">
              {activeSection === "overview" && <>
                <div className="stats"><Metric label="Účastníci" value={overview?.participant_count ?? "—"} /><Metric label="Merania" value={overview?.measurement_count ?? "—"} /><Metric label="Čakajúce synchronizácie" value="0" /></div>
                <div className="empty"><span>01</span><div><h2>Databáza je pripravená</h2><p>Vyber sekciu vľavo alebo začni vytvorením účastníka.</p></div></div>
                <div className="admin-grid"><section className="panel quick-panel"><div className="eyebrow">RÝCHLA AKCIA</div><h2>Nový účastník</h2><p className="muted">Vytvor pseudonymné ID a priraď k nemu neskoršie merania.</p><button className="primary" onClick={() => setActiveSection("participants")}>Otvoriť administráciu účastníkov</button></section><section className="panel quick-panel"><div className="eyebrow">RÝCHLA AKCIA</div><h2>Synchronizované výsledky</h2><p className="muted">Zobraz merania odoslané z lokálneho THRUST/SCoPE klienta.</p><button className="primary" onClick={() => setActiveSection("measurements")}>Otvoriť evidenciu meraní</button></section></div>
              </>}
              {activeSection === "participants" && <>
                <div className="admin-grid"><section className="panel"><div className="eyebrow">NOVÝ ÚČASTNÍK</div><h2>Vytvoriť účastníka</h2><p className="muted">Na serveri sa ukladá iba pseudonymné ID.</p><form className="participant-form" onSubmit={createParticipant}><label>Jedinečný kód<input value={participantCode} onChange={(event) => setParticipantCode(event.target.value.toUpperCase())} maxLength={5} pattern="[A-Za-z0-9]{5}" placeholder="ABCDE" required /></label><div className="actions"><button type="button" className="quiet" onClick={generateParticipantCode}>Generovať ID</button><button type="submit" className="primary">Vytvoriť</button></div></form>{participantMessage && <p className="notice">{participantMessage}</p>}</section><section className="panel"><div className="eyebrow">EVIDENCIA</div><h2>Registrovaní účastníci</h2>{participants.length === 0 ? <p className="muted">Zatiaľ nie sú evidovaní žiadni účastníci.</p> : <div className="participant-list">{participants.map((participant) => <button className="participant-row" key={participant.id} onClick={() => openParticipant(participant)}><strong>{participant.participant_code}</strong><span>{participant.is_active ? "Aktívny" : "Archivovaný"}</span></button>)}</div>}</section></div>
                {selectedParticipant && <section className="panel detail-panel"><div className="eyebrow">DETAIL ÚČASTNÍKA</div><h2>{selectedParticipant.participant.participant_code}</h2>{selectedParticipant.measurements.filter((measurement) => measurement.raw_data_available).length === 0 ? <p className="muted">Účastník zatiaľ nemá synchronizované merania.</p> : <div className="participant-list">{selectedParticipant.measurements.filter((measurement) => measurement.raw_data_available).map((measurement) => <div className="participant-row" key={measurement.id}><strong>{measurement.test_type}</strong><span>{new Date(measurement.started_at).toLocaleString("sk-SK")} · {measurement.status}</span></div>)}</div>}</section>}
              </>}
              {activeSection === "tests" && <div className="admin-grid"><section className="panel"><div className="eyebrow">KATALÓG TESTOV</div><h2>Nový typ testu</h2><form className="participant-form" onSubmit={createTest}><label>Kód testu<input value={testForm.test_code} onChange={(event) => setTestForm({ ...testForm, test_code: event.target.value.toUpperCase() })} placeholder="SCOPE_HARD" required /></label><label>Názov<input value={testForm.name} onChange={(event) => setTestForm({ ...testForm, name: event.target.value })} placeholder="SCoPE HARD" required /></label><label>Verzia<input value={testForm.version} onChange={(event) => setTestForm({ ...testForm, version: event.target.value })} required /></label><label>Analytický profil<input value={testForm.analysis_profile} onChange={(event) => setTestForm({ ...testForm, analysis_profile: event.target.value })} required /></label><label>Konfigurácia testu (JSON)<textarea className="config-editor" value={testForm.configuration} onChange={(event) => setTestForm({ ...testForm, configuration: event.target.value })} rows={12} required /></label><button className="primary" type="submit">Pridať test</button></form>{testMessage && <p className="notice">{testMessage}</p>}</section><section className="panel"><div className="eyebrow">DOSTUPNÉ TESTY</div><h2>Katalóg</h2>{tests.length === 0 ? <p className="muted">Zatiaľ nie sú definované žiadne testy.</p> : <div className="participant-list">{tests.map((test) => <div className="participant-row" key={test.id}><strong>{test.name}</strong><span>{test.test_code} · v{test.version} · {test.status}</span></div>)}</div>}</section></div>}
              {activeSection === "measurements" && <>
                <div className="workbench">
                  <section className="panel workbench-list">
                    <div className="workbench-header"><div><div className="eyebrow">ARCHÍV MERANÍ</div><h2>Synchronizované merania</h2></div><button className="primary compact" onClick={() => setManualUploadOpen(true)}>Núdzový upload</button></div>
                    <div className="filters">
                      <input placeholder="Hľadať ID, test alebo súbor…" value={measurementSearch} onChange={(event) => setMeasurementSearch(event.target.value)} />
                      <select value={measurementParticipantFilter} onChange={(event) => setMeasurementParticipantFilter(event.target.value)}><option value="">Všetci účastníci</option>{participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.participant_code}</option>)}</select>
                      <select value={measurementTestFilter} onChange={(event) => setMeasurementTestFilter(event.target.value)}><option value="">Všetky testy</option>{tests.map((test) => <option key={test.id} value={test.id}>{test.name} · v{test.version}</option>)}</select>
                      <input type="date" value={measurementDateFrom} onChange={(event) => setMeasurementDateFrom(event.target.value)} aria-label="Od dátumu" />
                      <input type="date" value={measurementDateTo} onChange={(event) => setMeasurementDateTo(event.target.value)} aria-label="Do dátumu" />
                    </div>
                    <div className="selection-toolbar"><label><input type="checkbox" checked={filteredMeasurements().length > 0 && filteredMeasurements().every((item) => selectedMeasurementIds.includes(item.id))} onChange={() => setSelectedMeasurementIds(filteredMeasurements().every((item) => selectedMeasurementIds.includes(item.id)) ? [] : filteredMeasurements().map((item) => item.id))} /> Vybrať všetky</label><button className="quiet compact danger" disabled={!selectedMeasurementIds.length} onClick={deleteSelectedMeasurements}>Odstrániť vybrané</button></div>
                    <div className="measurement-list">{filteredMeasurements().map((measurement) => <button className={selectedMeasurementId === measurement.id ? "measurement-item selected" : "measurement-item"} key={measurement.id} onClick={() => setSelectedMeasurementId(measurement.id)}><input type="checkbox" checked={selectedMeasurementIds.includes(measurement.id)} onChange={(event) => { event.stopPropagation(); toggleMeasurementSelection(measurement.id); }} onClick={(event) => event.stopPropagation()} /><span className="measurement-main"><strong>{participantCodeFor(measurement.participant_id)}</strong><span>{new Date(measurement.started_at).toLocaleDateString("sk-SK")} · {measurement.test_type} · {measurement.source_file_name ?? "raw"}</span></span><span className="measurement-status">{measurement.raw_sha256 ? "Archivované" : "Bez raw dát"}</span></button>)}</div>
                    {filteredMeasurements().length === 0 && <p className="muted empty-list">Filteru nezodpovedajú žiadne archivované merania.</p>}
                  </section>
                  <section className="panel workbench-detail">
                    <div className="eyebrow">PRACOVNÝ PANEL</div>
                    {(() => { const selected = measurements.find((item) => item.id === selectedMeasurementId); return selected ? <><h2>{selected.test_type}</h2><p className="muted">{selected.source_file_name} · {new Date(selected.started_at).toLocaleString("sk-SK")}</p><div className="detail-grid"><div><span>Vzorky</span><strong>{String(selected.analysis_data?.sample_count ?? "—")}</strong></div><div><span>Trvanie</span><strong>{selected.analysis_data?.duration_s ? String(Number(selected.analysis_data.duration_s).toFixed(2)) + " s" : "—"}</strong></div><div><span>Raw dáta</span><strong>Archivované</strong></div><div><span>Normalizácia</span><strong>{selected.analysis_data?.normalized_step_response ? "Dostupná" : "Nie je dostupná"}</strong></div></div><p className="muted">Grafy a porovnanie vybraných meraní doplníme do tohto panelu.</p></> : <div className="empty-list"><h2>Vyber meranie</h2><p className="muted">V ľavom paneli vyber meranie, ktoré chceš preskúmať.</p></div> })()}
                  </section>
                </div>
                {manualUploadOpen && <div className="backdrop" onMouseDown={() => setManualUploadOpen(false)}><section className="login upload-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="eyebrow">NÚDZOVÁ SYNCHRONIZÁCIA</div><h2>Manuálne nahrať dátový súbor</h2><p className="muted">Použi iba vtedy, ak upload počas sessionu zlyhal.</p><form className="measurement-form modal-form" onSubmit={async (event) => { await uploadMeasurement(event); setManualUploadOpen(false); }}><label>Účastník<select name="participant_id" required><option value="">Vyber účastníka</option>{participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.participant_code}</option>)}</select></label><label>Test<select name="test_definition_id" required><option value="">Vyber test</option>{tests.filter((test) => test.is_active).map((test) => <option key={test.id} value={test.id}>{test.name} · v{test.version}</option>)}</select></label><label>Dátum a čas<input name="started_at" type="datetime-local" required /></label><label>Raw SCoPE log<input name="raw_file" type="file" accept=".txt,.tsv,text/plain" required /></label><div className="actions"><button type="button" className="quiet" onClick={() => setManualUploadOpen(false)}>Zrušiť</button><button className="primary" type="submit">Nahrať dáta</button></div></form>{uploadMessage && <p className="notice">{uploadMessage}</p>}</section></div>}
              </>}

            </section>
          </div>
        </div>
      ) : (
        <>
          <header><div className="brand"><span className="mark">T</span><div><strong>THRUST</strong><small>UAV Human Performance Research</small></div></div><button className="quiet" onClick={() => setLoginOpen(true)}>Administrácia</button></header>
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
        </>
      )}

      {loginOpen && <div className="backdrop" onMouseDown={() => setLoginOpen(false)}><form className="login" onSubmit={login} onMouseDown={(e) => e.stopPropagation()}><div className="eyebrow">CHRÁNENÝ PRÍSTUP</div><h2>Administrácia</h2><label>Používateľské meno<input name="username" autoComplete="username" required autoFocus /></label><label>Heslo<input name="password" type="password" autoComplete="current-password" required /></label>{error && <p className="error">{error}</p>}<div className="actions"><button type="button" className="quiet" onClick={() => setLoginOpen(false)}>Zrušiť</button><button type="submit" className="primary">Prihlásiť</button></div></form></div>}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}
