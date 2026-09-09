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
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantSort, setParticipantSort] = useState<"code" | "first" | "last" | "count">("code");
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
  const [testSearch, setTestSearch] = useState("");
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantDetail | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [uploadMessage, setUploadMessage] = useState("");
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [selectedMeasurementIds, setSelectedMeasurementIds] = useState<string[]>([]);
  const [chartChannel, setChartChannel] = useState("AILE");
  const [chartMode, setChartMode] = useState<"single" | "all">("single");
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

  function filteredTests() {
    const query = testSearch.trim().toLowerCase();
    return tests.filter((test) => !query || [test.test_code, test.name, test.version, test.analysis_profile].join(" ").toLowerCase().includes(query));
  }

  function participantMeasurements(participantId: string) {
    return measurements.filter((measurement) => measurement.participant_id === participantId && measurement.raw_sha256);
  }

  function filteredParticipants() {
    const query = participantSearch.trim().toLowerCase();
    return [...participants]
      .filter((participant) => !query || participant.participant_code.toLowerCase().includes(query))
      .sort((left, right) => {
        const leftMeasurements = participantMeasurements(left.id);
        const rightMeasurements = participantMeasurements(right.id);
        if (participantSort === "count") return rightMeasurements.length - leftMeasurements.length;
        if (participantSort === "first") return (leftMeasurements[0]?.started_at ?? "").localeCompare(rightMeasurements[0]?.started_at ?? "");
        if (participantSort === "last") return (rightMeasurements[0]?.started_at ?? "").localeCompare(leftMeasurements[0]?.started_at ?? "");
        return left.participant_code.localeCompare(right.participant_code);
      });
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
                <section className="browser-panel">
                  <div className="browser-header"><div><div className="eyebrow">ÚČASTNÍCI</div><h2>Databáza účastníkov</h2><p className="muted">Na serveri sa uchováva iba pseudonymné päťznakové ID.</p></div><button className="primary compact" onClick={() => document.getElementById("new-participant-code")?.focus()}>Nový účastník</button></div>
                  <div className="browser-toolbar"><input placeholder="Hľadať ID účastníka…" value={participantSearch} onChange={(event) => setParticipantSearch(event.target.value)} /><select value={participantSort} onChange={(event) => setParticipantSort(event.target.value as typeof participantSort)}><option value="code">Zoradiť podľa ID</option><option value="first">Najstarší prvý test</option><option value="last">Najnovší posledný test</option><option value="count">Počet meraní</option></select></div>
                  <div className="data-table participant-table"><div className="data-table-head"><span>ID účastníka</span><span>Prvé meranie</span><span>Posledné meranie</span><span>Meraní</span><span>Akcie</span></div>{filteredParticipants().map((participant) => { const rows = participantMeasurements(participant.id); const first = rows.length ? rows[rows.length - 1].started_at : null; const last = rows.length ? rows[0].started_at : null; return <div className="data-table-row" key={participant.id}><strong>{participant.participant_code}</strong><span>{first ? new Date(first).toLocaleDateString("sk-SK") : "—"}</span><span>{last ? new Date(last).toLocaleDateString("sk-SK") : "—"}</span><span>{rows.length}</span><span className="row-actions"><button className="quiet compact" onClick={() => openParticipant(participant)}>Otvoriť</button><button className="quiet compact" onClick={() => { setMeasurementParticipantFilter(participant.id); setActiveSection("measurements"); }}>Merania</button></span></div>; })}</div>
                  {filteredParticipants().length === 0 && <div className="empty-list"><h2>Žiadni účastníci</h2><p className="muted">Filteru nezodpovedá žiadny záznam.</p></div>}
                </section>
                <section className="participant-create-strip"><div><div className="eyebrow">NOVÝ ÚČASTNÍK</div><strong>Vytvoriť anonymné ID</strong></div><form className="inline-create-form" onSubmit={createParticipant}><input id="new-participant-code" value={participantCode} onChange={(event) => setParticipantCode(event.target.value.toUpperCase())} maxLength={5} pattern="[A-Za-z0-9]{5}" placeholder="ABCDE" required /><button type="button" className="quiet compact" onClick={generateParticipantCode}>Generovať</button><button type="submit" className="primary compact">Vytvoriť</button></form>{participantMessage && <span className="notice">{participantMessage}</span>}</section>
                {selectedParticipant && <section className={selectedParticipant ? "browser-detail detail-modal-open" : "browser-detail detail-modal-closed"}><div className="detail-header"><div><div className="eyebrow">DETAIL ÚČASTNÍKA</div><h2>{selectedParticipant.participant.participant_code}</h2></div><button className="quiet compact" onClick={() => setSelectedParticipant(null)}>Zavrieť detail</button></div><p className="muted">História synchronizovaných meraní účastníka.</p><div className="data-table"><div className="data-table-head"><span>Test</span><span>Dátum</span><span>Stav</span><span>Akcia</span></div>{selectedParticipant.measurements.filter((measurement) => measurement.raw_data_available).map((measurement) => <div className="data-table-row" key={measurement.id}><strong>{measurement.test_type}</strong><span>{new Date(measurement.started_at).toLocaleString("sk-SK")}</span><span>{measurement.status}</span><button className="quiet compact" onClick={() => { setSelectedMeasurementId(measurement.id); setActiveSection("measurements"); }}>Otvoriť výsledok</button></div>)}</div></section>}
              </>}
              {activeSection === "tests" && <>
                <section className="browser-panel">
                  <div className="browser-header"><div><div className="eyebrow">KATALÓG TESTOV</div><h2>Testy a konfigurácie</h2><p className="muted">Každá verzia testu je samostatná, nemenná konfigurácia pre THRUST.</p></div></div>
                  <div className="browser-toolbar"><input placeholder="Hľadať kód, názov alebo profil…" value={testSearch} onChange={(event) => setTestSearch(event.target.value)} /></div>
                  <div className="data-table test-table"><div className="data-table-head"><span>Kód</span><span>Názov</span><span>Verzia</span><span>Profil</span><span>Stav / akcie</span></div>{filteredTests().map((test) => <div className="data-table-row" key={test.id}><strong>{test.test_code}</strong><span>{test.name}</span><span>v{test.version}</span><span>{test.analysis_profile}</span><span className="row-actions"><span>{test.status}</span><button className="quiet compact" onClick={() => setSelectedTestId(test.id)}>Otvoriť</button></span></div>)}</div>
                  {filteredTests().length === 0 && <div className="empty-list"><h2>Žiadne testy</h2><p className="muted">Filteru nezodpovedá žiadna verzia testu.</p></div>}
                </section>
                {selectedTestId && (() => { const selected = tests.find((test) => test.id === selectedTestId); return selected ? <section className={selectedTestId ? "browser-detail detail-modal-open" : "browser-detail detail-modal-closed"}><div className="detail-header"><div><div className="eyebrow">KONFIGURÁCIA TESTU</div><h2>{selected.name} · v{selected.version}</h2></div><button className="quiet compact" onClick={() => setSelectedTestId(null)}>Zavrieť detail</button></div><div className="detail-grid"><div><span>Kód</span><strong>{selected.test_code}</strong></div><div><span>Profil</span><strong>{selected.analysis_profile}</strong></div><div><span>Stav</span><strong>{selected.status}</strong></div><div><span>Aktívny</span><strong>{selected.is_active ? "Áno" : "Nie"}</strong></div></div><pre className="config-preview">{JSON.stringify(selected.configuration, null, 2)}</pre></section> : null })()}
                <details className="create-disclosure"><summary className="participant-create-strip"><span><span className="eyebrow">NOVÁ VERZIA</span><strong>Vytvoriť test alebo ďalšiu konfiguráciu</strong></span><span className="primary compact">Otvoriť formulár</span></summary><section className="create-form-panel"><form className="participant-form" onSubmit={createTest}><label>Kód testu<input value={testForm.test_code} onChange={(event) => setTestForm({ ...testForm, test_code: event.target.value.toUpperCase() })} placeholder="SCOPE_HARD" required /></label><label>Názov<input value={testForm.name} onChange={(event) => setTestForm({ ...testForm, name: event.target.value })} placeholder="SCoPE HARD" required /></label><label>Verzia<input value={testForm.version} onChange={(event) => setTestForm({ ...testForm, version: event.target.value })} required /></label><label>Analytický profil<input value={testForm.analysis_profile} onChange={(event) => setTestForm({ ...testForm, analysis_profile: event.target.value })} required /></label><label>Konfigurácia testu (JSON)<textarea className="config-editor" value={testForm.configuration} onChange={(event) => setTestForm({ ...testForm, configuration: event.target.value })} rows={12} required /></label><button className="primary" type="submit">Vytvoriť</button></form>{testMessage && <p className="notice">{testMessage}</p>}</section></details>
              </>}
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
                  <section className={selectedMeasurementId ? "panel workbench-detail detail-modal-open" : "panel workbench-detail detail-modal-closed"}>
                    <div className="detail-window-bar"><div className="eyebrow">PRACOVNÝ PANEL</div><button className="quiet compact" onClick={() => setSelectedMeasurementId(null)}>Zavrieť</button></div>
                    {(() => { const selected = measurements.find((item) => item.id === selectedMeasurementId); return selected ? <><h2>{selected.test_type}</h2><p className="muted">{selected.source_file_name} · {new Date(selected.started_at).toLocaleString("sk-SK")}</p><div className="detail-grid"><div><span>Vzorky</span><strong>{String(selected.analysis_data?.sample_count ?? "—")}</strong></div><div><span>Trvanie</span><strong>{selected.analysis_data?.duration_s ? String(Number(selected.analysis_data.duration_s).toFixed(2)) + " s" : "—"}</strong></div><div><span>Raw dáta</span><strong>Archivované</strong></div><div><span>Normalizácia</span><strong>{selected.analysis_data?.normalized_step_response ? "Dostupná" : "Nie je dostupná"}</strong></div></div><div className="chart-toolbar"><label>Zobrazenie<select value={chartMode} onChange={(event) => setChartMode(event.target.value as "single" | "all")}><option value="single">Vybraný kanál</option><option value="all">Všetky osi</option></select></label>{chartMode === "single" && <label>Kanál<select value={chartChannel} onChange={(event) => setChartChannel(event.target.value)}><option>AILE</option><option>ELEV</option><option>THRO</option><option>RUDD</option></select></label>}</div><ResponseChart data={selected.analysis_data?.normalized_step_response} channel={chartChannel} mode={chartMode} /><ResponseMetrics data={selected.analysis_data?.normalized_step_response} /></> : <div className="empty-list"><h2>Vyber meranie</h2><p className="muted">V ľavom paneli vyber meranie, ktoré chceš preskúmať.</p></div> })()}
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

type NormalizedChannel = { mean?: number[]; median?: number[]; std?: number[]; metrics?: Record<string, number | null> };
type NormalizedResponse = { time_s?: number[]; channels?: Record<string, NormalizedChannel> };
type ResponseMode = "single" | "all";

type StepMetrics = {
  reaction_s: number | null;
  rise_s: number | null;
  overshoot_pct: number | null;
  settling_s: number | null;
  steady_state_error_pct: number | null;
  rmse: number | null;
  mean_std: number | null;
};

const RESPONSE_CHANNELS = ["AILE", "ELEV", "THRO", "RUDD"] as const;
const RESPONSE_COLORS: Record<string, string> = { AILE: "#ff6878", ELEV: "#45d5ff", THRO: "#ffc857", RUDD: "#9d8cff" };

function calculateStepMetrics(channel: NormalizedChannel | undefined, time: number[]): StepMetrics {
  const values = channel?.mean ?? [];
  const count = Math.min(time.length, values.length);
  const empty = { reaction_s: null, rise_s: null, overshoot_pct: null, settling_s: null, steady_state_error_pct: null, rmse: null, mean_std: null };
  if (count < 3) return empty;
  const ys = values.slice(0, count).map(Number);
  const edgeCount = Math.max(1, Math.floor(count * .1));
  const baseline = ys.slice(0, edgeCount).reduce((sum, value) => sum + value, 0) / edgeCount;
  const final = ys.slice(count - edgeCount).reduce((sum, value) => sum + value, 0) / edgeCount;
  const amplitude = final - baseline;
  if (!Number.isFinite(amplitude) || Math.abs(amplitude) < 1e-9) return empty;
  const normalized = ys.map((value) => (value - baseline) / amplitude);
  const crossing = (level: number) => { const index = normalized.findIndex((value) => value >= level); return index >= 0 ? time[index] : null; };
  const t10 = crossing(.1);
  const t90 = crossing(.9);
  const peak = Math.max(...normalized);
  let lastOutside = -1;
  normalized.forEach((value, index) => { if (Math.abs(value - 1) > .05) lastOutside = index; });
  const stdValues = (channel?.std ?? []).slice(0, count).map(Number).filter(Number.isFinite);
  return {
    reaction_s: t10,
    rise_s: t10 !== null && t90 !== null ? Math.max(0, t90 - t10) : null,
    overshoot_pct: Number.isFinite(peak) ? Math.max(0, (peak - 1) * 100) : null,
    settling_s: lastOutside >= 0 && lastOutside < count - 1 ? time[lastOutside] : null,
    steady_state_error_pct: Number.isFinite(normalized[count - 1]) ? Math.abs(1 - normalized[count - 1]) * 100 : null,
    rmse: Math.sqrt(normalized.reduce((sum, value) => sum + ((value - 1) ** 2), 0) / count),
    mean_std: stdValues.length ? stdValues.reduce((sum, value) => sum + value, 0) / stdValues.length : null,
  };
}

function formatMetric(value: number | null, unit = "") { return value === null || !Number.isFinite(value) ? "—" : value.toFixed(3) + unit; }
function metricsFor(channel: NormalizedChannel | undefined, time: number[]): StepMetrics {
  const raw = channel?.metrics;
  if (raw && typeof raw.step_count === "number" && raw.step_count > 0) {
    return {
      reaction_s: raw.reaction_delay_s ?? null,
      rise_s: raw.rise_time_s ?? null,
      overshoot_pct: raw.overshoot_pct ?? null,
      settling_s: raw.settling_time_s ?? null,
      steady_state_error_pct: raw.steady_state_error_pct ?? null,
      rmse: raw.tracking_rmse ?? null,
      mean_std: raw.mean_std ?? null,
    };
  }
  return calculateStepMetrics(channel, time);
}


function ResponseMetrics({ data }: { data: unknown }) {
  const response = data as NormalizedResponse | null;
  const time = response?.time_s ?? [];
  const available = RESPONSE_CHANNELS.filter((name) => response?.channels?.[name]?.mean?.length);
  if (!available.length) return null;
  return <section className="metrics-summary"><div className="eyebrow">VYPOČÍTANÉ UKAZOVATELE</div><p className="muted metrics-note">Odhady zo znormalizovanej priemernej odozvy; presné modelové parametre budú doplnené lokálnym THRUST-compute.</p><div className="metrics-table"><div className="metrics-head"><span>Osa</span><span>Oneskorenie</span><span>Náběh 10–90 %</span><span>Overshoot</span><span>Ustálenie</span><span>Chyba</span><span>RMSE</span><span>Priem. SD</span></div>{available.map((name) => { const m = metricsFor(response?.channels?.[name], time); return <div className="metrics-row" key={name}><strong style={{ color: RESPONSE_COLORS[name] }}>{name}</strong><span>{formatMetric(m.reaction_s, " s")}</span><span>{formatMetric(m.rise_s, " s")}</span><span>{formatMetric(m.overshoot_pct, " %")}</span><span>{formatMetric(m.settling_s, " s")}</span><span>{formatMetric(m.steady_state_error_pct, " %")}</span><span>{formatMetric(m.rmse)}</span><span>{formatMetric(m.mean_std)}</span></div>; })}</div></section>;
}

function ChartPlot({ name, channel, time, min, max, expanded }: { name: string; channel: NormalizedChannel; time: number[]; min: number; max: number; expanded?: boolean }) {
  const mean = channel.mean?.map(Number) ?? [];
  const median = channel.median?.map(Number) ?? [];
  const std = channel.std?.map(Number) ?? [];
  const count = Math.min(time.length, mean.length);
  const width = 280; const height = 200; const left = 42; const right = 266; const top = 18; const bottom = 164;
  const x = (index: number) => left + (index / Math.max(1, count - 1)) * (right - left);
  const y = (value: number) => bottom - ((value - min) / Math.max(.001, max - min)) * (bottom - top);
  const linePoints = (values: number[]) => values.slice(0, count).map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const upper = mean.slice(0, count).map((value, index) => `${x(index).toFixed(1)},${y(value + (std[index] || 0)).toFixed(1)}`);
  const lower = mean.slice(0, count).map((value, index) => `${x(index).toFixed(1)},${y(value - (std[index] || 0)).toFixed(1)}`).reverse();
  const horizontalTicks = [0, .5, 1]; const verticalTicks = [0, .5, 1];
  return <svg className={expanded ? "plot-svg plot-svg-large" : "plot-svg"} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Normalizovaná odozva osi ${name}`}><g className="plot-grid">{horizontalTicks.map((value) => <line key={`h${value}`} x1={left} x2={right} y1={y(value)} y2={y(value)} />)}{verticalTicks.map((fraction) => <line key={`v${fraction}`} x1={left + fraction * (right - left)} x2={left + fraction * (right - left)} y1={top} y2={bottom} />)}</g><line x1={left} y1={bottom} x2={right} y2={bottom} className="chart-axis" /><line x1={left} y1={top} x2={left} y2={bottom} className="chart-axis" /><line x1={left} y1={y(0)} x2={right} y2={y(0)} className="chart-zero" /><polygon points={[...upper, ...lower].join(" ")} fill={RESPONSE_COLORS[name]} opacity=".16" /><polyline points={linePoints(mean)} fill="none" stroke={RESPONSE_COLORS[name]} strokeWidth={expanded ? "2.5" : "2"} /><polyline points={linePoints(median)} fill="none" stroke={RESPONSE_COLORS[name]} strokeWidth="1.5" strokeDasharray="5 3" opacity=".9" /><text x={left} y="178" className="plot-tick">0</text><text x={right - 10} y="178" className="plot-tick">${time[count - 1]?.toFixed(1)} s</text><text x="9" y={top + 4} className="plot-tick">${max.toFixed(1)}</text><text x="16" y={bottom} className="plot-tick">${min.toFixed(1)}</text><text x={(left + right) / 2 - 20} y="194" className="plot-axis-label">Čas (s)</text><text x="11" y={(top + bottom) / 2} className="plot-axis-label" transform={`rotate(-90 11 ${(top + bottom) / 2})`}>Odozva</text><text x={left + 5} y="12" className="plot-title" fill={RESPONSE_COLORS[name]}>{name}</text>{!expanded && <text x={right - 50} y="12" className="plot-hint">otvoriť ↗</text>}</svg>;
}

function ResponseChart({ data, channel, mode }: { data: unknown; channel: string; mode: ResponseMode }) {
  const response = data as NormalizedResponse | null;
  const time = response?.time_s ?? [];
  const names = mode === "all" ? RESPONSE_CHANNELS.filter((name) => response?.channels?.[name]?.mean?.length) : [channel];
  const series = names.map((name) => ({ name, channel: response?.channels?.[name], count: Math.min(time.length, response?.channels?.[name]?.mean?.length ?? 0) })).filter((item): item is { name: string; channel: NormalizedChannel; count: number } => Boolean(item.channel) && item.count > 1);
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  if (!series.length) return <div className="chart-empty">Normalizovaná odozva nie je dostupná.</div>;
  const allValues = series.flatMap(({ channel: item, count }) => { const mean = item.mean?.slice(0, count) ?? []; const std = item.std?.slice(0, count) ?? []; return mean.flatMap((value, index) => [Number(value) - (Number(std[index]) || 0), Number(value) + (Number(std[index]) || 0)]); }).filter(Number.isFinite);
  const min = Math.min(-0.2, ...allValues); const max = Math.max(1.2, ...allValues);
  const plots = series.map(({ name, channel: item }) => <button type="button" className="chart-tile" key={name} onClick={() => setExpandedChannel(name)}><ChartPlot name={name} channel={item} time={time} min={min} max={max} /></button>);
  const expanded = expandedChannel ? series.find((item) => item.name === expandedChannel) : null;
  return <><div className={mode === "all" ? "response-grid" : "response-single"}>{plots}</div>{expanded && <div className="chart-expand-backdrop" onMouseDown={() => setExpandedChannel(null)}><section className="chart-expand-window" onMouseDown={(event) => event.stopPropagation()}><div className="chart-expand-header"><div><div className="eyebrow">DETAIL GRAFU</div><h3>{expanded.name} · normalizovaná odozva</h3></div><button type="button" className="quiet compact" onClick={() => setExpandedChannel(null)}>Zavrieť</button></div><ChartPlot name={expanded.name} channel={expanded.channel} time={time} min={min} max={max} expanded /></section></div>}</>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}
