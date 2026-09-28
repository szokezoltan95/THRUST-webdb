Warning: truncated output (original token count: 44929)
Total output lines: 1853

import { t, tf, serverMessage } from "./i18n";
import { LanguageSwitcher, useLanguage } from "./LanguageContext";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import thrustLogo from "./img/THRUST_logo_white.svg";
import lfSkLogo from "./img/lf_sk.svg";
import lfEnLogo from "./img/lf_en.svg";
import { WelcomeContent, defaultWelcomeBlocks, type WelcomeBlock, type WelcomeData } from "./WelcomeContent";
import { WelcomeEditor } from "./WelcomeEditor";

function Brand() {
  return <div className="brand"><img src={thrustLogo} alt="THRUST" /></div>;
}

function FacultyLogo() {
  const { language } = useLanguage();
  return <div className="faculty-logo-frame"><img className="faculty-logo" src={language === "sk" ? lfSkLogo : lfEnLogo} alt={language === "sk" ? "Letecká fakulta TUKE" : "Faculty of Aeronautics TUKE"} /></div>;
}

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
type AdminSection = "overview" | "participants" | "groups" | "trends" | "reports" | "tests" | "measurements" | "welcome";
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

function measurementMetrics(analysis: Record<string, unknown> | null): Record<string, number> {
  if (!analysis) return {};
  const result: Record<string, number> = {};
  const addNumbers = (prefix: string, value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (typeof item === "number" && Number.isFinite(item)) result[prefix + key] = item;
    }
  };
  addNumbers("", analysis.metrics);
  const response = analysis.normalized_step_response as Record<string, unknown> | undefined;
  const channels = response?.channels;
  if (channels && typeof channels === "object") {
    for (const [axis, channel] of Object.entries(channels as Record<string, unknown>)) {
      if (channel && typeof channel === "object") addNumbers(`${axis}.`, (channel as Record<string, unknown>).metrics);
    }
  }
  addNumbers("", analysis.parameters);
  return result;
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
  const [publishedWelcome, setPublishedWelcome] = useState<{ blocks: WelcomeBlock[] | null; data: WelcomeData }>({ blocks: null, data: {} });
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
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [groupMessage, setGroupMessage] = useState("");
  const [trendParticipants, setTrendParticipants] = useState<string[]>([]);
  const [trendGroups, setTrendGroups] = useState<string[]>([]);
  const [trendMetric, setTrendMetric] = useState("");
  const [trendAxis, setTrendAxis] = useState<"date" | "test">("date");
  const [trendFrom, setTrendFrom] = useState("");
  const [trendTo, setTrendTo] = useState("");
  const [trendData, setTrendData] = useState<{ metric: string; axis: string; series: { subject_id: string; subject: string; points: { label: string; mean: number; median: number; sd_sample: number | null; min: number; max: number; participant_count: number; measurement_count: number }[] }[] } | null>(null);
  const [trendMessage, setTrendMessage] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [selectedMeasurementIds, setSelectedMeasurementIds] = useState<string[]>([]);
  const [reportMeasurementIds, setReportMeasurementIds] = useState<string[]>([]);
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
    let active = true;
    setPublishedWelcome({ blocks: null, data: {} });
    request<{ blocks: WelcomeBlock[] | null; data?: WelcomeData }>(`/api/public/welcome?lang=${language}`)
      .then((page) => { if (active) setPublishedWelcome({ blocks: page.blocks, data: page.data ?? {} }); })
      .catch(() => { if (active) setPublishedWelcome({ blocks: null, data: {} }); });
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

  function trendQuery(): string {
    const params = new URLSearchParams();
    trendParticipants.forEach((id) => params.append("participant_ids", id));
    trendGroups.forEach((id) => params.append("group_ids", id));
    params.set("metric", trendMetric); params.set("axis", trendAxis);
    if (trendFrom) params.set("date_from", trendFrom);
    if (trendTo) params.set("date_to", trendTo);
    return params.toString();
  }

  async function loadTrendAnalysis() {
    if (!trendMetric || (!trendParticipants.length && !trendGroups.length)) { setTrendMessage(t("Vyber aspoň jedného účastníka alebo skupinu a parameter.")); return; }
    try { setTrendData(await request(`/api/admin/reports/trends?${trendQuery()}`)); setTrendMessage(""); }
    catch (reason) { setTrendData(null); setTrendMessage(reason instanceof Error ? reason.message : t("Trendy sa nepodarilo načítať.")); }
  }

  async function downloadProtectedFile(url: string, filename: string, csrfToken?: string) {
    const response = await fetch(url, { credentials: "same-origin", headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {} });
    if (!response.ok) throw new Error(t("Súbor sa nepodarilo stiahnuť.") + ` HTTP ${response.status}`);
    const blob = await response.blob();
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = filename; link.click();
    URL.revokeObjectURL(link.href);
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
      setParticipantCode("")…29929 tokens truncated…te">{t("Raw log je povinný, pretože z neho THRUST vytvorí objekt merania pre WebDB. Lokálny priečinok a názov súboru určuje klient podľa verzie testu.")}</p><div className="toggle-grid"><label><input type="checkbox" checked={true} disabled /> {t("Raw log · povinné pre WebDB")}</label><label><input type="checkbox" checked={Boolean(configuration.save_action_log)} onChange={(event) => setValue("save_action_log", event.target.checked)} /> {t("Action log · voliteľný")}</label><label><input type="checkbox" checked={Boolean(configuration.run_evaluation) ? true : Boolean(configuration.save_step_file)} disabled={Boolean(configuration.run_evaluation)} onChange={(event) => setValue("save_step_file", event.target.checked)} /> {t("Step súbor")}{Boolean(configuration.run_evaluation) ? t(" · povinný pri vyhodnotení") : ""}</label><label><input type="checkbox" checked={Boolean(configuration.save_graph_pdf)} disabled={!Boolean(configuration.run_evaluation)} onChange={(event) => setValue("save_graph_pdf", event.target.checked)} /> {t("Graf PDF")}</label><label><input type="checkbox" checked={Boolean(configuration.auto_open_graph)} disabled={!Boolean(configuration.run_evaluation) || !Boolean(configuration.save_graph_pdf)} onChange={(event) => setValue("auto_open_graph", event.target.checked)} /> {t("Otvoriť graf po uložení")}</label><label><input type="checkbox" checked={Boolean(configuration.run_evaluation)} onChange={(event) => setValue("run_evaluation", event.target.checked)} /> {t("Spustiť vyhodnotenie")}</label><label><input type="checkbox" checked={Boolean(configuration.show_graph)} disabled={!Boolean(configuration.run_evaluation)} onChange={(event) => setValue("show_graph", event.target.checked)} /> {t("Zobraziť graf")}</label></div></section>
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
      <Brand />
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
    <header><Brand /><div className="header-actions"><LanguageSwitcher /><button className="quiet" onClick={onLogout}>{t("Odhlásiť")}</button></div></header>
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
