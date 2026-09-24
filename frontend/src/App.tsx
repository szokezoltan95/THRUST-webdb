import { t, tf, serverMessage } from "./i18n";
import { LanguageSwitcher, useLanguage } from "./LanguageContext";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

type ConsentDocument = { version: string; text: string; configured?: boolean };
type ConsentDocuments = { research: ConsentDocument; gdpr: ConsentDocument };
type ConsentKind = "research" | "gdpr";
type ConsentStatus = { accepted: boolean; accepted_at: string | null; revoked_at: string | null; version: string | null; text: string | null };
type ConsentStatuses = Record<ConsentKind, ConsentStatus>;

type PublicMetrics = {
  participant_count: number | null;
  measurement_count: number | null;
  minimum_group_size: number;
  publishable: boolean;
};

type User = { username: string; role: string; csrf_token: string; email?: string | null; participant_id?: string | null; participant_code?: string | null; first_name?: string | null; last_name?: string | null };
type Overview = { participant_count: number; measurement_count: number };
type Participant = { id: string; participant_code: string; is_active: boolean; created_at: string; birth_date?: string | null; pilot_experience?: string | null; flight_hours_range?: string | null; pilot_certificate?: string | null; primary_uav_type?: string | null; simulator_experience?: string | null; self_rated_skill?: number | null; sex?: string | null; dominant_hand?: string | null; vision_correction?: string | null; vision_diopters_left?: number | null; vision_diopters_right?: number | null; rc_experience?: string | null; fpv_experience?: string | null; game_controller_experience?: string | null; video_game_experience?: string | null; }
type AdminAccount = { id: string; username: string; email: string | null; first_name: string | null; last_name: string | null; role: string; effective_role: string; is_active: boolean; participant_id: string | null; participant_code: string | null; created_at: string };
type TestDefinition = { id: string; test_code: string; name: string; version: string; status: string; analysis_profile: string; configuration: Record<string, unknown>; is_active: boolean };
type Measurement = { id: string; participant_id: string; test_definition_id: string | null; test_type: string; status: string; started_at: string; source_file_name: string | null; raw_sha256: string | null; raw_size_bytes: number | null; analysis_data: Record<string, unknown> | null };
type ParticipantDetail = { participant: Participant; measurements: { id: string; test_type: string; status: string; started_at: string; raw_data_available?: boolean; raw_size_bytes?: number | null }[] };
type AdminSection = "overview" | "participants" | "groups" | "tests" | "measurements";
type ParticipantGroup = { id: string; name: string; description: string | null; created_at: string; participant_ids: string[]; participant_codes: string[] };
type StudentMeasurement = { id: string; test_type: string; status: string; started_at: string; raw_size_bytes: number | null; analysis_data: Record<string, unknown> | null };
type StudentProfile = { username: string; email: string | null; role: string; participant_code: string; first_name: string; last_name: string; created_at: string; birth_date: string | null; pilot_experience: string | null; flight_hours_range: string | null; pilot_certificate: string | null; primary_uav_type: string | null; simulator_experience: string | null; self_rated_skill: number | null; sex?: string | null; dominant_hand?: string | null; vision_correction?: string | null; vision_diopters_left?: number | null; vision_diopters_right?: number | null; rc_experience?: string | null; fpv_experience?: string | null; game_controller_experience?: string | null; video_game_experience?: string | null; }
type StudentComparison = { available: boolean; minimum_group_size: number; cohort_participant_count: number; own_measurement_count: number; own_average: Record<string, number>; cohort_average: Record<string, number> };

type MeasurementMode = "SCOPE" | "SIMPLE";
function getMeasurementMode(item: { test_type: string; analysis_data: Record<string, unknown> | null; test_definition_id?: string | null }, tests: TestDefinition[] = []): MeasurementMode {
  const profile = tests.find((test) => test.id === item.test_definition_id)?.analysis_profile.toUpperCase();
  if (profile?.startsWith("SIMPLE")) return "SIMPLE";
  if (profile?.startsWith("SCOPE")) return "SCOPE";
  if (String(item.analysis_data?.analysis_type ?? "").toUpperCase().startsWith("SIMPLE")) return "SIMPLE";
  return item.test_type.toUpperCase().startsWith("SIMPLE") ? "SIMPLE" : "SCOPE";
}
function ModeSwitch({ value, onChange }: { value: MeasurementMode; onChange: (mode: MeasurementMode) => void }) {
  return <div className="mode-switch" role="group" aria-label={t("Merací režim")}>
    {(["SCOPE", "SIMPLE"] as const).map((mode) => <button type="button" key={mode} className={value === mode ? "mode-switch-option active" : "mode-switch-option"} aria-pressed={value === mode} onClick={() => onChange(mode)}>{mode === "SCOPE" ? "SCoPE" : "SimPLE"}</button>)}
  </div>;
}

const MONTH_ABBREVIATIONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const year = date.getUTCFullYear();
  const month = MONTH_ABBREVIATIONS[date.getUTCMonth()];
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const time = [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
  return `${formatDate(value)} ${time} UTC`;
}

function formatBytes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value < 0) return "—";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unit]}`;
}

function parseFormattedDate(value: string): string | null {
  const trimmed = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const displayMatch = /^(\d{4})\/([A-Za-z]{3})\/(\d{2})$/.exec(trimmed);
  const match = isoMatch ?? displayMatch;
  if (!match) return null;
  const year = Number(match[1]);
  const month = isoMatch
    ? Number(match[2]) - 1
    : MONTH_ABBREVIATIONS.findIndex((name) => name.toLowerCase() === match[2].toLowerCase());
  const day = Number(match[3]);
  if (month < 0 || month > 11) return null;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseFormattedDateTime(value: string): string | null {
  const trimmed = value.trim();
  const nativeMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(trimmed);
  const displayMatch = /^(\d{4}\/[A-Za-z]{3}\/\d{2})[ T](\d{2}):(\d{2})$/.exec(trimmed);
  const match = nativeMatch ?? displayMatch;
  if (!match) return null;
  const isoDate = parseFormattedDate(match[1]);
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (!isoDate || hours > 23 || minutes > 59) return null;
  return `${isoDate}T${match[2]}:${match[3]}`;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null;
    if (response.status === 401) throw new Error(t("Nesprávne prihlasovacie údaje."));
    if (response.status === 503 && typeof body?.detail === "string") {
      throw new Error(serverMessage(body.detail, response.status));
    }
    if (response.status >= 500) {
      throw new Error(tf("Server vrátil chybu HTTP {0} pri požiadavke {1}. Podrobnosti sú v logu backendu.", response.status, url));
    }
    const detail = body?.detail;
    if (typeof detail === "string") throw new Error(serverMessage(detail, response.status));
    if (Array.isArray(detail)) {
      const validationErrors = detail.filter((item) => item && typeof item === "object") as { loc?: unknown[]; msg?: unknown }[];
      if (validationErrors.some((item) => item.loc?.includes("email"))) {
        throw new Error(t("Zadaj platnú e-mailovú adresu."));
      }
      const messages = validationErrors.map((item) => String(item.msg ?? t("Neplatná hodnota.")));
      throw new Error(messages.join(" "));
    }
    throw new Error(t("Požiadavku sa nepodarilo dokončiť (HTTP ") + response.status + ").");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export function App() {
  const { language } = useLanguage();
  const [metrics, setMetrics] = useState<PublicMetrics | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([]);
  const [accountMessage, setAccountMessage] = useState("");
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
  const [testModeFilter, setTestModeFilter] = useState<"ALL" | MeasurementMode>("ALL");
  const [resultMode, setResultMode] = useState<MeasurementMode>("SCOPE");
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantDetail | null>(null);
  const [participantDialog, setParticipantDialog] = useState<"detail" | "measurements" | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<AdminAccount | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [groups, setGroups] = useState<ParticipantGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [statsParticipantId, setStatsParticipantId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [groupMetric, setGroupMetric] = useState("");
  const [groupXAxis, setGroupXAxis] = useState<"date" | "test">("date");
  const [groupMessage, setGroupMessage] = useState("");
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
  const [isRegisterPage, setIsRegisterPage] = useState(() => window.location.pathname.replace(/\/+$/, "") === "/register");
  const [isResearcherRegisterPage, setIsResearcherRegisterPage] = useState(() => window.location.pathname.replace(/\/+$/, "") === "/register/researcher");
  const [consentTexts, setConsentTexts] = useState<ConsentDocuments | null>(null);
  const [consentDialog, setConsentDialog] = useState<ConsentKind | null>(null);
  const [activeConsentDocument, setActiveConsentDocument] = useState<ConsentDocument | null>(null);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");

  useEffect(() => {
    setError("");
    setAccountMessage("");
    setParticipantMessage("");
    setTestMessage("");
    setUploadMessage("");
  }, [language]);

  useEffect(() => {
    const syncRoute = () => {
      const path = window.location.pathname.replace(/\/+$/, "");
      setIsRegisterPage(path === "/register");
      setIsResearcherRegisterPage(path === "/register/researcher");
    };
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    request<PublicMetrics>("/api/public/metrics").then(setMetrics).catch(() => setMetrics(null));
    request<User>("/api/auth/me").then((sessionUser) => {
      setUser(sessionUser);
      if (["/register", "/register/researcher"].includes(window.location.pathname.replace(/\/+$/, ""))) {
        window.history.replaceState({}, "", "/");
        setIsRegisterPage(false);
        setIsResearcherRegisterPage(false);
      }
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    setConsentTexts(null);
    request<ConsentDocuments>(`/api/public/consent-texts?lang=${language}`)
      .then((documents) => { if (active) setConsentTexts(documents); })
      .catch(() => { if (active) setConsentTexts(null); });
    return () => { active = false; };
  }, [language]);

  useEffect(() => {
    if (user && user.role !== "student") {
      request<Overview>("/api/admin/overview").then(setOverview).catch(() => setOverview(null));
      request<Participant[]>("/api/admin/participants").then(setParticipants).catch(() => setParticipants([]));
      if (user.role === "admin" || user.role === "superadmin") request<AdminAccount[]>("/api/admin/users").then(setAdminAccounts).catch((reason) => setAccountMessage(reason instanceof Error ? reason.message : t("Používateľov sa nepodarilo načítať.")));
      else setAdminAccounts([]);
      request<TestDefinition[]>("/api/admin/tests").then(setTests).catch(() => setTests([]));
      request<Measurement[]>("/api/admin/measurements").then(setMeasurements).catch(() => setMeasurements([]));
      request<ParticipantGroup[]>("/api/admin/groups").then(setGroups).catch(() => setGroups([]));
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
      setTestMessage(t("Typ testu bol vytvorený."));
    } catch (reason) {
      setTestMessage(reason instanceof SyntaxError ? t("Konfigurácia testu nie je platný JSON.") : reason instanceof Error ? reason.message : t("Test sa nepodarilo vytvoriť."));
    }
  }

  async function openParticipant(participant: Participant, view: "detail" | "measurements") {
    const detail = await request<ParticipantDetail>(`/api/admin/participants/${participant.id}`);
    setSelectedMeasurementId(null);
    setSelectedParticipant(detail);
    setParticipantDialog(view);
  }

  async function uploadMeasurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadMessage("");
    const form = new FormData(event.currentTarget);
    const file = form.get("raw_file");
    const startedAtInput = String(form.get("started_at") || "").trim();
    const startedAt = parseFormattedDateTime(startedAtInput);
    if (!startedAt) {
      setUploadMessage(t("Vyber platný dátum a čas merania."));
      return;
    }
    if (!(file instanceof File) || !file.size) {
      setUploadMessage(t("Vyber raw dátový súbor."));
      return;
    }
    const analysisFile = form.get("analysis_file");
    let analysisData: Record<string, unknown> | null = null;
    if (analysisFile instanceof File && analysisFile.size) {
      try {
        const parsed: unknown = JSON.parse(await analysisFile.text());
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(t("Neplatný JSON analýzy."));
        analysisData = parsed as Record<string, unknown>;
        const chosen = tests.find((test) => test.id === form.get("test_definition_id"));
        if (chosen?.analysis_profile.toUpperCase().startsWith("SIMPLE") && analysisData.analysis_type !== "SIMPLE_2D_FLIGHT") {
          throw new Error(t("Zvolený SimPLE test vyžaduje analýzu SimPLE."));
        }
        if (chosen?.analysis_profile.toUpperCase().startsWith("SCOPE") && analysisData.analysis_type === "SIMPLE_2D_FLIGHT") {
          throw new Error(t("Analýza SimPLE nepatrí k testu SCoPE."));
        }
      } catch (reason) {
        setUploadMessage(reason instanceof Error ? reason.message : t("Súbor analýzy nie je platný JSON."));
        return;
      }
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
          started_at: new Date(startedAt).toISOString(),
          source_file_name: file.name,
          raw_content_type: file.name.toLowerCase().endsWith(".gz") ? "application/gzip" : "text/tab-separated-values",
          raw_log_base64: btoa(binary),
          status: "recorded",
          analysis_data: analysisData,
        }),
      });
      setMeasurements((current) => [uploaded, ...current]);
      setOverview((current) => current ? { ...current, measurement_count: current.measurement_count + 1 } : current);
      setUploadMessage(analysisData ? t("Raw log a výsledky boli nahrané.") : t("Raw log bol nahraný bez analýzy. Výsledky sa zobrazia až po nahratí analýzy."));
      event.currentTarget.reset();
    } catch (reason) {
      setUploadMessage(reason instanceof Error ? reason.message : t("Súbor sa nepodarilo nahrať."));
    }
  }

  function changeResultMode(mode: MeasurementMode) {
    setResultMode(mode);
    setMeasurementTestFilter("");
    setSelectedMeasurementId(null);
    setSelectedMeasurementIds([]);
  }

  function filteredMeasurements() {
    const query = measurementSearch.trim().toLowerCase();
    return measurements.filter((measurement) => {
      if (!measurement.raw_sha256 || !measurement.raw_size_bytes) return false;
      if (getMeasurementMode(measurement, tests) !== resultMode) return false;
      if (measurementParticipantFilter && measurement.participant_id !== measurementParticipantFilter) return false;
      if (measurementTestFilter && measurement.test_definition_id !== measurementTestFilter) return false;
      const date = new Date(measurement.started_at);
      const dateFrom = measurementDateFrom ? parseFormattedDate(measurementDateFrom) : null;
      const dateTo = measurementDateTo ? parseFormattedDate(measurementDateTo) : null;
      if (dateFrom && date < new Date(dateFrom + "T00:00:00Z")) return false;
      if (dateTo && date > new Date(dateTo + "T23:59:59Z")) return false;
      if (query && ![measurement.test_type, measurement.source_file_name ?? "", measurement.id].join(" ").toLowerCase().includes(query)) return false;
      return true;
    });
  }

  function toggleMeasurementSelection(id: string) {
    setSelectedMeasurementIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function saveParticipantGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    try {
      const body = { name: groupName, description: groupDescription || null, participant_ids: groupMemberIds };
      const url = selectedGroupId ? `/api/admin/groups/${selectedGroupId}` : "/api/admin/groups";
      const saved = await request<ParticipantGroup>(url, { method: selectedGroupId ? "PATCH" : "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": user.csrf_token }, body: JSON.stringify(body) });
      setGroups((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedGroupId(saved.id); setGroupName(saved.name); setGroupDescription(saved.description ?? ""); setGroupMemberIds(saved.participant_ids);
      setGroupMessage(t("Skupina bola uložená."));
    } catch (reason) { setGroupMessage(reason instanceof Error ? reason.message : t("Skupinu sa nepodarilo uložiť.")); }
  }

  function groupSeries(): { label: string; date: string; value: number; n: number }[] {
    const group = groups.find((item) => item.id === selectedGroupId);
    if (!group || !groupMetric) return [];
    const memberSet = new Set(group.participant_ids);
    const rows = measurements.filter((item) => memberSet.has(item.participant_id) && item.status !== "failed").map((item) => {
      const data = item.analysis_data ?? {};
      const metrics = (data.metrics && typeof data.metrics === "object" ? data.metrics : data) as Record<string, unknown>;
      const value = metrics[groupMetric];
      return typeof value === "number" && Number.isFinite(value) ? { label: item.test_type, date: item.started_at, value, participant: item.participant_id } : null;
    }).filter((item): item is { label: string; date: string; value: number; participant: string } => item !== null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (groupXAxis === "test") return rows.map((item) => ({ label: item.label, date: item.date, value: item.value, n: 1 }));
    return rows.map((item) => ({ label: formatDate(item.date), date: item.date, value: item.value, n: 1 }));
  }

  async function deleteTestVersion(test: TestDefinition) {
    if (!user || user.role !== "superadmin") return;
    const attached = measurements.filter((item) => item.test_definition_id === test.id);
    if (!window.confirm(t("Trvalo odstrániť verziu ") + test.test_code + " v" + test.version + t(" a všetkých ") + attached.length + t(" priradených meraní vrátane archivovaných raw súborov? Akcia sa nedá vrátiť späť."))) return;
    try {
      await request<void>("/api/admin/tests/" + test.id, { method: "DELETE", headers: { "X-CSRF-Token": user.csrf_token } });
      const removedIds = new Set(attached.map((item) => item.id));
      setMeasurements((current) => current.filter((item) => !removedIds.has(item.id)));
      setSelectedMeasurementIds((current) => current.filter((id) => !removedIds.has(id)));
      if (selectedMeasurementId && removedIds.has(selectedMeasurementId)) setSelectedMeasurementId(null);
      setOverview((current) => current ? { ...current, measurement_count: Math.max(0, current.measurement_count - attached.length) } : current);
      setTests((current) => current.filter((item) => item.id !== test.id));
      if (selectedTestId === test.id) setSelectedTestId(null);
      setTestMessage("Verzia " + test.test_code + " v" + test.version + t(" a jej merania boli odstránené."));
    } catch (reason) {
      setTestMessage(reason instanceof Error ? reason.message : t("Verziu testu sa nepodarilo odstrániť."));
    }
  }

  async function deleteSelectedMeasurements() {
    if (!selectedMeasurementIds.length) return;
    if (!window.confirm(tf("Naozaj chceš odstrániť {0} vybraných meraní? Odstránia sa aj archivované raw súbory.", selectedMeasurementIds.length))) return;
    try {
      for (const id of selectedMeasurementIds) {
        await request<void>(`/api/admin/measurements/${id}`, { method: "DELETE", headers: { "X-CSRF-Token": user?.csrf_token ?? "" } });
      }
      setMeasurements((current) => current.filter((measurement) => !selectedMeasurementIds.includes(measurement.id)));
      if (selectedMeasurementId && selectedMeasurementIds.includes(selectedMeasurementId)) setSelectedMeasurementId(null);
      setSelectedMeasurementIds([]);
      setOverview((current) => current ? { ...current, measurement_count: Math.max(0, current.measurement_count - selectedMeasurementIds.length) } : current);
    } catch (reason) {
      setUploadMessage(reason instanceof Error ? reason.message : t("Merania sa nepodarilo odstrániť."));
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
      setParticipantMessage(t("Účastník bol vytvorený."));
      setOverview((current) => current ? { ...current, participant_count: current.participant_count + 1 } : current);
    } catch (reason) {
      setParticipantMessage(reason instanceof Error ? reason.message : t("Účastníka sa nepodarilo vytvoriť."));
    }
  }

  function openRegistration() {
    window.history.pushState({}, "", "/register");
    setIsRegisterPage(true);
    setIsResearcherRegisterPage(false);
    setError("");
    window.scrollTo(0, 0);
  }

  function openResearcherRegistration() {
    window.history.pushState({}, "", "/register/researcher");
    setIsRegisterPage(false);
    setIsResearcherRegisterPage(true);
    setError("");
    window.scrollTo(0, 0);
  }

  function leaveRegistration() {
    window.history.pushState({}, "", "/");
    setIsRegisterPage(false);
    setIsResearcherRegisterPage(false);
    setError("");
    window.scrollTo(0, 0);
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!consentTexts) { setError(t("Texty súhlasov sa nepodarilo načítať.")); return; }
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("password_confirmation")) {
      setError(t("Heslá sa nezhodujú."));
      return;
    }
    const birthDateInput = String(data.get("birth_date") || "").trim();
    const birthDate = birthDateInput ? parseFormattedDate(birthDateInput) : null;
    if (birthDateInput && !birthDate) {
      setError(t("Vyber platný dátum narodenia."));
      return;
    }
    try {
      const signedIn = await request<User>("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"), first_name: data.get("first_name"), last_name: data.get("last_name"),
          password: data.get("password"), research_consent: data.get("research_consent") === "on",
          gdpr_consent: data.get("gdpr_consent") === "on",
          birth_date: birthDate,
          sex: data.get("sex") || null,
          dominant_hand: data.get("dominant_hand") || null,
          vision_correction: data.get("vision_correction") || null,
          vision_diopters_left: data.get("vision_diopters_left") ? Number(data.get("vision_diopters_left")) : null,
          vision_diopters_right: data.get("vision_diopters_right") ? Number(data.get("vision_diopters_right")) : null,
          rc_experience: data.get("rc_experience") || null,
          fpv_experience: data.get("fpv_experience") || null,
          game_controller_experience: data.get("game_controller_experience") || null,
          video_game_experience: data.get("video_game_experience") || null,
          pilot_experience: data.get("pilot_experience") || null,
          flight_hours_range: data.get("flight_hours_range") || null,
          pilot_certificate: data.get("pilot_certificate") || null,
          primary_uav_type: data.get("primary_uav_type") || null,
          simulator_experience: data.get("simulator_experience") || null,
          self_rated_skill: data.get("self_rated_skill") ? Number(data.get("self_rated_skill")) : null,
          consent_version: consentTexts?.research.version || "research-v4",
          gdpr_consent_version: consentTexts?.gdpr.version || "gdpr-v3",
          consent_language: language,
        }),
      });
      setUser(signedIn); leaveRegistration();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("Registrácia zlyhala.")); }
  }

  async function registerResearcher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!consentTexts) { setError(t("Texty súhlasov sa nepodarilo načítať.")); return; }
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("password_confirmation")) {
      setError(t("Heslá sa nezhodujú."));
      return;
    }
    try {
      const signedIn = await request<User>("/api/auth/register/researcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: data.get("first_name"),
          last_name: data.get("last_name"),
          email: data.get("email"),
          password: data.get("password"),
          registration_key: data.get("registration_key"),
          gdpr_consent: data.get("gdpr_consent") === "on",
          gdpr_consent_version: consentTexts?.gdpr.version || "gdpr-v3",
          consent_language: language,
        }),
      });
      setUser(signedIn);
      leaveRegistration();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Registrácia výskumníka zlyhala."));
    }
  }

  async function changeAccountRole(account: AdminAccount, role: string) {
    if (!user || user.role !== "superadmin") return;
    const ok = window.confirm(tf("Zmeniť rolu účtu {0} na {1}?", account.email || account.username, role));
    if (!ok) return;
    try {
      const updated = await request<AdminAccount>(`/api/admin/users/${account.id}/role`, {
        method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": user.csrf_token },
        body: JSON.stringify({ role }),
      });
      setAdminAccounts((items) => items.map((item) => item.id === updated.id ? updated : item));
      setSelectedAccount((current) => current?.id === updated.id ? updated : current);
      if (updated.participant_id && updated.participant_code && !participants.some((item) => item.id === updated.participant_id)) {
        setParticipants((items) => [{ id: updated.participant_id!, participant_code: updated.participant_code!, is_active: updated.is_active, created_at: updated.created_at }, ...items]);
      }
      setAccountMessage(t("Rola bola zmenená."));
    } catch (reason) { setAccountMessage(reason instanceof Error ? reason.message : t("Rolu sa nepodarilo zmeniť.")); }
  }

  async function resetAccountPassword(account: AdminAccount) {
    if (!user || user.role !== "superadmin") return;
    const password = window.prompt(tf("Zadaj nové dočasné heslo pre {0} (min. 10 znakov):", account.email || account.username));
    if (!password) return;
    if (password.length < 10) { setAccountMessage(t("Heslo musí mať aspoň 10 znakov.")); return; }
    try {
      await request<void>(`/api/admin/users/${account.id}/password`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": user.csrf_token },
        body: JSON.stringify({ password }),
      });
      setAccountMessage(t("Heslo zmenené. Používateľ sa musí prihlásiť znova."));
    } catch (reason) { setAccountMessage(reason instanceof Error ? reason.message : t("Heslo sa nepodarilo resetovať.")); }
  }

  async function anonymizeAccount(account: AdminAccount) {
    if (!user || user.role !== "superadmin") return;
    if (!window.confirm(tf("Anonymizovať a deaktivovať účet {0}? Merania zostanú zachované pod pseudonymným ID.", account.email || account.username))) return;
    try {
      await request<void>(`/api/admin/users/${account.id}`, { method: "DELETE", headers: { "X-CSRF-Token": user.csrf_token } });
      await refreshAccounts();
      setAccountMessage(t("Účet bol deaktivovaný a osobné údaje odstránené; merania zostali zachované."));
      setSelectedAccount(null);
    } catch (reason) { setAccountMessage(reason instanceof Error ? reason.message : t("Účet sa nepodarilo anonymizovať.")); }
  }

  async function permanentlyDeleteParticipant(participant: Participant, account: AdminAccount | null) {
    if (!user || user.role !== "superadmin") return;
    const linkedAccount = account ? tf(" Úplne sa odstráni aj konto {0} a jeho súhlasy.", account.email || account.username) : "";
    const ok = window.confirm(tf("Trvalo odstrániť účastníka {0}, všetky jeho merania a archivované raw súbory?{1} Túto akciu nemožno vrátiť späť.", participant.participant_code, linkedAccount));
    if (!ok) return;
    try {
      await request<void>(`/api/admin/participants/${participant.id}/purge`, { method: "DELETE", headers: { "X-CSRF-Token": user.csrf_token } });
      const removedRawCount = measurements.filter((item) => item.participant_id === participant.id && item.raw_sha256).length;
      setParticipants((items) => items.filter((item) => item.id !== participant.id));
      setAdminAccounts((items) => items.filter((item) => item.participant_id !== participant.id));
      setMeasurements((items) => items.filter((item) => item.participant_id !== participant.id));
      setSelectedParticipant(null);
      setParticipantDialog(null);
      setOverview((current) => current ? { participant_count: Math.max(0, current.participant_count - 1), measurement_count: Math.max(0, current.measurement_count - removedRawCount) } : current);
      setAccountMessage(tf("Účastník {0}, jeho konto a všetky merania boli úplne odstránené.", participant.participant_code));
    } catch (reason) {
      setAccountMessage(reason instanceof Error ? reason.message : t("Údaje účastníka sa nepodarilo úplne odstrániť."));
    }
  }

  async function permanentlyDeleteStandaloneAccount(account: AdminAccount) {
    if (!user || user.role !== "superadmin") return;
    if (!window.confirm(tf("Natrvalo odstrániť konto {0} vrátane jeho súhlasov? Akcia sa nedá vrátiť späť.", account.email || account.username))) return;
    try {
      await request<void>(`/api/admin/users/${account.id}/purge`, { method: "DELETE", headers: { "X-CSRF-Token": user.csrf_token } });
      setAdminAccounts((items) => items.filter((item) => item.id !== account.id));
      setSelectedAccount(null);
      setAccountMessage(t("Konto a súvisiace súhlasy boli úplne odstránené."));
    } catch (reason) {
      setAccountMessage(reason instanceof Error ? reason.message : t("Konto sa nepodarilo úplne odstrániť."));
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
        body: JSON.stringify({ identifier: data.get("identifier"), password: data.get("password") }),
      });
      setUser(signedIn);
      setLoginOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Prihlásenie zlyhalo."));
    }
  }

  async function logout() {
    if (!user) return;
    await request<void>("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": user.csrf_token } });
    setUser(null);
    setOverview(null);
  }

  async function refreshAccounts() {
    setAccountMessage("");
    try {
      const participants = await request<Participant[]>("/api/admin/participants");
      setParticipants(participants);
      if (user?.role === "admin" || user?.role === "superadmin") {
        const accounts = await request<AdminAccount[]>("/api/admin/users");
        setAdminAccounts(accounts);
        setAccountMessage(tf("Načítaných {0} účtov a {1} účastníkov.", accounts.length, participants.length));
      } else {
        setAdminAccounts([]);
        setAccountMessage(tf("Načítaných {0} Participant ID.", participants.length));
      }
    } catch (reason) {
      setAccountMessage(reason instanceof Error ? reason.message : t("Údaje sa nepodarilo obnoviť."));
    }
  }


  function participantCodeFor(participantId: string) {
    return participants.find((participant) => participant.id === participantId)?.participant_code ?? participantId.slice(0, 8);
  }

  function filteredTests() {
    const query = testSearch.trim().toLowerCase();
    return tests.filter((test) => (testModeFilter === "ALL" || test.analysis_profile.toUpperCase().startsWith(testModeFilter)) && (!query || [test.test_code, test.name, test.version, test.analysis_profile].join(" ").toLowerCase().includes(query)));
  }

  function participantMeasurements(participantId: string) {
    return measurements.filter((measurement) => measurement.participant_id === participantId && measurement.raw_sha256);
  }

  function filteredParticipants() {
    const query = participantSearch.trim().toLowerCase();
    return [...participants]
      .filter((participant) => { const account = adminAccounts.find((item) => item.participant_id === participant.id); return !query || [participant.participant_code, account?.first_name, account?.last_name, account?.email, account?.username].filter(Boolean).join(" ").toLowerCase().includes(query); })
      .sort((left, right) => {
        const leftMeasurements = participantMeasurements(left.id);
        const rightMeasurements = participantMeasurements(right.id);
        if (participantSort === "count") return rightMeasurements.length - leftMeasurements.length;
        if (participantSort === "first") return (leftMeasurements[0]?.started_at ?? "").localeCompare(rightMeasurements[0]?.started_at ?? "");
        if (participantSort === "last") return (rightMeasurements[0]?.started_at ?? "").localeCompare(leftMeasurements[0]?.started_at ?? "");
        return left.participant_code.localeCompare(right.participant_code);
      });
  }

  function visibleAccountOnlyRows() {
    const query = participantSearch.trim().toLowerCase();
    return adminAccounts.filter((account) => !account.participant_id &&
      (!query || [account.first_name, account.last_name, account.email, account.username, account.role].filter(Boolean).join(" ").toLowerCase().includes(query)));
  }

  function accountManagementActions(account: AdminAccount | null) {
    if (!account) return <span className="muted">{t("Bez prihlasovacieho účtu")}</span>;
    return <span className="role-label">{account.effective_role}</span>;
  }

  if (user?.role === "student") return <StudentPortal user={user} onLogout={logout} />;
  if (isRegisterPage && !user) return <>
    <RegistrationPage onSubmit={register} onBack={leaveRegistration} onLogin={() => { leaveRegistration(); setLoginOpen(true); }} onResearcherRegister={openResearcherRegistration} error={error} consentTexts={consentTexts} onOpenConsent={setConsentDialog} />
    {consentDialog && consentTexts && <ConsentTextDialog kind={consentDialog} document={activeConsentDocument || consentTexts[consentDialog]} onClose={() => { setConsentDialog(null); setActiveConsentDocument(null); }} />}
  </>;
  if (isResearcherRegisterPage && !user) return <>
    <ResearcherRegistrationPage onSubmit={registerResearcher} onBack={leaveRegistration} onStudentRegister={openRegistration} onLogin={() => { leaveRegistration(); setLoginOpen(true); }} error={error} consentTexts={consentTexts} onOpenConsent={setConsentDialog} />
    {consentDialog && consentTexts && <ConsentTextDialog kind={consentDialog} document={activeConsentDocument || consentTexts[consentDialog]} onClose={() => { setConsentDialog(null); setActiveConsentDocument(null); }} />}
  </>;

  return (
    <main>
      {user ? (
        <div className="app-shell">
          <aside className="sidebar">
            <div className="brand"><span className="mark">{t("T")}</span><div><strong>{t("THRUST")}</strong><small>{t("UAV Human Performance Research")}</small></div></div>
            <nav className="side-nav" aria-label={t("Administrácia")}>
              <button className={activeSection === "overview" ? "nav-item active" : "nav-item"} onClick={() => setActiveSection("overview")}><span>⌂</span>{t("Prehľad")}</button>
              <button className={activeSection === "participants" ? "nav-item active" : "nav-item"} onClick={() => setActiveSection("participants")}><span>◎</span>{t("Účastníci a účty")}</button>
              <button className={activeSection === "groups" ? "nav-item active" : "nav-item"} onClick={() => setActiveSection("groups")}><span>◉</span>{t("Skupiny a trendy")}</button>
              <button className={activeSection === "tests" ? "nav-item active" : "nav-item"} onClick={() => setActiveSection("tests")}><span>▣</span>{t("Testy a konfigurácie")}</button>
              <button className={activeSection === "measurements" ? "nav-item active" : "nav-item"} onClick={() => setActiveSection("measurements")}><span>↗</span>{t("Merania a výsledky")}</button>
            </nav>
            <div className="sidebar-footer"><span>{user.username} · {user.role}</span><button className="quiet" onClick={logout}>{t("Odhlásiť")}</button></div>
          </aside>
          <div className="app-main">
            <header className="topbar"><div><div className="eyebrow">{t("ADMINISTRÁCIA ·")} {user.role.toUpperCase()}</div><h1>{activeSection === "overview" ? t("Prehľad meraní") : activeSection === "participants" ? t("Účastníci a účty") : activeSection === "groups" ? t("Skupiny a trendy") : activeSection === "tests" ? t("Testy a konfigurácie") : t("Merania a výsledky")}</h1></div><div className="header-actions"><LanguageSwitcher /><span className="status-dot">{t("Systém online")}</span></div></header>
            <section className="workspace">
              {activeSection === "overview" && <>
                <div className="stats"><Metric label={t("Účastníci")} value={overview?.participant_count ?? "—"} /><Metric label={t("Merania")} value={overview?.measurement_count ?? "—"} /><Metric label={t("Čakajúce synchronizácie")} value="0" /></div>
                <div className="empty"><span>01</span><div><h2>{t("Databáza je pripravená")}</h2><p>{t("Vyber sekciu vľavo alebo začni vytvorením účastníka.")}</p></div></div>
                <div className="admin-grid">{(user.role === "admin" || user.role === "superadmin") && <section className="panel quick-panel"><div className="eyebrow">{t("RÝCHLA AKCIA")}</div><h2>{t("Nový účastník")}</h2><p className="muted">{t("Vytvor pseudonymné ID a priraď k nemu neskoršie merania.")}</p><button className="primary" onClick={() => setActiveSection("participants")}>{t("Otvoriť administráciu účastníkov")}</button></section>}<section className="panel quick-panel"><div className="eyebrow">{t("RÝCHLA AKCIA")}</div><h2>{t("Synchronizované výsledky")}</h2><p className="muted">{t("Zobraz merania odoslané z lokálneho THRUST/SCoPE klienta.")}</p><button className="primary" onClick={() => setActiveSection("measurements")}>{t("Otvoriť evidenciu meraní")}</button></section></div>
              </>}
              {activeSection === "participants" && <>
                <section className="browser-panel">
                  <div className="browser-header"><div><div className="eyebrow">{t("ÚČASTNÍCI A ÚČTY")}</div><h2>{user.role === "researcher" ? t("Účastníci a výskumné dáta") : t("Spoločná evidencia účastníkov a kont")}</h2><p className="muted">{user.role === "researcher" ? t("Výsledky, merania a pseudonymné profily účastníkov.") : t("Participant ID, používateľské konto a rola sú zobrazené spolu. Účty bez Participant ID sú súčasťou toho istého zoznamu.")}</p></div><div className="actions"><button className="quiet compact" onClick={() => void refreshAccounts()}>{t("Obnoviť")}</button>{(user.role === "admin" || user.role === "superadmin") && <button className="primary compact" onClick={() => document.getElementById("new-participant-code")?.focus()}>{t("Nové anonymné ID")}</button>}</div></div>
                  {accountMessage && <p className="notice">{accountMessage}</p>}
                  <div className="browser-toolbar"><input placeholder={t("Hľadať ID, meno, e-mail alebo login…")} value={participantSearch} onChange={(event) => setParticipantSearch(event.target.value)} /><select value={participantSort} onChange={(event) => setParticipantSort(event.target.value as typeof participantSort)}><option value="code">{t("Zoradiť podľa ID")}</option><option value="first">{t("Najstarší prvý test")}</option><option value="last">{t("Najnovší posledný test")}</option><option value="count">{t("Počet meraní")}</option></select></div>
                  <div className="data-table participant-table"><div className="data-table-head"><span>{t("Participant ID")}</span><span>{user.role === "researcher" ? t("Profil účastníka") : t("Konto / rola")}</span><span>{t("Prvé meranie")}</span><span>{t("Posledné meranie")}</span><span>{t("Meraní")}</span><span>{t("Akcie")}</span></div>
                    {filteredParticipants().map((participant) => {
                      const rows = participantMeasurements(participant.id);
                      const first = rows.length ? rows[rows.length - 1].started_at : null;
                      const last = rows.length ? rows[0].started_at : null;
                      const account = adminAccounts.find((item) => item.participant_id === participant.id) || null;
                      return <div className="data-table-row" key={participant.id}>
                        <strong>{participant.participant_code}</strong>
                        <span>{account ? <><strong>{[account.first_name, account.last_name].filter(Boolean).join(" ") || account.username}</strong><small className="student-email">{account.email || account.username} · {account.effective_role}</small></> : <span className="muted">{user.role === "researcher" ? t("Osobný účet skrytý") : t("Manuálny účastník")}</span>}</span>
                        <span>{first ? formatDate(first) : "—"}</span>
                        <span>{last ? formatDate(last) : "—"}</span>
                        <span>{rows.length}</span>
                        <span className="row-actions">{accountManagementActions(account)}{participant && <><button className="quiet compact" onClick={() => void openParticipant(participant, "detail")}>{t("Detail")}</button><button className="quiet compact" onClick={() => void openParticipant(participant, "measurements")}>{t("Merania")}</button></>}</span>
                      </div>;
                    })}
                    {visibleAccountOnlyRows().map((account) => <div className="data-table-row" key={account.id}>
                      <strong>—</strong><span><strong>{[account.first_name, account.last_name].filter(Boolean).join(" ") || account.username}</strong><small className="student-email">{account.email || account.username}</small></span>
                      <span>—</span><span>—</span><span>—</span><span className="row-actions">{accountManagementActions(account)}<button className="quiet compact" onClick={() => setSelectedAccount(account)}>{t("Detail účtu")}</button></span>
                    </div>)}
                  </div>
                  {filteredParticipants().length === 0 && visibleAccountOnlyRows().length === 0 && <div className="empty-list"><h2>{t("Žiadni účastníci")}</h2><p className="muted">{t("Filteru nezodpovedá žiadny záznam.")}</p></div>}
                </section>
                {(user.role === "admin" || user.role === "superadmin") && <section className="participant-create-strip"><div><div className="eyebrow">{t("NOVÝ ÚČASTNÍK")}</div><strong>{t("Vytvoriť anonymné ID")}</strong></div><form className="inline-create-form" onSubmit={createParticipant}><input id="new-participant-code" value={participantCode} onChange={(event) => setParticipantCode(event.target.value.toUpperCase())} maxLength={5} pattern="[A-Za-z0-9]{5}" placeholder={t("ABCDE")} required /><button type="button" className="quiet compact" onClick={generateParticipantCode}>{t("Generovať")}</button><button type="submit" className="primary compact">{t("Vytvoriť")}</button></form>{participantMessage && <span className="notice">{participantMessage}</span>}</section>}
                {selectedParticipant && participantDialog && (() => {
                  const participant = selectedParticipant.participant;
                  const linkedAccount = adminAccounts.find((item) => item.participant_id === participant.id) || null;
                  const allRows = measurements.filter((item) => item.participant_id === participant.id && item.raw_sha256);
                  const rows = allRows.filter((item) => getMeasurementMode(item, tests) === resultMode);
                  const dates = allRows.map((item) => item.started_at).sort();
                  if (participantDialog === "detail") return <section className="browser-detail detail-modal-open participant-detail-modal">
                     <div className="detail-header"><div><div className="eyebrow">{t("DETAIL ÚČASTNÍKA")}</div><h2>{participant.participant_code}</h2></div><div className="detail-header-actions"><ModeSwitch value={resultMode} onChange={changeResultMode} /><button className="quiet compact" onClick={() => { setParticipantDialog(null); setSelectedMeasurementId(null); }}>{t("Zavrieť")}</button></div></div>
                     {accountMessage && <p className="notice">{accountMessage}</p>}

                     <section className="participant-detail-section">
                       <div className="participant-section-heading"><div><div className="eyebrow">{t("SÚHRN VÝSLEDKOV")}</div><h3>{resultMode === "SCOPE" ? "SCoPE" : "SimPLE"}</h3></div></div>
                       <AllMeasurementStats measurements={rows} mode={resultMode} />
                     </section>

                     <section className="participant-detail-section">
                       <div className="participant-section-heading"><div><div className="eyebrow">{t("HISTÓRIA")}</div><h3>{t("Posledných 5 meraní")}</h3></div><span className="muted">{rows.length} {t("spolu")}</span></div>
                       {rows.length ? <div className="data-table participant-history-table">
                         <div className="data-table-head"><span>{t("Test")}</span><span>{t("Dátum a čas")}</span><span>{t("Veľkosť súboru")}</span><span>{t("Stav")}</span><span>{t("Výsledok")}</span></div>
                         {[...rows].sort((left, right) => right.started_at.localeCompare(left.started_at)).slice(0, 5).map((measurement) => {
                           const hasResult = rows.some((item) => item.id === measurement.id);
                           return <div className="data-table-row" key={measurement.id}><strong>{measurement.test_type}</strong><span>{formatDateTime(measurement.started_at)}</span><span>{formatBytes(measurement.raw_size_bytes)}</span><span>{measurement.status}</span><span className="row-actions"><button className="quiet compact" disabled={!hasResult} onClick={() => { setSelectedMeasurementId(measurement.id); }}>{hasResult ? t("Otvoriť") : t("Bez výsledkov")}</button></span></div>;
                         })}
                       </div> : <div className="participant-empty-state">{t("Účastník zatiaľ nemá zaznamenané žiadne merania.")}</div>}
                     </section>

                     <section className="participant-detail-section">
                       <div className="participant-section-heading"><div><div className="eyebrow">{t("PROFIL")}</div><h3>{t("Údaje účastníka")}</h3></div></div>
                       <div className="participant-profile-columns">
                         <InfoTable rows={[
                           ["Participant ID", participant.participant_code],
                           [t("Stav účastníka"), participant.is_active ? t("Aktívny") : t("Neaktívny")],
                           [t("Vytvorený"), formatDate(participant.created_at)],
                           [t("Počet meraní"), rows.length],
                           [t("Prvé meranie"), dates.length ? formatDate(dates[0]) : "—"],
                           [t("Posledné meranie"), dates.length ? formatDate(dates[dates.length - 1]) : "—"],
                           [t("Prepojené konto"), linkedAccount ? [linkedAccount.first_name, linkedAccount.last_name].filter(Boolean).join(" ") || linkedAccount.username : t("Bez konta")],
                           [t("E-mail / rola"), linkedAccount ? `${linkedAccount.email || linkedAccount.username} · ${linkedAccount.effective_role}` : "—"],
                         ]} />
                         <InfoTable rows={[
                           [t("Dátum narodenia"), participant.birth_date ? formatDate(participant.birth_date) : t("Neuvedené")],
                           [t("Pohlavie"), profileLabel(participant.sex)],
                           [t("Dominantná ruka"), profileLabel(participant.dominant_hand)],
                           [t("Zraková korekcia"), profileLabel(participant.vision_correction)],
                           [t("Dioptrie ľavé / pravé"), `${participant.vision_diopters_left ?? "—"} / ${participant.vision_diopters_right ?? "—"} D`],
                           [t("Skúsenosť s pilotovaním"), profileLabel(participant.pilot_experience)],
                           [t("Letové hodiny"), profileLabel(participant.flight_hours_range)],
                           [t("Osvedčenie"), profileLabel(participant.pilot_certificate)],
                           [t("Typ UAV"), profileLabel(participant.primary_uav_type)],
                           [t("Simulátor"), profileLabel(participant.simulator_experience)],
                           [t("RC ovládanie"), profileLabel(participant.rc_experience)],
                           ["FPV", profileLabel(participant.fpv_experience)],
                           [t("Herný ovládač"), profileLabel(participant.game_controller_experience)],
                           [t("Video / počítačové hry"), profileLabel(participant.video_game_experience)],
                           [t("Sebahodnotenie zručností"), participant.self_rated_skill ?? t("Neuvedené")],
                         ]} />
                       </div>
                     </section>

                     {user?.role === "superadmin" && linkedAccount && linkedAccount.effective_role !== "superadmin" && <section className="account-management-panel">
                       <div><div className="eyebrow">{t("SPRÁVA KONTA")}</div><strong>{linkedAccount.email || linkedAccount.username}</strong><small>{t("Rola, prístup a údaje konta")}</small></div>
                       <div className="account-management-controls">
                         <label>{t("Rola")}<select value={linkedAccount.role} onChange={(event) => void changeAccountRole(linkedAccount, event.target.value)}><option value="student">{t("Študent")}</option><option value="researcher">{t("Researcher")}</option><option value="admin">{t("Admin")}</option></select></label>
                         <button className="quiet compact" onClick={() => void resetAccountPassword(linkedAccount)}>{t("Resetovať heslo")}</button>
                         <button className="quiet compact danger" onClick={() => void anonymizeAccount(linkedAccount)}>{t("Deaktivovať a anonymizovať konto")}</button>
                       </div>
                     </section>}
                     {user?.role === "superadmin" && (!linkedAccount || linkedAccount.effective_role !== "superadmin") && <div className="participant-purge-row"><p className="muted">{t("Úplné vymazanie odstráni konto, súhlasy, účastníka, merania aj archivované raw súbory.")}</p><button className="quiet compact danger" onClick={() => void permanentlyDeleteParticipant(participant, linkedAccount)}>{t("Trvalo vymazať všetko")}</button></div>}
                     {(user?.role === "admin" || user?.role === "superadmin") && <section className="participant-detail-section participant-edit-section"><div className="participant-section-heading"><div><div className="eyebrow">{t("EDITÁCIA")}</div><h3>{t("Upraviť údaje účastníka")}</h3></div></div><ParticipantProfileEditor participant={participant} csrfToken={user.csrf_token} onSaved={(updated) => { setParticipants((items) => items.map((item) => item.id === updated.id ? updated : item)); setSelectedParticipant((current) => current ? { ...current, participant: updated } : current); setAccountMessage(t("Profil účastníka bol uložený.")); }} /></section>}
                   </section>;
                   return <section className="browser-detail detail-modal-open participant-detail-modal">
                    <div className="detail-header"><div><div className="eyebrow">{t("MERANIA ÚČASTNÍKA")}</div><h2>{participant.participant_code}</h2></div><div className="detail-header-actions"><ModeSwitch value={resultMode} onChange={changeResultMode} /><button className="quiet compact" onClick={() => { setParticipantDialog(null); setSelectedMeasurementId(null); }}>{t("Zavrieť")}</button></div></div>
                    <p className="muted">{t("História")} {resultMode === "SCOPE" ? "SCoPE" : "SimPLE"} {t("meraní účastníka.")}</p>
                    <div className="data-table participant-history-table"><div className="data-table-head"><span>{t("Test")}</span><span>{t("Dátum a čas")}</span><span>{t("Veľkosť súboru")}</span><span>{t("Stav")}</span><span>{t("Akcia")}</span></div>{rows.map((measurement) => <div className="data-table-row" key={measurement.id}><strong>{measurement.test_type}</strong><span>{formatDateTime(measurement.started_at)}</span><span>{formatBytes(measurement.raw_size_bytes)}</span><span>{measurement.status}</span><button className="quiet compact row-actions" onClick={() => setSelectedMeasurementId(measurement.id)}>{t("Otvoriť výsledok")}</button></div>)}</div>
                    {rows.length === 0 && <p className="muted">{t("Pre tento režim zatiaľ nie sú synchronizované merania.")}</p>}
                  </section>;
                })()}
                {selectedParticipant && participantDialog && selectedMeasurementId && (() => { const selected = measurements.find((item) => item.id === selectedMeasurementId); return selected ? <div className="measurement-context-backdrop"><section className="measurement-context-window"><MeasurementDetailBody measurement={selected} tests={tests} onClose={() => setSelectedMeasurementId(null)} /></section></div> : null; })()}
              </>}
              {selectedAccount && <div className="backdrop" onMouseDown={() => setSelectedAccount(null)}><section className="login account-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
                <div className="eyebrow">{t("DETAIL KONTA")}</div><h2>{[selectedAccount.first_name, selectedAccount.last_name].filter(Boolean).join(" ") || selectedAccount.username}</h2>
                <p className="muted">{selectedAccount.email || selectedAccount.username} · {selectedAccount.effective_role}</p>
                {accountMessage && <p className="notice">{accountMessage}</p>}
                {user?.role === "superadmin" && selectedAccount.effective_role !== "superadmin" ? <>
                  <label>{t("Rola")}<select value={selectedAccount.role} onChange={(event) => void changeAccountRole(selectedAccount, event.target.value)}><option value="student">{t("Študent")}</option><option value="researcher">{t("Researcher")}</option><option value="admin">{t("Admin")}</option></select></label>
                  <div className="account-dialog-actions"><button className="quiet" onClick={() => void resetAccountPassword(selectedAccount)}>{t("Resetovať heslo")}</button><button className="quiet danger" onClick={() => void anonymizeAccount(selectedAccount)}>{t("Deaktivovať a anonymizovať")}</button><button className="quiet danger" onClick={() => void permanentlyDeleteStandaloneAccount(selectedAccount)}>{t("Trvalo vymazať konto")}</button><button className="primary" onClick={() => setSelectedAccount(null)}>{t("Zavrieť")}</button></div>
                </> : <div className="account-dialog-actions"><span className="role-label">{selectedAccount.effective_role}</span><button className="primary" onClick={() => setSelectedAccount(null)}>{t("Zavrieť")}</button></div>}
              </section></div>}
              {activeSection === "groups" && <>
                <section className="browser-panel">
                  <div className="browser-header"><div><div className="eyebrow">{t("DLHODOBÉ ŠTATISTIKY")}</div><h2>{t("Skupiny účastníkov")}</h2><p className="muted">{t("Vytváraj výskumné skupiny z pseudonymných ID a sleduj zmeny uložených metrík v čase alebo podľa testov.")}</p></div></div>
                  {groupMessage && <p className="notice">{groupMessage}</p>}
                  <div className="filters"><select value={selectedGroupId} onChange={(event) => { const id = event.target.value; setSelectedGroupId(id); setStatsParticipantId(""); const found = groups.find((item) => item.id === id); if (found) { setGroupName(found.name); setGroupDescription(found.description ?? ""); setGroupMemberIds(found.participant_ids); } else { setGroupName(""); setGroupDescription(""); setGroupMemberIds([]); } }}><option value="">{t("Nová skupina / vyber existujúcu")}</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} · {group.participant_ids.length}</option>)}</select><select value={statsParticipantId} onChange={(event) => { setStatsParticipantId(event.target.value); setSelectedGroupId(""); }}><option value="">{t("Alebo vyber jednotlivca")}</option>{participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.participant_code}</option>)}</select><select value={groupXAxis} onChange={(event) => setGroupXAxis(event.target.value as "date" | "test")}><option value="date">{t("Os X: dátum merania")}</option><option value="test">{t("Os X: typ testu")}</option></select></div>
                  <form className="measurement-form" onSubmit={saveParticipantGroup}><label>{t("Názov skupiny")}<input required maxLength={120} value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label><label>{t("Popis")}<input maxLength={500} value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} /></label><div className="group-members"><strong>{t("Členovia · Participant ID")}</strong>{participants.filter((item) => item.is_active).map((participant) => <label key={participant.id}><input type="checkbox" checked={groupMemberIds.includes(participant.id)} onChange={(event) => setGroupMemberIds((ids) => event.target.checked ? [...ids, participant.id] : ids.filter((id) => id !== participant.id))} /> {participant.participant_code}</label>)}</div><div className="actions"><button type="button" className="quiet" onClick={() => { setSelectedGroupId(""); setGroupName(""); setGroupDescription(""); setGroupMemberIds([]); }}>{t("Nová skupina")}</button><button className="primary" type="submit">{selectedGroupId ? t("Uložiť skupinu") : t("Vytvoriť skupinu")}</button></div></form>
                </section>
                {(selectedGroupId || statsParticipantId) && (() => {
                  const group = groups.find((item) => item.id === selectedGroupId);
                  const memberSet = new Set(group?.participant_ids ?? (statsParticipantId ? [statsParticipantId] : []));
                  const metricOptions = Array.from(new Set(measurements.filter((item) => memberSet.has(item.participant_id)).flatMap((item) => { const data = item.analysis_data ?? {}; const source = (data.metrics && typeof data.metrics === "object" ? data.metrics : data) as Record<string, unknown>; return Object.entries(source).filter(([, value]) => typeof value === "number" && Number.isFinite(value)).map(([key]) => key); }))).sort();
                  const metric = metricOptions.includes(groupMetric) ? groupMetric : metricOptions[0] ?? "";
                  const points = measurements.filter((item) => memberSet.has(item.participant_id)).map((item) => { const data = item.analysis_data ?? {}; const source = (data.metrics && typeof data.metrics === "object" ? data.metrics : data) as Record<string, unknown>; const value = source[metric]; return metric && typeof value === "number" && Number.isFinite(value) ? { date: item.started_at, test: item.test_type, value, participant: item.participant_id } : null; }).filter((item): item is { date: string; test: string; value: number; participant: string } => item !== null).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                  const buckets = new Map<string, { sum: number; n: number; date: string; label: string }>();
                  for (const point of points) { const label = groupXAxis === "date" ? formatDate(point.date) : point.test; const key = groupXAxis === "date" ? point.date.slice(0, 10) : point.test; const current = buckets.get(key) ?? { sum: 0, n: 0, date: point.date, label }; current.sum += point.value; current.n += 1; buckets.set(key, current); }
                  const series = Array.from(buckets.values()).sort((a, b) => groupXAxis === "date" ? a.date.localeCompare(b.date) : a.label.localeCompare(b.label));
                  const vals = series.map((item) => item.sum / item.n); const min = Math.min(...vals, 0); const max = Math.max(...vals, 1); const path = vals.map((value, index) => `${index ? "L" : "M"} ${40 + index * (560 / Math.max(1, vals.length - 1))} ${220 - ((value - min) / (max - min || 1)) * 180}`).join(" ");
                  const subject = group?.name ?? participants.find((item) => item.id === statsParticipantId)?.participant_code ?? "";
                  return <section className="browser-panel"><div className="browser-header"><div><div className="eyebrow">{t("TREND ·")}{subject}</div><h2>{t("Dlhodobý vývoj parametra")}</h2></div><select value={metric} onChange={(event) => setGroupMetric(event.target.value)}>{metricOptions.map((key) => <option key={key} value={key}>{key}</option>)}</select></div>{series.length ? <><div className="trend-chart"><svg viewBox="0 0 620 250" role="img" aria-label={t("Graf vývoja parametra")}>{[0, 1, 2, 3].map((i) => <line key={i} x1="40" x2="600" y1={40 + i * 60} y2={40 + i * 60} />)}<path d={path} />{vals.map((value, index) => <circle key={index} cx={40 + index * (560 / Math.max(1, vals.length - 1))} cy={220 - ((value - min) / (max - min || 1)) * 180} r="4" />)}</svg><div className="trend-axis-labels"><span>{series[0].label}</span><span>{series[series.length - 1].label}</span></div></div><div className="data-table trend-data-table"><div className="data-table-head"><span>{groupXAxis === "date" ? t("Dátum") : t("Test")}</span><span>{t("Priemer")}</span><span>{t("Počet meraní")}</span></div>{series.map((item) => <div className="data-table-row" key={`${item.label}-${item.date}`}><strong>{item.label}</strong><span>{(item.sum / item.n).toPrecision(5)}</span><span>{item.n}</span></div>)}</div></> : <p className="muted">{t("Pre členov tejto skupiny zatiaľ nie sú uložené číselné metriky.")}</p>}</section>;
                })()}
              </>}
              {activeSection === "tests" && <>
                <section className="browser-panel">
                  <div className="browser-header"><div><div className="eyebrow">{t("KATALÓG TESTOV")}</div><h2>{t("Testy a konfigurácie")}</h2><p className="muted">{t("Každá verzia testu je samostatná, nemenná konfigurácia pre THRUST.")}</p></div></div>
                  <div className="browser-toolbar"><select value={testModeFilter} onChange={(event) => setTestModeFilter(event.target.value as "ALL" | MeasurementMode)} aria-label={t("Režim testu")}><option value="ALL">{t("Všetky programy")}</option><option value="SCOPE">{t("SCoPE")}</option><option value="SIMPLE">{t("SimPLE")}</option></select><input placeholder={t("Hľadať kód, názov alebo profil…")} value={testSearch} onChange={(event) => setTestSearch(event.target.value)} /></div>
                  <div className="data-table test-table"><div className="data-table-head"><span>{t("Kód")}</span><span>{t("Názov")}</span><span>{t("Verzia")}</span><span>{t("Profil")}</span><span>{t("Stav / akcie")}</span></div>{filteredTests().map((test) => <div className="data-table-row" key={test.id}><strong className="test-code-cell"><ProgramWordmark mode={test.analysis_profile.toUpperCase().startsWith("SIMPLE") ? "SIMPLE" : "SCOPE"} compact />{test.test_code}</strong><span>{test.name}</span><span>{t("v")}{test.version}</span><span>{test.analysis_profile}</span><span className="row-actions"><span>{test.status}</span><button className="quiet compact" onClick={() => setSelectedTestId(test.id)}>{t("Otvoriť")}</button><button className="quiet compact" onClick={() => setEditingTestId(test.id)}>{t("Editovať")}</button>{user.role === "superadmin" && <button className="quiet compact danger" onClick={() => void deleteTestVersion(test)}>{t("Zmazať")}</button>}</span></div>)}</div>
                  {filteredTests().length === 0 && <div className="empty-list"><h2>{t("Žiadne testy")}</h2><p className="muted">{t("Filteru nezodpovedá žiadna verzia testu.")}</p></div>}
                </section>
                {selectedTestId && (() => { const selected = tests.find((test) => test.id === selectedTestId); return selected ? <section className={selectedTestId ? "browser-detail detail-modal-open" : "browser-detail detail-modal-closed"}><div className="detail-header"><div><div className="eyebrow">{t("KONFIGURÁCIA TESTU")}</div><h2>{selected.name} {t("· v")}{selected.version}</h2></div><button className="quiet compact" onClick={() => setSelectedTestId(null)}>{t("Zavrieť detail")}</button></div><div className="detail-grid"><div><span>{t("Kód")}</span><strong>{selected.test_code}</strong></div><div><span>{t("Profil")}</span><strong>{selected.analysis_profile}</strong></div><div><span>{t("Stav")}</span><strong>{selected.status}</strong></div><div><span>{t("Aktívny")}</span><strong>{selected.is_active ? t("Áno") : t("Nie")}</strong></div></div><pre className="config-preview">{JSON.stringify(selected.configuration, null, 2)}</pre></section> : null })()}
                <TestCreator onCreated={(test) => { setTests((current) => [...current, test]); setEditingTestId(test.id); }} />
                {editingTestId && (() => { const editing = tests.find((test) => test.id === editingTestId); if (!editing) return null; const onSaved = (saved: TestDefinition) => { setTests((current) => current.map((item) => item.id === saved.id ? saved : item)); setEditingTestId(null); }; return editing.analysis_profile.toUpperCase().startsWith("SIMPLE") ? <SimpleTestEditor test={editing} csrfToken={user.csrf_token} onClose={() => setEditingTestId(null)} onSaved={onSaved} /> : <TestEditor test={editing} onClose={() => setEditingTestId(null)} onSaved={onSaved} />; })()}
              </>}
              {activeSection === "measurements" && <>
                <div className="workbench">
                  <section className="panel workbench-list">
                    <div className="workbench-header"><div><div className="eyebrow">{t("ARCHÍV MERANÍ")}</div><h2>{t("Synchronizované merania")}</h2></div><button className="primary compact" onClick={() => setManualUploadOpen(true)}>{t("Núdzový upload")}</button></div>
                    <div className="filters">
                      <ModeSwitch value={resultMode} onChange={changeResultMode} />
                      <input placeholder={t("Hľadať ID, test alebo súbor…")} value={measurementSearch} onChange={(event) => setMeasurementSearch(event.target.value)} />
                      <select value={measurementParticipantFilter} onChange={(event) => setMeasurementParticipantFilter(event.target.value)}><option value="">{t("Všetci účastníci")}</option>{participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.participant_code}</option>)}</select>
                      <select value={measurementTestFilter} onChange={(event) => setMeasurementTestFilter(event.target.value)}><option value="">{t("Všetky testy")}</option>{tests.filter((test) => test.analysis_profile.toUpperCase().startsWith(resultMode)).map((test) => <option key={test.id} value={test.id}>{test.name} {t("· v")}{test.version}</option>)}</select>
                      <input type="date" value={measurementDateFrom} onChange={(event) => setMeasurementDateFrom(event.target.value)} aria-label={t("Od dátumu")} />
                      <input type="date" value={measurementDateTo} onChange={(event) => setMeasurementDateTo(event.target.value)} aria-label={t("Do dátumu")} />
                    </div>
                    <div className="selection-toolbar"><label><input type="checkbox" checked={filteredMeasurements().length > 0 && filteredMeasurements().every((item) => selectedMeasurementIds.includes(item.id))} onChange={() => setSelectedMeasurementIds(filteredMeasurements().every((item) => selectedMeasurementIds.includes(item.id)) ? [] : filteredMeasurements().map((item) => item.id))} /> {t("Vybrať všetky")}</label>{user.role === "superadmin" && <button className="quiet compact danger" disabled={!selectedMeasurementIds.length} onClick={deleteSelectedMeasurements}>{t("Odstrániť vybrané")}</button>}</div>
                    <div className="measurement-list">{filteredMeasurements().map((measurement) => <button className={selectedMeasurementId === measurement.id ? "measurement-item selected" : "measurement-item"} key={measurement.id} onClick={() => setSelectedMeasurementId(measurement.id)}><input type="checkbox" checked={selectedMeasurementIds.includes(measurement.id)} onChange={(event) => { event.stopPropagation(); toggleMeasurementSelection(measurement.id); }} onClick={(event) => event.stopPropagation()} /><span className="measurement-main"><strong>{participantCodeFor(measurement.participant_id)}</strong><span>{formatDateTime(measurement.started_at)} · {measurement.test_type} · {measurement.source_file_name ?? "raw"}</span><small>{formatBytes(measurement.raw_size_bytes)} {t("na serveri")}</small></span><span className="measurement-status">{measurement.raw_sha256 ? t("Archivované") : t("Bez raw dát")}</span></button>)}</div>
                    {filteredMeasurements().length === 0 && <p className="muted empty-list">{t("Filteru nezodpovedajú žiadne archivované merania.")}</p>}
                  </section>
                  <section className={selectedMeasurementId ? "panel workbench-detail detail-modal-open" : "panel workbench-detail detail-modal-closed"}>
                    {(() => { const selected = measurements.find((item) => item.id === selectedMeasurementId); return selected ? <MeasurementDetailBody measurement={selected} tests={tests} onClose={() => setSelectedMeasurementId(null)} /> : <div className="empty-list"><h2>{t("Vyber meranie")}</h2><p className="muted">{t("V ľavom paneli vyber meranie, ktoré chceš preskúmať.")}</p></div>; })()}
                  </section>
                </div>
                {manualUploadOpen && <div className="backdrop" onMouseDown={() => setManualUploadOpen(false)}><section className="login upload-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="eyebrow">{t("NÚDZOVÁ SYNCHRONIZÁCIA")}</div><h2>{t("Manuálne nahrať dátový súbor")}</h2><p className="muted">{t("Použi iba vtedy, ak upload počas sessionu zlyhal.")}</p><form className="measurement-form modal-form" onSubmit={async (event) => { await uploadMeasurement(event); setManualUploadOpen(false); }}><label>{t("Účastník")}<select name="participant_id" required><option value="">{t("Vyber účastníka")}</option>{participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.participant_code}</option>)}</select></label><label>{t("Test")}<select name="test_definition_id" required><option value="">{t("Vyber test")}</option>{tests.filter((test) => test.is_active && test.analysis_profile.toUpperCase().startsWith(resultMode)).map((test) => <option key={test.id} value={test.id}>{test.name} {t("· v")}{test.version}</option>)}</select></label><label>{t("Dátum a čas")}<input name="started_at" type="datetime-local" step="60" required /></label><label>{t("Raw log · SCoPE alebo SimPLE")}<input name="raw_file" type="file" accept=".tsv,.tsv.gz,.gz,.txt,text/plain,application/gzip" required /></label><label>{t("Analýza merania · JSON (nepovinné)")}<input name="analysis_file" type="file" accept=".json,application/json" /></label><div className="actions"><button type="button" className="quiet" onClick={() => setManualUploadOpen(false)}>{t("Zrušiť")}</button><button className="primary" type="submit">{t("Nahrať dáta")}</button></div></form>{uploadMessage && <p className="notice">{uploadMessage}</p>}</section></div>}
              </>}

            </section>
          </div>
        </div>
      ) : (
        <>
          <header><div className="brand"><span className="mark">{t("T")}</span><div><strong>{t("THRUST")}</strong><small>{t("UAV Human Performance Research")}</small></div></div><div className="actions"><LanguageSwitcher /><button className="quiet" onClick={openRegistration}>{t("Registrácia")}</button><button className="quiet" onClick={() => setLoginOpen(true)}>{t("Prihlásenie")}</button></div></header>
          <section className="public">
          <div className="eyebrow">{t("TESTING HUB FOR RESEARCH IN UAV SIMULATION AND TRAINING")}</div>
          <h1>{t("Merateľný pohľad na výkon pilotov UAV.")}</h1>
          <p className="lead">{t("THRUST spája štandardizované experimenty, lokálne analytické modely a anonymizované skupinové výsledky.")}</p>
          <div className="stats">
            <Metric label={t("Účastníci")} value={metrics?.participant_count ?? "—"} />
            <Metric label={t("Merania")} value={metrics?.measurement_count ?? "—"} />
            <Metric label={t("Aktívne testy")} value="SCoPE" />
          </div>
          {metrics && !metrics.publishable && <p className="privacy">{t("Verejné štatistiky sa zobrazia po dosiahnutí minimálnej skupiny")} {metrics.minimum_group_size} {t("účastníkov.")}</p>}
          </section>
        </>
      )}

      {loginOpen && <div className="backdrop" onMouseDown={() => setLoginOpen(false)}><form className="login" onSubmit={login} onMouseDown={(e) => e.stopPropagation()}><div className="eyebrow">{t("CHRÁNENÝ PRÍSTUP")}</div><h2>{t("Prihlásenie")}</h2><label>{t("E-mail, Participant ID alebo username")}<input name="identifier" autoComplete="username" required autoFocus /></label><label>{t("Heslo")}<input name="password" type="password" autoComplete="current-password" required /></label>{error && <p className="error">{error}</p>}<div className="actions"><button type="button" className="quiet" onClick={() => setLoginOpen(false)}>{t("Zrušiť")}</button><button type="submit" className="primary">{t("Prihlásiť")}</button></div></form></div>}
      {consentDialog && consentTexts && <ConsentTextDialog kind={consentDialog} document={activeConsentDocument || consentTexts[consentDialog]} onClose={() => { setConsentDialog(null); setActiveConsentDocument(null); }} />}
    </main>
  );
}


function RegistrationPage({ onSubmit, onBack, onLogin, onResearcherRegister, error, consentTexts, onOpenConsent }: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
  onLogin: () => void;
  onResearcherRegister: () => void;
  error: string;
  consentTexts: ConsentDocuments | null;
  onOpenConsent: (kind: ConsentKind) => void;
}) {
  return <main className="registration-page">
    <header className="registration-header">
      <div className="brand"><span className="mark">{t("T")}</span><div><strong>{t("THRUST")}</strong><small>{t("UAV Human Performance Research")}</small></div></div>
      <div className="actions"><LanguageSwitcher /><button type="button" className="quiet" onClick={onBack}>{t("Späť na hlavnú stránku")}</button><button type="button" className="quiet" onClick={onResearcherRegister}>{t("Registrácia výskumníka")}</button><button type="button" className="quiet" onClick={onLogin}>{t("Už mám účet · Prihlásiť sa")}</button></div>
    </header>
    <section className="registration-content">
      <div className="registration-heading"><div className="eyebrow">{t("NOVÝ ŠTUDENTSKÝ ÚČET")}</div><h1>{t("Vytvor si účet")}</h1><p className="lead">{t("Po registrácii dostaneš svoje Participant ID. Výskumník ho použije pri meraní v lokálnom THRUSTe.")}</p></div>
      <form className="registration-form" onSubmit={onSubmit}>
        <section className="registration-card registration-account-fields">
          <div className="eyebrow">{t("PRIHLASOVACIE ÚDAJE")}</div><h2>{t("Účet")}</h2><p className="muted">{t("Účet má na začiatku rolu študenta. Oprávnenia môže zmeniť iba superadmin.")}</p>
          <div className="form-grid"><label>{t("Meno")}<input name="first_name" autoComplete="given-name" required /></label><label>{t("Priezvisko")}<input name="last_name" autoComplete="family-name" required /></label></div>
          <label>{t("E-mail")}<input name="email" type="email" autoComplete="email" required /></label>
          <div className="form-grid"><label>{t("Heslo")}<input name="password" type="password" minLength={10} autoComplete="new-password" required /></label><label>{t("Zopakovať heslo")}<input name="password_confirmation" type="password" minLength={10} autoComplete="new-password" required /></label></div>
        </section>
        <section className="registration-card profile-questionnaire">
          <div><div className="eyebrow">{t("PROFIL PILOTA · NEPOVINNÉ")}</div><h2>{t("Skúsenosti a zručnosti")}</h2><p className="muted">{t("Všetky odpovede sú nepovinné. Použijú sa na štatistické vyhodnotenie; môžeš ich preskočiť.")}</p></div>
          <div className="form-grid"><label>{t("Dátum narodenia")}<input name="birth_date" type="date" autoComplete="bday" /></label><label>{t("Pohlavie")}<select name="sex" defaultValue=""><option value="">{t("Nevyplnené")}</option><option value="female">{t("Žena")}</option><option value="male">{t("Muž")}</option><option value="intersex">{t("Intersex")}</option><option value="other">{t("Iné")}</option><option value="prefer_not_to_say">{t("Nechcem uviesť")}</option></select></label></div>
          <div className="form-grid"><label>{t("Dominantná ruka")}<select name="dominant_hand" defaultValue=""><option value="">{t("Nevyplnené")}</option><option value="right">{t("Pravá")}</option><option value="left">{t("Ľavá")}</option><option value="both">{t("Obe ruky")}</option><option value="prefer_not_to_say">{t("Nechcem uviesť")}</option></select></label><label>{t("Zraková korekcia")}<select name="vision_correction" defaultValue=""><option value="">{t("Nevyplnené")}</option><option value="none">{t("Bez korekcie")}</option><option value="glasses">{t("Okuliare")}</option><option value="contact_lenses">{t("Kontaktné šošovky")}</option><option value="both">{t("Okuliare aj šošovky")}</option><option value="other">{t("Iná korekcia")}</option><option value="prefer_not_to_say">{t("Nechcem uviesť")}</option></select></label></div>
          <div><span className="muted">{t("Približné dioptrie, nepovinné (D)")}</span><div className="form-grid"><label>{t("Ľavé oko")}<input name="vision_diopters_left" type="number" min="-30" max="30" step="0.25" /></label><label>{t("Pravé oko")}<input name="vision_diopters_right" type="number" min="-30" max="30" step="0.25" /></label></div></div>
          <div className="form-grid"><label>{t("Skúsenosť s pilotovaním dronu")}<select name="pilot_experience" defaultValue=""><option value="">{t("Nevyplnené")}</option><option value="none">{t("Žiadna")}</option><option value="under_1_year">{t("Menej ako 1 rok")}</option><option value="1_3_years">{t("1–3 roky")}</option><option value="3_5_years">{t("3–5 rokov")}</option><option value="over_5_years">{t("Viac ako 5 rokov")}</option></select></label><label>{t("Odhadovaný počet letových hodín")}<select name="flight_hours_range" defaultValue=""><option value="">{t("Nevyplnené")}</option><option value="0">0</option><option value="under_10">{t("Menej ako 10")}</option><option value="10_50">10–50</option><option value="51_200">51–200</option><option value="201_500">201–500</option><option value="over_500">{t("Viac ako 500")}</option></select></label></div>
          <div className="form-grid"><label>{t("Osvedčenie / licencia")}<select name="pilot_certificate" defaultValue=""><option value="">{t("Nevyplnené")}</option><option value="none">{t("Žiadne")}</option><option value="a1_a3">{t("A1/A3")}</option><option value="a2">{t("A2")}</option><option value="sts">{t("STS")}</option><option value="other">{t("Iné")}</option></select></label><label>{t("Najčastejší typ UAV")}<select name="primary_uav_type" defaultValue=""><option value="">{t("Nevyplnené")}</option><option value="multirotor">{t("Multikoptéra")}</option><option value="fixed_wing">{t("Pevné krídlo")}</option><option value="helicopter">{t("Vrtuľník")}</option><option value="vtol">{t("VTOL")}</option><option value="other">{t("Iný / neviem")}</option></select></label></div>
          <div className="form-grid"><label>{t("Skúsenosť s leteckým simulátorom")}<select name="simulator_experience" defaultValue=""><option value="">{t("Nevyplnené")}</option><option value="none">{t("Žiadna")}</option><option value="under_10">{t("Menej ako 10 hodín")}</option><option value="10_50">{t("10–50 hodín")}</option><option value="51_200">{t("51–200 hodín")}</option><option value="over_200">{t("Viac ako 200 hodín")}</option></select></label><label>{t("Skúsenosť s RC ovládaním")}<select name="rc_experience" defaultValue=""><option value="">{t("Nevyplnené")}</option><option value="none">{t("Žiadna")}</option><option value="under_1_year">{t("Menej ako 1 rok")}</option><option value="1_3_years">{t("1–3 roky")}</option><option value="3_5_years">{t("3–5 rokov")}</option><option value="over_5_years">{t("Viac ako 5 rokov")}</option></select></label></div>
          <div className="form-grid"><label>{t("Skúsenosť s FPV")}<select name="fpv_experience" defaultValue=""><option value="">{t("Nevyplnené")}</option><option value="none">{t("Žiadna")}</option><option value="under_1_year">{t("Menej ako 1 rok")}</option><option value="1_3_years">{t("1–3 roky")}</option><option value="3_5_years">{t("3–5 rokov")}</option><option value="over_5_years">{t("Viac ako 5 rokov")}</option></select></label><label>{t("Skúsenosť s gamepadom / herným ovládačom")}<select name="game_controller_experience" defaultValue=""><option value="">{t("Nevyplnené")}</option><option value="none">{t("Žiadna")}</option><option value="under_1_year">{t("Menej ako 1 rok")}</option><option value="1_3_years">{t("1–3 roky")}</option><option value="3_5_years">{t("3–5 rokov")}</option><option value="over_5_years">{t("Viac ako 5 rokov")}</option></select></label></div>
          <div className="form-grid"><label>{t("Video / počítačové hry (hodiny za týždeň)")}<select name="video_game_experience" defaultValue=""><option value="">{t("Nevyplnené")}</option><option value="none">{t("Nikdy")}</option><option value="under_2">{t("Menej ako 2")}</option><option value="2_5">2–5</option><option value="6_10">6–10</option><option value="over_10">{t("Viac ako 10")}</option></select></label><label>{t("Sebahodnotenie pilotných zručností")}<select name="self_rated_skill" defaultValue=""><option value="">{t("Nevyplnené")}</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></label></div>
        </section>
        <section className="registration-card registration-consents">
          <div className="eyebrow">{t("SÚHLASY A DOKONČENIE")}</div>
          <label className="consent"><input name="research_consent" type="checkbox" required /> <span>{t("Súhlasím s použitím pseudonymizovaných údajov na výskumné účely.")} <a href="#consent-research" onClick={(event) => { event.preventDefault(); onOpenConsent("research"); }}>{t("Zobraziť text výskumného súhlasu")}</a></span></label>
          <label className="consent"><input name="gdpr_consent" type="checkbox" required /> <span>{t("Súhlasím so spracovaním osobných údajov pre vytvorenie a správu účtu.")} <a href="#consent-gdpr" onClick={(event) => { event.preventDefault(); onOpenConsent("gdpr"); }}>{t("Zobraziť informácie a GDPR súhlas")}</a></span></label>
          {error && <p className="error">{error}</p>}
          <div className="registration-actions"><span className="muted">{t("Profilové otázky sú nepovinné. Oba súhlasy sú potrebné na registráciu.")}</span><button type="submit" className="primary" disabled={!consentTexts}>{t("Vytvoriť účet")}</button></div>
        </section>
      </form>
    </section>
  </main>;
}

type NormalizedChannel = { mean?: number[]; median?: number[]; std?: number[]; metrics?: Record<string, number | null> };
type NormalizedResponse = { time_s?: number[]; channels?: Record<string, NormalizedChannel> };

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


function AllMeasurementStats({ measurements, mode }: { measurements: Measurement[]; mode: MeasurementMode }) {
  if (mode === "SIMPLE") {
    const analyzed = measurements.filter((item) => item.analysis_data?.analysis_type === "SIMPLE_2D_FLIGHT");
    const average = (key: string) => {
      const values = analyzed.map((item) => (item.analysis_data?.metrics as Record<string, unknown> | undefined)?.[key])
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    };
    const error = average("simple_mean_target_error_m");
    const zone = average("simple_in_zone_fraction");
    const duration = average("simple_duration_s");
    const resets = average("simple_reset_count");
    return <div className="participant-statistics">
      <div className="participant-stat-grid">
        <article><span>{t("Merania SimPLE")}</span><strong>{measurements.length}</strong></article>
        <article><span>{t("S analýzou letu")}</span><strong>{analyzed.length}</strong></article>
        <article><span>{t("Priemerná chyba cieľa")}</span><strong>{error === null ? "—" : error.toFixed(2) + " m"}</strong></article>
        <article><span>{t("Čas v cieľovej zóne")}</span><strong>{zone === null ? "—" : (zone * 100).toFixed(1) + " %"}</strong></article>
        <article><span>{t("Priemerné trvanie")}</span><strong>{duration === null ? "—" : duration.toFixed(1) + " s"}</strong></article>
        <article><span>{t("Priemerné resety")}</span><strong>{resets === null ? "—" : resets.toFixed(1)}</strong></article>
      </div>
      {analyzed.length === 0 && <div className="participant-empty-state">{measurements.length ? t("SimPLE logy zatiaľ nemajú nahranú lokálnu analýzu.") : t("Štatistiky sa zobrazia po prvom meraní SimPLE.")}</div>}
    </div>;
  }
  const completed = measurements.filter((item) => item.status === "completed" || item.status === "recorded").length;
  const testTypes = new Set(measurements.map((item) => item.test_type)).size;
  const analyzed = measurements.filter((item) => Boolean(item.analysis_data?.normalized_step_response)).length;
  const durations = measurements.map((item) => item.analysis_data?.duration_s).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const averageDuration = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null;
  const aggregate = RESPONSE_CHANNELS.map((axis) => {
    const values = measurements.flatMap((item) => {
      const response = item.analysis_data?.normalized_step_response as NormalizedResponse | undefined;
      const channel = response?.channels?.[axis];
      return channel ? [metricsFor(channel, response?.time_s ?? [])] : [];
    });
    const average = (key: keyof StepMetrics) => {
      const numbers = values.map((value) => value[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
    };
    return { axis, count: values.length, reaction: average("reaction_s"), rise: average("rise_s"), overshoot: average("overshoot_pct"), settling: average("settling_s"), error: average("steady_state_error_pct"), rmse: average("rmse"), std: average("mean_std") };
  }).filter((item) => item.count > 0);

  return <div className="participant-statistics">
    <div className="participant-stat-grid">
      <article><span>{t("Merania spolu")}</span><strong>{measurements.length}</strong></article>
      <article><span>{t("Dokončené / zaznamenané")}</span><strong>{completed}</strong></article>
      <article><span>{t("Typy testov")}</span><strong>{testTypes}</strong></article>
      <article><span>{t("S vyhodnotením odozvy")}</span><strong>{analyzed}</strong></article>
      <article><span>{t("Priemerné trvanie")}</span><strong>{averageDuration === null ? "—" : `${averageDuration.toFixed(2)} s`}</strong></article>
    </div>
    {measurements.length === 0
      ? <div className="participant-empty-state">{t("Štatistiky sa zobrazia po prvom meraní.")}</div>
      : aggregate.length === 0
        ? <div className="participant-empty-state">{t("Merania sú uložené, ale neobsahujú vyhodnotenie normalizovanej odozvy.")}</div>
        : <div className="participant-aggregate-table">
          <div className="metrics-head"><span>{t("Osa")}</span><span>{t("Meraní")}</span><span>{t("Oneskorenie")}</span><span>{t("Náběh 10–90 %")}</span><span>{t("Overshoot")}</span><span>{t("Ustálenie")}</span><span>{t("Chyba")}</span><span>{t("RMSE")}</span><span>{t("Priem. SD")}</span></div>
          {aggregate.map((item) => <div className="metrics-row" key={item.axis}><strong style={{ color: RESPONSE_COLORS[item.axis] }}>{item.axis}</strong><span>{item.count}</span><span>{formatMetric(item.reaction, " s")}</span><span>{formatMetric(item.rise, " s")}</span><span>{formatMetric(item.overshoot, " %")}</span><span>{formatMetric(item.settling, " s")}</span><span>{formatMetric(item.error, " %")}</span><span>{formatMetric(item.rmse)}</span><span>{formatMetric(item.std)}</span></div>)}
        </div>}
  </div>;
}

function ResponseMetrics({ data }: { data: unknown }) {
  const response = data as NormalizedResponse | null;
  const time = response?.time_s ?? [];
  const available = RESPONSE_CHANNELS.filter((name) => response?.channels?.[name]?.mean?.length);
  if (!available.length) return null;
  return <section className="metrics-summary"><div className="eyebrow">{t("VYPOČÍTANÉ UKAZOVATELE")}</div><p className="muted metrics-note">{t("Odhady zo znormalizovanej priemernej odozvy; presné modelové parametre budú doplnené lokálnym THRUST-compute.")}</p><div className="metrics-table"><div className="metrics-head"><span>{t("Osa")}</span><span>{t("Oneskorenie")}</span><span>{t("Náběh 10–90 %")}</span><span>{t("Overshoot")}</span><span>{t("Ustálenie")}</span><span>{t("Chyba")}</span><span>{t("RMSE")}</span><span>{t("Priem. SD")}</span></div>{available.map((name) => { const m = metricsFor(response?.channels?.[name], time); return <div className="metrics-row" key={name}><strong style={{ color: RESPONSE_COLORS[name] }}>{name}</strong><span>{formatMetric(m.reaction_s, " s")}</span><span>{formatMetric(m.rise_s, " s")}</span><span>{formatMetric(m.overshoot_pct, " %")}</span><span>{formatMetric(m.settling_s, " s")}</span><span>{formatMetric(m.steady_state_error_pct, " %")}</span><span>{formatMetric(m.rmse)}</span><span>{formatMetric(m.mean_std)}</span></div>; })}</div></section>;
}

type SimpleTraceChannel = { mean?: number[]; time_s?: number[] };

function SimpleTrace({ name, channel, color }: { name: string; channel?: SimpleTraceChannel; color: string }) {
  const values = (channel?.mean ?? []).map(Number).filter(Number.isFinite);
  const sourceTime = (channel?.time_s ?? []).map(Number);
  const time = values.map((_, index) => Number.isFinite(sourceTime[index]) ? sourceTime[index] : index);
  if (values.length < 2) return <div className="chart-empty">{t("Pre os")} {name.toUpperCase()} {t("nie je dosť dát na graf odozvy.")}</div>;
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const left = 42, right = 474, top = 20, bottom = 172;
  const x = (index: number) => left + (index / Math.max(1, values.length - 1)) * (right - left);
  const y = (value: number) => bottom - ((value - min) / Math.max(0.001, max - min)) * (bottom - top);
  const points = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const maxTime = time[time.length - 1] || 0;
  return <section className="simple-trace"><div className="simple-trace-title"><strong style={{ color }}>{name.toUpperCase()} {t("· cieľ → poloha")}</strong><span>{maxTime.toFixed(1)} {t("s")}</span></div><svg viewBox="0 0 500 210" role="img" aria-label={`SimPLE odozva osi ${name.toUpperCase()}`}><g className="plot-grid"><line x1={left} x2={right} y1={top} y2={top}/><line x1={left} x2={right} y1={(top + bottom) / 2} y2={(top + bottom) / 2}/><line x1={left} x2={right} y1={bottom} y2={bottom}/><line x1={left} x2={left} y1={top} y2={bottom}/><line x1={(left + right) / 2} x2={(left + right) / 2} y1={top} y2={bottom}/><line x1={right} x2={right} y1={top} y2={bottom}/></g><line x1={left} x2={right} y1={y(1)} y2={y(1)} className="chart-zero"/><polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/><text x={left} y="198" className="plot-axis-label">{t("0 s")}</text><text x={right} y="198" textAnchor="end" className="plot-axis-label">{maxTime.toFixed(1)} {t("s")}</text><text x="10" y={top + 4} className="plot-axis-label">{max.toFixed(1)}</text><text x="10" y={bottom} className="plot-axis-label">{min.toFixed(1)}</text></svg></section>;
}

function SimpleAnalysisView({ analysis }: { analysis: Record<string, unknown> }) {
  if (!analysis.metrics || typeof analysis.metrics !== "object" || !analysis.step_response) {
    return <section className="simple-analysis-view"><div className="eyebrow">{t("SIMULOVANÝ LET")}</div><h3>{t("Analýza SimPLE nie je dostupná")}</h3><p className="muted">{t("K tomuto meraniu je uložený iba raw log. Pri núdzovom nahratí prilož aj súbor analýzy JSON vytvorený lokálnym THRUSTom.")}</p></section>;
  }
  const rawMetrics = analysis.metrics && typeof analysis.metrics === "object" ? analysis.metrics as Record<string, unknown> : {};
  const response = analysis.step_response && typeof analysis.step_response === "object" ? analysis.step_response as { channels?: Record<string, SimpleTraceChannel> } : {};
  const metrics: [string, string, string][] = [
    [t("Akcie"), "simple_action_count", ""],
    [t("Priemerná chyba cieľa"), "simple_mean_target_error_m", " m"],
    [t("Medián chyby cieľa"), "simple_median_target_error_m", " m"],
    [t("RMS chyba cieľa"), "simple_rms_target_error_m", " m"],
    [t("Čas v cieľovej zóne"), "simple_in_zone_fraction", "%"],
    [t("Reset polohy"), "simple_reset_count", ""],
    [t("Vzorkovacia frekvencia"), "simple_sampling_hz", " Hz"],
    [t("Trvanie"), "simple_duration_s", " s"],
  ];
  const display = (key: string, suffix: string) => { const value = rawMetrics[key]; if (typeof value !== "number" || !Number.isFinite(value)) return "—"; const scaled = key === "simple_in_zone_fraction" ? value * 100 : value; return `${scaled.toFixed(key === "simple_action_count" || key === "simple_reset_count" ? 0 : 2)}${suffix}`; };
  return <section className="simple-analysis-view"><header className="simple-analysis-heading"><div><div className="eyebrow">{t("SIMULOVANÝ LET")}</div><h3>{t("Výsledky SimPLE")}</h3></div><span className="simple-analysis-version">{t("Analýza")} {String(analysis.algorithm_version ?? "v1")}</span></header>{analysis.algorithm_version === "1.0.0" && <p className="notice">{t("Toto meranie používa staršie vyhodnotenie; počty akcií, resetov a čas v zóne môžu byť neúplné.")}</p>}<div className="simple-metric-grid">{metrics.map(([label, key, suffix]) => <article className="simple-metric-card" key={key}><span>{label}</span><strong>{display(key, suffix)}</strong></article>)}</div><div className="simple-trace-grid"><SimpleTrace name="x" channel={response.channels?.x} color="#45d5ff"/><SimpleTrace name="y" channel={response.channels?.y} color="#ff6878"/></div></section>;
}

function ChartPlot({ name, channel, time, min, max, expanded }: { name: string; channel: NormalizedChannel; time: number[]; min: number; max: number; expanded?: boolean }) {
  const mean = channel.mean?.map(Number) ?? [];
  const median = channel.median?.map(Number) ?? [];
  const std = channel.std?.map(Number) ?? [];
  const count = Math.min(time.length, mean.length);
  const width = expanded ? 900 : 280;
  const height = expanded ? 500 : 200;
  const left = expanded ? 82 : 42;
  const right = expanded ? 860 : 266;
  const top = expanded ? 34 : 18;
  const bottom = expanded ? 420 : 164;
  const x = (index: number) => left + (index / Math.max(1, count - 1)) * (right - left);
  const y = (value: number) => bottom - ((value - min) / Math.max(.001, max - min)) * (bottom - top);
  const pointString = (values: number[]) => values.slice(0, count).map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const upper = mean.slice(0, count).map((value, index) => `${x(index).toFixed(1)},${y(value + (std[index] || 0)).toFixed(1)}`);
  const lower = mean.slice(0, count).map((value, index) => `${x(index).toFixed(1)},${y(value - (std[index] || 0)).toFixed(1)}`).reverse();
  const fractions = expanded ? [0, .25, .5, .75, 1] : [0, .5, 1];
  const yValues = fractions.map((fraction) => min + fraction * (max - min));
  return <svg className={expanded ? "plot-svg plot-svg-large" : "plot-svg"} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={tf("Normalizovaná odozva osi {0}", name)}><g className="plot-grid">{yValues.map((value) => <line key={`h${value}`} x1={left} x2={right} y1={y(value)} y2={y(value)} />)}{fractions.map((fraction) => <line key={`v${fraction}`} x1={left + fraction * (right - left)} x2={left + fraction * (right - left)} y1={top} y2={bottom} />)}</g><line x1={left} y1={bottom} x2={right} y2={bottom} className="chart-axis" /><line x1={left} y1={top} x2={left} y2={bottom} className="chart-axis" /><line x1={left} y1={y(0)} x2={right} y2={y(0)} className="chart-zero" /><polygon points={[...upper, ...lower].join(" ")} fill={RESPONSE_COLORS[name]} opacity={expanded ? ".2" : ".16"} /><polyline points={pointString(mean)} fill="none" stroke={RESPONSE_COLORS[name]} strokeWidth={expanded ? "3" : "2"} /><polyline points={pointString(median)} fill="none" stroke={RESPONSE_COLORS[name]} strokeWidth={expanded ? "2" : "1.5"} strokeDasharray="6 4" opacity=".9" />{yValues.map((value) => <text key={`yl${value}`} x={left - 8} y={y(value) + 3} textAnchor="end" className="plot-tick">{value.toFixed(2)}</text>)}<text x={left} y={bottom + 20} className="plot-tick">0.00</text><text x={(left + right) / 2} y={bottom + 20} textAnchor="middle" className="plot-tick">{(time[Math.floor(Math.max(0, count - 1) / 2)] ?? 0).toFixed(2)}</text><text x={right} y={bottom + 20} textAnchor="end" className="plot-tick">{(time[count - 1] ?? 0).toFixed(2)} {t("s")}</text><text x={(left + right) / 2 - 22} y={height - 6} className="plot-axis-label">{t("Čas (s)")}</text><text x={expanded ? 18 : 11} y={(top + bottom) / 2} className="plot-axis-label" transform={`rotate(-90 ${expanded ? 18 : 11} ${(top + bottom) / 2})`}>{t("Normalizovaná odozva")}</text><text x={left + 5} y={top - 10} className="plot-title" fill={RESPONSE_COLORS[name]}>{name}</text>{!expanded && <text x={right - 50} y={top - 6} className="plot-hint">{t("otvoriť ↗")}</text>}</svg>;
}

function ResponseChart({ data }: { data: unknown }) {
  const response = data as NormalizedResponse | null;
  const time = response?.time_s ?? [];
  const names: (typeof RESPONSE_CHANNELS[number])[] = RESPONSE_CHANNELS.filter((name) => response?.channels?.[name]?.mean?.length);
  const series = names.map((name) => ({ name, channel: response?.channels?.[name], count: Math.min(time.length, response?.channels?.[name]?.mean?.length ?? 0) })).filter((item): item is { name: (typeof RESPONSE_CHANNELS)[number]; channel: NormalizedChannel; count: number } => Boolean(item.channel) && item.count > 1);
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  if (!series.length) return <div className="chart-empty">{t("Normalizovaná odozva nie je dostupná.")}</div>;
  const allValues = series.flatMap(({ channel: item, count }) => { const mean = item.mean?.slice(0, count) ?? []; const std = item.std?.slice(0, count) ?? []; return mean.flatMap((value, index) => [Number(value) - (Number(std[index]) || 0), Number(value) + (Number(std[index]) || 0)]); }).filter(Number.isFinite);
  const min = Math.min(-0.2, ...allValues); const max = Math.max(1.2, ...allValues);
  const plots = series.map(({ name, channel: item }) => <button type="button" className="chart-tile" key={name} onClick={() => setExpandedChannel(name)}><ChartPlot name={name} channel={item} time={time} min={min} max={max} /></button>);
  const expanded = expandedChannel ? series.find((item) => item.name === expandedChannel) : null;
  return <><div className="response-grid">{plots}</div>{expanded && <div className="chart-expand-backdrop" onMouseDown={() => setExpandedChannel(null)}><section className="chart-expand-window" onMouseDown={(event) => event.stopPropagation()}><div className="chart-expand-header"><div><div className="eyebrow">{t("DETAIL GRAFU")}</div><h3>{expanded.name} {t("· normalizovaná odozva")}</h3></div><button type="button" className="quiet compact" onClick={() => setExpandedChannel(null)}>{t("Zavrieť")}</button></div><ChartPlot name={expanded.name} channel={expanded.channel} time={time} min={min} max={max} expanded /></section></div>}</>;
}




type ScopeConfiguration = {
  [key: string]: unknown;
  difficulty: string; action_timeout_s: number; hold_time_s: number; fps: number; stick_max: number;
  max_completed_actions: number; countdown_s: number; fullscreen: boolean; topmost: boolean;
  gui_gimbal_size: number; gui_stick_zone: number;
  screen_background: string; gimbal_background: string; stick_outline: string; stick_fill: string;
  zone_idle_outline: string; zone_idle_fill: string; zone_ok_outline: string; zone_ok_fill: string;
  grid_color: string; label_color: string; prompt_color: string;
};

const initialScopeConfiguration: ScopeConfiguration = {
  debug_output: false, difficulty: "hard", action_timeout_s: 3, hold_time_s: 0.5, fps: 100, stick_max: 1000,
  max_completed_actions: 50, countdown_s: 3, seed: null,
  fullscreen: true, topmost: true, save_raw_log: true, save_action_log: true,
  save_step_file: true, save_graph_pdf: true, auto_open_graph: true, run_evaluation: true, show_graph: false,
  gui_gimbal_size: 500, gui_stick_zone: 200, gui_stick_radius: 20,
  gui_stick_outline_width: 6, gui_zone_outline_width: 8, gui_gimbal_border_width: 12, gui_gimbal_cross_width: 6,
  screen_background: "#000000", gimbal_background: "#808080", stick_outline: "#1e2cff", stick_fill: "#ffffff",
  zone_idle_outline: "#ff0000", zone_idle_fill: "#ff0000", zone_ok_outline: "#00cc00", zone_ok_fill: "#00cc00",
  grid_color: "#ffffff", label_color: "#ffffff", prompt_color: "#ff0000"
};

function MeasurementDetailBody({ measurement, tests, onClose }: { measurement: Measurement; tests: TestDefinition[]; onClose: () => void }) {
  const isSimple = getMeasurementMode(measurement, tests) === "SIMPLE";
  return <>
    <div className="detail-window-bar"><div className="eyebrow">{t("DETAIL MERANIA ·")} {isSimple ? "SimPLE" : "SCoPE"}</div><div className="detail-header-actions"><button className="quiet compact" onClick={onClose}>{t("Zavrieť")}</button></div></div>
    <h2>{measurement.test_type}</h2><p className="muted">{measurement.source_file_name} · {formatDateTime(measurement.started_at)}</p>
    <div className="detail-grid"><div><span>{t("Vzorky")}</span><strong>{String(measurement.analysis_data?.sample_count ?? measurement.analysis_data?.simple_sample_count ?? "—")}</strong></div><div><span>{t("Trvanie")}</span><strong>{measurement.analysis_data?.duration_s ? `${Number(measurement.analysis_data.duration_s).toFixed(2)} s` : "—"}</strong></div><div><span>{t("Raw dáta")}</span><strong>{measurement.raw_sha256 ? tf("Archivované · {0}", formatBytes(measurement.raw_size_bytes)) : t("Nie sú dostupné")}</strong></div><div><span>{t("Merací režim")}</span><strong>{isSimple ? t("SimPLE · 2D let") : t("SCoPE · odozva osí")}</strong></div></div>
    {isSimple ? <SimpleAnalysisView analysis={measurement.analysis_data ?? {}} /> : <div className="results-layout"><div className="results-chart-column"><ResponseChart data={measurement.analysis_data?.normalized_step_response} /></div><ResponseMetrics data={measurement.analysis_data?.normalized_step_response} /></div>}
  </>;
}

function makeScopeConfiguration(value: Record<string, unknown>): ScopeConfiguration {
  const normalized = { ...value };
  delete normalized.user;
  delete normalized.profile_name;
  delete normalized.expert_mode;
  delete normalized.output_root;
  delete normalized.use_dated_subfolders;
  return { ...initialScopeConfiguration, ...normalized, difficulty: String(value.difficulty ?? "hard").toLowerCase() } as ScopeConfiguration;
}

const initialSimpleConfiguration: Record<string, number | string> = {
  action_timeout_s: 5, hold_time_s: 1, countdown_s: 3,
  completion_radius_m: 0.1, target_x_limit_m: 1.5, target_y_max_m: 2,
  field_width_px: 1920, field_height_px: 1080, world_width_m: 4.5,
  zone_idle_fill: "#ff3948", zone_idle_outline: "#ff3948",
  zone_ok_fill: "#00cc66", zone_ok_outline: "#00ff80",
  mass_kg: 0.8, max_thrust_n: 16, drag_coefficient: 0.3,
};

function ProgramWordmark({ mode, compact = false }: { mode: "SCOPE" | "SIMPLE"; compact?: boolean }) {
  return <span className={`program-wordmark ${mode.toLowerCase()} ${compact ? "compact" : ""}`}>
    <span className="program-symbol">{mode === "SCOPE" ? "S" : "2D"}</span>
    <span>{mode === "SCOPE" ? "SCoPE" : "SimPLE"}</span>
  </span>;
}

function TestCreator({ onCreated }: { onCreated: (test: TestDefinition) => void }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"SCOPE" | "SIMPLE">("SCOPE");
  const [message, setMessage] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    setMessage("");
    const slug = cleanName.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 42) || "TEST";
    const isSimple = mode === "SIMPLE";
    try {
      const created = await request<TestDefinition>("/api/admin/tests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test_code: (isSimple ? "SIMPLE_" : "SCOPE_") + slug,
          name: cleanName,
          version: "1.0",
          analysis_profile: isSimple ? "SIMPLE_FLIGHT_V1" : "SCOPE_STEP_RESPONSE_V1",
          configuration: isSimple ? { ...initialSimpleConfiguration } : { ...initialScopeConfiguration },
        })
      });
      setName(""); onCreated(created);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : t("Test sa nepodarilo vytvoriť.")); }
  }
  return <section className="test-create-strip mode-create-panel">
    <div className="mode-create-heading"><div className="eyebrow">{t("NOVÝ MERACÍ REŽIM")}</div><strong>{t("Vytvor definíciu testu")}</strong><p className="muted">{t("Vyber program, zadaj názov a parametre uprav v editore.")}</p></div>
    <div className="program-choice-grid" role="group" aria-label={t("Merací program")}>
      {(["SCOPE", "SIMPLE"] as const).map((item) => <button type="button" key={item} onClick={() => setMode(item)} className={mode === item ? "program-choice selected" : "program-choice"}>
        <ProgramWordmark mode={item} />
        <span>{item === "SCOPE" ? "Joystick step response" : t("Simulovaný let v 2D priestore")}</span>
        <small>{item === "SCOPE" ? "SCoPE" : "SimPLE"}</small>
      </button>)}
    </div>
    <form className="test-create-form" onSubmit={create}>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("Názov testu")} required />
      <button className="primary compact" type="submit">{t("Vytvoriť")}</button>
    </form>
    {message && <span className="notice">{message}</span>}
  </section>;
}

type BackgroundImage = { id: string; filename: string; width: number; height: number; created_at: string };
function SimpleScenePreview({ imageId, radius, xLimit, yLimit, worldWidth, widthPx, heightPx, fill, outline }: { imageId: string; radius: number; xLimit: number; yLimit: number; worldWidth: number; widthPx: number; heightPx: number; fill: string; outline: string }) {
  const sceneHeight = 720 * heightPx / widthPx;
  const horizon = sceneHeight * .82;
  const groundY = sceneHeight - Math.max(50, sceneHeight * .14);
  const scale = Math.min(640 / worldWidth, (groundY - 30) / (worldWidth * heightPx / widthPx));
  const zoneRadius = Math.max(1, radius * scale);
  const targetX = 530;
  const targetY = Math.max(zoneRadius + 12, horizon - Math.min(yLimit, 1.2) * scale);
  const droneX = Math.max(80, Math.min(300, 360 - Math.min(xLimit, 1) * scale));
  const droneY = Math.max(40, horizon - Math.min(yLimit * .5, .8) * scale);
  return <div className="simple-scene-preview" style={{ aspectRatio: `${widthPx} / ${heightPx}` }} aria-label={t("Náhľad SimPLE scény")}>
    {imageId ? <img src={`/api/backgrounds/${imageId}`} alt={t("Zvolené pozadie SimPLE")} /> : <div className="simple-scene-default" />}
    <svg viewBox={`0 0 720 ${sceneHeight}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={t("Modrý dron a cieľová zóna")}>
      <rect x="0" y={horizon} width="720" height={sceneHeight - horizon} className="scene-ground" />
      <line x1="0" y1={horizon} x2="720" y2={horizon} className="scene-ground-line" />
      <circle cx={targetX} cy={targetY} r={zoneRadius} fill={fill} stroke={outline} strokeWidth="2.5" className="scene-target-zone" />
      <circle cx={droneX} cy={droneY} r="24" className="scene-drone-ball" />
      <line x1={droneX} y1={droneY} x2={droneX} y2={droneY - 34} className="scene-drone-arrow" />
      <path d={`M${droneX} ${droneY - 41} L${droneX - 8} ${droneY - 27} L${droneX + 8} ${droneY - 27} Z`} className="scene-drone-arrow-head" />
    </svg>
    <span className="scene-preview-caption">{t("Náhľad letovej scény · mierka zachováva pomer strán")}</span>
  </div>;
}

function SimpleTestEditor({ test, csrfToken, onClose, onSaved }: { test: TestDefinition; csrfToken: string; onClose: () => void; onSaved: (test: TestDefinition) => void }) {
  const [configuration, setConfiguration] = useState<Record<string, number | string>>(() => {
    const values = { ...initialSimpleConfiguration };
    for (const key of Object.keys(values)) {
      const value = test.configuration[key];
      if (typeof values[key] === "number" && typeof value === "number" && Number.isFinite(value)) values[key] = value;
      if (typeof values[key] === "string" && typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) values[key] = value;
    }
    return values;
  });
  const [message, setMessage] = useState("");
  const [backgrounds, setBackgrounds] = useState<BackgroundImage[]>([]);
  const [backgroundImageId, setBackgroundImageId] = useState(String(test.configuration.background_image_id ?? ""));
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    void request<BackgroundImage[]>("/api/backgrounds").then(setBackgrounds).catch((reason) =>
      setMessage(reason instanceof Error ? reason.message : t("Obrázky sa nepodarilo načítať."))
    );
  }, []);
  async function uploadBackground(file: File | undefined) {
    if (!file) return;
    if (file.size > 5_000_000 || !["image/png", "image/jpeg"].includes(file.type)) { setMessage(t("Vyber PNG alebo JPEG s veľkosťou najviac 5 MB.")); return; }
    setUploading(true); setMessage("");
    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error(t("Obrázok sa nepodarilo načítať."))); reader.readAsDataURL(file);
      });
      const uploaded = await request<BackgroundImage>("/api/backgrounds", {
        method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ filename: file.name, image_base64: imageBase64 }),
      });
      setBackgrounds((items) => [uploaded, ...items]); setBackgroundImageId(uploaded.id);
      setMessage(t("Pozadie bolo nahrané. Ulož nastavenia testu, aby sa použilo."));
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : t("Pozadie sa nepodarilo nahrať.")); }
    finally { setUploading(false); }
  }
  const numericFields: [keyof typeof initialSimpleConfiguration, string, number, number, number][] = [
    ["action_timeout_s", t("Limit času na cieľ [s]"), .1, 60, .1],
    ["hold_time_s", t("Výdrž v cieľovej zóne [s]"), .1, 30, .1],
    ["countdown_s", t("Odpočítavanie [s]"), 0, 60, 1],
    ["completion_radius_m", t("Polomer cieľovej zóny [m]"), .01, 2, .01],
    ["target_x_limit_m", t("Limit cieľa v osi X [m]"), .1, 20, .1],
    ["target_y_max_m", t("Maximálna výška cieľa [m]"), .1, 20, .1],
    ["world_width_m", t("Šírka ihriska [m]"), .5, 50, .1],
    ["mass_kg", t("Hmotnosť modelu [kg]"), .1, 10, .1],
    ["max_thrust_n", t("Maximálny ťah [N]"), 1, 100, .5],
    ["drag_coefficient", t("Koeficient odporu"), 0, 5, .05],
  ];
  const resolutions = [[1920,1080,"1920 × 1080 · 16:9"],[2560,1440,"2560 × 1440 · 16:9"],[1280,720,"1280 × 720 · 16:9"],[1920,1200,"1920 × 1200 · 16:10"],[1280,800,"1280 × 800 · 16:10"],[1280,1024,"1280 × 1024 · 5:4"],[1024,768,"1024 × 768 · 4:3"]] as const;
  const fieldWidth = Number(configuration.field_width_px ?? 1920);
  const fieldHeight = Number(configuration.field_height_px ?? 1080);
  const resolutionOptions = resolutions.some(([w,h]) => w === fieldWidth && h === fieldHeight)
    ? resolutions
    : [[fieldWidth, fieldHeight, tf("{0} × {1} · aktuálne", fieldWidth, fieldHeight)] as const, ...resolutions];
  const worldHeight = Number(configuration.world_width_m) * fieldHeight / fieldWidth;
  async function save() {
    setMessage("");
    const cleanConfiguration: Record<string, unknown> = { ...configuration, field_width_px: fieldWidth, field_height_px: fieldHeight };
    delete cleanConfiguration.sampling_hz; delete cleanConfiguration.zoom_px_per_m;
    if (backgroundImageId) cleanConfiguration.background_image_id = backgroundImageId;
    else delete cleanConfiguration.background_image_id;
    try {
      const saved = await request<TestDefinition>(`/api/admin/tests/${test.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ configuration: cleanConfiguration }) });
      onSaved(saved);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : t("Nastavenia SimPLE sa nepodarilo uložiť.")); }
  }
  return <div className="editor-backdrop"><section className="test-editor-window simple-editor-window">
    <header className="editor-header"><div><div className="eyebrow">{t("SIMPLE · NASTAVENIE TESTU")}</div><h2>{test.name}</h2><p className="muted">{test.test_code} {t("· v")}{test.version}</p></div><button type="button" className="quiet compact" onClick={onClose}>{t("Zavrieť")}</button></header>
    <div className="simple-editor-intro"><ProgramWordmark mode="SIMPLE" /><p>{t("Určuje sa tu letová úloha, mierka 2D sveta a fyzikálne parametre modelu. Joystick a break/reset zostávajú lokálnymi nastaveniami THRUSTu.")}</p></div>
    <div className="simple-editor-layout"><div>
      <div className="simple-config-grid"><label>{t("Rozlíšenie / pomer strán")}<select value={`${fieldWidth}x${fieldHeight}`} onChange={(event) => { const [w,h] = event.target.value.split("x").map(Number); setConfiguration((current) => ({ ...current, field_width_px: w, field_height_px: h })); }}>{resolutionOptions.map(([w,h,label]) => <option key={`${w}x${h}`} value={`${w}x${h}`}>{label}</option>)}</select></label>
      {numericFields.map(([key,label,min,max,step]) => <label key={key}>{label}<input type="number" min={min} max={max} step={step} value={Number(configuration[key] ?? initialSimpleConfiguration[key])} onChange={(event) => setConfiguration((current) => ({ ...current, [key]: Number(event.target.value) }))} />{key === "world_width_m" && <small>{t("Odvodená výška:")} {worldHeight.toFixed(2)} {t("m")}</small>}</label>)}</div>
      <p className="muted">{t("Obrazovka určuje iba pomer strán. Výška ihriska sa počíta z nastavenej šírky a pomeru strán.")}</p>
    </div><div className="simple-background-panel"><div className="eyebrow">{t("POZADIE A NÁHĽAD")}</div><label>{t("Vybrané pozadie")}<select value={backgroundImageId} onChange={(event) => setBackgroundImageId(event.target.value)}><option value="">{t("Predvolené vektorové pozadie SimPLE")}</option>{backgrounds.map((item) => <option key={item.id} value={item.id}>{item.filename} · {item.width}×{item.height}</option>)}</select></label><label>{t("Nahrať vlastné PNG / JPEG")}<input type="file" accept="image/png,image/jpeg" disabled={uploading} onChange={(event) => { void uploadBackground(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
      <SimpleScenePreview imageId={backgroundImageId} radius={Number(configuration.completion_radius_m)} xLimit={Number(configuration.target_x_limit_m)} yLimit={Number(configuration.target_y_max_m)} worldWidth={Number(configuration.world_width_m)} widthPx={fieldWidth} heightPx={fieldHeight} fill={String(configuration.zone_idle_fill)} outline={String(configuration.zone_idle_outline)} />
      <div className="simple-zone-colors"><label>{t("Zóna · výplň")}<input type="color" value={String(configuration.zone_idle_fill)} onChange={(event) => setConfiguration((current) => ({ ...current, zone_idle_fill: event.target.value }))} /></label><label>{t("Zóna · okraj")}<input type="color" value={String(configuration.zone_idle_outline)} onChange={(event) => setConfiguration((current) => ({ ...current, zone_idle_outline: event.target.value }))} /></label><label>{t("Úspech · výplň")}<input type="color" value={String(configuration.zone_ok_fill)} onChange={(event) => setConfiguration((current) => ({ ...current, zone_ok_fill: event.target.value }))} /></label><label>{t("Úspech · okraj")}<input type="color" value={String(configuration.zone_ok_outline)} onChange={(event) => setConfiguration((current) => ({ ...current, zone_ok_outline: event.target.value }))} /></label></div>
      {uploading && <p className="muted">{t("Nahrávam obrázok…")}</p>}</div></div>
    {message && <p className="error">{message}</p>}
    <div className="simple-editor-actions"><button type="button" className="quiet" onClick={onClose}>{t("Zrušiť")}</button><button type="button" className="primary" onClick={() => void save()}>{t("Uložiť nastavenia")}</button></div>
  </section></div>;
}

function GimbalPreview({ configuration, onPick }: { configuration: ScopeConfiguration; onPick: (key: string) => void }) {
  const color = (key: string) => String(configuration[key] ?? "#ffffff");
  const gimbal = (x: number, prefix: string) => {
    const scale = 220 / Number(configuration.gui_gimbal_size ?? 500);
    const corner = 220 / 5;
    const centerMark = 220 / 10;
    const zoneRadius = Number(configuration.gui_stick_zone ?? 200) / (2 * Number(configuration.stick_max ?? 1000)) * 220;
    const stickRadius = Number(configuration.gui_stick_radius ?? 20) * scale;
    return <g key={prefix} onClick={() => onPick("gimbal_background")} className="preview-clickable">
      <rect x={x} y="52" width="220" height="220" rx="3" fill={color("gimbal_background")} />
      <g fill="none" stroke={color("grid_color")} strokeLinecap="square" strokeLinejoin="miter" onClick={(event) => { event.stopPropagation(); onPick("grid_color"); }} className="preview-clickable">
        <line x1={x + corner} y1="52" x2={x} y2="52" /><line x1={x} y1="52" x2={x} y2={52 + corner} />
        <line x1={x + 220 - corner} y1="52" x2={x + 220} y2="52" /><line x1={x + 220} y1="52" x2={x + 220} y2={52 + corner} />
        <line x1={x + corner} y1="272" x2={x} y2="272" /><line x1={x} y1="272" x2={x} y2={272 - corner} />
        <line x1={x + 220 - corner} y1="272" x2={x + 220} y2="272" /><line x1={x + 220} y1="272" x2={x + 220} y2={272 - corner} />
        <line x1={x + 110} y1="52" x2={x + 110} y2={52 + centerMark} /><line x1={x} y1="162" x2={x + centerMark} y2="162" />
        <line x1={x + 110} y1="272" x2={x + 110} y2={272 - centerMark} /><line x1={x + 220} y1="162" x2={x + 220 - centerMark} y2="162" />
      </g>
      <circle cx={x + 110} cy="162" r={zoneRadius} fill={color("zone_idle_fill")} stroke={color("zone_idle_outline")} strokeWidth={8 * scale} onClick={(event) => { event.stopPropagation(); onPick("zone_idle_fill"); }} className="preview-clickable" />
      <circle cx={x + 110} cy="162" r={stickRadius} fill={color("stick_fill")} stroke={color("stick_outline")} strokeWidth={6 * scale} onClick={(event) => { event.stopPropagation(); onPick("stick_fill"); }} className="preview-clickable" />
    </g>;
  };
  return <div className="gimbal-preview"><svg viewBox="0 0 620 345" role="img" aria-label={t("Interaktívny náhľad SCoPE")}><rect width="620" height="345" fill={color("screen_background")} onClick={() => onPick("screen_background")} className="preview-clickable" />{gimbal(55, "left")}{gimbal(345, "right")}<text x="310" y="22" textAnchor="middle" fill={color("label_color")} onClick={() => onPick("label_color")} className="preview-clickable">{t("Action: [0, 0, 0, 0]")}</text><text x="310" y="330" textAnchor="middle" fill={color("label_color")} onClick={() => onPick("label_color")} className="preview-clickable">{t("Completed: 0 · Mistakes: 0")}</text><text x="310" y="162" textAnchor="middle" fill={color("prompt_color")} fontSize="22" onClick={() => onPick("prompt_color")} className="preview-clickable">{t("Press button on RC")}</text></svg><div className="preview-help">{t("Kliknutie na prvok okamžite otvorí výber jeho farby.")}</div></div>;
}

function TestEditor({ test, onClose, onSaved }: { test: TestDefinition; onClose: () => void; onSaved: (test: TestDefinition) => void }) {
  const [configuration, setConfiguration] = useState(() => makeScopeConfiguration(test.configuration));
  const [selectedColor, setSelectedColor] = useState("screen_background");
  const [message, setMessage] = useState("");
  const colorInput = useRef<HTMLInputElement>(null);
  function setValue(key: string, value: unknown) { setConfiguration((current) => ({ ...current, [key]: value })); }
  function pickColor(key: string) { setSelectedColor(key); if (colorInput.current) { colorInput.current.value = String(configuration[key] ?? "#ffffff"); colorInput.current.click(); } }
  const colorFields = [["screen_background", t("Pozadie obrazovky")], ["gimbal_background", t("Pozadie gimbalu")], ["grid_color", t("Okraje a stredové značky")], ["zone_idle_fill", t("Výplň neaktívnej zóny")], ["zone_idle_outline", t("Obrys neaktívnej zóny")], ["zone_ok_fill", t("Výplň OK zóny")], ["zone_ok_outline", t("Obrys OK zóny")], ["stick_fill", t("Výplň páčky")], ["stick_outline", t("Obrys páčky")], ["label_color", t("Popisy")], ["prompt_color", t("Výzva")]] as const;
  async function save() {
    setMessage("");
    try {
      const saved = await request<TestDefinition>(`/api/admin/tests/${test.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ configuration: { ...configuration, difficulty: String(configuration.difficulty).toLowerCase() } }) });
      onSaved(saved); setMessage(t("Nastavenia boli uložené."));
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : t("Nastavenia sa nepodarilo uložiť.")); }
  }
  return <div className="editor-backdrop"><section className="test-editor-window"><header className="editor-header"><div><div className="eyebrow">{t("EDITOR TESTU · ROZPRACOVANÁ VERZIA")}</div><h2>{test.name}</h2><p className="muted">{test.test_code} {t("· v")}{test.version}</p></div><button type="button" className="quiet compact" onClick={onClose}>{t("Zavrieť")}</button></header><div className="editor-layout">
    <div className="editor-controls">
<section className="config-card"><div className="eyebrow">{t("VZHĽAD")}</div><h3>{t("Farby a geometria")}</h3><div className="selected-color"><span>{colorFields.find(([key]) => key === selectedColor)?.[1] ?? selectedColor}</span><input ref={colorInput} type="color" value={String(configuration[selectedColor])} onChange={(event) => setValue(selectedColor, event.target.value)} /><code>{String(configuration[selectedColor])}</code></div><div className="color-list">{colorFields.map(([key, label]) => <button type="button" className={selectedColor === key ? "color-item selected" : "color-item"} key={key} onClick={() => pickColor(key)}><span>{label}</span><i style={{ background: String(configuration[key]) }} /><code>{String(configuration[key])}</code></button>)}</div><div className="field-grid geometry-fields"><label>{t("Veľkosť gimbalu")}<input type="number" min="150" value={String(configuration.gui_gimbal_size)} onChange={(event) => setValue("gui_gimbal_size", Number(event.target.value))} /></label><label>{t("Polomer zóny")}<input type="number" min="10" value={String(configuration.gui_stick_zone)} onChange={(event) => setValue("gui_stick_zone", Number(event.target.value))} /></label><label>{t("Polomer páčky")}<input type="number" min="1" value={String(configuration.gui_stick_radius)} onChange={(event) => setValue("gui_stick_radius", Number(event.target.value))} /></label><label>{t("Obrys páčky")}<input type="number" min="1" value={String(configuration.gui_stick_outline_width)} onChange={(event) => setValue("gui_stick_outline_width", Number(event.target.value))} /></label><label>{t("Obrys zóny")}<input type="number" min="1" value={String(configuration.gui_zone_outline_width)} onChange={(event) => setValue("gui_zone_outline_width", Number(event.target.value))} /></label><label>{t("Obrys gimbalu")}<input type="number" min="1" value={String(configuration.gui_gimbal_border_width)} onChange={(event) => setValue("gui_gimbal_border_width", Number(event.target.value))} /></label><label>{t("Šírka stredových značiek")}<input type="number" min="1" value={String(configuration.gui_gimbal_cross_width)} onChange={(event) => setValue("gui_gimbal_cross_width", Number(event.target.value))} /></label></div></section>
      <section className="config-card"><div className="eyebrow">{t("EXPERIMENT")}</div><h3>{t("Základné parametre")}</h3><div className="field-grid"><label>{t("Obtiažnosť")}<select value={String(configuration.difficulty)} onChange={(event) => setValue("difficulty", event.target.value)}><option value="easy">{t("Ľahká")}</option><option value="medium">{t("Stredná")}</option><option value="hard">{t("Ťažká")}</option><option value="ultra">{t("Ultra")}</option></select></label><label>{t("Vzorkovacia frekvencia (Hz)")}<input type="number" min="10" value={String(configuration.fps)} onChange={(event) => setValue("fps", Number(event.target.value))} /></label><label>{t("Počet dokončených akcií")}<input type="number" min="1" value={String(configuration.max_completed_actions)} onChange={(event) => setValue("max_completed_actions", Number(event.target.value))} /></label><label>{t("Timeout akcie (s)")}<input type="number" min=".1" step=".1" value={String(configuration.action_timeout_s)} onChange={(event) => setValue("action_timeout_s", Number(event.target.value))} /></label><label>{t("Čas podržania (s)")}<input type="number" min=".1" step=".1" value={String(configuration.hold_time_s)} onChange={(event) => setValue("hold_time_s", Number(event.target.value))} /></label><label>{t("Odpočet pred štartom (s)")}<input type="number" min="0" value={String(configuration.countdown_s)} onChange={(event) => setValue("countdown_s", Number(event.target.value))} /></label><label>{t("Maximálna hodnota páčky")}<input type="number" min="100" value={String(configuration.stick_max)} onChange={(event) => setValue("stick_max", Number(event.target.value))} /></label><label>{t("Náhodný seed")}<input value={configuration.seed == null ? "" : String(configuration.seed)} onChange={(event) => setValue("seed", event.target.value.trim() === "" ? null : Number(event.target.value))} placeholder={t("automaticky")} /></label></div><div className="toggle-row"><label><input type="checkbox" checked={Boolean(configuration.debug_output)} onChange={(event) => setValue("debug_output", event.target.checked)} /> {t("Debug výstup")}</label></div></section>
      <section className="config-card"><div className="eyebrow">{t("RUNTIME")}</div><h3>{t("Správanie okna")}</h3><div className="toggle-row"><label><input type="checkbox" checked={Boolean(configuration.fullscreen)} onChange={(event) => setValue("fullscreen", event.target.checked)} /> {t("Celá obrazovka")}</label><label><input type="checkbox" checked={Boolean(configuration.topmost)} onChange={(event) => setValue("topmost", event.target.checked)} /> {t("Vždy navrchu")}</label></div></section>
      <section className="config-card"><div className="eyebrow">{t("VÝSTUP")}</div><h3>{t("Ukladanie a vyhodnotenie")}</h3><p className="config-note">{t("Raw log je povinný, pretože z neho THRUST vytvorí objekt merania pre WebDB. Lokálny priečinok a názov súboru určuje klient podľa verzie testu.")}</p><div className="toggle-grid"><label><input type="checkbox" checked={true} disabled /> {t("Raw log · povinné pre WebDB")}</label><label><input type="checkbox" checked={Boolean(configuration.save_action_log)} onChange={(event) => setValue("save_action_log", event.target.checked)} /> {t("Action log · voliteľný")}</label><label><input type="checkbox" checked={Boolean(configuration.run_evaluation) ? true : Boolean(configuration.save_step_file)} disabled={Boolean(configuration.run_evaluation)} onChange={(event) => setValue("save_step_file", event.target.checked)} /> {t("Step súbor")}{Boolean(configuration.run_evaluation) ? t(" · povinný pri vyhodnotení") : ""}</label><label><input type="checkbox" checked={Boolean(configuration.save_graph_pdf)} disabled={!Boolean(configuration.run_evaluation)} onChange={(event) => setValue("save_graph_pdf", event.target.checked)} /> {t("Graf PDF")}</label><label><input type="checkbox" checked={Boolean(configuration.auto_open_graph)} disabled={!Boolean(configuration.run_evaluation) || !Boolean(configuration.save_graph_pdf)} onChange={(event) => setValue("auto_open_graph", event.target.checked)} /> {t("Otvoriť graf po uložení")}</label><label><input type="checkbox" checked={Boolean(configuration.run_evaluation)} onChange={(event) => setValue("run_evaluation", event.target.checked)} /> {t("Spustiť vyhodnotenie")}</label><label><input type="checkbox" checked={Boolean(configuration.show_graph)} disabled={!Boolean(configuration.run_evaluation)} onChange={(event) => setValue("show_graph", event.target.checked)} /> {t("Zobraziť graf")}</label></div></section>
    </div>
    <div className="editor-preview"><div className="eyebrow">{t("ŽIVÝ NÁHĽAD")}</div><h3>{t("SCoPE obrazovka")}</h3><GimbalPreview configuration={configuration} onPick={pickColor} /><details className="json-disclosure"><summary>{t("Rozšírený JSON náhľad")}</summary><pre className="config-preview live">{JSON.stringify({ ...configuration, difficulty: String(configuration.difficulty).toLowerCase() }, null, 2)}</pre></details></div>
  </div><footer className="editor-footer"><button type="button" className="quiet" onClick={onClose}>{t("Zrušiť")}</button><button className="primary" onClick={save}>{t("Uložiť nastavenia")}</button>{message && <span className="notice">{message}</span>}</footer></section></div>;
}

function ResearcherRegistrationPage({ onSubmit, onBack, onStudentRegister, onLogin, error, consentTexts, onOpenConsent }: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
  onStudentRegister: () => void;
  onLogin: () => void;
  error: string;
  consentTexts: ConsentDocuments | null;
  onOpenConsent: (kind: ConsentKind) => void;
}) {
  return <main className="registration-page">
    <header className="registration-header">
      <div className="brand"><span className="mark">{t("T")}</span><div><strong>{t("THRUST")}</strong><small>{t("UAV Human Performance Research")}</small></div></div>
      <div className="actions"><LanguageSwitcher /><button type="button" className="quiet" onClick={onBack}>{t("Späť na hlavnú stránku")}</button><button type="button" className="quiet" onClick={onStudentRegister}>{t("Registrácia študenta")}</button><button type="button" className="quiet" onClick={onLogin}>{t("Prihlásiť sa")}</button></div>
    </header>
    <section className="registration-content">
      <div className="registration-heading"><div className="eyebrow">{t("VÝSKUMNÝ ÚČET")}</div><h1>{t("Registrácia výskumníka")}</h1><p className="lead">{t("Účet získa rolu researcher a nebude mať Participant ID. Na registráciu potrebuješ pozývací kľúč od správcu systému.")}</p></div>
      <form className="registration-form researcher-registration-form" onSubmit={onSubmit}>
        <section className="registration-card registration-account-fields">
          <div className="eyebrow">{t("ÚDAJE ÚČTU")}</div><h2>{t("Prístup pre výskumníka")}</h2>
          <div className="form-grid"><label>{t("Meno")}<input name="first_name" autoComplete="given-name" required /></label><label>{t("Priezvisko")}<input name="last_name" autoComplete="family-name" required /></label></div>
          <label>{t("E-mail")}<input name="email" type="email" autoComplete="email" required /></label>
          <div className="form-grid"><label>{t("Heslo")}<input name="password" type="password" minLength={10} autoComplete="new-password" required /></label><label>{t("Zopakovať heslo")}<input name="password_confirmation" type="password" minLength={10} autoComplete="new-password" required /></label></div>
        </section>
        <section className="registration-card researcher-key-card">
          <div><div className="eyebrow">{t("OVERENIE PRÍSTUPU")}</div><h2>{t("Registračné heslo")}</h2><p className="muted">{t("Zadaj krátke spoločné heslo, ktoré ti poskytol správca. Umožní vytvoriť účet výskumníka.")}</p></div>
          <label>{t("Registračné heslo")}<input name="registration_key" type="password" maxLength={64} autoComplete="off" required /></label>
          <label className="consent"><input name="gdpr_consent" type="checkbox" required /> <span>{t("Súhlasím so spracovaním osobných údajov pre vytvorenie a správu účtu.")} <a href="#consent-gdpr" onClick={(event) => { event.preventDefault(); onOpenConsent("gdpr"); }}>{t("Zobraziť informácie a GDPR súhlas")}</a></span></label>
          {error && <p className="error">{error}</p>}
          <div className="registration-actions"><span className="muted">{t("Výskumný súhlas účastníka merania sa na tento účet nevzťahuje.")}</span><button className="primary" type="submit" disabled={!consentTexts}>{t("Vytvoriť účet výskumníka")}</button></div>
        </section>
      </form>
    </section>
  </main>;
}

function ConsentTextDialog({ kind, document, onClose }: { kind: ConsentKind; document: ConsentDocument; onClose: () => void }) {
  const title = kind === "research" ? t("Súhlas s výskumným použitím údajov") : t("Informácie o spracúvaní osobných údajov (GDPR)");
  return <div className="backdrop" onMouseDown={onClose}>
    <section className="login consent-dialog" role="dialog" aria-modal="true" aria-labelledby="consent-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="eyebrow">{t("VERZIA")} {document.version}</div><h2 id="consent-dialog-title">{title}</h2>
      {kind === "gdpr" && document.configured === false && <p className="notice">{t("Text obsahuje konfiguračné údaje prevádzkovateľa, ktoré musí správca doplniť v serverovom .env pred produkčnou registráciou.")}</p>}
      <p className="consent-copy">{document.text}</p>
      <div className="actions"><button className="primary" onClick={onClose}>{t("Zavrieť")}</button></div>
    </section>
  </div>;
}

function InfoTable({ rows }: { rows: Array<[string, string | number]> }) {
  return <div className="table-wrap profile-info-wrap"><table className="profile-info-table"><tbody>
    {rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}
  </tbody></table></div>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong></article>;
}

function StudentPortal({ user, onLogout }: { user: User; onLogout: () => Promise<void> }) {
  const { language } = useLanguage();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [measurements, setMeasurements] = useState<StudentMeasurement[]>([]);
  const [comparison, setComparison] = useState<StudentComparison | null>(null);
  const [mode, setMode] = useState<MeasurementMode>("SCOPE");
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [consents, setConsents] = useState<ConsentStatuses | null>(null);
  const [consentTexts, setConsentTexts] = useState<ConsentDocuments | null>(null);
  const [consentDialog, setConsentDialog] = useState<ConsentKind | null>(null);
  const [activeConsentDocument, setActiveConsentDocument] = useState<ConsentDocument | null>(null);
  const [error, setError] = useState("");
  const [consentMessage, setConsentMessage] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

  useEffect(() => {
    setError("");
    setConsentMessage("");
    setProfileMessage("");
  }, [language]);

  async function revokeConsent(kind: ConsentKind) {
    const name = kind === "research" ? t("výskumný súhlas") : t("súhlas so spracovaním osobných údajov");
    if (!window.confirm(tf("Naozaj chceš odvolať: {0}?", name))) return;
    try {
      await request<void>(`/api/student/consent/${kind}/revoke`, {
        method: "POST",
        headers: { "X-CSRF-Token": user.csrf_token },
      });
      setConsents(await request<ConsentStatuses>("/api/student/consents"));
      setConsentMessage(tf("Súhlas „{0}“ bol odvolaný.", name));
    } catch (reason) {
      setConsentMessage(reason instanceof Error ? reason.message : t("Súhlas sa nepodarilo odvolať."));
    }
  }

  useEffect(() => {
    async function load<T>(label: string, url: string, apply: (value: T) => void): Promise<string | null> {
      try {
        apply(await request<T>(url));
        return null;
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : t("Údaje sa nepodarilo načítať.");
        return `${label}: ${message}`;
      }
    }

    void Promise.all([
      load<StudentMeasurement[]>(t("Merania"), "/api/student/measurements", setMeasurements),
      load<ConsentStatuses>(t("Súhlasy"), "/api/student/consents", setConsents),
      load<StudentProfile>(t("Profil"), "/api/student/profile", setProfile),
    ]).then((errors) => {
      setError(errors.filter((message): message is string => message !== null).join(" "));
    });
  }, []);

  useEffect(() => {
    let active = true;
    setConsentTexts(null);
    request<ConsentDocuments>(`/api/public/consent-texts?lang=${language}`)
      .then((documents) => { if (active) setConsentTexts(documents); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : t("Texty súhlasov sa nepodarilo načítať.")); });
    return () => { active = false; };
  }, [language]);

  useEffect(() => {
    let active = true;
    setComparison(null);
    void request<StudentComparison>(`/api/student/comparison?mode=${mode}`)
      .then((result) => { if (active) setComparison(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : t("Porovnanie sa nepodarilo načítať.")); });
    return () => { active = false; };
  }, [mode]);

  const visibleMeasurements = measurements.filter((item) => getMeasurementMode(item) === mode);
  const selectedMeasurement = visibleMeasurements.find((item) => item.id === selectedMeasurementId);

  return <main className="student-shell">
    <header><div className="brand"><span className="mark">{t("T")}</span><div><strong>{t("THRUST")}</strong><small>{t("Študentský portál")}</small></div></div><div className="header-actions"><LanguageSwitcher /><button className="quiet" onClick={onLogout}>{t("Odhlásiť")}</button></div></header>
    <section className="public student-content">
      <div className="eyebrow">{t("OSOBNÝ PROFIL")}</div>
      <h1>{t("Ahoj,")} {profile?.first_name || user.first_name || user.username}.</h1>
      <p className="lead">{t("Tvoje účastnícke ID:")} <strong>{user.participant_code || "—"}</strong></p>
      <div className="stats"><Metric label={t("Moje merania")} value={visibleMeasurements.length} /><Metric label={t("Skupina")} value={comparison?.cohort_participant_count ?? "—"} /><Metric label={t("Porovnanie")} value={comparison?.available ? t("dostupné") : t("čaká na limit")} /></div>
      {error && <p className="error">{error}</p>}
      {profile && <section className="panel student-profile-panel">
        <div className="profile-panel-heading"><div><div className="eyebrow">{t("PROFIL PILOTA")}</div><h2>{t("Moje údaje")}</h2><p className="muted">{t("Osobné údaje a odpovede z registrácie.")}</p></div>
          <button className="quiet compact" onClick={() => { setEditingProfile((value) => !value); setProfileMessage(""); }}>{editingProfile ? t("Zrušiť úpravy") : t("Upraviť údaje")}</button>
        </div>
        {profileMessage && <p className="notice">{profileMessage}</p>}
        {editingProfile
          ? <ParticipantProfileEditor studentProfile={profile} csrfToken={user.csrf_token} onStudentSaved={(updated) => { setProfile(updated); setEditingProfile(false); setProfileMessage(t("Údaje profilu boli uložené.")); }} />
          : <InfoTable rows={[
            ["Meno", profile.first_name],
            ["Priezvisko", profile.last_name],
            ["E-mail", profile.email || profile.username],
            ["Participant ID", profile.participant_code],
            [t("Dátum narodenia"), profile.birth_date ? formatDate(profile.birth_date) : t("Neuvedené")],
            [t("Pohlavie"), profileLabel(profile.sex)],
            [t("Dominantná ruka"), profileLabel(profile.dominant_hand)],
            [t("Zraková korekcia"), profileLabel(profile.vision_correction)],
            [t("Dioptrie ľavé / pravé"), `${profile.vision_diopters_left ?? "—"} / ${profile.vision_diopters_right ?? "—"} D`],
            [t("Skúsenosť s pilotovaním"), profileLabel(profile.pilot_experience)],
            [t("Letové hodiny"), profileLabel(profile.flight_hours_range)],
            [t("Osvedčenie"), profileLabel(profile.pilot_certificate)],
            [t("Typ UAV"), profileLabel(profile.primary_uav_type)],
            [t("Skúsenosť so simulátorom"), profileLabel(profile.simulator_experience)],
            [t("RC ovládanie"), profileLabel(profile.rc_experience)],
            ["FPV", profileLabel(profile.fpv_experience)],
            [t("Herný ovládač"), profileLabel(profile.game_controller_experience)],
            [t("Video / počítačové hry"), profileLabel(profile.video_game_experience)],
            [t("Sebahodnotenie zručností"), profile.self_rated_skill ?? t("Neuvedené")],
          ]} />}
      </section>}
      <section className="panel">
        <div className="student-result-heading"><div><div className="eyebrow">{t("VÝSLEDKY")}</div><h2>{t("Moje merania ·")} {mode === "SCOPE" ? "SCoPE" : "SimPLE"}</h2></div><ModeSwitch value={mode} onChange={(selected) => { setMode(selected); setSelectedMeasurementId(null); }} /></div>
        {visibleMeasurements.length ? <div className="table-wrap"><table><thead><tr><th>{t("Test")}</th><th>{t("Stav")}</th><th>{t("Dátum a čas")}</th><th>{t("Veľkosť súboru")}</th><th>{t("Výsledky")}</th></tr></thead><tbody>{visibleMeasurements.map((m) => <tr key={m.id}><td>{m.test_type}</td><td>{m.status}</td><td>{formatDateTime(m.started_at)}</td><td>{formatBytes(m.raw_size_bytes)}</td><td><button type="button" className="quiet compact" onClick={() => setSelectedMeasurementId(m.id === selectedMeasurementId ? null : m.id)}>{m.id === selectedMeasurementId ? t("Skryť") : t("Zobraziť")}</button></td></tr>)}</tbody></table></div> : <p className="muted">{t("Zatiaľ nemáš uložené meranie")} {mode === "SCOPE" ? "SCoPE" : "SimPLE"}.</p>}
        {selectedMeasurement && <div className="student-result-detail"><h3>{selectedMeasurement.test_type} · {formatDateTime(selectedMeasurement.started_at)}</h3>{mode === "SIMPLE" ? <SimpleAnalysisView analysis={selectedMeasurement.analysis_data ?? {}} /> : selectedMeasurement.analysis_data?.normalized_step_response ? <><ResponseChart data={selectedMeasurement.analysis_data.normalized_step_response} /><ResponseMetrics data={selectedMeasurement.analysis_data.normalized_step_response} /></> : <p className="muted">{t("Toto meranie nemá uloženú analýzu odozvy.")}</p>}</div>}
      </section>
      <section className="panel">
        <div className="eyebrow">{t("ANONYMIZOVANÉ POROVNANIE ·")} {mode === "SCOPE" ? "SCoPE" : "SimPLE"}</div>
        {comparison?.available ? <><p>{t("Tvoje priemery:")} {formatMetricMap(comparison.own_average)}</p><p>{t("Skupinové priemery:")} {formatMetricMap(comparison.cohort_average)}</p></> : <p className="muted">{t("Porovnanie sa zobrazí po nazbieraní dostatočne veľkej skupiny.")}</p>}
      </section>
      <section className="panel">
        <div className="eyebrow">{t("TVOJE SÚHLASY")}</div><h2>{t("Informácie o spracúvaní údajov")}</h2>
        <p className="muted">{t("Výskumný súhlas a spracovanie údajov účtu sú oddelené. Každý si môžeš prezrieť a odvolať samostatne.")}</p>
        <div className="consent-status-grid">
          {(["research", "gdpr"] as const).map((kind) => {
            const status = consents?.[kind];
            const doc = consentTexts?.[kind];
            const title = kind === "research" ? t("Výskumné použitie meraní") : t("Osobné údaje a účet");
            return <article className="consent-status-card" key={kind}>
              <strong>{title}</strong>
              <p className={status?.accepted ? "consent-active" : "muted"}>{status?.accepted ? t("Súhlas udelený") : status?.revoked_at ? t("Súhlas odvolaný") : t("Záznam súhlasu sa nenašiel")}</p>
              {status?.accepted_at && <small>{t("Udelený:")} {formatDate(status.accepted_at)} · {status.version}</small>}
              {doc && <a href={`#consent-${kind}`} onClick={(event) => { event.preventDefault(); setActiveConsentDocument({ version: status?.version || doc.version, text: status?.text || doc.text, configured: doc.configured }); setConsentDialog(kind); }}>{t("Zobraziť text súhlasu")}</a>}
              {status?.accepted && <button className="quiet compact" onClick={() => void revokeConsent(kind)}>{t("Odvolať tento súhlas")}</button>}
            </article>;
          })}
        </div>
        {consentMessage && <p className="notice">{consentMessage}</p>}
      </section>
    </section>
    {consentDialog && consentTexts && <ConsentTextDialog kind={consentDialog} document={activeConsentDocument || consentTexts[consentDialog]} onClose={() => { setConsentDialog(null); setActiveConsentDocument(null); }} />}
  </main>;
}
function ParticipantProfileEditor({ participant, studentProfile, csrfToken, onSaved, onStudentSaved }: {
  participant?: Participant;
  studentProfile?: StudentProfile;
  csrfToken: string;
  onSaved?: (updated: Participant) => void;
  onStudentSaved?: (updated: StudentProfile) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const values = studentProfile ?? participant;
  if (!values) return null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const birthDateInput = String(form.get("birth_date") || "").trim();
    const birthDate = birthDateInput ? parseFormattedDate(birthDateInput) : null;
    if (birthDateInput && !birthDate) {
      setMessage(t("Dátum zadaj vo formáte yyyy/MMM/dd, napríklad 2001/Feb/09."));
      setSaving(false);
      return;
    }
    const profileData = {
      birth_date: birthDate,
      pilot_experience: form.get("pilot_experience") || null,
      flight_hours_range: form.get("flight_hours_range") || null,
      pilot_certificate: form.get("pilot_certificate") || null,
      primary_uav_type: form.get("primary_uav_type") || null,
      simulator_experience: form.get("simulator_experience") || null,
      self_rated_skill: form.get("self_rated_skill") ? Number(form.get("self_rated_skill")) : null,
      sex: form.get("sex") || null,
      dominant_hand: form.get("dominant_hand") || null,
      vision_correction: form.get("vision_correction") || null,
      vision_diopters_left: form.get("vision_diopters_left") ? Number(form.get("vision_diopters_left")) : null,
      vision_diopters_right: form.get("vision_diopters_right") ? Number(form.get("vision_diopters_right")) : null,
      rc_experience: form.get("rc_experience") || null,
      fpv_experience: form.get("fpv_experience") || null,
      game_controller_experience: form.get("game_controller_experience") || null,
      video_game_experience: form.get("video_game_experience") || null,
    };
    try {
      if (studentProfile) {
        const updated = await request<StudentProfile>("/api/student/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
          body: JSON.stringify({
            ...profileData,
            first_name: form.get("first_name"),
            last_name: form.get("last_name"),
            email: form.get("email"),
          }),
        });
        onStudentSaved?.(updated);
      } else if (participant) {
        const updated = await request<Participant>("/api/admin/participants/" + participant.id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
          body: JSON.stringify({ ...profileData, is_active: form.get("is_active") === "on" }),
        });
        onSaved?.(updated);
      }
      setMessage(t("Zmeny uložené."));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : t("Profil sa nepodarilo uložiť."));
    } finally {
      setSaving(false);
    }
  }

  return <form className="participant-profile-editor panel" onSubmit={save}>
    <div><div className="eyebrow">{studentProfile ? t("MOJE ÚDAJE") : t("PROFIL ÚČASTNÍKA")}</div><h3>{studentProfile ? t("Osobné údaje a skúsenosti") : t("Parametre a skúsenosti")}</h3></div>
    {studentProfile && <div className="form-grid">
      <label>{t("Meno")}<input name="first_name" defaultValue={studentProfile.first_name} maxLength={120} required /></label>
      <label>{t("Priezvisko")}<input name="last_name" defaultValue={studentProfile.last_name} maxLength={120} required /></label>
      <label className="profile-email-field">{t("E-mail")}<input name="email" type="email" defaultValue={studentProfile.email ?? studentProfile.username} maxLength={255} required /></label>
    </div>}
    {participant && <label className="checkbox-line"><input name="is_active" type="checkbox" defaultChecked={participant.is_active} /> {t("Aktívny účastník")}</label>}
    <div className="form-grid"><label>{t("Dátum narodenia")}<input name="birth_date" type="date" defaultValue={values.birth_date ?? ""} /></label><label>{t("Pohlavie")}<select name="sex" defaultValue={values.sex ?? ""}><option value="">{t("Nevyplnené")}</option><option value="female">{t("Žena")}</option><option value="male">{t("Muž")}</option><option value="intersex">{t("Intersex")}</option><option value="other">{t("Iné")}</option><option value="prefer_not_to_say">{t("Nechcem uviesť")}</option></select></label></div>
    <div className="form-grid"><label>{t("Dominantná ruka")}<select name="dominant_hand" defaultValue={values.dominant_hand ?? ""}><option value="">{t("Nevyplnené")}</option><option value="right">{t("Pravá")}</option><option value="left">{t("Ľavá")}</option><option value="both">{t("Obe ruky")}</option><option value="prefer_not_to_say">{t("Nechcem uviesť")}</option></select></label><label>{t("Zraková korekcia")}<select name="vision_correction" defaultValue={values.vision_correction ?? ""}><option value="">{t("Nevyplnené")}</option><option value="none">{t("Bez korekcie")}</option><option value="glasses">{t("Okuliare")}</option><option value="contact_lenses">{t("Kontaktné šošovky")}</option><option value="both">{t("Okuliare aj šošovky")}</option><option value="other">{t("Iná korekcia")}</option><option value="prefer_not_to_say">{t("Nechcem uviesť")}</option></select></label></div>
    <div className="form-grid"><label>{t("Dioptrie ľavé oko")}<input name="vision_diopters_left" type="number" min="-30" max="30" step="0.25" defaultValue={values.vision_diopters_left ?? ""} /></label><label>{t("Dioptrie pravé oko")}<input name="vision_diopters_right" type="number" min="-30" max="30" step="0.25" defaultValue={values.vision_diopters_right ?? ""} /></label></div>
    <div className="form-grid"><label>{t("Skúsenosť s pilotovaním")}<select name="pilot_experience" defaultValue={values.pilot_experience ?? ""}><option value="">{t("Nevyplnené")}</option><option value="none">{t("Žiadna")}</option><option value="under_1_year">{t("Menej ako 1 rok")}</option><option value="1_3_years">{t("1–3 roky")}</option><option value="3_5_years">{t("3–5 rokov")}</option><option value="over_5_years">{t("Viac ako 5 rokov")}</option></select></label><label>{t("Letové hodiny")}<select name="flight_hours_range" defaultValue={values.flight_hours_range ?? ""}><option value="">{t("Nevyplnené")}</option><option value="0">0</option><option value="under_10">{t("Menej ako 10")}</option><option value="10_50">10–50</option><option value="51_200">51–200</option><option value="201_500">201–500</option><option value="over_500">{t("Viac ako 500")}</option></select></label></div>
    <div className="form-grid"><label>{t("Osvedčenie")}<select name="pilot_certificate" defaultValue={values.pilot_certificate ?? ""}><option value="">{t("Nevyplnené")}</option><option value="none">{t("Žiadne")}</option><option value="a1_a3">{t("A1/A3")}</option><option value="a2">{t("A2")}</option><option value="sts">{t("STS")}</option><option value="other">{t("Iné")}</option></select></label><label>{t("Typ UAV")}<select name="primary_uav_type" defaultValue={values.primary_uav_type ?? ""}><option value="">{t("Nevyplnené")}</option><option value="multirotor">{t("Multikoptéra")}</option><option value="fixed_wing">{t("Pevné krídlo")}</option><option value="helicopter">{t("Vrtuľník")}</option><option value="vtol">{t("VTOL")}</option><option value="other">{t("Iný / neviem")}</option></select></label></div>
    <div className="form-grid"><label>{t("Skúsenosť so simulátorom")}<select name="simulator_experience" defaultValue={values.simulator_experience ?? ""}><option value="">{t("Nevyplnené")}</option><option value="none">{t("Žiadna")}</option><option value="under_10">{t("Menej ako 10 hodín")}</option><option value="10_50">{t("10–50 hodín")}</option><option value="51_200">{t("51–200 hodín")}</option><option value="over_200">{t("Viac ako 200 hodín")}</option></select></label><label>{t("Skúsenosť s RC ovládaním")}<select name="rc_experience" defaultValue={values.rc_experience ?? ""}><option value="">{t("Nevyplnené")}</option><option value="none">{t("Žiadna")}</option><option value="under_1_year">{t("Menej ako 1 rok")}</option><option value="1_3_years">{t("1–3 roky")}</option><option value="3_5_years">{t("3–5 rokov")}</option><option value="over_5_years">{t("Viac ako 5 rokov")}</option></select></label></div>
    <div className="form-grid"><label>{t("FPV")}<select name="fpv_experience" defaultValue={values.fpv_experience ?? ""}><option value="">{t("Nevyplnené")}</option><option value="none">{t("Žiadna")}</option><option value="under_1_year">{t("Menej ako 1 rok")}</option><option value="1_3_years">{t("1–3 roky")}</option><option value="3_5_years">{t("3–5 rokov")}</option><option value="over_5_years">{t("Viac ako 5 rokov")}</option></select></label><label>{t("Herný ovládač / gamepad")}<select name="game_controller_experience" defaultValue={values.game_controller_experience ?? ""}><option value="">{t("Nevyplnené")}</option><option value="none">{t("Žiadna")}</option><option value="under_1_year">{t("Menej ako 1 rok")}</option><option value="1_3_years">{t("1–3 roky")}</option><option value="3_5_years">{t("3–5 rokov")}</option><option value="over_5_years">{t("Viac ako 5 rokov")}</option></select></label></div>
    <div className="form-grid"><label>{t("Video / počítačové hry")}<select name="video_game_experience" defaultValue={values.video_game_experience ?? ""}><option value="">{t("Nevyplnené")}</option><option value="none">{t("Nikdy")}</option><option value="under_2">{t("Menej ako 2 h/týždeň")}</option><option value="2_5">{t("2–5 h/týždeň")}</option><option value="6_10">{t("6–10 h/týždeň")}</option><option value="over_10">{t("Viac ako 10 h/týždeň")}</option></select></label><label>{t("Sebahodnotenie zručností")}<select name="self_rated_skill" defaultValue={values.self_rated_skill?.toString() ?? ""}><option value="">{t("Nevyplnené")}</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
    <div className="profile-editor-actions"><span className="muted">{message}</span><button className="primary compact" disabled={saving}>{saving ? t("Ukladám…") : t("Uložiť údaje")}</button></div>
  </form>;
}

function profileLabel(value?: string | null) {
  const labels: Record<string, string> = { none: t("Žiadna"), under_1_year: t("Menej ako 1 rok"), "1_3_years": t("1–3 roky"), "3_5_years": t("3–5 rokov"), over_5_years: t("Viac ako 5 rokov"), "0": "0", under_10: t("Menej ako 10"), "10_50": "10–50", "51_200": "51–200", "201_500": "201–500", over_500: t("Viac ako 500"), over_200: t("Viac ako 200"), under_2: t("Menej ako 2 h/týždeň"), "2_5": t("2–5 h/týždeň"), "6_10": t("6–10 h/týždeň"), over_10: t("Viac ako 10 h/týždeň"), a1_a3: "A1/A3", a2: "A2", sts: "STS", multirotor: t("Multikoptéra"), fixed_wing: t("Pevné krídlo"), helicopter: t("Vrtuľník"), vtol: "VTOL", female: t("Žena"), male: t("Muž"), intersex: "Intersex", right: t("Pravá"), left: t("Ľavá"), both: t("Obe"), glasses: t("Okuliare"), contact_lenses: t("Kontaktné šošovky"), prefer_not_to_say: t("Nechcem uviesť"), other: t("Iné") };
  return value ? labels[value] ?? value : t("Neuvedené");
}
function formatMetricMap(values: Record<string, number>) { return Object.entries(values).map(([key, value]) => `${key}: ${value.toFixed(2)}`).join(" · ") || t("bez dostupných metrík"); }
