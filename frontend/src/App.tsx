import { t, tf, serverMessage } from "./i18n";
import { LanguageSwitcher, useLanguage } from "./LanguageContext";
import { ChangeEvent, FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import thrustLogoWhite from "./img/THRUST_logo_white.svg";
import thrustLogoBlack from "./img/THRUST_logo_black.svg";
import lfSkLogo from "./img/lf_sk.svg";
import lfEnLogo from "./img/lf_en.svg";
import { WelcomeContent, defaultWelcomeBlocks, type WelcomeBlock, type WelcomeData } from "./WelcomeContent";
import { WelcomeEditor } from "./WelcomeEditor";
import { ComparisonHistogramPlot, ComparisonResponsePlot, formatComparisonValue, type ComparisonMetric, type ComparisonResponseCurve } from "./ComparisonVisuals";

type AccentTheme = "blue" | "red" | "green" | "purple" | "orange" | "teal" | "pink" | "gold";
type ColorMode = "dark" | "light";
const ACCENT_COLORS: Record<AccentTheme, string> = {
  blue: "#54dcff", red: "#ff6578", green: "#44d994", purple: "#b49aff",
  orange: "#ffa346", teal: "#32d4d0", pink: "#ff79bb", gold: "#f0c44e",
};
const ACCENT_LABELS: Record<AccentTheme, string> = {
  blue: "Modrá", red: "Červená", green: "Zelená", purple: "Fialová",
  orange: "Oranžová", teal: "Tyrkysová", pink: "Ružová", gold: "Zlatá",
};

function Brand({ colorMode = "dark" }: { colorMode?: ColorMode }) {
  return <div className="brand"><img src={colorMode === "light" ? thrustLogoBlack : thrustLogoWhite} alt="THRUST" /></div>;
}

function SiteFooter() {
  return <footer className="site-footer">© 2026 Zoltán Szőke · THRUST-webdb · MIT License</footer>;
}

function AppearanceControls({ accentTheme, colorMode, onAccentChange, onModeChange }: {
  accentTheme: AccentTheme;
  colorMode: ColorMode;
  onAccentChange: (theme: AccentTheme) => void;
  onModeChange: (mode: ColorMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div className="appearance-controls" ref={menuRef}>
    <button type="button" className="appearance-trigger" aria-label={t("Nastavenia vzhľadu")} title={t("Nastavenia vzhľadu")}
      aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.1a2.4 2.4 0 0 0 1.7-4.1 1.35 1.35 0 0 1 .95-2.3H18a3 3 0 0 0 3-3c0-4.75-4.03-8.6-9-8.6Z"/><circle cx="7.6" cy="11.2" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="8" r="1"/></svg>
    </button>
    {open && <div className="appearance-popover" role="dialog" aria-label={t("Nastavenia vzhľadu")}>
      <div className="appearance-popover-heading">{t("Farebný motív")}</div>
      <div className="appearance-theme-grid" role="group" aria-label={t("Farebný motív")}>
        {(Object.keys(ACCENT_COLORS) as AccentTheme[]).map((theme) => <button key={theme} type="button"
          className={`appearance-swatch${theme === accentTheme ? " active" : ""}`}
          style={{ "--swatch-color": ACCENT_COLORS[theme] } as React.CSSProperties}
          aria-label={t(ACCENT_LABELS[theme])} title={t(ACCENT_LABELS[theme])} aria-pressed={theme === accentTheme}
          onClick={() => { onAccentChange(theme); setOpen(false); }}><span aria-hidden="true" /></button>)}
      </div>
      <div className="appearance-popover-heading appearance-mode-heading">{t("Režim zobrazenia")}</div>
      <div className="appearance-mode-options" role="group" aria-label={t("Režim zobrazenia")}>
        <button type="button" className={colorMode === "light" ? "active" : ""} aria-pressed={colorMode === "light"}
          onClick={() => { onModeChange("light"); setOpen(false); }}><span aria-hidden="true">☼</span>{t("Svetlý režim")}</button>
        <button type="button" className={colorMode === "dark" ? "active" : ""} aria-pressed={colorMode === "dark"}
          onClick={() => { onModeChange("dark"); setOpen(false); }}><span aria-hidden="true">☾</span>{t("Tmavý režim")}</button>
      </div>
    </div>}
  </div>;
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

type User = { username: string; role: string; csrf_token: string; must_change_password?: boolean; email?: string | null; nickname?: string | null; participant_id?: string | null; participant_code?: string | null; first_name?: string | null; last_name?: string | null; accent_theme?: AccentTheme; color_mode?: ColorMode };
type Overview = { participant_count: number; measurement_count: number };
type Participant = { id: string; participant_code: string; is_active: boolean; created_at: string; revoked_consents?: Partial<Record<ConsentKind, string>>; birth_year?: number | null; biological_sex?: "male" | "female" | "unspecified" | null; dominant_hand?: string | null; gamepad_used?: boolean | null; pc_joystick_used?: boolean | null; rc_transmitter_used?: boolean | null; uav_flown?: boolean | null; uav_los?: boolean | null; uav_fpv?: boolean | null; uav_stabilized_mode?: boolean | null; uav_manual_mode?: boolean | null; }
type AdminAccount = { id: string; username: string; email: string | null; first_name?: string | null; last_name?: string | null; role: string; effective_role: string; is_active: boolean; participant_id: string | null; participant_code: string | null; created_at: string };
type TestDefinition = { id: string; test_code: string; name: string; version: string; status: string; analysis_profile: string; configuration: Record<string, unknown>; is_active: boolean };
type Measurement = { id: string; participant_id: string; test_definition_id: string | null; test_type: string; status: string; started_at: string; source_file_name: string | null; raw_sha256: string | null; raw_size_bytes: number | null; analysis_data: Record<string, unknown> | null; human_model_status?: string; human_model_revision?: number | null; compute_quality_status?: string; compute_quality_note?: string | null };
type ParticipantDetail = { participant: Participant; measurements: { id: string; test_type: string; status: string; started_at: string; raw_data_available?: boolean; raw_size_bytes?: number | null }[] };
type AdminSection = "overview" | "participants" | "groups" | "trends" | "reports" | "tests" | "measurements" | "welcome" | "clients" | "privacy";
type ParticipantGroup = { id: string; name: string; description: string | null; created_at: string; participant_ids: string[]; participant_codes: string[] };
type StudentMeasurement = { id: string; test_type: string; status: string; started_at: string; raw_size_bytes: number | null; analysis_data: Record<string, unknown> | null };
type StudentProfile = { username: string; email: string | null; nickname: string | null; role: string; participant_code: string; created_at: string; birth_year: number | null; biological_sex: "male" | "female" | "unspecified" | null; dominant_hand: string | null; gamepad_used: boolean | null; pc_joystick_used: boolean | null; rc_transmitter_used: boolean | null; uav_flown: boolean | null; uav_los: boolean | null; uav_fpv: boolean | null; uav_stabilized_mode: boolean | null; uav_manual_mode: boolean | null; }
type StudentDataRequest = { id: string; request_type: "access" | "rectification" | "erasure" | "restriction" | "portability" | "objection"; details: string | null; status: "received" | "in_review" | "completed" | "rejected"; response_note: string | null; created_at: string; updated_at: string; requester_email?: string | null; participant_code?: string | null; }

type DataRequestStatus = StudentDataRequest["status"];

const privacyRetentionPlaceholders = [
  { key: "account", label: "Účet a prihlasovacie údaje", period: null },
  { key: "profile", label: "Profil účastníka", period: null },
  { key: "measurements", label: "Merania, raw súbory a výsledky", period: null },
  { key: "consents", label: "Súhlasy a žiadosti o práva", period: null },
  { key: "backups", label: "Záložné kópie", period: null },
] as const;
const privacyNoticePlaceholders = [
  { key: "controller", label: "Prevádzkovateľ a kontaktné údaje" },
  { key: "purpose", label: "Účely a právne základy spracúvania" },
  { key: "recipients", label: "Príjemcovia a sprostredkovatelia" },
  { key: "retention", label: "Lehoty uchovávania a výmaz" },
] as const;
type StudentComparison = { available: boolean; minimum_group_size: number; cohort_participant_count: number; own_measurement_count: number; metrics: ComparisonMetric[]; response_curve: ComparisonResponseCurve | null };

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

type SortState = { column: string; direction: "asc" | "desc" };
type SortValue = string | number | null | undefined;

function nextSort(current: SortState, column: string): SortState {
  return current.column === column
    ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
    : { column, direction: "asc" };
}

function sortRows<T>(rows: T[], sort: SortState, valueFor: (row: T, column: string) => SortValue): T[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = valueFor(left, sort.column);
    const b = valueFor(right, sort.column);
    if (a == null || a === "") return b == null || b === "" ? 0 : 1;
    if (b == null || b === "") return -1;
    const comparison = typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
    return comparison * sign;
  });
}

function SortHeader({ label, active, direction, onClick }: {
  label: string; active: boolean; direction: "asc" | "desc"; onClick: () => void;
}) {
  return <button type="button" className={active ? "sort-header active" : "sort-header"}
    aria-pressed={active} onClick={onClick}>
    {label}<span aria-hidden="true">{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span>
  </button>;
}

function useDragScroll() {
  useEffect(() => {
    let active: { element: HTMLElement; pointerId: number; x: number; y: number; left: number; top: number; moved: boolean } | null = null;
    let suppress: HTMLElement | null = null;
    let suppressUntil = 0;
    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const element = target?.closest<HTMLElement>(".measurement-list, .table-wrap, .test-participant-table-wrap, .participant-table, .test-table, .trend-data-table");
      if (!element || (element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1)) return;
      if (target?.closest("input, select, textarea, a, [contenteditable='true'], .sort-header")) return;
      const itemButton = target?.closest(".measurement-item");
      if (target?.closest("button") && !itemButton) return;
      element.classList.add("drag-scroll");
      active = { element, pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop, moved: false };
    };
    const onMove = (event: PointerEvent) => {
      if (!active || active.pointerId !== event.pointerId) return;
      const dx = event.clientX - active.x;
      const dy = event.clientY - active.y;
      if (!active.moved && Math.hypot(dx, dy) < 5) return;
      active.moved = true;
      active.element.classList.add("is-dragging");
      active.element.scrollLeft = active.left - dx;
      active.element.scrollTop = active.top - dy;
      event.preventDefault();
    };
    const finish = (event: PointerEvent) => {
      if (!active || active.pointerId !== event.pointerId) return;
      if (active.moved) {
        suppress = active.element;
        suppressUntil = Date.now() + 250;
      }
      active.element.classList.remove("is-dragging");
      active = null;
    };
    const onClick = (event: MouseEvent) => {
      if (suppress && Date.now() < suppressUntil && event.target instanceof Node && suppress.contains(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppress = null;
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
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
  useDragScroll();
  const [metrics, setMetrics] = useState<PublicMetrics | null>(null);
  const [publishedWelcome, setPublishedWelcome] = useState<{ blocks: WelcomeBlock[] | null; data: WelcomeData }>({ blocks: null, data: {} });
  const [user, setUser] = useState<User | null>(null);
  const [accentTheme, setAccentTheme] = useState<AccentTheme>("blue");
  const [colorMode, setColorMode] = useState<ColorMode>("dark");
  const appearanceRequestId = useRef(0);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([]);
  const [accountMessage, setAccountMessage] = useState("");
  const [participantCode, setParticipantCode] = useState("");
  const [participantMessage, setParticipantMessage] = useState("");
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantSort, setParticipantSort] = useState<SortState>({ column: "code", direction: "asc" });
  const [testSort, setTestSort] = useState<SortState>({ column: "code", direction: "asc" });
  const [overviewParticipantSort, setOverviewParticipantSort] = useState<SortState>({ column: "last", direction: "desc" });
  const [trendSort, setTrendSort] = useState<SortState>({ column: "period", direction: "asc" });
  const [historySort, setHistorySort] = useState<SortState>({ column: "date", direction: "desc" });
  const [measurementSort, setMeasurementSort] = useState<SortState>({ column: "date", direction: "desc" });
  const [reportMeasurementSort, setReportMeasurementSort] = useState<SortState>({ column: "date", direction: "desc" });
  const [tests, setTests] = useState<TestDefinition[]>([]);
  const defaultTestConfiguration = `{
  "action_timeout_s": 3.0,
  "hold_time_s": 0.5,
  "fps": 100,
  "max_completed_actions": 50,
  "countdown_s": 3,
  "stick_max": 1000,
  "action_settings": {
    "generator_version": 1,
    "intervals": { "LX": [-0.8, 0.8], "LY": [-0.8, 0.8], "RY": [-0.8, 0.8], "RX": [-0.8, 0.8] },
    "points_per_axis": 9,
    "min_changed_axes": 1,
    "max_changed_axes": 2,
    "single_gimbal_probability": 0.5
  }
}`;
  const [testForm, setTestForm] = useState({ test_code: "", name: "", version: "1.0", analysis_profile: "SCOPE_STEP_RESPONSE_V1", configuration: defaultTestConfiguration });
  const [testMessage, setTestMessage] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [testModeFilter, setTestModeFilter] = useState<"ALL" | MeasurementMode>("ALL");
  const [resultMode, setResultMode] = useState<MeasurementMode>("SCOPE");
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [testRemovalTarget, setTestRemovalTarget] = useState<TestDefinition | null>(null);
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
  const [studentProfileReminder, setStudentProfileReminder] = useState(false);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("thrust-webdb-sidebar-collapsed") === "true");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [navOrder, setNavOrder] = useState<AdminSection[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("thrust-webdb-nav-order") || "[]") as AdminSection[];
      const allowed: AdminSection[] = ["overview", "participants", "groups", "trends", "reports", "tests", "measurements", "welcome", "clients", "privacy"];
      const uniqueStored = [...new Set(stored)].filter((item) => allowed.includes(item));
      return [...uniqueStored, ...allowed.filter((item) => !uniqueStored.includes(item))];
    } catch { return ["overview", "participants", "groups", "trends", "reports", "tests", "measurements", "welcome", "clients", "privacy"]; }
  });
  const [draggedNavItem, setDraggedNavItem] = useState<AdminSection | null>(null);
  const [dropTargetNavItem, setDropTargetNavItem] = useState<AdminSection | null>(null);
  const navListRef = useRef<HTMLElement | null>(null);
  const previousNavRects = useRef<Map<string, DOMRect> | null>(null);

  function applySignedInUser(signedIn: User) {
    setUser(signedIn);
    setAccentTheme(signedIn.accent_theme ?? "blue");
    setColorMode(signedIn.color_mode ?? "dark");
  }

  async function saveAppearance(nextAccent: AccentTheme, nextMode: ColorMode) {
    if (!user) return;
    const requestId = ++appearanceRequestId.current;
    const previousAccent = accentTheme;
    const previousMode = colorMode;
    setAccentTheme(nextAccent);
    setColorMode(nextMode);
    try {
      const saved = await request<{ accent_theme: AccentTheme; color_mode: ColorMode }>("/api/auth/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": user.csrf_token },
        body: JSON.stringify({ accent_theme: nextAccent, color_mode: nextMode }),
      });
      if (requestId !== appearanceRequestId.current) return;
      setAccentTheme(saved.accent_theme);
      setColorMode(saved.color_mode);
      setUser((current) => current ? { ...current, ...saved } : current);
    } catch (reason) {
      if (requestId !== appearanceRequestId.current) return;
      setAccentTheme(previousAccent);
      setColorMode(previousMode);
      setError(reason instanceof Error ? reason.message : t("Nastavenie vzhľadu sa nepodarilo uložiť."));
    }
  }

  useEffect(() => { localStorage.setItem("thrust-webdb-sidebar-collapsed", String(sidebarCollapsed)); }, [sidebarCollapsed]);
  useEffect(() => { localStorage.setItem("thrust-webdb-nav-order", JSON.stringify(navOrder)); }, [navOrder]);
  useLayoutEffect(() => {
    const workspace = document.querySelector(".app-main > .workspace");
    if (!workspace) return;
    const rows = workspace.querySelectorAll<HTMLElement>(".data-table-row, .measurement-item, .test-participant-table tbody tr");
    const positions = new Map<Element, number>();
    rows.forEach((row) => {
      const parent = row.parentElement;
      if (!parent) return;
      const index = positions.get(parent) ?? 0;
      positions.set(parent, index + 1);
      row.style.animationDelay = `${Math.min(index * 28, 560)}ms`;
    });
  }, [activeSection, participants, adminAccounts, measurements, tests, groups, trendData]);
  useLayoutEffect(() => {
    const nav = navListRef.current;
    const before = previousNavRects.current;
    previousNavRects.current = null;
    if (!nav || !before) return;
    const items = [...nav.querySelectorAll<HTMLElement>("[data-nav-id]")];
    const moved: HTMLElement[] = [];
    items.forEach((item) => {
      const oldRect = before.get(item.dataset.navId ?? "");
      if (!oldRect) return;
      const rect = item.getBoundingClientRect();
      const dx = oldRect.left - rect.left;
      const dy = oldRect.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      item.style.transition = "none";
      item.style.transform = `translate(${dx}px, ${dy}px)`;
      moved.push(item);
    });
    if (!moved.length) return;
    void nav.offsetHeight;
    const frame = requestAnimationFrame(() => moved.forEach((item) => {
      item.style.transition = "transform 280ms cubic-bezier(.2,.75,.25,1)";
      item.style.transform = "";
    }));
    const timeout = window.setTimeout(() => moved.forEach((item) => { item.style.transition = ""; }), 310);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timeout); };
  }, [navOrder]);

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
      applySignedInUser(sessionUser);
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
    if (!user || user.role === "student") return;
    let active = true;
    const refreshResearchData = () => {
      request<Overview>("/api/admin/overview").then((value) => { if (active) setOverview(value); }).catch(() => { if (active) setOverview(null); });
      request<Participant[]>("/api/admin/participants").then((value) => { if (active) setParticipants(value); }).catch(() => { if (active) setParticipants([]); });
      if (user.role === "admin" || user.role === "superadmin") {
        request<AdminAccount[]>("/api/admin/users").then((value) => { if (active) setAdminAccounts(value); }).catch((reason) => { if (active) setAccountMessage(reason instanceof Error ? reason.message : t("Používateľov sa nepodarilo načítať.")); });
      } else setAdminAccounts([]);
      request<TestDefinition[]>("/api/admin/tests").then((value) => { if (active) setTests(value); }).catch(() => { if (active) setTests([]); });
      request<Measurement[]>("/api/admin/measurements").then((value) => { if (active) setMeasurements(value); }).catch(() => { if (active) setMeasurements([]); });
      request<ParticipantGroup[]>("/api/admin/groups").then((value) => { if (active) setGroups(value); }).catch(() => { if (active) setGroups([]); });
    };
    refreshResearchData();
    window.addEventListener("thrust:data-updated", refreshResearchData);
    return () => {
      active = false;
      window.removeEventListener("thrust:data-updated", refreshResearchData);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const stream = new EventSource("/api/live/events");
    const refresh = () => window.dispatchEvent(new Event("thrust:data-updated"));
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    stream.addEventListener("measurement_updated", refresh);
    stream.addEventListener("force_logout", () => {
      stream.close();
      setUser(null);
      setOverview(null);
      setAccentTheme("blue");
      setColorMode("dark");
      window.alert(t("Správca odpojil tvoju reláciu WebDB. Prihlás sa znova."));
    });
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      stream.close();
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
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
    if (!(file instanceof File) || !file.size) {
      setUploadMessage(t("Vyber raw dátový súbor."));
      return;
    }
    const analysisFile = form.get("analysis_file");
    let analysisData: Record<string, unknown> | null = null;
    if (!(analysisFile instanceof File) || !analysisFile.size) {
      setUploadMessage(t("Vyber aj JSON analýzy vytvorený THRUST-measure."));
      return;
    }
    if (analysisFile instanceof File && analysisFile.size) {
      try {
        const parsed: unknown = JSON.parse(await analysisFile.text());
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(t("Neplatný JSON analýzy."));
        analysisData = parsed as Record<string, unknown>;
        if (analysisData.schema_version !== "thrust-analysis-v1") throw new Error(t("Analýza nemá podporovaný formát THRUST-measure."));
        if (!Number.isFinite(Date.parse(String(analysisData.started_at ?? "")))) throw new Error(t("Súbor analýzy nemá platný čas začiatku merania."));
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
    const analysisStart = Date.parse(String(analysisData?.started_at ?? ""));
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
          started_at: new Date(analysisStart).toISOString(),
          source_file_name: file.name,
          raw_content_type: file.name.toLowerCase().endsWith(".gz") ? "application/gzip" : "text/tab-separated-values",
          raw_log_base64: btoa(binary),
          status: "recorded",
          analysis_data: analysisData,
        }),
      });
      setMeasurements((current) => [uploaded, ...current]);
      setOverview((current) => current ? { ...current, measurement_count: current.measurement_count + 1 } : current);
      setUploadMessage(t("Raw log a nemenné výsledky Measure boli nahrané."));
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

  async function finalizeTest(test: TestDefinition) {
    if (!user || test.status !== "draft") return;
    if (!window.confirm(t("Finalizovať test? Po finalizácii už nebude možné upraviť jeho názov ani nastavenia."))) return;
    try {
      const saved = await request<TestDefinition>(`/api/admin/tests/${test.id}/finalize`, {
        method: "POST", headers: { "X-CSRF-Token": user.csrf_token },
      });
      setTests((current) => current.map((item) => item.id === saved.id ? saved : item));
      setEditingTestId((current) => current === saved.id ? null : current);
      setTestMessage(t("Test bol finalizovaný a jeho nastavenia sú uzamknuté."));
    } catch (reason) {
      setTestMessage(reason instanceof Error ? reason.message : t("Test sa nepodarilo finalizovať."));
    }
  }

  async function changeTestAvailability(test: TestDefinition, active: boolean) {
    if (!user) return;
    try {
      const saved = await request<TestDefinition>(`/api/admin/tests/${test.id}/${active ? "reactivate" : "deactivate"}`, {
        method: "POST", headers: { "X-CSRF-Token": user.csrf_token },
      });
      setTests((current) => current.map((item) => item.id === saved.id ? saved : item));
      setTestRemovalTarget(null);
      setTestMessage(active ? t("Test je opäť dostupný v THRUST-measure.") : t("Test bol deaktivovaný. Doterajšie merania zostali zachované."));
    } catch (reason) {
      setTestMessage(reason instanceof Error ? reason.message : t("Stav testu sa nepodarilo zmeniť."));
    }
  }

  async function deleteTestVersion(test: TestDefinition) {
    if (!user || user.role !== "superadmin") return;
    if (!window.confirm(t("Natrvalo zmazať tento test, všetky jeho merania a raw súbory? Táto akcia sa nedá vrátiť."))) return;
    const attached = measurements.filter((item) => item.test_definition_id === test.id);
    try {
      await request<void>("/api/admin/tests/" + test.id, { method: "DELETE", headers: { "X-CSRF-Token": user.csrf_token } });
      const removedIds = new Set(attached.map((item) => item.id));
      setMeasurements((current) => current.filter((item) => !removedIds.has(item.id)));
      setSelectedMeasurementIds((current) => current.filter((id) => !removedIds.has(id)));
      if (selectedMeasurementId && removedIds.has(selectedMeasurementId)) setSelectedMeasurementId(null);
      setOverview((current) => current ? { ...current, measurement_count: Math.max(0, current.measurement_count - attached.length) } : current);
      setTests((current) => current.filter((item) => item.id !== test.id));
      if (selectedTestId === test.id) setSelectedTestId(null);
      setEditingTestId((current) => current === test.id ? null : current);
      setTestRemovalTarget(null);
      setTestMessage(t("Test a všetky jeho merania boli natrvalo odstránené."));
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
    try {
      const signedIn = await request<User>("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          nickname: data.get("nickname") || null,
          password: data.get("password"), research_consent: data.get("research_consent") === "on",
          gdpr_consent: data.get("gdpr_consent") === "on",
          consent_version: consentTexts?.research.version || "research-v4",
          gdpr_consent_version: consentTexts?.gdpr.version || "gdpr-v3",
          consent_language: language,
        }),
      });
      setStudentProfileReminder(true);
      applySignedInUser(signedIn); leaveRegistration();
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
      applySignedInUser(signedIn);
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
      setAccountMessage(account.role === "student" ? t("Dočasné heslo je nastavené. Pri ďalšom prihlásení ho študent bude musieť zmeniť.") : t("Heslo zmenené. Používateľ sa musí prihlásiť znova."));
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
      applySignedInUser(signedIn);
      setLoginOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Prihlásenie zlyhalo."));
    }
  }

  async function logout() {
    if (!user) return;
    await request<void>("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": user.csrf_token } });
    setUser(null);
    setStudentProfileReminder(false);
    setAccentTheme("blue");
    setColorMode("dark");
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
    const filtered = tests.filter((test) => (testModeFilter === "ALL" || test.analysis_profile.toUpperCase().startsWith(testModeFilter)) && (!query || [test.test_code, test.name, test.version, test.analysis_profile].join(" ").toLowerCase().includes(query)));
    const ordered = sortRows(filtered, testSort, (test, column) => ({
      code: test.test_code, name: test.name, version: test.version,
      profile: test.analysis_profile, status: test.status,
    }[column as "code" | "name" | "version" | "profile" | "status"]));
    return [...ordered.filter((test) => test.is_active), ...ordered.filter((test) => !test.is_active)];
  }

  function participantMeasurements(participantId: string) {
    return measurements.filter((measurement) => measurement.participant_id === participantId && measurement.raw_sha256);
  }

  function filteredParticipants() {
    const query = participantSearch.trim().toLowerCase();
    const filtered = participants.filter((participant) => {
      const account = adminAccounts.find((item) => item.participant_id === participant.id);
      return !query || [participant.participant_code, account?.first_name, account?.last_name, account?.email, account?.username].filter(Boolean).join(" ").toLowerCase().includes(query);
    });
    return sortRows(filtered, participantSort, (participant, column) => {
      const account = adminAccounts.find((item) => item.participant_id === participant.id);
      const runs = participantMeasurements(participant.id);
      const dates = runs.map((item) => item.started_at).sort();
      return ({
        code: participant.participant_code,
        account: [account?.first_name, account?.last_name].filter(Boolean).join(" ") || account?.username || account?.email || "",
        first: dates[0],
        last: dates.at(-1),
        count: runs.length,
      }[column as "code" | "account" | "first" | "last" | "count"]);
    });
  }

  function visibleAccountOnlyRows() {
    const query = participantSearch.trim().toLowerCase();
    const filtered = adminAccounts.filter((account) => !account.participant_id &&
      (!query || [account.first_name, account.last_name, account.email, account.username, account.role].filter(Boolean).join(" ").toLowerCase().includes(query)));
    return sortRows(filtered, participantSort, (account, column) => ({
      code: "", account: [account.first_name, account.last_name].filter(Boolean).join(" ") || account.username || account.email,
      first: null, last: null, count: null,
    }[column as "code" | "account" | "first" | "last" | "count"]));
  }

  function accountManagementActions(account: AdminAccount | null) {
    if (!account) return <span className="muted">{t("Bez prihlasovacieho účtu")}</span>;
    return <span className="role-label">{account.effective_role}</span>;
  }

  const navItems: { id: AdminSection; icon: string; label: string }[] = [
    { id: "overview", icon: "⌂", label: t("Prehľad") },
    { id: "participants", icon: "◎", label: t("Účastníci a účty") },
    { id: "groups", icon: "◉", label: t("Skupiny") },
    { id: "trends", icon: "⌁", label: t("Trendy") },
    { id: "reports", icon: "⇩", label: t("Exporty a reporty") },
    { id: "tests", icon: "▣", label: t("Testy a konfigurácie") },
    { id: "measurements", icon: "↗", label: t("Merania a výsledky") },
    { id: "welcome", icon: "✎", label: t("Úvodná stránka") },
    { id: "clients", icon: "◉", label: t("Pripojení klienti") },
    { id: "privacy", icon: "⌑", label: t("Žiadosti o údaje") },
  ];
  const visibleNavItems = navOrder.map((id) => navItems.find((item) => item.id === id)!).filter((item) => (item.id !== "welcome" && item.id !== "clients" && item.id !== "privacy") || user?.role === "admin" || user?.role === "superadmin");
  function moveNavItem(target: AdminSection) {
    if (!draggedNavItem || draggedNavItem === target) return;
    const nav = navListRef.current;
    previousNavRects.current = nav ? new Map([...nav.querySelectorAll<HTMLElement>("[data-nav-id]")].map((item) => [item.dataset.navId ?? "", item.getBoundingClientRect()])) : null;
    setNavOrder((current) => {
      const next = [...current];
      const from = next.indexOf(draggedNavItem);
      const to = next.indexOf(target);
      if (from < 0 || to < 0) return current;
      next.splice(from, 1);
      next.splice(to, 0, draggedNavItem);
      return next;
    });
    setDraggedNavItem(null);
  }

  if (user?.role === "student") return <StudentPortal user={user} onLogout={logout} onPasswordChanged={() => setUser((current) => current ? { ...current, must_change_password: false } : current)} accentTheme={accentTheme} colorMode={colorMode} onAppearanceChange={(theme, mode) => void saveAppearance(theme, mode)} profileReminder={studentProfileReminder} onDismissProfileReminder={() => setStudentProfileReminder(false)} />;
  if (isRegisterPage && !user) return <>
    <RegistrationPage onSubmit={register} onBack={leaveRegistration} onLogin={() => { leaveRegistration(); setLoginOpen(true); }} onResearcherRegister={openResearcherRegistration} error={error} consentTexts={consentTexts} onOpenConsent={setConsentDialog} />
    {consentDialog && consentTexts && <ConsentTextDialog kind={consentDialog} document={activeConsentDocument || consentTexts[consentDialog]} onClose={() => { setConsentDialog(null); setActiveConsentDocument(null); }} />}
  </>;
  if (isResearcherRegisterPage && !user) return <>
    <ResearcherRegistrationPage onSubmit={registerResearcher} onBack={leaveRegistration} onStudentRegister={openRegistration} onLogin={() => { leaveRegistration(); setLoginOpen(true); }} error={error} consentTexts={consentTexts} onOpenConsent={setConsentDialog} />
    {consentDialog && consentTexts && <ConsentTextDialog kind={consentDialog} document={activeConsentDocument || consentTexts[consentDialog]} onClose={() => { setConsentDialog(null); setActiveConsentDocument(null); }} />}
  </>;

  return (
    <main data-accent-theme={user ? accentTheme : "blue"} data-color-mode={user ? colorMode : "dark"}>
      {user ? (
        <div className={`${sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}${mobileNavOpen ? " mobile-nav-open" : ""}`}>
          {mobileNavOpen && <button className="mobile-nav-backdrop" type="button" aria-label={t("Zavrieť menu")} onClick={() => setMobileNavOpen(false)} />}
          <aside className="sidebar">
            <div className="sidebar-brand-row"><Brand colorMode={colorMode} /><button type="button" className="sidebar-toggle" aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed ? t("Rozbaliť menu") : t("Zbaliť menu")} title={sidebarCollapsed ? t("Rozbaliť menu") : t("Zbaliť menu")} onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}>{sidebarCollapsed ? "»" : "«"}</button><button type="button" className="mobile-menu-close" aria-label={t("Zavrieť menu")} onClick={() => setMobileNavOpen(false)}>×</button></div>
            <nav ref={navListRef} className="side-nav" aria-label={t("Administrácia")}>
              {visibleNavItems.map((item) => <button key={item.id} data-nav-id={item.id} type="button" draggable onDragStart={(event) => { setDraggedNavItem(item.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); }} onDragEnter={() => setDropTargetNavItem(item.id)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTargetNavItem(item.id); }} onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropTargetNavItem(null); }} onDrop={(event) => { event.preventDefault(); moveNavItem(item.id); setDropTargetNavItem(null); }} onDragEnd={() => { setDraggedNavItem(null); setDropTargetNavItem(null); }} title={sidebarCollapsed ? item.label : t("Potiahni na zmenu poradia") + ` · ${item.label}`} aria-label={item.label} className={`nav-item${activeSection === item.id ? " active" : ""}${draggedNavItem === item.id ? " nav-item-dragging" : ""}${dropTargetNavItem === item.id && draggedNavItem !== item.id ? " nav-item-drop-target" : ""}`} onClick={() => { setActiveSection(item.id); setMobileNavOpen(false); }}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span className="nav-label">{item.label}</span></button>)}
            </nav>
            <div className="sidebar-footer"><span className="sidebar-user">{user.username} · {user.role}</span><button className="quiet" onClick={logout} title={t("Odhlásiť")}>{sidebarCollapsed ? "↪" : t("Odhlásiť")}</button></div>
          </aside>
          <div className="app-main">
            <header className="topbar"><button type="button" className="mobile-menu-toggle" aria-label={mobileNavOpen ? t("Zavrieť menu") : t("Otvoriť menu")} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}><span /><span /><span /></button><div className="topbar-title"><div className="eyebrow">{t("ADMINISTRÁCIA ·")} {user.role.toUpperCase()}</div><h1>{activeSection === "overview" ? t("Prehľad meraní") : activeSection === "participants" ? t("Účastníci a účty") : activeSection === "groups" ? t("Skupiny") : activeSection === "trends" ? t("Trendy") : activeSection === "reports" ? t("Exporty a reporty") : activeSection === "tests" ? t("Testy a konfigurácie") : activeSection === "welcome" ? t("Úvodná stránka") : activeSection === "clients" ? t("Pripojení klienti") : activeSection === "privacy" ? t("Žiadosti o údaje") : t("Merania a výsledky")}</h1></div><div className="header-actions"><AppearanceControls accentTheme={accentTheme} colorMode={colorMode} onAccentChange={(theme) => void saveAppearance(theme, colorMode)} onModeChange={(mode) => void saveAppearance(accentTheme, mode)} /><LanguageSwitcher /><span className="status-dot">{t("Systém online")}</span></div></header>
            <section className="workspace">
              {activeSection === "welcome" && (user.role === "admin" || user.role === "superadmin") && <WelcomeEditor csrfToken={user.csrf_token} initialLanguage={language} metrics={metrics} />}
              {activeSection === "clients" && (user.role === "admin" || user.role === "superadmin") && <ClientMonitor csrfToken={user.csrf_token} />}
              {activeSection === "privacy" && (user.role === "admin" || user.role === "superadmin") && <StudentDataRequestAdminQueue csrfToken={user.csrf_token} />}
              {activeSection === "overview" && <>
                <div className="stats"><Metric label={t("Účastníci")} value={overview?.participant_count ?? "—"} /><Metric label={t("Merania")} value={overview?.measurement_count ?? "—"} /><Metric label={t("Čakajúce synchronizácie")} value="0" /></div>
                <div className="empty"><span>01</span><div><h2>{t("Databáza je pripravená")}</h2><p>{t("Vyber sekciu vľavo alebo začni vytvorením účastníka.")}</p></div></div>
                <div className="admin-grid">{(user.role === "admin" || user.role === "superadmin") && <section className="panel quick-panel"><div className="eyebrow">{t("RÝCHLA AKCIA")}</div><h2>{t("Nový účastník")}</h2><p className="muted">{t("Vytvor pseudonymné ID a priraď k nemu neskoršie merania.")}</p><button className="primary" onClick={() => setActiveSection("participants")}>{t("Otvoriť administráciu účastníkov")}</button></section>}<section className="panel quick-panel"><div className="eyebrow">{t("RÝCHLA AKCIA")}</div><h2>{t("Synchronizované výsledky")}</h2><p className="muted">{t("Zobraz merania odoslané z lokálneho THRUST/SCoPE klienta.")}</p><button className="primary" onClick={() => setActiveSection("measurements")}>{t("Otvoriť evidenciu meraní")}</button></section></div>
              </>}
              {activeSection === "participants" && <>
                <section className="browser-panel">
                  <div className="browser-header"><div><div className="eyebrow">{t("ÚČASTNÍCI A ÚČTY")}</div><h2>{user.role === "researcher" ? t("Účastníci a výskumné dáta") : t("Spoločná evidencia účastníkov a kont")}</h2><p className="muted">{user.role === "researcher" ? t("Výsledky, merania a pseudonymné profily účastníkov.") : t("Participant ID, používateľské konto a rola sú zobrazené spolu. Účty bez Participant ID sú súčasťou toho istého zoznamu.")}</p></div><div className="actions"><button className="quiet compact" onClick={() => void refreshAccounts()}>{t("Obnoviť")}</button>{(user.role === "admin" || user.role === "superadmin") && <button className="primary compact" onClick={() => document.getElementById("new-participant-code")?.focus()}>{t("Nové anonymné ID")}</button>}</div></div>
                  {accountMessage && <p className="notice">{accountMessage}</p>}
                  <div className="browser-toolbar"><input placeholder={t("Hľadať ID, meno, e-mail alebo login…")} value={participantSearch} onChange={(event) => setParticipantSearch(event.target.value)} /></div>
                  <div className="data-table participant-table"><div className="data-table-head"><SortHeader label={t("Participant ID")} active={participantSort.column === "code"} direction={participantSort.direction} onClick={() => setParticipantSort((current) => nextSort(current, "code"))} /><SortHeader label={user.role === "researcher" ? t("Profil účastníka") : t("Konto / rola")} active={participantSort.column === "account"} direction={participantSort.direction} onClick={() => setParticipantSort((current) => nextSort(current, "account"))} /><SortHeader label={t("Prvé meranie")} active={participantSort.column === "first"} direction={participantSort.direction} onClick={() => setParticipantSort((current) => nextSort(current, "first"))} /><SortHeader label={t("Posledné meranie")} active={participantSort.column === "last"} direction={participantSort.direction} onClick={() => setParticipantSort((current) => nextSort(current, "last"))} /><SortHeader label={t("Meraní")} active={participantSort.column === "count"} direction={participantSort.direction} onClick={() => setParticipantSort((current) => nextSort(current, "count"))} /><span>{t("Akcie")}</span></div>
                    {filteredParticipants().map((participant) => {
                      const rows = participantMeasurements(participant.id);
                      const first = rows.length ? rows[rows.length - 1].started_at : null;
                      const last = rows.length ? rows[0].started_at : null;
                      const account = adminAccounts.find((item) => item.participant_id === participant.id) || null;
                      return <div className="data-table-row" key={participant.id}>
                        <strong>{participant.participant_code}{(participant.revoked_consents?.research || participant.revoked_consents?.gdpr) && <small className="consent-review-badge">{t("Vyžaduje riešenie")}</small>}</strong>
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

                     {(participant.revoked_consents?.research || participant.revoked_consents?.gdpr) && <section className="participant-detail-section consent-review-panel"><div className="eyebrow">{t("VYŽADUJE RIEŠENIE")}</div><h3>{t("Odvolané súhlasy")}</h3>
                       {participant.revoked_consents.research && <p>{t("Výskumný súhlas odvolaný")}: {formatDateTime(participant.revoked_consents.research)}</p>}
                       {participant.revoked_consents.gdpr && <p>{t("Súhlas s osobnými údajmi odvolaný")}: {formatDateTime(participant.revoked_consents.gdpr)}</p>}
                       <p className="muted">{t("Nové merania sú pozastavené a účastník je vynechaný z výskumných výstupov. Posúďte existujúce údaje a zvoľte primeraný krok; samotné odvolanie ich automaticky nevymazáva.")}</p>
                       {user?.role === "superadmin" && <div className="actions">{linkedAccount && linkedAccount.effective_role !== "superadmin" && <button className="quiet compact" onClick={() => void anonymizeAccount(linkedAccount)}>{t("Deaktivovať a anonymizovať konto")}</button>}<button className="quiet compact danger" onClick={() => void permanentlyDeleteParticipant(participant, linkedAccount)}>{t("Trvalo vymazať všetko")}</button></div>}
                     </section>}

                     <section className="participant-detail-section">
                       <div className="participant-section-heading"><div><div className="eyebrow">{t("SÚHRN VÝSLEDKOV")}</div><h3>{resultMode === "SCOPE" ? "SCoPE" : "SimPLE"}</h3></div></div>
                       <AllMeasurementStats measurements={rows} mode={resultMode} />
                     </section>

                     <section className="participant-detail-section">
                       <div className="participant-section-heading"><div><div className="eyebrow">{t("HISTÓRIA")}</div><h3>{t("Posledných 5 meraní")}</h3></div><span className="muted">{rows.length} {t("spolu")}</span></div>
                       {rows.length ? <div className="data-table participant-history-table">
                         <div className="data-table-head"><SortHeader label={t("Test")} active={historySort.column === "test"} direction={historySort.direction} onClick={() => setHistorySort((current) => nextSort(current, "test"))} /><SortHeader label={t("Dátum a čas")} active={historySort.column === "date"} direction={historySort.direction} onClick={() => setHistorySort((current) => nextSort(current, "date"))} /><SortHeader label={t("Veľkosť súboru")} active={historySort.column === "size"} direction={historySort.direction} onClick={() => setHistorySort((current) => nextSort(current, "size"))} /><SortHeader label={t("Stav")} active={historySort.column === "status"} direction={historySort.direction} onClick={() => setHistorySort((current) => nextSort(current, "status"))} /><span>{t("Výsledok")}</span></div>
                         {sortRows(rows, historySort, (measurement, column) => ({ test: measurement.test_type, date: measurement.started_at, size: measurement.raw_size_bytes ?? 0, status: measurement.status }[column as "test" | "date" | "size" | "status"])).slice(0, 5).map((measurement) => {
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
                           [t("Rok narodenia"), participant.birth_year ?? t("Neuvedené")],
                           [t("Biologické pohlavie"), biologicalSexLabel(participant.biological_sex)],
                           [t("Dominantná ruka"), profileLabel(participant.dominant_hand)],
                           [t("Herný gamepad"), yesNoLabel(participant.gamepad_used)],
                           [t("PC joystick"), yesNoLabel(participant.pc_joystick_used)],
                           [t("RC vysielač"), yesNoLabel(participant.rc_transmitter_used)],
                           [t("Lietal(a) s UAV"), yesNoLabel(participant.uav_flown)],
                           [t("LOS"), yesNoLabel(participant.uav_los)],
                           [t("FPV"), yesNoLabel(participant.uav_fpv)],
                           [t("Stabilizovaný režim"), yesNoLabel(participant.uav_stabilized_mode)],
                           [t("Manuálny / acro režim"), yesNoLabel(participant.uav_manual_mode)],
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
                     {(user?.role === "admin" || user?.role === "superadmin") && <section className="participant-detail-section participant-edit-section"><div className="participant-section-heading"><div><div className="eyebrow">{t("EDITÁCIA")}</div><h3>{t("Upraviť údaje účastníka")}</h3></div></div><ParticipantProfileEditor participant={participant} csrfToken={user.csrf_token} onSaved={(updated) => { const withConsent = { ...updated, revoked_consents: participant.revoked_consents }; setParticipants((items) => items.map((item) => item.id === updated.id ? withConsent : item)); setSelectedParticipant((current) => current ? { ...current, participant: withConsent } : current); setAccountMessage(t("Profil účastníka bol uložený.")); }} /></section>}
                   </section>;
                   return <section className="browser-detail detail-modal-open participant-detail-modal">
                    <div className="detail-header"><div><div className="eyebrow">{t("MERANIA ÚČASTNÍKA")}</div><h2>{participant.participant_code}</h2></div><div className="detail-header-actions"><ModeSwitch value={resultMode} onChange={changeResultMode} /><button className="quiet compact" onClick={() => { setParticipantDialog(null); setSelectedMeasurementId(null); }}>{t("Zavrieť")}</button></div></div>
                    <p className="muted">{t("História")} {resultMode === "SCOPE" ? "SCoPE" : "SimPLE"} {t("meraní účastníka.")}</p>
                    <div className="data-table participant-history-table"><div className="data-table-head"><SortHeader label={t("Test")} active={historySort.column === "test"} direction={historySort.direction} onClick={() => setHistorySort((current) => nextSort(current, "test"))} /><SortHeader label={t("Dátum a čas")} active={historySort.column === "date"} direction={historySort.direction} onClick={() => setHistorySort((current) => nextSort(current, "date"))} /><SortHeader label={t("Veľkosť súboru")} active={historySort.column === "size"} direction={historySort.direction} onClick={() => setHistorySort((current) => nextSort(current, "size"))} /><SortHeader label={t("Stav")} active={historySort.column === "status"} direction={historySort.direction} onClick={() => setHistorySort((current) => nextSort(current, "status"))} /><span>{t("Akcia")}</span></div>{sortRows(rows, historySort, (measurement, column) => ({ test: measurement.test_type, date: measurement.started_at, size: measurement.raw_size_bytes ?? 0, status: measurement.status }[column as "test" | "date" | "size" | "status"])).map((measurement) => <div className="data-table-row" key={measurement.id}><strong>{measurement.test_type}</strong><span>{formatDateTime(measurement.started_at)}</span><span>{formatBytes(measurement.raw_size_bytes)}</span><span>{measurement.status}</span><button className="quiet compact row-actions" onClick={() => setSelectedMeasurementId(measurement.id)}>{t("Otvoriť výsledok")}</button></div>)}</div>
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
                  <div className="browser-header"><div><div className="eyebrow">{t("SPRÁVA SKUPÍN")}</div><h2>{t("Skupiny účastníkov")}</h2><p className="muted">{t("Vytváraj výskumné skupiny z pseudonymných Participant ID. Výber účastníkov na analýzu je na samostatnej stránke Trendy.")}</p></div></div>
                  {groupMessage && <p className="notice">{groupMessage}</p>}
                  <div className="filters"><select value={selectedGroupId} onChange={(event) => { const id = event.target.value; setSelectedGroupId(id); const found = groups.find((item) => item.id === id); if (found) { setGroupName(found.name); setGroupDescription(found.description ?? ""); setGroupMemberIds(found.participant_ids); } else { setGroupName(""); setGroupDescription(""); setGroupMemberIds([]); } }}><option value="">{t("Nová skupina / vyber existujúcu")}</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} · {group.participant_ids.length}</option>)}</select></div>
                  <form className="measurement-form" onSubmit={saveParticipantGroup}><label>{t("Názov skupiny")}<input required maxLength={120} value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label><label>{t("Popis")}<input maxLength={500} value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} /></label><div className="group-members"><strong>{t("Členovia · Participant ID")}</strong>{participants.filter((item) => item.is_active).map((participant) => <label key={participant.id}><input type="checkbox" checked={groupMemberIds.includes(participant.id)} onChange={(event) => setGroupMemberIds((ids) => event.target.checked ? [...ids, participant.id] : ids.filter((id) => id !== participant.id))} /> {participant.participant_code}</label>)}</div><div className="actions"><button type="button" className="quiet" onClick={() => { setSelectedGroupId(""); setGroupName(""); setGroupDescription(""); setGroupMemberIds([]); }}>{t("Nová skupina")}</button><button className="primary" type="submit">{selectedGroupId ? t("Uložiť skupinu") : t("Vytvoriť skupinu")}</button></div></form>
                </section>
              </>}
              {activeSection === "trends" && <>
                <section className="browser-panel"><div className="browser-header"><div><div className="eyebrow">{t("DLHODOBÉ ŠTATISTIKY")}</div><h2>{t("Porovnanie účastníkov a skupín")}</h2><p className="muted">{t("Vyber ľubovoľných jednotlivcov aj skupiny. Pri skupinách tabuľka a graf zobrazia priemer členov v období alebo pre test.")}</p></div></div>
                  <div className="trend-select-grid"><label>{t("Jednotlivci · môžeš vybrať viac") }<select multiple size={6} value={trendParticipants} onChange={(event) => setTrendParticipants(Array.from(event.target.selectedOptions, (item) => item.value))}>{participants.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.participant_code}</option>)}</select></label><label>{t("Skupiny · môžeš vybrať viac")}<select multiple size={6} value={trendGroups} onChange={(event) => setTrendGroups(Array.from(event.target.selectedOptions, (item) => item.value))}>{groups.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.participant_ids.length}</option>)}</select></label></div>
                  {(() => { const selectedIds = new Set([...trendParticipants, ...groups.filter((g) => trendGroups.includes(g.id)).flatMap((g) => g.participant_ids)]); const options = Array.from(new Set(measurements.filter((m) => selectedIds.has(m.participant_id)).flatMap((m) => Object.keys(measurementMetrics(m.analysis_data))))).sort(); return <div className="filters"><label>{t("Parameter")}<select value={trendMetric} onChange={(event) => setTrendMetric(event.target.value)}><option value="">{t("Vyber parameter")}</option>{options.map((metric) => <option key={metric} value={metric}>{metric}</option>)}</select></label><label>{t("Os X")}<select value={trendAxis} onChange={(event) => setTrendAxis(event.target.value as "date" | "test")}><option value="date">{t("Dátum")}</option><option value="test">{t("Test")}</option></select></label><label>{t("Od dátumu")}<input type="date" value={trendFrom} onChange={(event) => setTrendFrom(event.target.value)} /></label><label>{t("Do dátumu")}<input type="date" value={trendTo} onChange={(event) => setTrendTo(event.target.value)} /></label><button className="primary" onClick={() => void loadTrendAnalysis()}>{t("Vykresliť trend")}</button></div>; })()}
                  {trendMessage && <p className="notice">{trendMessage}</p>}
                </section>
                {trendData && <section className="browser-panel"><div className="browser-header"><div><div className="eyebrow">{t("TREND ·")}{trendData.metric}</div><h2>{t("Graf a tabuľkové hodnoty")}</h2></div><div className="actions"><a className="quiet compact" href={`/api/admin/reports/trends.png?${trendQuery()}`} download="thrust-trend.png">{t("Stiahnuť PNG graf")}</a><a className="primary compact" href={`/api/admin/reports/trends.csv?${trendQuery()}`}>{t("Stiahnuť CSV")}</a></div></div><img className="report-chart-image" src={`/api/admin/reports/trends.png?${trendQuery()}&v=${Date.now()}`} alt={t("Matplotlib graf trendu")} /><div className="data-table trend-data-table"><div className="data-table-head"><SortHeader label={t("Účastník / skupina")} active={trendSort.column === "subject"} direction={trendSort.direction} onClick={() => setTrendSort((current) => nextSort(current, "subject"))} /><SortHeader label={t("Obdobie")} active={trendSort.column === "period"} direction={trendSort.direction} onClick={() => setTrendSort((current) => nextSort(current, "period"))} /><SortHeader label={t("Priemer")} active={trendSort.column === "mean"} direction={trendSort.direction} onClick={() => setTrendSort((current) => nextSort(current, "mean"))} /><SortHeader label={t("SD")} active={trendSort.column === "sd"} direction={trendSort.direction} onClick={() => setTrendSort((current) => nextSort(current, "sd"))} /><SortHeader label={t("Účastníkov")} active={trendSort.column === "participants"} direction={trendSort.direction} onClick={() => setTrendSort((current) => nextSort(current, "participants"))} /><SortHeader label={t("Počet meraní")} active={trendSort.column === "count"} direction={trendSort.direction} onClick={() => setTrendSort((current) => nextSort(current, "count"))} /></div>{sortRows(trendData.series.flatMap((series) => series.points.map((point) => ({ series, point }))), trendSort, ({ series, point }, column) => ({
                    subject: series.subject, period: point.label, mean: point.mean, sd: point.sd_sample ?? null,
                    participants: point.participant_count, count: point.measurement_count,
                  }[column as "subject" | "period" | "mean" | "sd" | "participants" | "count"])).map(({ series, point }) => <div className="data-table-row" key={`${series.subject_id}-${point.label}`}><strong>{series.subject}</strong><span>{point.label}</span><span>{point.mean.toPrecision(5)}</span><span>{point.sd_sample?.toPrecision(4) ?? "—"}</span><span>{point.participant_count}</span><span>{point.measurement_count}</span></div>)}</div></section>}
              </>}
              {activeSection === "reports" && <>
                <section className="browser-panel"><div className="browser-header"><div><div className="eyebrow">{t("EXPORTY A REPORTY")}</div><h2>{t("Stiahnuť analýzy a merania")}</h2><p className="muted">{t("Vyber merania a stiahni ich raw log, nemennú uloženú analýzu alebo tabuľku CSV.")}</p></div></div>
                  <div className="filters"><ModeSwitch value={resultMode} onChange={changeResultMode} /><label>{t("Účastník")}<select value={measurementParticipantFilter} onChange={(event) => setMeasurementParticipantFilter(event.target.value)}><option value="">{t("Všetci účastníci")}</option>{participants.map((p) => <option key={p.id} value={p.id}>{p.participant_code}</option>)}</select></label><label>{t("Test")}<select value={measurementTestFilter} onChange={(event) => setMeasurementTestFilter(event.target.value)}><option value="">{t("Všetky testy")}</option>{tests.map((test) => <option key={test.id} value={test.id}>{test.name} · v{test.version}</option>)}</select></label><label>{t("Od dátumu")}<input type="date" value={measurementDateFrom} onChange={(event) => setMeasurementDateFrom(event.target.value)} /></label><label>{t("Do dátumu")}<input type="date" value={measurementDateTo} onChange={(event) => setMeasurementDateTo(event.target.value)} /></label></div>
                  <div className="selection-toolbar"><label><input type="checkbox" checked={filteredMeasurements().length > 0 && filteredMeasurements().every((m) => reportMeasurementIds.includes(m.id))} onChange={() => setReportMeasurementIds(filteredMeasurements().every((m) => reportMeasurementIds.includes(m.id)) ? [] : filteredMeasurements().map((m) => m.id))} /> {t("Vybrať filtrované")}</label><span>{reportMeasurementIds.length} {t("vybraných")}</span></div>
                  <div className="measurement-list report-measurement-list">
                    <div className="measurement-list-head"><span aria-hidden="true"></span><SortHeader label={t("Participant ID")} active={reportMeasurementSort.column === "participant"} direction={reportMeasurementSort.direction} onClick={() => setReportMeasurementSort((current) => nextSort(current, "participant"))} /><SortHeader label={t("Test")} active={reportMeasurementSort.column === "test"} direction={reportMeasurementSort.direction} onClick={() => setReportMeasurementSort((current) => nextSort(current, "test"))} /><SortHeader label={t("Dátum a čas")} active={reportMeasurementSort.column === "date"} direction={reportMeasurementSort.direction} onClick={() => setReportMeasurementSort((current) => nextSort(current, "date"))} /><SortHeader label={t("Analýza")} active={reportMeasurementSort.column === "analysis"} direction={reportMeasurementSort.direction} onClick={() => setReportMeasurementSort((current) => nextSort(current, "analysis"))} /></div>
                    {sortRows(filteredMeasurements(), reportMeasurementSort, (m, column) => ({
                      participant: participantCodeFor(m.participant_id), test: m.test_type, date: m.started_at,
                      analysis: m.analysis_data ? 1 : 0,
                    }[column as "participant" | "test" | "date" | "analysis"])).map((m) => <label className="measurement-item" key={m.id}>
                      <input type="checkbox" checked={reportMeasurementIds.includes(m.id)} onChange={(event) => setReportMeasurementIds((ids) => event.target.checked ? [...ids, m.id] : ids.filter((id) => id !== m.id))} />
                      <strong>{participantCodeFor(m.participant_id)}</strong><span>{m.test_type}</span><span>{formatDateTime(m.started_at)}</span><small>{m.status === "incomplete" ? t("Nedokončené meranie") : m.human_model_status === "accepted" ? tf("Human model prijatý · v{0}", m.human_model_revision ?? "—") : (m.analysis_data ? t("Analýza uložená · human model chýba") : t("Bez uloženej analýzy"))}</small>
                    </label>)}
                  </div>
                  <div className="actions report-actions"><button className="quiet" disabled={!reportMeasurementIds.length} onClick={() => void downloadProtectedFile(`/api/admin/reports/measurements.csv?${reportMeasurementIds.map((id) => `measurement_ids=${encodeURIComponent(id)}`).join("&")}`, "thrust-measurements.csv")}>{t("Stiahnuť tabuľku CSV")}</button>{reportMeasurementIds.length === 1 && (() => { const id = reportMeasurementIds[0]; const selected = measurements.find((m) => m.id === id); return <><a className="quiet" href={`/api/admin/measurements/${id}/raw`}>{t("Stiahnuť raw TSV/GZIP")}</a><button className="quiet" onClick={() => { if (selected) { const blob = new Blob([JSON.stringify(selected, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `measurement-${id}.json`; link.click(); URL.revokeObjectURL(link.href); } }}>{t("Stiahnuť JSON analýzy")}</button></>; })()}</div>
                </section>
                {user.role === "superadmin" && <section className="panel quick-panel"><div className="eyebrow">{t("SUPERADMIN · KOMPLETNÝ EXPORT")}</div><h2>{t("Všetky pseudonymné dáta WebDB")}</h2><p className="muted">{t("ZIP obsahuje profily účastníkov, skupiny, definície testov, analýzy a všetky dostupné raw logy. Neobsahuje prihlasovacie účty.")}</p><button className="primary" onClick={() => void downloadProtectedFile("/api/admin/reports/all-data.zip", "thrust-webdb-full-export.zip", user.csrf_token)}>{t("Stiahnuť kompletný ZIP")}</button></section>}
              </>}
              {activeSection === "tests" && <>
                <section className="browser-panel">
                  <div className="browser-header"><div><div className="eyebrow">{t("KATALÓG TESTOV")}</div><h2>{t("Testy a konfigurácie")}</h2><p className="muted">{t("Každá verzia testu je samostatná, nemenná konfigurácia pre THRUST.")}</p></div></div>
                  <div className="browser-toolbar"><select value={testModeFilter} onChange={(event) => setTestModeFilter(event.target.value as "ALL" | MeasurementMode)} aria-label={t("Režim testu")}><option value="ALL">{t("Všetky programy")}</option><option value="SCOPE">{t("SCoPE")}</option><option value="SIMPLE">{t("SimPLE")}</option></select><input placeholder={t("Hľadať kód, názov alebo profil…")} value={testSearch} onChange={(event) => setTestSearch(event.target.value)} /></div>
                  {testMessage && <p className="notice" role="status">{testMessage}</p>}
                  <div className="data-table test-table">
                    <div className="data-table-head"><SortHeader label={t("Kód")} active={testSort.column === "code"} direction={testSort.direction} onClick={() => setTestSort((current) => nextSort(current, "code"))} /><SortHeader label={t("Názov")} active={testSort.column === "name"} direction={testSort.direction} onClick={() => setTestSort((current) => nextSort(current, "name"))} /><SortHeader label={t("Verzia")} active={testSort.column === "version"} direction={testSort.direction} onClick={() => setTestSort((current) => nextSort(current, "version"))} /><SortHeader label={t("Profil")} active={testSort.column === "profile"} direction={testSort.direction} onClick={() => setTestSort((current) => nextSort(current, "profile"))} /><span>{t("Stav / akcie")}</span></div>
                    {filteredTests().map((test) => {
                      const state = !test.is_active ? "inactive" : test.status === "draft" ? "draft" : "finalized";
                      return <div className={`data-table-row test-row test-row-${state}`} key={test.id}>
                        <strong className="test-code-cell"><ProgramWordmark mode={test.analysis_profile.toUpperCase().startsWith("SIMPLE") ? "SIMPLE" : "SCOPE"} compact />{test.test_code}</strong>
                        <span>{test.name}</span><span>{t("v")}{test.version}</span><span>{test.analysis_profile}</span>
                        <span className="row-actions">
                          <span className={`test-state-badge test-state-${state}`}>{t(state === "inactive" ? "Deaktivovaný" : state === "draft" ? "Draft" : "Finalizovaný")}</span>
                          <button className="quiet compact" onClick={() => setSelectedTestId(test.id)}>{t("Otvoriť")}</button>
                          {test.status === "draft" && <button className="quiet compact" onClick={() => setEditingTestId(test.id)}>{t("Editovať")}</button>}
                          {test.status === "draft" && <button className="quiet compact" onClick={() => void finalizeTest(test)}>{t("Finalizovať")}</button>}
                          <button className="quiet compact danger" onClick={() => { setTestMessage(""); setTestRemovalTarget(test); }}>{test.is_active ? t("Zmazať…") : t("Spravovať…")}</button>
                        </span>
                      </div>;
                    })}
                  </div>
                  {filteredTests().length === 0 && <div className="empty-list"><h2>{t("Žiadne testy")}</h2><p className="muted">{t("Filteru nezodpovedá žiadna verzia testu.")}</p></div>}
                </section>
                {selectedTestId && (() => {
                  const selected = tests.find((test) => test.id === selectedTestId);
                  if (!selected) return null;
                  const legacyTestType = `${selected.test_code} v${selected.version}`.toLowerCase();
                  const testMeasurements = measurements.filter((measurement) => measurement.test_definition_id === selected.id || (!measurement.test_definition_id && measurement.test_type.toLowerCase() === legacyTestType));
                  const byParticipant = new Map<string, Measurement[]>();
                  testMeasurements.forEach((measurement) => byParticipant.set(measurement.participant_id, [...(byParticipant.get(measurement.participant_id) ?? []), measurement]));
                  const orderedMeasurements = [...testMeasurements].sort((a, b) => a.started_at.localeCompare(b.started_at));
                  const firstRun = orderedMeasurements[0]?.started_at;
                  const lastRun = orderedMeasurements.at(-1)?.started_at;
                  const completedPeople = participants.filter((participant) => (byParticipant.get(participant.id) ?? []).length > 0).length;
                  const orderedParticipants = sortRows(participants, overviewParticipantSort, (participant, column) => {
                    const runs = [...(byParticipant.get(participant.id) ?? [])].sort((a, b) => a.started_at.localeCompare(b.started_at));
                    const latest = runs.at(-1);
                    return ({
                      code: participant.participant_code,
                      attendance: runs.length ? 1 : 0,
                      count: runs.length,
                      first: runs[0]?.started_at,
                      last: latest?.started_at,
                      status: latest?.status ?? (participant.is_active ? "active" : "inactive"),
                    }[column as "code" | "attendance" | "count" | "first" | "last" | "status"]);
                  });
                  return <section className="browser-detail detail-modal-open test-overview">
                    <div className="detail-header"><div><div className="eyebrow">{t("PREHĽAD TESTU")}</div><h2>{selected.name} {t("· v")}{selected.version}</h2><p className="muted">{selected.test_code} · {selected.analysis_profile}</p></div><button className="quiet compact" onClick={() => setSelectedTestId(null)}>{t("Zavrieť detail")}</button></div>
                    <div className="test-overview-stats">
                      <div><span>{t("Vykonania spolu")}</span><strong>{testMeasurements.length}</strong></div>
                      <div><span>{t("Účastníci s meraním")}</span><strong>{completedPeople} / {participants.length}</strong></div>
                      <div><span>{t("Prvé vykonanie")}</span><strong>{firstRun ? formatDateTime(firstRun) : "—"}</strong></div>
                      <div><span>{t("Posledné vykonanie")}</span><strong>{lastRun ? formatDateTime(lastRun) : "—"}</strong></div>
                      <div><span>{t("Stav testu")}</span><strong>{t(!selected.is_active ? "Deaktivovaný" : selected.status === "draft" ? "Draft" : "Finalizovaný")}</strong></div>
                    </div>
                    <div className="test-overview-list-heading"><div><h3>{t("Účastníci")}</h3><p className="muted">{t("Prehľad účasti a počtu vykonaní tohto testu.")}</p></div><span>{participants.length} {t("účastníkov.")}</span></div>
                    <div className="test-participant-table-wrap"><table className="test-participant-table"><thead><tr><th><SortHeader label={t("Participant ID")} active={overviewParticipantSort.column === "code"} direction={overviewParticipantSort.direction} onClick={() => setOverviewParticipantSort((current) => nextSort(current, "code"))} /></th><th><SortHeader label={t("Účasť")} active={overviewParticipantSort.column === "attendance"} direction={overviewParticipantSort.direction} onClick={() => setOverviewParticipantSort((current) => nextSort(current, "attendance"))} /></th><th><SortHeader label={t("Počet meraní")} active={overviewParticipantSort.column === "count"} direction={overviewParticipantSort.direction} onClick={() => setOverviewParticipantSort((current) => nextSort(current, "count"))} /></th><th><SortHeader label={t("Prvé meranie")} active={overviewParticipantSort.column === "first"} direction={overviewParticipantSort.direction} onClick={() => setOverviewParticipantSort((current) => nextSort(current, "first"))} /></th><th><SortHeader label={t("Posledné meranie")} active={overviewParticipantSort.column === "last"} direction={overviewParticipantSort.direction} onClick={() => setOverviewParticipantSort((current) => nextSort(current, "last"))} /></th><th><SortHeader label={t("Stav účastníka")} active={overviewParticipantSort.column === "status"} direction={overviewParticipantSort.direction} onClick={() => setOverviewParticipantSort((current) => nextSort(current, "status"))} /></th></tr></thead><tbody>{orderedParticipants.map((participant) => {
                      const runs = [...(byParticipant.get(participant.id) ?? [])].sort((a, b) => a.started_at.localeCompare(b.started_at));
                      const latest = runs[runs.length - 1];
                      return <tr key={participant.id}><td><strong>{participant.participant_code}</strong></td><td><span className={runs.length ? "test-attendance completed" : "test-attendance pending"}>{runs.length ? t("Vykonal") : t("Nevykonal")}</span></td><td>{runs.length || "—"}</td><td>{runs[0] ? formatDateTime(runs[0].started_at) : "—"}</td><td>{latest ? formatDateTime(latest.started_at) : "—"}</td><td>{latest ? latest.status : (participant.is_active ? t("Aktívny") : t("Neaktívny"))}</td></tr>;
                    })}</tbody></table></div>
                  </section>;
                })()}
                <TestCreator onCreated={(test) => { setTests((current) => [...current, test]); setEditingTestId(test.id); }} />
                {editingTestId && (() => { const editing = tests.find((test) => test.id === editingTestId); if (!editing || editing.status !== "draft") return null; const onSaved = (saved: TestDefinition) => { setTests((current) => current.map((item) => item.id === saved.id ? saved : item)); setEditingTestId(null); }; return editing.analysis_profile.toUpperCase().startsWith("SIMPLE") ? <SimpleTestEditor test={editing} csrfToken={user.csrf_token} onClose={() => setEditingTestId(null)} onSaved={onSaved} /> : <TestEditor test={editing} onClose={() => setEditingTestId(null)} onSaved={onSaved} />; })()}
                {testRemovalTarget && <div className="backdrop test-removal-backdrop" onMouseDown={() => setTestRemovalTarget(null)}>
                  <section className="login test-removal-dialog" role="dialog" aria-modal="true" aria-labelledby="test-removal-heading" onMouseDown={(event) => event.stopPropagation()}>
                    <div className="eyebrow">{t("SPRÁVA TESTU")}</div>
                    <h2 id="test-removal-heading">{testRemovalTarget.name} · {t("v")}{testRemovalTarget.version}</h2>
                    <p className="muted">{t("Deaktivácia skryje test v THRUST-measure, ale ponechá všetky merania a výsledky. Test môžeš neskôr znovu aktivovať.")}</p>
                    {user.role === "superadmin" && <p className="test-delete-warning">{t("Trvalé zmazanie odstráni test, všetky jeho merania a uložené raw súbory.")}</p>}
                    {testMessage && <p className="notice" role="status">{testMessage}</p>}
                    <div className="test-removal-actions">
                      <button className="quiet" onClick={() => setTestRemovalTarget(null)}>{t("Zrušiť")}</button>
                      <button className="primary" onClick={() => void changeTestAvailability(testRemovalTarget, !testRemovalTarget.is_active)}>{testRemovalTarget.is_active ? t("Deaktivovať · ponechať merania") : t("Znovu aktivovať")}</button>
                      {user.role === "superadmin" && <button className="quiet danger" onClick={() => void deleteTestVersion(testRemovalTarget)}>{t("Natrvalo zmazať aj merania")}</button>}
                    </div>
                  </section>
                </div>}
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
                    <div className="measurement-list archive-measurement-list">
                      <div className="measurement-list-head"><span aria-hidden="true"></span><SortHeader label={t("Participant ID")} active={measurementSort.column === "participant"} direction={measurementSort.direction} onClick={() => setMeasurementSort((current) => nextSort(current, "participant"))} /><SortHeader label={t("Dátum a čas")} active={measurementSort.column === "date"} direction={measurementSort.direction} onClick={() => setMeasurementSort((current) => nextSort(current, "date"))} /><SortHeader label={t("Test")} active={measurementSort.column === "test"} direction={measurementSort.direction} onClick={() => setMeasurementSort((current) => nextSort(current, "test"))} /><SortHeader label={t("Veľkosť súboru")} active={measurementSort.column === "size"} direction={measurementSort.direction} onClick={() => setMeasurementSort((current) => nextSort(current, "size"))} /><SortHeader label={t("Stav")} active={measurementSort.column === "status"} direction={measurementSort.direction} onClick={() => setMeasurementSort((current) => nextSort(current, "status"))} /></div>
                      {sortRows(filteredMeasurements(), measurementSort, (m, column) => ({
                        participant: participantCodeFor(m.participant_id), date: m.started_at,
                        test: m.test_type + " " + (m.source_file_name ?? ""),
                        size: m.raw_size_bytes ?? 0, status: m.raw_sha256 ? 1 : 0,
                      }[column as "participant" | "date" | "test" | "size" | "status"])).map((measurement) => <button className={selectedMeasurementId === measurement.id ? "measurement-item selected" : "measurement-item"} key={measurement.id} onClick={() => setSelectedMeasurementId(measurement.id)}>
                        <input type="checkbox" checked={selectedMeasurementIds.includes(measurement.id)} onChange={(event) => { event.stopPropagation(); toggleMeasurementSelection(measurement.id); }} onClick={(event) => event.stopPropagation()} />
                        <strong>{participantCodeFor(measurement.participant_id)}</strong><span>{formatDateTime(measurement.started_at)}</span><span>{measurement.test_type} · {measurement.source_file_name ?? "raw"}</span>
                        <small>{formatBytes(measurement.raw_size_bytes)}</small><span className="measurement-status">{measurement.human_model_status === "accepted" ? tf("Model prijatý · verzia {0}", measurement.human_model_revision ?? "—") : t("Model nepočítaný")}</span>
                      </button>)}
                    </div>
                    {filteredMeasurements().length === 0 && <p className="muted empty-list">{t("Filteru nezodpovedajú žiadne archivované merania.")}</p>}
                  </section>
                  <section className={selectedMeasurementId ? "panel workbench-detail detail-modal-open" : "panel workbench-detail detail-modal-closed"}>
                    {(() => { const selected = measurements.find((item) => item.id === selectedMeasurementId); return selected ? <MeasurementDetailBody measurement={selected} tests={tests} onClose={() => setSelectedMeasurementId(null)} /> : <div className="empty-list"><h2>{t("Vyber meranie")}</h2><p className="muted">{t("V ľavom paneli vyber meranie, ktoré chceš preskúmať.")}</p></div>; })()}
                  </section>
                </div>
                {manualUploadOpen && <div className="backdrop" onMouseDown={() => setManualUploadOpen(false)}><section className="login upload-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="eyebrow">{t("NÚDZOVÁ SYNCHRONIZÁCIA")}</div><h2>{t("Manuálne nahrať dátový súbor")}</h2><p className="muted">{t("Použi iba vtedy, ak upload počas sessionu zlyhal. Nahraj raw log a jeho zodpovedajúci súbor analýzy.")}</p><form className="measurement-form modal-form" onSubmit={async (event) => { await uploadMeasurement(event); setManualUploadOpen(false); }}><label>{t("Účastník")}<select name="participant_id" required><option value="">{t("Vyber účastníka")}</option>{participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.participant_code}</option>)}</select></label><label>{t("Test")}<select name="test_definition_id" required><option value="">{t("Vyber test")}</option>{tests.filter((test) => test.is_active && test.analysis_profile.toUpperCase().startsWith(resultMode)).map((test) => <option key={test.id} value={test.id}>{test.name} {t("· v")}{test.version}</option>)}</select></label><label>{t("Raw log · SCoPE alebo SimPLE")}<input name="raw_file" type="file" accept=".tsv,.tsv.gz,.gz,.txt,text/plain,application/gzip" required /></label><label>{t("Výsledky THRUST-measure · JSON")}<input name="analysis_file" type="file" accept=".json,application/json" required /></label><div className="actions"><button type="button" className="quiet" onClick={() => setManualUploadOpen(false)}>{t("Zrušiť")}</button><button className="primary" type="submit">{t("Nahrať dáta")}</button></div></form>{uploadMessage && <p className="notice">{uploadMessage}</p>}</section></div>}
              </>}

            </section>
            <SiteFooter />
          </div>
        </div>
      ) : (
        <>
          <header className="welcome-header"><div className="welcome-identities"><FacultyLogo /><Brand /></div><div className="actions"><LanguageSwitcher /><button className="quiet" onClick={openRegistration}>{t("Registrácia")}</button><button className="quiet" onClick={() => setLoginOpen(true)}>{t("Prihlásenie")}</button></div></header>
          <section className="public">
          <WelcomeContent blocks={publishedWelcome.blocks ?? defaultWelcomeBlocks(language)} language={language} metrics={metrics} data={publishedWelcome.data} />
          </section>
          <SiteFooter />
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
      <Brand />
      <div className="actions"><LanguageSwitcher /><button type="button" className="quiet" onClick={onBack}>{t("Späť na hlavnú stránku")}</button><button type="button" className="quiet" onClick={onResearcherRegister}>{t("Registrácia výskumníka")}</button><button type="button" className="quiet" onClick={onLogin}>{t("Už mám účet · Prihlásiť sa")}</button></div>
    </header>
    <section className="registration-content student-registration-content">
      <aside className="registration-heading"><div className="eyebrow">{t("NOVÝ ŠTUDENTSKÝ ÚČET")}</div><h1>{t("Vytvor si účet")}</h1><p className="lead">{t("Najprv si vytvor účet. Po registrácii môžeš doplniť krátky profil a hneď uvidíš svoju osobnú stránku s výsledkami.")}</p><ol className="registration-steps"><li><span>1</span>{t("Účet")}</li><li><span>2</span>{t("Doplnenie profilu")}</li></ol></aside>
      <form className="registration-form" onSubmit={onSubmit}>
        <section className="registration-card registration-account-fields">
          <div><div className="eyebrow">{t("PRIHLASOVACIE ÚDAJE")}</div><h2>{t("Účet")}</h2><p className="muted">{t("Prihlasuj sa e-mailom a heslom. Meno a priezvisko nepotrebujeme.")}</p></div>
          <label>{t("E-mail")}<input name="email" type="email" autoComplete="email" required /></label>
          <label>{t("Prezývka (nepovinné)")}<input name="nickname" type="text" autoComplete="nickname" maxLength={40} /></label>
          <div className="form-grid"><label>{t("Heslo")}<input name="password" type="password" minLength={10} autoComplete="new-password" required /></label><label>{t("Zopakovať heslo")}<input name="password_confirmation" type="password" minLength={10} autoComplete="new-password" required /></label></div>
        </section>
        <section className="registration-card registration-consents">
          <div><div className="eyebrow">{t("SÚHLASY A DOKONČENIE")}</div><h2>{t("Pred vytvorením účtu")}</h2></div>
          <label className="consent"><input name="research_consent" type="checkbox" required /> <span>{t("Súhlasím s použitím pseudonymizovaných údajov na výskumné účely.")} <a href="#consent-research" onClick={(event) => { event.preventDefault(); onOpenConsent("research"); }}>{t("Zobraziť text výskumného súhlasu")}</a></span></label>
          <label className="consent"><input name="gdpr_consent" type="checkbox" required /> <span>{t("Súhlasím so spracovaním osobných údajov pre vytvorenie a správu účtu.")} <a href="#consent-gdpr" onClick={(event) => { event.preventDefault(); onOpenConsent("gdpr"); }}>{t("Zobraziť informácie a GDPR súhlas")}</a></span></label>
          {error && <p className="error">{error}</p>}
          <div className="registration-actions"><span className="muted">{t("Profil účastníka môžeš doplniť po registrácii. Oba súhlasy sú potrebné na vytvorenie účtu.")}</span><button type="submit" className="primary" disabled={!consentTexts}>{t("Vytvoriť účet")}</button></div>
        </section>
      </form>
    </section>
    <SiteFooter />
  </main>;
}
type NormalizedChannel = { mean?: number[]; median?: number[]; std?: number[]; metrics?: Record<string, number | null> };
type NormalizedResponse = { time_s?: number[]; channels?: Record<string, NormalizedChannel> };

type StepMetrics = {
  reaction_s: number | null; rise_s: number | null; overshoot_pct: number | null;
  settling_s: number | null; steady_state_error_pct: number | null; rmse: number | null; mean_std: number | null;
};

const RESPONSE_CHANNELS = ["LX", "LY", "RY", "RX"] as const;
const LEGACY_RESPONSE_CHANNEL: Record<(typeof RESPONSE_CHANNELS)[number], string> = { LX: "AILE", LY: "ELEV", RY: "THRO", RX: "RUDD" };
const RESPONSE_COLORS: Record<string, string> = { LX: "#ff6878", LY: "#45d5ff", RY: "#ffc857", RX: "#9d8cff" };
function responseChannel(channels: NormalizedResponse["channels"], axis: (typeof RESPONSE_CHANNELS)[number]) {
  return channels?.[axis] ?? channels?.[LEGACY_RESPONSE_CHANNEL[axis]];
}

function formatMetric(value: number | null | undefined, unit = "") { return value == null || !Number.isFinite(value) ? "—" : value.toFixed(3) + unit; }
function metricsFor(channel: NormalizedChannel | undefined): StepMetrics {
  const raw = channel?.metrics;
  if (!raw || typeof raw.step_count !== "number" || raw.step_count <= 0) {
    return { reaction_s: null, rise_s: null, overshoot_pct: null, settling_s: null, steady_state_error_pct: null, rmse: null, mean_std: null };
  }
  return {
    reaction_s: raw.reaction_delay_s ?? null, rise_s: raw.rise_time_s ?? null,
    overshoot_pct: raw.overshoot_pct ?? null, settling_s: raw.settling_time_s ?? null,
    steady_state_error_pct: raw.steady_state_error_pct ?? null,
    rmse: raw.tracking_rmse ?? null, mean_std: raw.mean_std ?? null,
  };
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
      const channel = responseChannel(response?.channels, axis);
      return channel ? [metricsFor(channel)] : [];
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
  const available = RESPONSE_CHANNELS.filter((name) => responseChannel(response?.channels, name)?.mean?.length);
  if (!available.length) return null;
  return <section className="metrics-summary"><div className="eyebrow">{t("VYPOČÍTANÉ UKAZOVATELE")}</div><p className="muted metrics-note">{t("Základné ukazovatele vypočítané THRUST-measure a uložené spolu s meraním.")}</p><div className="metrics-table"><div className="metrics-head"><span>{t("Osa")}</span><span>{t("Oneskorenie")}</span><span>{t("Náběh 10–90 %")}</span><span>{t("Overshoot")}</span><span>{t("Ustálenie")}</span><span>{t("Chyba")}</span><span>{t("RMSE")}</span><span>{t("Priem. SD")}</span></div>{available.map((name) => { const m = metricsFor(responseChannel(response?.channels, name)); return <div className="metrics-row" key={name}><strong style={{ color: RESPONSE_COLORS[name] }}>{name}</strong><span>{formatMetric(m.reaction_s, " s")}</span><span>{formatMetric(m.rise_s, " s")}</span><span>{formatMetric(m.overshoot_pct, " %")}</span><span>{formatMetric(m.settling_s, " s")}</span><span>{formatMetric(m.steady_state_error_pct, " %")}</span><span>{formatMetric(m.rmse)}</span><span>{formatMetric(m.mean_std)}</span></div>; })}</div></section>;
}

function ScopeTaskSummary({ analysis }: { analysis: Record<string, unknown> }) {
  const summary = analysis.session_summary && typeof analysis.session_summary === "object"
    ? analysis.session_summary as Record<string, unknown> : {};
  const events = Array.isArray(analysis.events) ? analysis.events as Record<string, unknown>[] : [];
  const realized = events.filter((event) => Number(event.result_code) === 1 || Number(event.result_code) === 2);
  const successes = realized.length ? realized.filter((event) => event.success === true).length : Number(summary.completed ?? 0);
  const attempts = realized.length ? realized.length : Number(summary.attempts ?? (successes + Number(summary.mistakes ?? 0)));
  if (!attempts) return null;
  const left = realized.length ? realized.filter((event) => event.left_success === true).length : null;
  const right = realized.length ? realized.filter((event) => event.right_success === true).length : null;
  const interrupted = events.filter((event) => Number(event.result_code) === 3).length;
  return <section className="scope-task-summary"><div className="eyebrow">{t("VÝSLEDOK ÚLOH SCoPE")}</div><div className="scope-task-summary-grid">
    <div><span>{t("Úspešnosť celkovo")}</span><strong>{Math.round(100 * successes / attempts)}% <small>({successes}/{attempts})</small></strong></div>
    {left !== null && <div><span>{t("Úspech ľavého gimbalu")}</span><strong>{Math.round(100 * left / attempts)}% <small>({left}/{attempts})</small></strong></div>}
    {right !== null && <div><span>{t("Úspech pravého gimbalu")}</span><strong>{Math.round(100 * right / attempts)}% <small>({right}/{attempts})</small></strong></div>}
    <div><span>{t("Neúspešné úlohy")}</span><strong>{Math.max(0, attempts - successes)}</strong></div>
    {interrupted > 0 && <div><span>{t("Prerušená úloha · mimo počtu")}</span><strong>{interrupted}</strong></div>}
  </div><p className="muted">{t("Celkový úspech vyžaduje súvislé podržanie oboch gimbalov; čiastkový úspech gimbalu sa eviduje samostatne.")}</p></section>;
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
  if (!analysis.metrics || typeof analysis.metrics !== "object" || !analysis.normalized_step_response) {
    return <section className="simple-analysis-view"><div className="eyebrow">{t("SIMULOVANÝ LET")}</div><h3>{t("Analýza SimPLE nie je dostupná")}</h3><p className="muted">{t("K tomuto meraniu je uložený iba raw log. Pri núdzovom nahratí prilož aj súbor analýzy JSON vytvorený lokálnym THRUSTom.")}</p></section>;
  }
  const rawMetrics = analysis.metrics && typeof analysis.metrics === "object" ? analysis.metrics as Record<string, unknown> : {};
  const response = analysis.normalized_step_response && typeof analysis.normalized_step_response === "object" ? analysis.normalized_step_response as { channels?: Record<string, SimpleTraceChannel> } : {};
  const metrics: [string, string, string][] = [
    [t("Akcie"), "simple_action_count", ""],
    [t("Priemerná chyba cieľa"), "simple_mean_target_error_m", " m"],
    [t("Medián chyby cieľa"), "simple_median_target_error_m", " m"],
    [t("RMS chyba cieľa"), "simple_rms_target_error_m", " m"],
    [t("Čas v cieľovej zóne"), "simple_in_zone_fraction", "%"],
    [t("Reset polohy"), "simple_reset_count", ""],
    [t("Kolízie"), "simple_crash_count", ""],
    [t("Vzorkovacia frekvencia"), "simple_sampling_hz", " Hz"],
    [t("Trvanie"), "simple_duration_s", " s"],
  ];
  const display = (key: string, suffix: string) => { const value = rawMetrics[key]; if (typeof value !== "number" || !Number.isFinite(value)) return "—"; const scaled = key === "simple_in_zone_fraction" ? value * 100 : value; return `${scaled.toFixed(key === "simple_action_count" || key === "simple_reset_count" || key === "simple_crash_count" ? 0 : 2)}${suffix}`; };
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
  const names: (typeof RESPONSE_CHANNELS[number])[] = RESPONSE_CHANNELS.filter((name) => responseChannel(response?.channels, name)?.mean?.length);
  const series = names.map((name) => ({ name, channel: responseChannel(response?.channels, name), count: Math.min(time.length, responseChannel(response?.channels, name)?.mean?.length ?? 0) })).filter((item): item is { name: (typeof RESPONSE_CHANNELS)[number]; channel: NormalizedChannel; count: number } => Boolean(item.channel) && item.count > 1);
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  if (!series.length) return <div className="chart-empty">{t("Normalizovaná odozva nie je dostupná.")}</div>;
  const allValues = series.flatMap(({ channel: item, count }) => { const mean = item.mean?.slice(0, count) ?? []; const std = item.std?.slice(0, count) ?? []; return mean.flatMap((value, index) => [Number(value) - (Number(std[index]) || 0), Number(value) + (Number(std[index]) || 0)]); }).filter(Number.isFinite);
  const min = Math.min(-0.2, ...allValues); const max = Math.max(1.2, ...allValues);
  const plots = series.map(({ name, channel: item }) => <button type="button" className="chart-tile" key={name} onClick={() => setExpandedChannel(name)}><ChartPlot name={name} channel={item} time={time} min={min} max={max} /></button>);
  const expanded = expandedChannel ? series.find((item) => item.name === expandedChannel) : null;
  return <><div className="response-grid">{plots}</div>{expanded && <div className="chart-expand-backdrop" onMouseDown={() => setExpandedChannel(null)}><section className="chart-expand-window" onMouseDown={(event) => event.stopPropagation()}><div className="chart-expand-header"><div><div className="eyebrow">{t("DETAIL GRAFU")}</div><h3>{expanded.name} {t("· normalizovaná odozva")}</h3></div><button type="button" className="quiet compact" onClick={() => setExpandedChannel(null)}>{t("Zavrieť")}</button></div><ChartPlot name={expanded.name} channel={expanded.channel} time={time} min={min} max={max} expanded /></section></div>}</>;
}




type AxisKey = "LX" | "LY" | "RY" | "RX";
type ActionSettings = {
  generator_version: number;
  intervals: Record<AxisKey, [number, number]>;
  points_per_axis: number;
  min_changed_axes: number;
  max_changed_axes: number;
  single_gimbal_probability: number;
};
type ScopeConfiguration = {
  [key: string]: unknown;
  action_timeout_s: number; hold_time_s: number; fps: number; stick_max: number;
  timing_version: number; timing_mode: "original" | "fixed_duration";
  hold_time_min_s: number; hold_time_max_s: number; task_duration_min_s: number;
  task_duration_max_s: number; success_hold_s: number; independent_zone_colors: boolean;
  max_completed_actions: number; countdown_s: number; fullscreen: boolean; topmost: boolean;
  action_settings: ActionSettings;
  gui_gimbal_size: number; gui_stick_zone: number; gui_stick_radius: number;
  gui_stick_outline_width: number; gui_zone_outline_width: number;
  gui_gimbal_border_width: number; gui_gimbal_cross_width: number;
  screen_background: string; gimbal_background: string; stick_outline: string; stick_fill: string;
  zone_idle_outline: string; zone_idle_fill: string; zone_ok_outline: string; zone_ok_fill: string;
  grid_color: string; label_color: string; prompt_color: string;
};

const AXIS_KEYS: AxisKey[] = ["LX", "LY", "RY", "RX"];
const makeDefaultActionSettings = (): ActionSettings => ({
  generator_version: 1,
  intervals: { LX: [-0.8, 0.8], LY: [-0.8, 0.8], RY: [-0.8, 0.8], RX: [-0.8, 0.8] },
  points_per_axis: 9,
  min_changed_axes: 1,
  max_changed_axes: 2,
  single_gimbal_probability: 0.5,
});
const initialScopeConfiguration: ScopeConfiguration = {
  debug_output: false, action_timeout_s: 5, hold_time_s: 1, timing_version: 2, timing_mode: "original",
  hold_time_min_s: 1, hold_time_max_s: 1, task_duration_min_s: 3, task_duration_max_s: 5,
  success_hold_s: 1, independent_zone_colors: false, fps: 100, stick_max: 1000,
  max_completed_actions: 50, countdown_s: 3, seed: null,
  action_settings: makeDefaultActionSettings(),
  fullscreen: true, topmost: true,
  gui_gimbal_size: 500, gui_stick_zone: 200, gui_stick_radius: 20,
  gui_stick_outline_width: 6, gui_zone_outline_width: 8, gui_gimbal_border_width: 12, gui_gimbal_cross_width: 6,
  screen_background: "#000000", gimbal_background: "#808080", stick_outline: "#1e2cff", stick_fill: "#ffffff",
  zone_idle_outline: "#ff0000", zone_idle_fill: "#ff0000", zone_ok_outline: "#00cc00", zone_ok_fill: "#00cc00",
  grid_color: "#ffffff", label_color: "#ffffff", prompt_color: "#ff0000"
};

function HumanTransferFunction({ parameters }: { parameters: Record<string, number> }) {
  return <div style={{ textAlign: "center", fontFamily: "Georgia, serif", fontSize: "1.3rem", padding: "14px", overflowX: "auto" }}>
    <span>G(s) = </span><span style={{ display: "inline-grid", verticalAlign: "middle", textAlign: "center", lineHeight: 1.35 }}>
      <span style={{ borderBottom: "1px solid currentColor", padding: "0 12px 3px" }}>{parameters.gain.toPrecision(5)} (1 + {parameters.t3_s.toPrecision(4)}s)</span>
      <span style={{ padding: "3px 12px 0" }}>(1 + {parameters.t1_s.toPrecision(4)}s)(1 + {parameters.t2_s.toPrecision(4)}s)</span>
    </span><span> e<sup>−{parameters.delay_s.toPrecision(4)}s</sup></span>
  </div>;
}

function HumanModelCurve({ axis, channel }: { axis: string; channel: any }) {
  const recording = channel?.recording;
  if (!recording) return <section className="panel"><h3>{axis}</h3><p className="muted">{t("Graf celého záznamu nie je k dispozícii.")}</p></section>;
  const times = recording.time_s.map((value: number) => value + (recording.time_origin_s ?? 0));
  const scale = recording.request_span ?? 1;
  const offset = recording.output_offset ?? 0;
  const observed = recording.observed_normalized.map((value: number) => value * scale + offset);
  const predicted = recording.model_normalized.map((value: number) => value * scale + offset);
  const all = [...observed, ...predicted].filter(Number.isFinite);
  const ymin = Math.min(...all), ymax = Math.max(...all), span = Math.max(ymax - ymin, 1e-9);
  const xmin = times[0] ?? 0, xmax = times[times.length - 1] ?? 1;
  const path = (values: number[]) => values.map((value, index) => {
    const x = 42 + ((times[index] - xmin) / Math.max(xmax - xmin, 1e-9)) * 520;
    const y = 145 - ((value - ymin) / span) * 120;
    return `${index ? "L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
  return <section className="panel" style={{ minWidth: 0 }}>
    <h3>{axis} · {channel.status}</h3>
    <svg viewBox="0 0 580 185" role="img" aria-label={tf("Meraný záznam a model osi {0}", axis)} style={{ width: "100%", height: "auto", minHeight: 145 }}>
      <path d="M42 25V145H562" fill="none" stroke="currentColor" opacity=".28" />
      <path d={path(observed)} fill="none" stroke="#5798d2" strokeWidth="1.4" opacity=".66" />
      <path d={path(predicted)} fill="none" stroke="#e94f43" strokeWidth="2.2" />
      <text x="42" y="172" fontSize="11">{xmin.toFixed(2)} s</text><text x="520" y="172" fontSize="11">{xmax.toFixed(2)} s</text>
      <text x="45" y="19" fontSize="10">{ymax.toPrecision(3)}</text><text x="45" y="159" fontSize="10">{ymin.toPrecision(3)}</text>
      <line x1="315" y1="14" x2="335" y2="14" stroke="#5798d2" strokeWidth="2" /><text x="340" y="18" fontSize="10">{t("Meranie")}</text>
      <line x1="420" y1="14" x2="440" y2="14" stroke="#e94f43" strokeWidth="2.5" /><text x="445" y="18" fontSize="10">{t("Human model")}</text>
    </svg>
    <p className="muted">{channel.transfer_function}</p>
    {channel.fit?.training && <p className="muted">{tf("Fit {0}% · RMSE {1}", channel.fit.training.fit_pct?.toFixed?.(2) ?? "—", channel.fit.training.rmse?.toPrecision?.(4) ?? "—")}</p>}
  </section>;
}

function HumanModelDetails({ measurementId }: { measurementId: string }) {
  const [result, setResult] = useState<any>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    request<any>(`/api/admin/measurements/${measurementId}/human-models/latest`)
      .then((value) => { if (active) { setResult(value); setMessage(""); } })
      .catch((error) => { if (active) { setResult(null); setMessage(String(error)); } });
    return () => { active = false; };
  }, [measurementId]);
  if (!result) return <section className="panel"><h3>{t("Human model")}</h3><p className="muted">{message || t("Načítavam model…")}</p></section>;
  return <section className="participant-detail-section">
    <div className="detail-header"><div><div className="eyebrow">{t("AKCEPTOVANÝ HUMAN MODEL")}</div><h3>{tf("Verzia {0} · {1}", result.revision, result.algorithm_version)}</h3></div></div>
    {Object.entries(result.channels ?? {}).map(([axis, channel]: [string, any]) => <div key={axis} className="panel" style={{ marginBottom: 16 }}>
      <HumanTransferFunction parameters={channel.fit.parameters} /><HumanModelCurve axis={axis} channel={channel} />
      {channel.fit.warnings?.length > 0 && <p className="notice">{channel.fit.warnings.join(" · ")}</p>}
    </div>)}
  </section>;
}

function MeasurementDetailBody({ measurement, tests, onClose }: { measurement: Measurement; tests: TestDefinition[]; onClose: () => void }) {
  const isSimple = getMeasurementMode(measurement, tests) === "SIMPLE";
  return <>
    <div className="detail-window-bar"><div className="eyebrow">{t("DETAIL MERANIA ·")} {isSimple ? "SimPLE" : "SCoPE"}</div><div className="detail-header-actions"><button className="quiet compact" onClick={onClose}>{t("Zavrieť")}</button></div></div>
    <h2>{measurement.test_type}</h2><p className="muted">{measurement.source_file_name} · {formatDateTime(measurement.started_at)}</p>
    <div className="detail-grid"><div><span>{t("Vzorky")}</span><strong>{String(measurement.analysis_data?.sample_count ?? measurement.analysis_data?.simple_sample_count ?? "—")}</strong></div><div><span>{t("Trvanie")}</span><strong>{measurement.analysis_data?.duration_s ? `${Number(measurement.analysis_data.duration_s).toFixed(2)} s` : "—"}</strong></div><div><span>{t("Raw dáta")}</span><strong>{measurement.raw_sha256 ? tf("Archivované · {0}", formatBytes(measurement.raw_size_bytes)) : t("Nie sú dostupné")}</strong></div><div><span>{t("Merací režim")}</span><strong>{isSimple ? "SimPLE" : "SCoPE"}</strong></div></div>
    {measurement.status === "incomplete" && <p className="notice danger">{t("Meranie bolo prerušené; rozpracovaná úloha sa nezapočítala ako neúspech.")}</p>}
    {measurement.compute_quality_status && measurement.compute_quality_status !== "unreviewed" && <p className={measurement.compute_quality_status === "unsuitable" ? "notice danger" : "notice"}>{tf("Kvalita pre compute: {0}", measurement.compute_quality_status)}{measurement.compute_quality_note ? ` · ${measurement.compute_quality_note}` : ""}</p>}
    {isSimple ? <SimpleAnalysisView analysis={measurement.analysis_data ?? {}} /> : <><ScopeTaskSummary analysis={measurement.analysis_data ?? {}} /><div className="results-layout"><div className="results-chart-column"><ResponseChart data={measurement.analysis_data?.normalized_step_response} /></div><ResponseMetrics data={measurement.analysis_data?.normalized_step_response} /></div>{measurement.human_model_status === "accepted" && <HumanModelDetails measurementId={measurement.id} />}</>}
  </>;
}

function makeScopeConfiguration(value: Record<string, unknown>): ScopeConfiguration {
  const normalized = { ...value };
  delete normalized.user;
  delete normalized.profile_name;
  delete normalized.expert_mode;
  delete normalized.output_root;
  delete normalized.use_dated_subfolders;
  delete normalized.difficulty;
  const defaults = makeDefaultActionSettings();
  const source = value.action_settings && typeof value.action_settings === "object"
    ? value.action_settings as Partial<ActionSettings>
    : {};
  const sourceIntervals: Partial<Record<AxisKey, [number, number]>> = source.intervals && typeof source.intervals === "object"
    ? source.intervals as Partial<Record<AxisKey, [number, number]>>
    : {};
  const actionSettings: ActionSettings = {
    ...defaults,
    ...source,
    intervals: {
      LX: [...(sourceIntervals.LX ?? defaults.intervals.LX)] as [number, number],
      LY: [...(sourceIntervals.LY ?? defaults.intervals.LY)] as [number, number],
      RY: [...(sourceIntervals.RY ?? defaults.intervals.RY)] as [number, number],
      RX: [...(sourceIntervals.RX ?? defaults.intervals.RX)] as [number, number],
    },
  };
  return { ...initialScopeConfiguration, ...normalized, action_settings: actionSettings } as ScopeConfiguration;
}

const initialSimpleConfiguration: Record<string, number | string> = {
  action_timeout_s: 5, hold_time_s: 1, countdown_s: 3,
  completion_radius_m: 0.1, target_x_limit_m: 1.5, target_y_min_m: 0.25, target_y_max_m: 2,
  target_pattern: "random", route_points: 6, copter_radius_m: 0.08,
  field_width_px: 1920, field_height_px: 1080, world_width_m: 4.5,
  zone_idle_fill: "#ff0000", zone_idle_outline: "#ff0000",
  zone_ok_fill: "#00cc00", zone_ok_outline: "#00cc00",
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
function SimpleScenePreview({ imageId, radius, copterRadius, xLimit, yMin, yLimit, worldWidth, widthPx, heightPx, fill, outline }: { imageId: string; radius: number; copterRadius: number; xLimit: number; yMin: number; yLimit: number; worldWidth: number; widthPx: number; heightPx: number; fill: string; outline: string }) {
  const sceneHeight = 720 * heightPx / widthPx;
  const groundY = sceneHeight - Math.max(50, sceneHeight * .12);
  const scale = Math.min(640 / worldWidth, (groundY - 30) / (worldWidth * heightPx / widthPx));
  const left = 360 - worldWidth * scale / 2, right = 360 + worldWidth * scale / 2;
  const top = groundY - worldWidth * heightPx / widthPx * scale;
  const zoneRadius = Math.max(1, radius * scale);
  const targetX = 360 + Math.min(xLimit, worldWidth / 2 - radius) * scale * .6;
  const targetY = groundY - (yMin + yLimit) / 2 * scale;
  const droneY = groundY - copterRadius * scale;
  return <div className="simple-scene-preview" style={{ aspectRatio: `${widthPx} / ${heightPx}` }} aria-label={t("Náhľad SimPLE scény")}>
    {imageId && <img src={`/api/backgrounds/${imageId}`} alt={t("Zvolené pozadie SimPLE")} />}
    <svg viewBox={`0 0 720 ${sceneHeight}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={t("Modrý dron a cieľová zóna")}>
      <rect x={left} y={top} width={right-left} height={groundY-top} fill={imageId ? "#80808066" : "#808080"} />
      <path d={`M${left} ${groundY} V${top} H${right} V${groundY}`} fill="none" stroke="#ffffff" strokeWidth="3" />
      <line x1={left} y1={groundY} x2={right} y2={groundY} stroke="#ffffff" strokeWidth="4" />
      {Array.from({ length: Math.floor((right-left)/22) }, (_, index) => <line key={index} x1={left+12+index*22} y1={groundY+5} x2={left+22+index*22} y2={groundY+15} stroke="#808080" />)}
      <circle cx={targetX} cy={targetY} r={zoneRadius} fill={fill} stroke={outline} strokeWidth="2" />
      <circle cx="360" cy={droneY} r={Math.max(1,copterRadius*scale)} className="scene-drone-ball" />
      <line x1="360" y1={droneY} x2="360" y2={droneY-Math.max(1,copterRadius*scale)*1.8} className="scene-drone-arrow" />
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
      if (typeof values[key] === "string" && typeof value === "string" && (key === "target_pattern" ? ["random", "slalom", "circuit"].includes(value) : /^#[0-9a-fA-F]{6}$/.test(value))) values[key] = value;
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
    ["target_x_limit_m", t("Limit cieľa v osi X [m]"), .01, 20, .01],
    ["target_y_min_m", t("Minimálna výška cieľa [m]"), .01, 20, .01],
    ["target_y_max_m", t("Maximálna výška cieľa [m]"), .1, 20, .1],
    ["world_width_m", t("Šírka ihriska [m]"), .5, 50, .1],
    ["copter_radius_m", t("Polomer dronu [m]"), .01, 2, .01],
    ["route_points", t("Počet bodov trajektórie"), 4, 20, 1],
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
  const targetMargin = Math.max(Number(configuration.completion_radius_m), Number(configuration.copter_radius_m));
  const xMax = Number(configuration.world_width_m) / 2 - targetMargin;
  const yMax = worldHeight - targetMargin;
  const validTargets = xMax > 0 && yMax >= targetMargin && Number(configuration.target_x_limit_m) > 0 && Number(configuration.target_x_limit_m) <= xMax && Number(configuration.target_y_min_m) >= targetMargin && Number(configuration.target_y_min_m) <= Number(configuration.target_y_max_m) && Number(configuration.target_y_max_m) <= yMax;
  async function save() {
    setMessage("");
    if (!validTargets) { setMessage(t("Cieľová zóna musí byť celá v ihrisku. Uprav limity X/Y alebo mierku sveta.")); return; }
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
      {numericFields.map(([key,label,min,max,step]) => { const fieldMax = key === "target_x_limit_m" ? Math.max(.01,xMax) : key === "target_y_min_m" || key === "target_y_max_m" ? Math.max(.01,yMax) : max; const fieldMin = key === "target_y_min_m" ? targetMargin : key === "target_y_max_m" ? Number(configuration.target_y_min_m) : min; return <label key={key}>{label}<input type="number" min={fieldMin} max={fieldMax} step={step} value={Number(configuration[key] ?? initialSimpleConfiguration[key])} onChange={(event) => setConfiguration((current) => ({ ...current, [key]: Number(event.target.value) }))} />{key === "world_width_m" && <small>{t("Odvodená výška:")} {worldHeight.toFixed(2)} {t("m")}</small>}</label>; })}</div>
      <label className="simple-pattern-field">{t("Trajektória cieľov")}<select value={String(configuration.target_pattern)} onChange={(event) => setConfiguration((current) => ({ ...current, target_pattern: event.target.value }))}><option value="random">{t("Náhodné body")}</option><option value="slalom">{t("Slalom")}</option><option value="circuit">{t("Obvodová trasa")}</option></select></label>
      <p className="muted">{t("Obrazovka určuje iba pomer strán. Výška ihriska sa počíta z nastavenej šírky a pomeru strán.")}</p>
    </div><div className="simple-background-panel"><div className="eyebrow">{t("POZADIE A NÁHĽAD")}</div><label>{t("Vybrané pozadie")}<select value={backgroundImageId} onChange={(event) => setBackgroundImageId(event.target.value)}><option value="">{t("Predvolené vektorové pozadie SimPLE")}</option>{backgrounds.map((item) => <option key={item.id} value={item.id}>{item.filename} · {item.width}×{item.height}</option>)}</select></label><label>{t("Nahrať vlastné PNG / JPEG")}<input type="file" accept="image/png,image/jpeg" disabled={uploading} onChange={(event) => { void uploadBackground(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
      <SimpleScenePreview imageId={backgroundImageId} radius={Number(configuration.completion_radius_m)} copterRadius={Number(configuration.copter_radius_m)} yMin={Number(configuration.target_y_min_m)} xLimit={Number(configuration.target_x_limit_m)} yLimit={Number(configuration.target_y_max_m)} worldWidth={Number(configuration.world_width_m)} widthPx={fieldWidth} heightPx={fieldHeight} fill={String(configuration.zone_idle_fill)} outline={String(configuration.zone_idle_outline)} />
      <div className="simple-zone-colors"><label>{t("Zóna · výplň")}<input type="color" value={String(configuration.zone_idle_fill)} onChange={(event) => setConfiguration((current) => ({ ...current, zone_idle_fill: event.target.value }))} /></label><label>{t("Zóna · okraj")}<input type="color" value={String(configuration.zone_idle_outline)} onChange={(event) => setConfiguration((current) => ({ ...current, zone_idle_outline: event.target.value }))} /></label><label>{t("Úspech · výplň")}<input type="color" value={String(configuration.zone_ok_fill)} onChange={(event) => setConfiguration((current) => ({ ...current, zone_ok_fill: event.target.value }))} /></label><label>{t("Úspech · okraj")}<input type="color" value={String(configuration.zone_ok_outline)} onChange={(event) => setConfiguration((current) => ({ ...current, zone_ok_outline: event.target.value }))} /></label></div>
      {uploading && <p className="muted">{t("Nahrávam obrázok…")}</p>}</div></div>
    {!validTargets && <p className="error">{t("Cieľová zóna musí byť celá v ihrisku. Uprav limity X/Y alebo mierku sveta.")}</p>}
    {message && <p className="error">{message}</p>}
    <div className="simple-editor-actions"><button type="button" className="quiet" onClick={onClose}>{t("Zrušiť")}</button><button type="button" className="primary" onClick={() => void save()} disabled={!validTargets}>{t("Uložiť nastavenia")}</button></div>
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
  return <div className="gimbal-preview"><svg viewBox="0 0 620 345" role="img" aria-label={t("Interaktívny náhľad SCoPE")}><rect width="620" height="345" fill={color("screen_background")} onClick={() => onPick("screen_background")} className="preview-clickable" />{gimbal(55, "left")}{gimbal(345, "right")}<text x="310" y="22" textAnchor="middle" fill={color("label_color")} onClick={() => onPick("label_color")} className="preview-clickable">{t("Action: [0, 0, 0, 0]")}</text><text x="310" y="330" textAnchor="middle" fill={color("label_color")} onClick={() => onPick("label_color")} className="preview-clickable">{t("Tasks: 0/50 · Success: 0 · Missed: 0")}</text><text x="310" y="162" textAnchor="middle" fill={color("prompt_color")} fontSize="22" onClick={() => onPick("prompt_color")} className="preview-clickable">{t("Press button on RC")}</text></svg><div className="preview-help">{t("Kliknutie na prvok okamžite otvorí výber jeho farby.")}</div></div>;
}

function TestEditor({ test, onClose, onSaved }: { test: TestDefinition; onClose: () => void; onSaved: (test: TestDefinition) => void }) {
  const [configuration, setConfiguration] = useState(() => makeScopeConfiguration(test.configuration));
  const [selectedPanel, setSelectedPanel] = useState<"basic" | "actions" | "colors">("basic");
  const [selectedColor, setSelectedColor] = useState("screen_background");
  const [message, setMessage] = useState("");
  const colorInput = useRef<HTMLInputElement>(null);
  const actionSettings = configuration.action_settings;
  function setValue(key: string, value: unknown) { setConfiguration((current) => ({ ...current, [key]: value })); }
  function updateAction(key: string, value: unknown) {
    setConfiguration((current) => ({
      ...current,
      action_settings: { ...current.action_settings, [key]: value },
    }));
  }
  function setAxisBound(axis: AxisKey, bound: 0 | 1, value: number) {
    const intervals = { ...actionSettings.intervals, [axis]: [...actionSettings.intervals[axis]] as [number, number] };
    intervals[axis][bound] = value;
    updateAction("intervals", intervals);
  }
  function pickColor(key: string) {
    setSelectedColor(key);
    if (colorInput.current) {
      colorInput.current.value = String(configuration[key] ?? "#ffffff");
      colorInput.current.click();
    }
  }
  const colorFields = [
    ["screen_background", t("Pozadie obrazovky")], ["gimbal_background", t("Pozadie gimbalu")],
    ["grid_color", t("Okraje a stredové značky")], ["zone_idle_fill", t("Výplň neaktívnej zóny")],
    ["zone_idle_outline", t("Obrys neaktívnej zóny")], ["zone_ok_fill", t("Výplň OK zóny")],
    ["zone_ok_outline", t("Obrys OK zóny")], ["stick_fill", t("Výplň páčky")],
    ["stick_outline", t("Obrys páčky")], ["label_color", t("Popisy")], ["prompt_color", t("Výzva")],
  ] as const;
  function validate(): string | null {
    if (!Number.isInteger(configuration.max_completed_actions) || configuration.max_completed_actions < 1)
      return t("Počet úloh musí byť kladné celé číslo.");
    if (configuration.timing_version !== 2)
      return t("Ulož tento test z editora, aby sa použil nový verziovaný režim časovania.");
    if (configuration.timing_mode === "original" &&
        (!Number.isFinite(configuration.hold_time_min_s) || !Number.isFinite(configuration.hold_time_max_s) ||
         configuration.hold_time_min_s <= 0 || configuration.hold_time_min_s > configuration.hold_time_max_s || configuration.hold_time_max_s > 5))
      return t("Čas držania musí spĺňať 0 < minimum ≤ maximum ≤ 5 sekúnd.");
    if (configuration.timing_mode === "fixed_duration" &&
        (!Number.isFinite(configuration.task_duration_min_s) || !Number.isFinite(configuration.task_duration_max_s) ||
         configuration.task_duration_min_s < 3 || configuration.task_duration_min_s > configuration.task_duration_max_s || configuration.task_duration_max_s > 5 ||
         !Number.isFinite(configuration.success_hold_s) || configuration.success_hold_s <= 0 || configuration.success_hold_s > configuration.task_duration_min_s))
      return t("Dĺžka úlohy musí byť v rozsahu 3 až 5 sekúnd a úspešná výdrž kladná.");
    if (!Number.isInteger(actionSettings.points_per_axis) || actionSettings.points_per_axis < 2 || actionSettings.points_per_axis > 101)
      return t("Počet bodov na os musí byť celé číslo od 2 do 101.");
    if (actionSettings.min_changed_axes < 1 || actionSettings.min_changed_axes > 4 ||
        actionSettings.max_changed_axes < actionSettings.min_changed_axes || actionSettings.max_changed_axes > 4)
      return t("Rozsah počtu meniacich sa osí musí byť od 1 do 4 a minimum nesmie prekročiť maximum.");
    if (actionSettings.single_gimbal_probability < 0 || actionSettings.single_gimbal_probability > 1)
      return t("Pravdepodobnosť zmeny jedného gimbalu musí byť od 0 do 100 %.");
    for (const axis of AXIS_KEYS) {
      const [low, high] = actionSettings.intervals[axis];
      if (!Number.isFinite(low) || !Number.isFinite(high) || low < -1 || high > 1 || low >= high)
        return tf("Interval osi {0} musí spĺňať −1 ≤ minimum < maximum ≤ 1.", axis);
      const quantized = new Set(Array.from({ length: actionSettings.points_per_axis }, (_, index) =>
        Math.round((low + (high - low) * index / (actionSettings.points_per_axis - 1)) * configuration.stick_max)));
      if (quantized.size !== actionSettings.points_per_axis)
        return tf("Interval osi {0} vytvára duplicitné hodnoty. Rozšír interval, zníž počet bodov alebo zvýš maximálnu hodnotu páčky.", axis);
    }
    return null;
  }
  async function save() {
    setMessage("");
    const validationError = validate();
    if (validationError) { setMessage(validationError); setSelectedPanel("actions"); return; }
    const cleanConfiguration: Record<string, unknown> = {
      ...configuration,
      action_settings: { ...actionSettings, generator_version: 1 },
    };
    delete cleanConfiguration.difficulty;
    try {
      const saved = await request<TestDefinition>("/api/admin/tests/" + test.id, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configuration: cleanConfiguration }),
      });
      onSaved(saved);
      setMessage(t("Nastavenia boli uložené."));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : t("Nastavenia sa nepodarilo uložiť."));
    }
  }

  const panels = [
    { id: "basic" as const, title: t("Základné nastavenia"), detail: t("Vzorkovanie, priebeh a okno merania") },
    { id: "actions" as const, title: t("Nastavenie akcií"), detail: t("Intervaly, hustota bodov a zmeny osí") },
    { id: "colors" as const, title: t("Farby prvkov"), detail: t("Vzhľad SCoPE obrazovky") },
  ];
  return <div className="editor-backdrop"><section className="test-editor-window">
    <header className="editor-header"><div><div className="eyebrow">{t("EDITOR TESTU · ROZPRACOVANÁ VERZIA")}</div><h2>{test.name}</h2><p className="muted">{test.test_code} {t("· v")}{test.version}</p></div><button type="button" className="quiet compact" onClick={onClose}>{t("Zavrieť")}</button></header>
    <div className="editor-layout">
      <div className="editor-controls">
        <div className="editor-panel-cards" role="tablist" aria-label={t("Nastavenia testu")}>
          {panels.map((panel) => <button type="button" role="tab" aria-selected={selectedPanel === panel.id}
            className={selectedPanel === panel.id ? "editor-panel-card selected" : "editor-panel-card"}
            key={panel.id} onClick={() => setSelectedPanel(panel.id)}>
            <strong>{panel.title}</strong><span>{panel.detail}</span>
          </button>)}
        </div>
        {selectedPanel === "basic" && <section className="config-card">
          <div className="eyebrow">{t("PRIEBEH MERANIA")}</div><h3>{t("Základné parametre")}</h3>
          <div className="field-grid">
            <label>{t("Vzorkovacia frekvencia (Hz)")}<input type="number" min="10" max="1000" value={configuration.fps} onChange={(event) => setValue("fps", Number(event.target.value))} /></label>
            <label>{t("Režim časovania")}<select value={configuration.timing_mode} onChange={(event) => setValue("timing_mode", event.target.value)}><option value="original">{t("Pôvodný · ďalší cieľ po úspechu")}</option><option value="fixed_duration">{t("Pevná dĺžka každej úlohy")}</option></select></label>
            {configuration.timing_mode === "original" ? <>
              <label>{t("Výdrž v cieli · minimum (s)")}<input type="number" min=".1" step=".1" value={configuration.hold_time_min_s} onChange={(event) => setValue("hold_time_min_s", Number(event.target.value))} /></label>
              <label>{t("Výdrž v cieli · maximum (s)")}<input type="number" min={configuration.hold_time_min_s} max="5" step=".1" value={configuration.hold_time_max_s} onChange={(event) => setValue("hold_time_max_s", Number(event.target.value))} /></label>
              <p className="muted">{t("Úspech posunie cieľ ďalej. Nesplnená úloha sa po 5 sekundách zaznamená ako neúspešná; test vždy obsahuje nastavený počet úloh.")}</p>
            </> : <>
              <label>{t("Dĺžka úlohy · minimum (s)")}<input type="number" min="3" step=".1" value={configuration.task_duration_min_s} onChange={(event) => setValue("task_duration_min_s", Number(event.target.value))} /></label>
              <label>{t("Dĺžka úlohy · maximum (s)")}<input type="number" min={configuration.task_duration_min_s} max="5" step=".1" value={configuration.task_duration_max_s} onChange={(event) => setValue("task_duration_max_s", Number(event.target.value))} /></label>
              <label>{t("Výdrž pre úspech (s)")}<input type="number" min=".1" max={configuration.task_duration_min_s} step=".1" value={configuration.success_hold_s} onChange={(event) => setValue("success_hold_s", Number(event.target.value))} /></label>
              <p className="muted">{t("Cieľ sa zmení po uplynutí času bez ohľadu na úspech. Úspech vyžaduje súvislú výdrž v zóne; účastník ďalej sleduje cieľ až do zmeny.")}</p>
            </>}
            <label>{t("Počet úloh v teste")}<input type="number" min="1" step="1" value={configuration.max_completed_actions} onChange={(event) => setValue("max_completed_actions", Number(event.target.value))} /></label>
            <label>{t("Odpočet pred štartom (s)")}<input type="number" min="0" value={configuration.countdown_s} onChange={(event) => setValue("countdown_s", Number(event.target.value))} /></label>
            <label>{t("Maximálna hodnota páčky")}<input type="number" min="100" value={configuration.stick_max} onChange={(event) => setValue("stick_max", Number(event.target.value))} /></label>
            <label>{t("Náhodný seed")}<input value={configuration.seed == null ? "" : String(configuration.seed)} onChange={(event) => setValue("seed", event.target.value.trim() === "" ? null : Number(event.target.value))} placeholder={t("automaticky")} /></label>
          </div>
          <div className="toggle-row"><label><input type="checkbox" checked={Boolean(configuration.fullscreen)} onChange={(event) => setValue("fullscreen", event.target.checked)} /> {t("Celá obrazovka")}</label><label><input type="checkbox" checked={Boolean(configuration.topmost)} onChange={(event) => setValue("topmost", event.target.checked)} /> {t("Vždy navrchu")}</label><label><input type="checkbox" checked={Boolean(configuration.debug_output)} onChange={(event) => setValue("debug_output", event.target.checked)} /> {t("Debug výstup")}</label></div>
          <div className="field-grid geometry-fields">
            <label>{t("Veľkosť gimbalu")}<input type="number" min="150" value={configuration.gui_gimbal_size} onChange={(event) => setValue("gui_gimbal_size", Number(event.target.value))} /></label>
            <label>{t("Polomer cieľovej zóny")}<input type="number" min="10" value={configuration.gui_stick_zone} onChange={(event) => setValue("gui_stick_zone", Number(event.target.value))} /></label>
            <label>{t("Polomer páčky")}<input type="number" min="1" value={configuration.gui_stick_radius} onChange={(event) => setValue("gui_stick_radius", Number(event.target.value))} /></label>
            <label>{t("Obrys páčky")}<input type="number" min="1" value={configuration.gui_stick_outline_width} onChange={(event) => setValue("gui_stick_outline_width", Number(event.target.value))} /></label>
            <label>{t("Obrys zóny")}<input type="number" min="1" value={configuration.gui_zone_outline_width} onChange={(event) => setValue("gui_zone_outline_width", Number(event.target.value))} /></label>
            <label>{t("Obrys gimbalu")}<input type="number" min="1" value={configuration.gui_gimbal_border_width} onChange={(event) => setValue("gui_gimbal_border_width", Number(event.target.value))} /></label>
            <label>{t("Šírka stredových značiek")}<input type="number" min="1" value={configuration.gui_gimbal_cross_width} onChange={(event) => setValue("gui_gimbal_cross_width", Number(event.target.value))} /></label>
          </div>
        </section>}
        {selectedPanel === "actions" && <section className="config-card action-settings-card">
          <div className="eyebrow">{t("NÁHODNÝ GENERÁTOR CIEĽOV")} · v{actionSettings.generator_version}</div><h3>{t("Množina cieľových bodov a prechody")}</h3>
          <p className="config-note">{t("Z každej osi sa vytvorí rovnomerná množina bodov v zadanom intervale. Následne sa náhodne mení 1 až nastavený maximálny počet súradníc oproti predchádzajúcemu cieľu. Nula je bežný bod; automatický návrat do stredu sa nevkladá.")}</p>
          <div className="field-grid action-global-fields">
            <label>{t("Počet možných bodov na každej osi")}<input type="number" min="2" max="101" step="1" value={actionSettings.points_per_axis} onChange={(event) => updateAction("points_per_axis", Number(event.target.value))} /></label>
            <label>{t("Minimum meniacich sa osí")}<input type="number" min="1" max="4" value={actionSettings.min_changed_axes} onChange={(event) => updateAction("min_changed_axes", Number(event.target.value))} /></label>
            <label>{t("Maximum meniacich sa osí")}<input type="number" min={actionSettings.min_changed_axes} max="4" value={actionSettings.max_changed_axes} onChange={(event) => updateAction("max_changed_axes", Math.max(actionSettings.min_changed_axes, Number(event.target.value)))} /></label>
            <label>{t("Pravdepodobnosť zmeny iba jedného gimbalu (%)")}<input type="number" min="0" max="100" step="5" value={Math.round(actionSettings.single_gimbal_probability * 100)} onChange={(event) => updateAction("single_gimbal_probability", Number(event.target.value) / 100)} /></label>
          </div>
          <div className="action-axis-table">
            <div className="action-axis-heading"><span>{t("Os")}</span><span>{t("Minimum")}</span><span>{t("Maximum")}</span></div>
            {AXIS_KEYS.map((axis) => <div className="action-axis-row" key={axis}>
              <strong>{axis}</strong>
              <label><span className="sr-only">{tf("{0} minimum", axis)}</span><input aria-label={tf("{0} minimum", axis)} type="number" min="-1" max="1" step=".05" value={actionSettings.intervals[axis][0]} onChange={(event) => setAxisBound(axis, 0, Number(event.target.value))} /></label>
              <label><span className="sr-only">{tf("{0} maximum", axis)}</span><input aria-label={tf("{0} maximum", axis)} type="number" min="-1" max="1" step=".05" value={actionSettings.intervals[axis][1]} onChange={(event) => setAxisBound(axis, 1, Number(event.target.value))} /></label>
            </div>)}
          </div>
          <p className="muted">{t("Osi LX/LY patria k ľavému gimbalu, RY/RX k pravému. Pri jednej meniacej sa osi zostáva druhý gimbal bez zmeny; pravdepodobnosť jedného gimbalu sa uplatní pri výbere dvoch osí.")}</p>
        </section>}
        {selectedPanel === "colors" && <section className="config-card">
          <div className="eyebrow">{t("VZHĽAD")}</div><h3>{t("Farby prvkov")}</h3>
          <label className="toggle-row"><input type="checkbox" checked={configuration.independent_zone_colors} onChange={(event) => setValue("independent_zone_colors", event.target.checked)} /> {t("Samostatná farba zóny pre každý gimbal podľa polohy páčky")}</label>
          <div className="selected-color"><span>{colorFields.find(([key]) => key === selectedColor)?.[1] ?? selectedColor}</span><input ref={colorInput} type="color" value={String(configuration[selectedColor] ?? "#ffffff")} onChange={(event) => setValue(selectedColor, event.target.value)} /><code>{String(configuration[selectedColor])}</code></div>
          <div className="color-list">{colorFields.map(([key, label]) => <button type="button" className={selectedColor === key ? "color-item selected" : "color-item"} key={key} onClick={() => pickColor(key)}><span>{label}</span><i style={{ background: String(configuration[key]) }} /><code>{String(configuration[key])}</code></button>)}</div>
        </section>}
      </div>
      <div className="editor-preview"><div className="eyebrow">{t("ŽIVÝ NÁHĽAD")}</div><h3>{t("SCoPE obrazovka")}</h3><GimbalPreview configuration={configuration} onPick={pickColor} /><details className="json-disclosure"><summary>{t("Rozšírený JSON náhľad")}</summary><pre className="config-preview live">{JSON.stringify(configuration, null, 2)}</pre></details></div>
    </div>
    <footer className="editor-footer"><button type="button" className="quiet" onClick={onClose}>{t("Zrušiť")}</button><button className="primary" onClick={save}>{t("Uložiť nastavenia")}</button>{message && <span className="notice">{message}</span>}</footer>
  </section></div>;
}

type ConnectedClient = {
  client_id: string;
  username: string;
  role: string;
  client_type: "web" | "measure" | "compute";
  ip_address: string | null;
  connected_for_seconds: number;
  last_seen_seconds: number;
  status: "idle" | "measuring";
  disconnect_pending: boolean;
  participant_code: string | null;
  test: string | null;
};

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)} min`;
}

function ClientMonitor({ csrfToken }: { csrfToken: string }) {
  const [clients, setClients] = useState<ConnectedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  async function disconnect(client: ConnectedClient) {
    if (!window.confirm(client.client_type === "measure"
      ? tf("Odpojiť THRUST-measure klienta {0} po dokončení aktuálneho merania?", client.username)
      : tf("Odhlásiť webového klienta {0}?", client.username))) return;
    setDisconnecting(client.client_id);
    setError("");
    try {
      const result = await request<{ status: "pending" | "disconnected" }>(
        `/api/admin/clients/${encodeURIComponent(client.client_id)}/disconnect`,
        { method: "POST", headers: { "X-CSRF-Token": csrfToken } },
      );
      setClients(current => result.status === "pending"
        ? current.map(item => item.client_id === client.client_id ? { ...item, disconnect_pending: true } : item)
        : current.filter(item => item.client_id !== client.client_id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Klienta sa nepodarilo odpojiť."));
    } finally {
      setDisconnecting(null);
    }
  }
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const data = await request<ConnectedClient[]>("/api/admin/clients");
        if (active) { setClients(data); setError(""); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : t("Pripojených klientov sa nepodarilo načítať."));
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return <section className="client-monitor">
    <div className="client-monitor-heading">
      <div><div className="eyebrow">{t("MONITOR KLIENTOV")}</div><h2>{t("Monitor pripojených klientov")}</h2><p className="muted">{t("Stav sa priebežne obnovuje.")}</p></div>
      <span className="client-count">{clients.length}</span>
    </div>
    {error && <div className="notice error">{error}</div>}
    {loading ? <div className="empty">{t("Načítavam klientov…")}</div> : clients.length === 0 ? <div className="empty">{t("Žiadni klienti nie sú pripojení.")}</div> :
      <div className="client-monitor-grid">{clients.map((client) => <article className={`client-monitor-card client-${client.client_type}`} key={client.client_id}>
        <div className="client-monitor-card-head"><div><h3>{client.username}</h3><span className={`client-type-pill ${client.client_type}`}>{client.client_type === "measure" ? "THRUST-measure" : client.client_type === "compute" ? "THRUST-compute" : "WebDB browser"}</span><span className="client-role">{client.role}</span></div></div>
        <div className={`client-activity ${client.status}`}><span className="client-activity-indicator" aria-hidden="true" /><strong>{client.status === "measuring" ? t("Vykonáva meranie") : t("Nečinný")}</strong>
          {client.status === "measuring" && <span className="client-activity-detail">{client.participant_code || "—"} · {client.test || "—"}</span>}</div>
        <dl className="client-monitor-fields">
          <div><dt>{t("Pripojený")}</dt><dd>{formatDuration(client.connected_for_seconds)}</dd></div>
          <div><dt>{t("IP adresa")}</dt><dd>{client.ip_address || "—"}</dd></div>
          <div><dt>{t("Posledná aktivita")}</dt><dd>{formatDuration(client.last_seen_seconds)} {t("dozadu")}</dd></div>
        </dl>
        <div className="client-monitor-actions">
          {client.disconnect_pending && <span className="muted">{t("Odpojenie po dokončení merania")}</span>}
          <button type="button" className="quiet compact" disabled={client.disconnect_pending || disconnecting === client.client_id}
            onClick={() => void disconnect(client)}>{disconnecting === client.client_id ? t("Odpájam…") : t("Odpojiť klienta")}</button>
        </div>
      </article>)}</div>}
  </section>;
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
    <SiteFooter />
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

const COMPARISON_METRIC_LABELS: Record<string, string> = {
  reaction_delay_s: "Oneskorenie reakcie",
  rise_time_s: "Čas nábehu",
  overshoot_pct: "Presiahnutie cieľa",
  settling_time_s: "Čas ustálenia",
  steady_state_error_pct: "Chyba v ustálenom stave",
  tracking_rmse: "Chyba sledovania",
  mean_std: "Kolísanie odozvy",
  mean_target_error_m: "Priemerná chyba cieľa",
  median_target_error_m: "Medián chyby cieľa",
  rms_target_error_m: "RMS chyba cieľa",
  time_in_zone_pct: "Čas v cieľovej zóne",
  action_count: "Počet akcií",
  reset_count: "Resetovania",
  crash_count: "Crash udalosti",
};

function StudentComparisonCharts({ comparison }: { comparison: StudentComparison }) {
  const [metricKey, setMetricKey] = useState("");
  const [view, setView] = useState<"histogram" | "response">("histogram");
  const metric = comparison.metrics.find((item) => item.key === metricKey) ?? comparison.metrics[0];
  const responseAvailable = Boolean(comparison.response_curve);
  useEffect(() => { if (!responseAvailable && view === "response") setView("histogram"); }, [responseAvailable, view]);
  if (!comparison.metrics.length) return <p className="muted">{t("Pre túto skupinu zatiaľ nie sú dostupné porovnateľné ukazovatele.")}</p>;
  const metricName = metric ? t(COMPARISON_METRIC_LABELS[metric.key] ?? metric.key) : "";
  return <div className="student-comparison">
    <p className="muted comparison-explainer">{t("Každý výsledok spája všetky osi jedného účastníka. Graf ukazuje anonymné rozdelenie skupiny a tvoju hodnotu.")}</p>
    <div className="comparison-view-tabs" role="tablist" aria-label={t("Typ grafu")}>
      <button type="button" role="tab" aria-selected={view === "histogram"} className={view === "histogram" ? "active" : ""} onClick={() => setView("histogram")}>{t("Histogram")}</button>
      <button type="button" role="tab" aria-selected={view === "response"} className={view === "response" ? "active" : ""} disabled={!responseAvailable} onClick={() => setView("response")}>{t("Priebeh odozvy")}</button>
    </div>
    {view === "histogram" ? <>
      <div className="comparison-metric-tabs" role="tablist" aria-label={t("Ukazovateľ")}>
        {comparison.metrics.map((item) => <button type="button" role="tab" key={item.key} aria-selected={item.key === metric?.key} className={item.key === metric?.key ? "active" : ""} onClick={() => setMetricKey(item.key)}>{t(COMPARISON_METRIC_LABELS[item.key] ?? item.key)}</button>)}
      </div>
      {metric && <div className="comparison-chart-card">
        <div className="comparison-chart-heading"><div><div className="eyebrow">{t("SKUPINOVÉ POROVNANIE")}</div><h3>{metricName}</h3></div><div className="comparison-legend"><span><i className="legend-cohort" />{t("Skupina")}</span><span><i className="legend-student" />{t("Ty")}: {formatComparisonValue(metric.own_value, metric.key)}</span></div></div>
        <ComparisonHistogramPlot metric={metric} />
      </div>}
    </> : comparison.response_curve && <div className="comparison-chart-card">
      <div className="comparison-chart-heading"><div><div className="eyebrow">{t("AGREGOVANÉ VŠETKY OSI")}</div><h3>{t("Priemerný normalizovaný priebeh")}</h3></div><div className="comparison-legend"><span><i className="legend-cohort" />{t("Skupina")}</span><span><i className="legend-student" />{t("Ty")}</span></div></div>
      <ComparisonResponsePlot data={comparison.response_curve} />
    </div>}
    <p className="comparison-footnote">{t("Každý účastník má v skupinovom priemere rovnakú váhu.")}</p>
  </div>;
}


function StudentPortal({ user, onLogout, onPasswordChanged, accentTheme, colorMode, onAppearanceChange, profileReminder, onDismissProfileReminder }: {
  user: User;
  onLogout: () => Promise<void>;
  onPasswordChanged: () => void;
  accentTheme: AccentTheme;
  colorMode: ColorMode;
  onAppearanceChange: (theme: AccentTheme, mode: ColorMode) => void;
  profileReminder: boolean;
  onDismissProfileReminder: () => void;
}) {
  const { language } = useLanguage();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [studentPage, setStudentPage] = useState<"results" | "account">("results");
  const [accountSection, setAccountSection] = useState<"profile" | "security" | "privacy" | "consents">("profile");
  const [measurements, setMeasurements] = useState<StudentMeasurement[]>([]);
  const [comparison, setComparison] = useState<StudentComparison | null>(null);
  const [mode, setMode] = useState<MeasurementMode>("SCOPE");
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [studentMeasurementSort, setStudentMeasurementSort] = useState<SortState>({ column: "date", direction: "desc" });
  const [consents, setConsents] = useState<ConsentStatuses | null>(null);
  const [consentTexts, setConsentTexts] = useState<ConsentDocuments | null>(null);
  const [consentDialog, setConsentDialog] = useState<ConsentKind | null>(null);
  const [activeConsentDocument, setActiveConsentDocument] = useState<ConsentDocument | null>(null);
  const [error, setError] = useState("");
  const [consentMessage, setConsentMessage] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
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
      setConsentMessage(tf("Súhlas „{0}“ bol odvolaný. Ďalšie merania sú pozastavené a existujúce údaje posúdi správca.", name));
    } catch (reason) {
      setConsentMessage(reason instanceof Error ? reason.message : t("Súhlas sa nepodarilo odvolať."));
    }
  }

  useEffect(() => {
    if (user.must_change_password) return;
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
  }, [user.must_change_password]);

  useEffect(() => {
    if (user.must_change_password) return;
    const refreshStudentResults = () => {
      request<StudentMeasurement[]>("/api/student/measurements").then(setMeasurements).catch(() => undefined);
      request<StudentComparison>(`/api/student/comparison?mode=${mode}`).then(setComparison).catch(() => undefined);
    };
    window.addEventListener("thrust:data-updated", refreshStudentResults);
    return () => window.removeEventListener("thrust:data-updated", refreshStudentResults);
  }, [mode, user.must_change_password]);

  useEffect(() => {
    if (user.must_change_password) return;
    let active = true;
    setConsentTexts(null);
    request<ConsentDocuments>(`/api/public/consent-texts?lang=${language}`)
      .then((documents) => { if (active) setConsentTexts(documents); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : t("Texty súhlasov sa nepodarilo načítať.")); });
    return () => { active = false; };
  }, [language, user.must_change_password]);

  useEffect(() => {
    if (user.must_change_password) return;
    let active = true;
    setComparison(null);
    void request<StudentComparison>(`/api/student/comparison?mode=${mode}`)
      .then((result) => { if (active) setComparison(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : t("Porovnanie sa nepodarilo načítať.")); });
    return () => { active = false; };
  }, [mode, user.must_change_password]);

  const visibleMeasurements = sortRows(measurements.filter((item) => getMeasurementMode(item) === mode), studentMeasurementSort, (item, column) => ({ test: item.test_type, status: item.status, date: item.started_at, size: item.raw_size_bytes ?? 0 }[column as "test" | "status" | "date" | "size"]));
  const selectedMeasurement = visibleMeasurements.find((item) => item.id === selectedMeasurementId);

  if (user.must_change_password) return <main className="student-shell" data-accent-theme={accentTheme} data-color-mode={colorMode}>
    <header><Brand colorMode={colorMode} /><div className="header-actions"><LanguageSwitcher /><button className="quiet" onClick={onLogout}>{t("Odhlásiť")}</button></div></header>
    <section className="public student-content forced-password-page"><div className="eyebrow">{t("ZABEZPEČENIE ÚČTU")}</div><h1>{t("Zmeň si dočasné heslo")}</h1><p className="lead">{t("Správca ti nastavil dočasné heslo. Pred pokračovaním si zvoľ vlastné heslo.")}</p><PasswordChangePanel csrfToken={user.csrf_token} forced onChanged={onPasswordChanged} /></section>
    <SiteFooter />
  </main>;

  return <main className="student-shell" data-accent-theme={accentTheme} data-color-mode={colorMode}>
    <header><Brand colorMode={colorMode} /><div className="header-actions"><AppearanceControls accentTheme={accentTheme} colorMode={colorMode} onAccentChange={(theme) => onAppearanceChange(theme, colorMode)} onModeChange={(mode) => onAppearanceChange(accentTheme, mode)} /><LanguageSwitcher /><button className="quiet" onClick={onLogout}>{t("Odhlásiť")}</button></div></header>
    <section className="public student-content">
      <div className="eyebrow">{studentPage === "results" ? t("OSOBNÝ PROFIL") : t("SPRÁVA ÚČTU")}</div>
      <h1>{t("Ahoj,")} {profile?.nickname || user.nickname || user.participant_code || user.username}.</h1>
      <p className="lead">{t("Tvoje účastnícke ID:")} <strong>{user.participant_code || "—"}</strong></p>
      <nav className="student-page-nav" aria-label={t("Hlavná navigácia")}>
        <button type="button" className={`student-page-card ${studentPage === "results" ? "active" : ""}`} aria-current={studentPage === "results" ? "page" : undefined} onClick={() => setStudentPage("results")}>
          <span className="student-page-card-icon" aria-hidden="true">↗</span><span><strong>{t("Moje výsledky")}</strong><small>{t("Výsledky meraní a skupinové porovnanie")}</small></span>
        </button>
        <button type="button" className={`student-page-card ${studentPage === "account" ? "active" : ""}`} aria-current={studentPage === "account" ? "page" : undefined} onClick={() => setStudentPage("account")}>
          <span className="student-page-card-icon" aria-hidden="true">⚙</span><span><strong>{t("Správa účtu")}</strong><small>{t("Profil, heslo, súkromie a súhlasy")}</small>
          </span>
        </button>
      </nav>
      {studentPage === "results" && <div className="stats"><Metric label={t("Moje merania")} value={visibleMeasurements.length} /><Metric label={t("Skupina")} value={comparison?.cohort_participant_count ?? "—"} /><Metric label={t("Porovnanie")} value={comparison?.available ? t("dostupné") : t("čaká na limit")} /></div>}
      {error && <p className="error">{error}</p>}
      {studentPage === "results" && profileReminder && profile && <div className="notice student-profile-reminder"><span>{t("Účet je vytvorený. Ak chceš, doplň si nepovinné otázky o skúsenostiach s ovládaním a UAV; môžeš to urobiť aj neskôr.")}</span><div><button type="button" className="primary compact" onClick={() => { setStudentPage("account"); setAccountSection("profile"); setOnboardingOpen(true); }}>{t("Vyplniť profil")}</button><button type="button" className="quiet compact" onClick={onDismissProfileReminder}>{t("Neskôr")}</button></div></div>}
      {studentPage === "results" && <section className="panel">
        <div className="student-result-heading"><div><div className="eyebrow">{t("VÝSLEDKY")}</div><h2>{t("Moje merania ·")} {mode === "SCOPE" ? "SCoPE" : "SimPLE"}</h2></div><ModeSwitch value={mode} onChange={(selected) => { setMode(selected); setSelectedMeasurementId(null); }} /></div>
        {visibleMeasurements.length ? <div className="table-wrap"><table><thead><tr><th><SortHeader label={t("Test")} active={studentMeasurementSort.column === "test"} direction={studentMeasurementSort.direction} onClick={() => setStudentMeasurementSort((current) => nextSort(current, "test"))} /></th><th><SortHeader label={t("Stav")} active={studentMeasurementSort.column === "status"} direction={studentMeasurementSort.direction} onClick={() => setStudentMeasurementSort((current) => nextSort(current, "status"))} /></th><th><SortHeader label={t("Dátum a čas")} active={studentMeasurementSort.column === "date"} direction={studentMeasurementSort.direction} onClick={() => setStudentMeasurementSort((current) => nextSort(current, "date"))} /></th><th><SortHeader label={t("Veľkosť súboru")} active={studentMeasurementSort.column === "size"} direction={studentMeasurementSort.direction} onClick={() => setStudentMeasurementSort((current) => nextSort(current, "size"))} /></th><th>{t("Výsledky")}</th></tr></thead><tbody>{visibleMeasurements.map((m) => <tr key={m.id}><td>{m.test_type}</td><td>{m.status}</td><td>{formatDateTime(m.started_at)}</td><td>{formatBytes(m.raw_size_bytes)}</td><td><button type="button" className="quiet compact" onClick={() => setSelectedMeasurementId(m.id === selectedMeasurementId ? null : m.id)}>{m.id === selectedMeasurementId ? t("Skryť") : t("Zobraziť")}</button></td></tr>)}</tbody></table></div> : <p className="muted">{t("Zatiaľ nemáš uložené meranie")} {mode === "SCOPE" ? "SCoPE" : "SimPLE"}.</p>}
        {selectedMeasurement && <div className="student-result-detail"><h3>{selectedMeasurement.test_type} · {formatDateTime(selectedMeasurement.started_at)}</h3>{mode === "SIMPLE" ? <SimpleAnalysisView analysis={selectedMeasurement.analysis_data ?? {}} /> : selectedMeasurement.analysis_data?.normalized_step_response ? <><ScopeTaskSummary analysis={selectedMeasurement.analysis_data ?? {}} /><ResponseChart data={selectedMeasurement.analysis_data.normalized_step_response} /><ResponseMetrics data={selectedMeasurement.analysis_data.normalized_step_response} /></> : <p className="muted">{t("Toto meranie nemá uloženú analýzu odozvy.")}</p>}</div>}
      </section>}
      {studentPage === "results" && <section className="panel">
        <div className="student-result-heading"><div><div className="eyebrow">{t("ANONYMIZOVANÉ POROVNANIE ·")} {mode === "SCOPE" ? "SCoPE" : "SimPLE"}</div><h2>{t("Výsledok v porovnaní so skupinou")}</h2></div></div>
        {comparison?.available ? <StudentComparisonCharts comparison={comparison} /> : <p className="muted">{t("Grafy sa zobrazia po nazbieraní dostatočne veľkej skupiny.")}</p>}
      </section>}
      {studentPage === "account" && <section className="account-page-intro panel"><div><div className="eyebrow">{t("KONTO, ZABEZPEČENIE A SÚKROMIE")}</div><h2>{t("Správa účtu")}</h2></div><p className="muted">{t("Uprav svoj profil, zmeň heslo alebo spravuj svoje údaje a súhlasy.")}</p></section>}
      {studentPage === "account" && <nav className="account-section-nav" aria-label={t("Časti správy účtu")}>
        {([["profile", "Profil"], ["security", "Zabezpečenie"], ["privacy", "Súkromie a údaje"], ["consents", "Súhlasy"]] as const).map(([section, label]) => <button type="button" key={section} className={accountSection === section ? "active" : ""} aria-current={accountSection === section ? "page" : undefined} onClick={() => setAccountSection(section)}>{t(label)}</button>)}
      </nav>}
      {studentPage === "account" && accountSection === "profile" && profile && <section id="student-profile-panel" className="panel student-profile-panel">
        <div className="profile-panel-heading"><div><div className="eyebrow">{t("PROFIL PILOTA")}</div><h2>{t("Moje údaje")}</h2><p className="muted">{t("Prezývka a nepovinné odpovede o tvojich skúsenostiach.")}</p></div>
          <button className="quiet compact" onClick={() => { setProfileMessage(""); if (onboardingOpen) { setOnboardingOpen(false); return; } setEditingProfile((value) => !value); }}>{onboardingOpen ? t("Zrušiť vyplnenie") : editingProfile ? t("Zrušiť úpravy") : t("Upraviť údaje")}</button>
        </div>
        {profileMessage && <p className="notice">{profileMessage}</p>}
        {onboardingOpen
          ? <StudentProfileOnboarding profile={profile} csrfToken={user.csrf_token} onSkip={() => { setOnboardingOpen(false); onDismissProfileReminder(); }} onSaved={(updated) => { setProfile(updated); setOnboardingOpen(false); setProfileMessage(t("Údaje profilu boli uložené.")); onDismissProfileReminder(); }} />
          : editingProfile
          ? <ParticipantProfileEditor studentProfile={profile} csrfToken={user.csrf_token} onStudentSaved={(updated) => { setProfile(updated); setEditingProfile(false); setProfileMessage(t("Údaje profilu boli uložené.")); onDismissProfileReminder(); }} />
          : <InfoTable rows={[
            ["E-mail", profile.email || profile.username],
            ["Participant ID", profile.participant_code],
            [t("Rok narodenia"), profile.birth_year ?? t("Neuvedené")],
            [t("Biologické pohlavie"), biologicalSexLabel(profile.biological_sex)],
            [t("Dominantná ruka"), profileLabel(profile.dominant_hand)],
            [t("Herný gamepad"), yesNoLabel(profile.gamepad_used)],
            [t("PC joystick"), yesNoLabel(profile.pc_joystick_used)],
            [t("RC vysielač"), yesNoLabel(profile.rc_transmitter_used)],
            [t("Lietal(a) s UAV"), yesNoLabel(profile.uav_flown)],
            [t("LOS"), yesNoLabel(profile.uav_los)],
            [t("FPV"), yesNoLabel(profile.uav_fpv)],
            [t("Stabilizovaný režim"), yesNoLabel(profile.uav_stabilized_mode)],
            [t("Manuálny / acro režim"), yesNoLabel(profile.uav_manual_mode)],
          ]} />}
      </section>}
      {studentPage === "account" && accountSection === "security" && <PasswordChangePanel csrfToken={user.csrf_token} onChanged={() => undefined} />}
      {studentPage === "account" && accountSection === "consents" && <section className="panel">
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
      </section>}

      {studentPage === "account" && accountSection === "privacy" && <StudentDataManagement csrfToken={user.csrf_token} />}
    </section>
    {consentDialog && consentTexts && <ConsentTextDialog kind={consentDialog} document={activeConsentDocument || consentTexts[consentDialog]} onClose={() => { setConsentDialog(null); setActiveConsentDocument(null); }} />}
    <SiteFooter />
  </main>;
}

function PasswordChangePanel({ csrfToken, forced = false, onChanged }: { csrfToken: string; forced?: boolean; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true); setMessage(""); setIsError(false);
    const data = new FormData(form);
    const currentPassword = String(data.get("current_password") || "");
    const newPassword = String(data.get("new_password") || "");
    const confirmation = String(data.get("confirm_password") || "");
    if (newPassword !== confirmation) { setMessage(t("Nové heslá sa nezhodujú.")); setIsError(true); setSaving(false); return; }
    try {
      await request<void>("/api/student/password", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) });
      setMessage(t("Heslo bolo zmenené."));
      onChanged();
      form.reset();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : t("Heslo sa nepodarilo zmeniť.")); setIsError(true); }
    finally { setSaving(false); }
  }
  return <section className={`panel password-change-panel${forced ? " forced" : ""}`}><div className="eyebrow">{t("ZABEZPEČENIE")}</div><h2>{forced ? t("Zmeň si dočasné heslo") : t("Zmena hesla")}</h2><p className="muted">{forced ? t("Pred pokračovaním si nastav vlastné heslo.") : t("Na zmenu hesla zadaj svoje aktuálne heslo a nové heslo s dĺžkou aspoň 10 znakov.")}</p><form className="password-change-form" onSubmit={submit}><label>{t("Aktuálne heslo")}<input type="password" name="current_password" autoComplete="current-password" required /></label><label>{t("Nové heslo")}<input type="password" name="new_password" autoComplete="new-password" minLength={10} maxLength={1024} required /></label><label>{t("Potvrdiť nové heslo")}<input type="password" name="confirm_password" autoComplete="new-password" minLength={10} maxLength={1024} required /></label><div className="profile-editor-actions"><span className={isError ? "error" : "muted"}>{message}</span><button className="primary compact" disabled={saving}>{saving ? t("Ukladám…") : t("Zmeniť heslo")}</button></div></form></section>;
}

function StudentDataManagement({ csrfToken }: { csrfToken: string }) {
  const [requests, setRequests] = useState<StudentDataRequest[]>([]);
  const [requestType, setRequestType] = useState<StudentDataRequest["request_type"]>("erasure");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);
  const [privacySection, setPrivacySection] = useState<"export" | "requests" | "information">("export");
  useEffect(() => { request<StudentDataRequest[]>("/api/student/data-requests").then(setRequests).catch((reason) => setMessage(reason instanceof Error ? reason.message : t("Žiadosti sa nepodarilo načítať."))); }, []);
  async function download(format: "json" | "csv" | "zip") {
    setExporting(format); setMessage("");
    try {
      const response = await fetch(`/api/student/data-export?format=${format}`, { credentials: "same-origin" });
      if (!response.ok) { const body = await response.json().catch(() => null) as { detail?: string } | null; throw new Error(body?.detail || t("Export sa nepodarilo vytvoriť.")); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `thrust-my-data.${format}`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : t("Export sa nepodarilo vytvoriť.")); }
    finally { setExporting(null); }
  }
  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestType === "erasure" && !window.confirm(t("Odoslať žiadosť o výmaz? Žiadosť sa najprv posúdi; údaje sa týmto tlačidlom okamžite nevymažú."))) return;
    setBusy(true); setMessage("");
    try {
      const created = await request<StudentDataRequest>("/api/student/data-requests", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ request_type: requestType, details: details.trim() || null }) });
      setRequests((current) => [created, ...current]); setDetails(""); setMessage(t("Žiadosť bola odoslaná."));
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : t("Žiadosť sa nepodarilo odoslať.")); }
    finally { setBusy(false); }
  }
  return <section className="student-data-management">
    <nav className="privacy-section-nav" aria-label={t("Súkromie a údaje")}>
      {([["export", "Stiahnutie"], ["requests", "Žiadosti"], ["information", "Informácie a lehoty"]] as const).map(([section, label]) => <button type="button" key={section} className={privacySection === section ? "active" : ""} aria-current={privacySection === section ? "page" : undefined} onClick={() => setPrivacySection(section)}>{t(label)}</button>)}
    </nav>
    {privacySection === "export" && <section className="panel"><div className="eyebrow">{t("TVOJE ÚDAJE")}</div><h2>{t("Stiahnuť moje údaje")}</h2><p className="muted">{t("Export obsahuje iba údaje priradené k tvojmu účtu. ZIP obsahuje aj dostupné raw súbory; prihlasovacie tajomstvá a údaje iných účastníkov sa neexportujú.")}</p><div className="actions"><button className="quiet" disabled={exporting !== null} onClick={() => void download("json")}>{exporting === "json" ? t("Pripravujem…") : t("Stiahnuť JSON")}</button><button className="quiet" disabled={exporting !== null} onClick={() => void download("csv")}>{exporting === "csv" ? t("Pripravujem…") : t("Stiahnuť CSV")}</button><button className="primary" disabled={exporting !== null} onClick={() => void download("zip")}>{exporting === "zip" ? t("Pripravujem…") : t("Stiahnuť ZIP")}</button></div></section>}
    {privacySection === "information" && <section className="panel"><div className="eyebrow">{t("OCHRANA OSOBNÝCH ÚDAJOV")}</div><h2>{t("Informácie o spracúvaní")}</h2><p className="muted">{t("Nasledujúce údaje doplníme po potvrdení s DPO. Zatiaľ nejde o schválené lehoty ani právne stanovisko.")}</p><div className="privacy-placeholder-grid">{privacyNoticePlaceholders.map((item) => <article key={item.key}><strong>{t(item.label)}</strong><span>{t("Bude doplnené po dohode s DPO.")}</span></article>)}</div><h3>{t("Lehoty uchovávania")}</h3><div className="privacy-placeholder-grid">{privacyRetentionPlaceholders.map((item) => <article key={item.key}><strong>{t(item.label)}</strong><span className="retention-placeholder">{item.period ?? t("Lehota sa doplní po dohode s DPO.")}</span></article>)}</div></section>}
    {privacySection === "requests" && <section className="panel"><div className="eyebrow">{t("TVOJE PRÁVA")}</div><h2>{t("Požiadať o vybavenie žiadosti")}</h2><p className="muted">{t("Výmaz, opravu údajov, obmedzenie spracúvania alebo námietku môžeš poslať správcovi. Stav vybavenia uvidíš nižšie. Export údajov je dostupný okamžite vyššie.")}</p><form className="data-request-form" onSubmit={submitRequest}><label>{t("Typ žiadosti")}<select value={requestType} onChange={(event) => setRequestType(event.target.value as StudentDataRequest["request_type"])}><option value="erasure">{t("Žiadosť o výmaz")}</option><option value="rectification">{t("Oprava údajov")}</option><option value="restriction">{t("Obmedzenie spracúvania")}</option><option value="objection">{t("Námietka proti spracúvaniu")}</option><option value="access">{t("Prístup k údajom")}</option><option value="portability">{t("Prenositeľnosť údajov")}</option></select></label><label>{t("Poznámka (nepovinné)")}<textarea rows={3} maxLength={4000} value={details} onChange={(event) => setDetails(event.target.value)} placeholder={t("Uveď, ktorých údajov alebo meraní sa žiadosť týka.")} /></label><button className="primary compact" disabled={busy}>{busy ? t("Odosielam…") : t("Odoslať žiadosť")}</button></form>{message && <p className="notice">{message}</p>}<div className="data-request-list"><h3>{t("Moje žiadosti")}</h3>{requests.length ? requests.map((item) => <article key={item.id}><div><strong>{dataRequestTypeLabel(item.request_type)}</strong><small>{formatDateTime(item.created_at)}</small></div><span className={`request-status request-status-${item.status}`}>{dataRequestStatusLabel(item.status)}</span>{item.details && <p>{item.details}</p>}{item.response_note && <p className="muted">{t("Odpoveď správcu:")} {item.response_note}</p>}</article>) : <p className="muted">{t("Zatiaľ nemáš odoslané žiadosti.")}</p>}</div></section>}
  </section>;
}

function dataRequestTypeLabel(value: StudentDataRequest["request_type"]) {
  const labels: Record<StudentDataRequest["request_type"], string> = { access: t("Prístup k údajom"), rectification: t("Oprava údajov"), erasure: t("Žiadosť o výmaz"), restriction: t("Obmedzenie spracúvania"), portability: t("Prenositeľnosť údajov"), objection: t("Námietka proti spracúvaniu") };
  return labels[value];
}
function dataRequestStatusLabel(value: DataRequestStatus) {
  const labels: Record<DataRequestStatus, string> = { received: t("Prijatá"), in_review: t("Posudzuje sa"), completed: t("Vybavená"), rejected: t("Zamietnutá") };
  return labels[value];
}

function StudentDataRequestAdminQueue({ csrfToken }: { csrfToken: string }) {
  const [items, setItems] = useState<StudentDataRequest[]>([]); const [error, setError] = useState("");
  useEffect(() => { request<StudentDataRequest[]>("/api/admin/data-requests").then(setItems).catch((reason) => setError(reason instanceof Error ? reason.message : t("Žiadosti sa nepodarilo načítať."))); }, []);
  function apply(updated: StudentDataRequest) { setItems((current) => current.map((item) => item.id === updated.id ? updated : item)); }
  return <section className="browser-panel"><div className="browser-header"><div><div className="eyebrow">{t("OCHRANA ÚDAJOV")}</div><h2>{t("Žiadosti študentov")}</h2><p className="muted">{t("Evidencia a stav žiadostí o prístup, opravu, výmaz alebo obmedzenie údajov.")}</p></div><span className="role-label">{items.filter((item) => item.status === "received" || item.status === "in_review").length} {t("otvorených")}</span></div>{error && <p className="error">{error}</p>}{items.length ? <div className="privacy-request-admin-list">{items.map((item) => <AdminDataRequestCard key={item.id} item={item} csrfToken={csrfToken} onSaved={apply} />)}</div> : !error && <p className="muted">{t("Momentálne nie sú evidované žiadne žiadosti.")}</p>}</section>;
}

function AdminDataRequestCard({ item, csrfToken, onSaved }: { item: StudentDataRequest; csrfToken: string; onSaved: (item: StudentDataRequest) => void }) {
  const [status, setStatus] = useState<DataRequestStatus>(item.status); const [note, setNote] = useState(item.response_note || ""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(""); try { const updated = await request<StudentDataRequest>(`/api/admin/data-requests/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ status, response_note: note.trim() || null }) }); onSaved(updated); } catch (reason) { setError(reason instanceof Error ? reason.message : t("Žiadosť sa nepodarilo uložiť.")); } finally { setSaving(false); } }
  return <article className="privacy-request-card"><div><strong>{dataRequestTypeLabel(item.request_type)}</strong><small>{item.requester_email || "—"} · {item.participant_code || t("Bez Participant ID")} · {formatDateTime(item.created_at)}</small>{item.details && <p>{item.details}</p>}</div><form onSubmit={save}><label>{t("Stav")}<select value={status} onChange={(event) => setStatus(event.target.value as DataRequestStatus)}><option value="received">{t("Prijatá")}</option><option value="in_review">{t("Posudzuje sa")}</option><option value="completed">{t("Vybavená")}</option><option value="rejected">{t("Zamietnutá")}</option></select></label><label>{t("Odpoveď pre študenta")}<textarea rows={2} maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} /></label>{error && <p className="error">{error}</p>}<button className="primary compact" disabled={saving}>{saving ? t("Ukladám…") : t("Uložiť stav")}</button></form></article>;
}

type ProfileBinaryKey = "gamepad_used" | "pc_joystick_used" | "rc_transmitter_used" | "uav_flown" | "uav_los" | "uav_fpv" | "uav_stabilized_mode" | "uav_manual_mode";
type StudentOnboardingAnswers = { birth_year: number | ""; biological_sex: "male" | "female" | "unspecified"; dominant_hand: string; } & Record<ProfileBinaryKey, boolean | null>;

function ProfileExperienceQuestion({ name, label, value, onChange }: {
  name: ProfileBinaryKey;
  label: string;
  value: boolean | null;
  onChange: (name: ProfileBinaryKey, value: boolean) => void;
}) {
  return <fieldset className="profile-experience-question">
    <legend>{t(label)}</legend>
    <div className="profile-experience-options">
      {[true, false].map((answer) => <label key={String(answer)} className={value === answer ? "selected" : ""}>
        <input type="radio" name={name} value={String(answer)} checked={value === answer} onChange={() => onChange(name, answer)} />
        <span>{answer ? t("Áno") : t("Nie")}</span>
      </label>)}
    </div>
  </fieldset>;
}

function StudentProfileOnboarding({ profile, csrfToken, onSaved, onSkip }: {
  profile: StudentProfile;
  csrfToken: string;
  onSaved: (updated: StudentProfile) => void;
  onSkip: () => void;
}) {
  const years = Array.from({ length: new Date().getFullYear() - 1899 }, (_, index) => new Date().getFullYear() - index);
  const [answers, setAnswers] = useState<StudentOnboardingAnswers>(() => ({
    birth_year: profile.birth_year ?? "",
    biological_sex: profile.biological_sex ?? "unspecified",
    dominant_hand: profile.dominant_hand ?? "",
    gamepad_used: profile.gamepad_used,
    pc_joystick_used: profile.pc_joystick_used,
    rc_transmitter_used: profile.rc_transmitter_used,
    uav_flown: profile.uav_flown,
    uav_los: profile.uav_los,
    uav_fpv: profile.uav_fpv,
    uav_stabilized_mode: profile.uav_stabilized_mode,
    uav_manual_mode: profile.uav_manual_mode,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateBoolean(name: ProfileBinaryKey, value: boolean) {
    setAnswers((current) => {
      const next = { ...current, [name]: value };
      if (name === "uav_flown" && !value) {
        next.uav_los = null;
        next.uav_fpv = null;
        next.uav_stabilized_mode = null;
        next.uav_manual_mode = null;
      }
      return next;
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const updated = await request<StudentProfile>("/api/student/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({
          birth_year: answers.birth_year === "" ? null : answers.birth_year,
          biological_sex: answers.biological_sex,
          dominant_hand: answers.dominant_hand || null,
          gamepad_used: answers.gamepad_used,
          pc_joystick_used: answers.pc_joystick_used,
          rc_transmitter_used: answers.rc_transmitter_used,
          uav_flown: answers.uav_flown,
          uav_los: answers.uav_los,
          uav_fpv: answers.uav_fpv,
          uav_stabilized_mode: answers.uav_stabilized_mode,
          uav_manual_mode: answers.uav_manual_mode,
        }),
      });
      onSaved(updated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Profil sa nepodarilo uložiť."));
    } finally {
      setSaving(false);
    }
  }

  return <form className="profile-onboarding" onSubmit={save}>
    <div className="profile-onboarding-intro">
      <div className="eyebrow">{t("KRÁTKY PROFIL · NEPOVINNÉ")}</div>
      <h3>{t("Ako sa cítiš za ovládačom?")}</h3>
      <p className="muted">{t("Odpovede môžeš kedykoľvek zmeniť. Ak niektorú otázku nechceš zodpovedať, jednoducho ju preskoč.")}</p>
    </div>
    <div className="profile-onboarding-demographics">
      <label>{t("Biologické pohlavie")}<select value={answers.biological_sex} onChange={(event) => setAnswers((current) => ({ ...current, biological_sex: event.target.value as StudentOnboardingAnswers["biological_sex"] }))}><option value="male">{t("Muž")}</option><option value="female">{t("Žena")}</option><option value="unspecified">{t("Neuvedené")}</option></select></label>
      <label>{t("Rok narodenia")}<select value={answers.birth_year} onChange={(event) => setAnswers((current) => ({ ...current, birth_year: event.target.value ? Number(event.target.value) : "" }))}><option value="">{t("Nevyplnené")}</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      <label>{t("Dominantná ruka")}<select value={answers.dominant_hand} onChange={(event) => setAnswers((current) => ({ ...current, dominant_hand: event.target.value }))}><option value="">{t("Nevyplnené")}</option><option value="right">{t("Pravá")}</option><option value="left">{t("Ľavá")}</option><option value="both">{t("Obe ruky")}</option><option value="prefer_not_to_say">{t("Nechcem uviesť")}</option></select></label>
    </div>
    <section className="profile-onboarding-section">
      <h4>{t("Skúsenosti s ovládačmi")}</h4>
      <div className="profile-onboarding-questions">
        <ProfileExperienceQuestion name="gamepad_used" label="Používal(a) si už herný gamepad?" value={answers.gamepad_used} onChange={updateBoolean} />
        <ProfileExperienceQuestion name="pc_joystick_used" label="Používal(a) si už PC joystick?" value={answers.pc_joystick_used} onChange={updateBoolean} />
        <ProfileExperienceQuestion name="rc_transmitter_used" label="Používal(a) si už RC vysielač?" value={answers.rc_transmitter_used} onChange={updateBoolean} />
      </div>
    </section>
    <section className="profile-onboarding-section">
      <h4>{t("Skúsenosti s UAV")}</h4>
      <div className="profile-onboarding-questions">
        <ProfileExperienceQuestion name="uav_flown" label="Lietal(a) si už niekedy s UAV?" value={answers.uav_flown} onChange={updateBoolean} />
      </div>
      {answers.uav_flown === true && <div className="profile-uav-followups">
        <p className="muted">{t("Akým spôsobom alebo v akom režime?")}</p>
        <div className="profile-onboarding-questions">
          <ProfileExperienceQuestion name="uav_los" label="Priamy vizuálny dohľad (LOS)" value={answers.uav_los} onChange={updateBoolean} />
          <ProfileExperienceQuestion name="uav_fpv" label="Lietanie cez FPV" value={answers.uav_fpv} onChange={updateBoolean} />
          <ProfileExperienceQuestion name="uav_stabilized_mode" label="Stabilizovaný režim (GPS/Angle)" value={answers.uav_stabilized_mode} onChange={updateBoolean} />
          <ProfileExperienceQuestion name="uav_manual_mode" label="Manuálny alebo acro/rate režim" value={answers.uav_manual_mode} onChange={updateBoolean} />
        </div>
      </div>}
    </section>
    {error && <p className="error">{error}</p>}
    <div className="profile-onboarding-actions"><button type="button" className="quiet" onClick={onSkip}>{t("Preskočiť na neskôr")}</button><button type="submit" className="primary" disabled={saving}>{saving ? t("Ukladám…") : t("Uložiť profil")}</button></div>
  </form>;
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
  const years = Array.from({ length: new Date().getFullYear() - 1899 }, (_, index) => new Date().getFullYear() - index);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const optionalBoolean = (name: string) => {
      const value = form.get(name);
      return value === "true" ? true : value === "false" ? false : null;
    };
    const profileData = {
      biological_sex: form.get("biological_sex") || "unspecified",
      birth_year: form.get("birth_year") ? Number(form.get("birth_year")) : null,
      dominant_hand: form.get("dominant_hand") || null,
      gamepad_used: optionalBoolean("gamepad_used"),
      pc_joystick_used: optionalBoolean("pc_joystick_used"),
      rc_transmitter_used: optionalBoolean("rc_transmitter_used"),
      uav_flown: optionalBoolean("uav_flown"),
      uav_los: optionalBoolean("uav_los"),
      uav_fpv: optionalBoolean("uav_fpv"),
      uav_stabilized_mode: optionalBoolean("uav_stabilized_mode"),
      uav_manual_mode: optionalBoolean("uav_manual_mode"),
    };
    try {
      if (studentProfile) {
        const updated = await request<StudentProfile>("/api/student/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
          body: JSON.stringify({ ...profileData, email: form.get("email"), nickname: form.get("nickname") || null }),
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

  const booleanSelect = (name: string, label: string, value?: boolean | null) => <label key={name}>{t(label)}<select name={name} defaultValue={value == null ? "" : String(value)}><option value="">{t("Nevyplnené")}</option><option value="true">{t("Áno")}</option><option value="false">{t("Nie")}</option></select></label>;

  return <form className="participant-profile-editor panel" onSubmit={save}>
    <div><div className="eyebrow">{studentProfile ? t("MOJE ÚDAJE") : t("PROFIL ÚČASTNÍKA")}</div><h3>{studentProfile ? t("Moje údaje") : t("Profil účastníka")}</h3></div>
    {studentProfile && <label className="profile-email-field">{t("E-mail")}<input name="email" type="email" defaultValue={studentProfile.email ?? studentProfile.username} maxLength={255} required /></label>}
    {studentProfile && <label>{t("Prezývka (nepovinné)")}<input name="nickname" type="text" defaultValue={studentProfile.nickname ?? ""} maxLength={40} autoComplete="nickname" /></label>}
    {participant && <label className="checkbox-line"><input name="is_active" type="checkbox" defaultChecked={participant.is_active} /> {t("Aktívny účastník")}</label>}
    <div className="form-grid">
      <label>{t("Biologické pohlavie")}<select name="biological_sex" defaultValue={values.biological_sex ?? "unspecified"}><option value="male">{t("Muž")}</option><option value="female">{t("Žena")}</option><option value="unspecified">{t("Neuvedené")}</option></select></label>
      <label>{t("Rok narodenia")}<select name="birth_year" defaultValue={values.birth_year ?? ""}><option value="">{t("Nevyplnené")}</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      <label>{t("Dominantná ruka")}<select name="dominant_hand" defaultValue={values.dominant_hand ?? ""}><option value="">{t("Nevyplnené")}</option><option value="right">{t("Pravá")}</option><option value="left">{t("Ľavá")}</option><option value="both">{t("Obe ruky")}</option><option value="prefer_not_to_say">{t("Nechcem uviesť")}</option></select></label>
    </div>
    <div className="registration-questions profile-editor-questions">
      {booleanSelect("gamepad_used", "Herný gamepad", values.gamepad_used)}
      {booleanSelect("pc_joystick_used", "PC joystick", values.pc_joystick_used)}
      {booleanSelect("rc_transmitter_used", "RC vysielač", values.rc_transmitter_used)}
      {booleanSelect("uav_flown", "Lietal(a) s UAV", values.uav_flown)}
      {booleanSelect("uav_los", "Priamy vizuálny dohľad (LOS)", values.uav_los)}
      {booleanSelect("uav_fpv", "FPV", values.uav_fpv)}
      {booleanSelect("uav_stabilized_mode", "Stabilizovaný režim", values.uav_stabilized_mode)}
      {booleanSelect("uav_manual_mode", "Manuálny / acro režim", values.uav_manual_mode)}
    </div>
    <div className="profile-editor-actions"><span className="muted">{message}</span><button className="primary compact" disabled={saving}>{saving ? t("Ukladám…") : t("Uložiť údaje")}</button></div>
  </form>;
}

function biologicalSexLabel(value?: string | null) {
  const labels: Record<string, string> = { male: t("Muž"), female: t("Žena"), unspecified: t("Neuvedené") };
  return value ? labels[value] ?? t("Neuvedené") : t("Neuvedené");
}
function profileLabel(value?: string | null) {
  const labels: Record<string, string> = { right: t("Pravá"), left: t("Ľavá"), both: t("Obe ruky"), prefer_not_to_say: t("Nechcem uviesť") };
  return value ? labels[value] ?? value : t("Neuvedené");
}
function yesNoLabel(value?: boolean | null) { return value == null ? t("Neuvedené") : value ? t("Áno") : t("Nie"); }
function formatMetricMap(values: Record<string, number>) { return Object.entries(values).map(([key, value]) => `${key}: ${value.toFixed(2)}`).join(" · ") || t("bez dostupných metrík"); }
