import { ReactNode, useEffect, useState } from "react";
import { t, serverMessage } from "./i18n";
import { useLanguage } from "./LanguageContext";

type Lang = "sk" | "en";
type LocalizedText = Record<Lang, string>;
type RetentionKey = "account" | "profile" | "measurements" | "consents" | "backups";
type PolicyContent = {
  controller_name: string; controller_address: string; controller_email: string | null; dpo_contact: string;
  research: LocalizedText; gdpr: LocalizedText; purposes: LocalizedText; recipients: LocalizedText;
  retention: Record<RetentionKey, LocalizedText>;
};
type Policy = { revision: number; content: PolicyContent; documents: Record<Lang, { research: { version: string; text: string }; gdpr: { version: string; text: string; configured: boolean } }>; history: { revision: number; published_at: string; published_by: string }[] };
type Backup = { status: "ok" | "stale" | "failed" | "invalid" | "unconfigured"; report: null | { generated_at: string; last_attempt_at: string; last_attempt_status: string; encrypted: boolean; offsite_copy: boolean; last_restore_test_at: string | null; backups: { name: string; created_at: string; size_bytes: number; database: boolean; files: boolean; checksums_verified: boolean }[] } };
type Overview = { policy_revision: number; open_requests: number; oldest_request_at: string | null; withdrawn_participants: number; active_sessions: number; roles: Record<string, number>; checks: { secure_cookie: boolean; allowed_hosts_restricted: boolean; session_lifetime_hours: number; public_min_group_size: number; researcher_registration_enabled: boolean; privacy_configured: boolean }; backup: Backup };
type AuditEvent = { id: string; action: string; category: string; actor_id: string | null; actor_role: string; target_id: string | null; details: Record<string, unknown>; created_at: string };
export type PrivacyInformation = { revision: number; controller_name: string; controller_address: string; controller_email: string | null; dpo_contact: string; purposes: string; recipients: string; retention: { key: string; label: string; period: string }[] };

const retentionLabels: Record<RetentionKey, string> = { account: "Účet a identita", profile: "Profil účastníka", measurements: "Merania a raw súbory", consents: "Súhlasy a žiadosti", backups: "Záložné kópie" };
const eventLabels: Record<string, string> = { "policy.published": "Publikovaná politika", "data.exported": "Pripravený export údajov", "request.created": "Prijatá žiadosť", "request.updated": "Aktualizovaná žiadosť", "account.role_changed": "Zmenená rola", "account.password_reset": "Resetované heslo", "account.contact_updated": "Upravený kontakt", "account.anonymized": "Anonymizovaný účet", "participant.purged": "Vymazaný účastník a merania", "account.purged": "Úplne vymazaný účet", "participant.updated": "Upravený profil účastníka", "client.disconnect_requested": "Vyžiadané odpojenie klienta", "client.disconnected": "Odpojený webový klient", "consent.withdrawn": "Odvolaný súhlas" };
const categoryLabels: Record<string, string> = { policy: "Politika", request: "Žiadosti", export: "Exporty", account: "Účty", erasure: "Výmazy", session: "Relácie", consent: "Súhlasy" };
const backupLabels = { ok: "Záloha aktuálna", stale: "Záloha chýba alebo je stará", failed: "Zálohovanie zlyhalo", invalid: "Neplatný report záloh", unconfigured: "Zálohy zatiaľ bez reportu" };

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.detail === "string" ? serverMessage(body.detail, response.status) : t("Požiadavku sa nepodarilo vykonať."));
  }
  return response.json() as Promise<T>;
}

function date(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getUTCFullYear()}/${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}/${String(d.getUTCDate()).padStart(2, "0")} ${d.toISOString().slice(11, 16)} UTC`;
}
function bytes(value: number): string { return value < 1_000_000 ? `${(value / 1000).toFixed(1)} KB` : `${(value / 1_000_000).toFixed(1)} MB`; }
function Check({ label, okay, detail }: { label: string; okay?: boolean; detail: string }) {
  return <div className={`security-check ${okay === undefined ? "is-unknown" : okay ? "is-good" : "is-warning"}`}><span className="security-indicator" aria-hidden="true" /><div><strong>{t(label)}</strong><small>{detail}</small></div><span className="security-check-state">{okay === undefined ? t("Overenie na serveri") : okay ? t("Nastavené") : t("Vyžaduje riešenie")}</span></div>;
}

export function SecurityDashboard({ csrfToken, isSuperadmin, requests, onNavigate }: { csrfToken: string; isSuperadmin: boolean; requests: ReactNode; onNavigate: (section: "participants" | "clients") => void }) {
  const [tab, setTab] = useState<"overview" | "requests" | "policy" | "backups" | "audit">("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true); setError("");
    try { setOverview(await api<Overview>("/api/admin/security/overview")); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("Údaje sa nepodarilo načítať.")); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (tab !== "overview") return;
    const timer = window.setInterval(() => { void refresh(); }, 30000);
    return () => window.clearInterval(timer);
  }, [tab]);
  return <section className="security-dashboard">
    <div className="security-dashboard-header"><div><div className="eyebrow">{t("BEZPEČNOSŤ A SPRÁVA ÚDAJOV")}</div><h2>{t("Bezpečnosť a ochrana údajov")}</h2></div><button type="button" className="quiet compact" disabled={loading} onClick={() => void refresh()}>{t("Obnoviť")}</button></div>
    {error && <p className="error" role="alert">{error}</p>}
    <nav className="security-tabs" aria-label={t("Bezpečnostný dashboard")}>
      {([["overview", "Prehľad"], ["requests", "Žiadosti"], ["policy", "Súhlasy a retencia"], ["backups", "Zálohy"], ["audit", "Audit"]] as const).map(([id, label]) => <button type="button" key={id} className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => { setTab(id); void refresh(); }}>{t(label)}{id === "requests" && !!overview?.open_requests && <span>{overview.open_requests}</span>}</button>)}
    </nav>
    <div className={`security-dashboard-body security-tab-${tab}`}>
      {tab === "overview" && (overview ? <>
        <div className="security-summary-grid">
          <button type="button" className={overview.open_requests ? "is-warning" : "is-good"} onClick={() => setTab("requests")}><span>{t("Žiadosti na vybavenie")}</span><strong>{overview.open_requests}</strong><small>{t("Najstaršia otvorená")}: {date(overview.oldest_request_at)}</small></button>
          <button type="button" className={overview.withdrawn_participants ? "is-warning" : "is-good"} onClick={() => onNavigate("participants")}><span>{t("Odvolané súhlasy")}</span><strong>{overview.withdrawn_participants}</strong><small>{t("Účastníci vyžadujúci posúdenie")}</small></button>
          <button type="button" onClick={() => onNavigate("clients")}><span>{t("Platné webové relácie")}</span><strong>{overview.active_sessions}</strong><small>{t("Otvoriť monitor a odpojenie klientov")}</small></button>
          <button type="button" className={overview.backup.status === "ok" ? "is-good" : "is-warning"} onClick={() => setTab("backups")}><span>{t("Zálohovanie")}</span><strong className="security-summary-text">{t(backupLabels[overview.backup.status])}</strong><small>{date(overview.backup.report?.last_attempt_at || null)}</small></button>
        </div>
        <div className="security-overview-grid">
          <section className="security-panel"><h3>{t("Aplikačné zabezpečenie")}</h3>
            <Check label="Zabezpečená session cookie" okay={overview.checks.secure_cookie} detail={`HttpOnly · SameSite=Lax · Secure: ${overview.checks.secure_cookie ? t("Áno") : t("Nie")}`} />
            <Check label="Povolené hosty" okay={overview.checks.allowed_hosts_restricted} detail={t("Obmedzenie domén pri prístupe k backendu")}/>
            <Check label="Súhlasy a retenčné pravidlá" okay={overview.checks.privacy_configured} detail={`${t("Publikovaná revízia")}: ${overview.policy_revision || t("Východiskové nastavenie")}`}/>
            <Check label="Dĺžka webovej relácie" okay={overview.checks.session_lifetime_hours > 0} detail={`${overview.checks.session_lifetime_hours} h`}/>
            <Check label="Minimum pre skupinové výstupy" okay={overview.checks.public_min_group_size > 1} detail={`${overview.checks.public_min_group_size} ${t("účastníkov")}`}/>
            <Check label="HTTPS, firewall a rate limiting" detail={t("Konfigurácia infraštruktúry sa overuje na serveri; aplikácia jej stav nemeria.")}/>
          </section>
          <section className="security-panel"><h3>{t("Prístupy a úlohy správcu")}</h3><div className="security-role-counts">{Object.entries(overview.roles).map(([role, count]) => <div key={role}><span>{role}</span><strong>{count}</strong></div>)}</div><p className="muted">{t("Aktívne účty podľa efektívnej roly vrátane bootstrap superadminov.")}</p><div className="security-action-list">
            <button type="button" className="quiet" onClick={() => onNavigate("participants")}>{t("Účty, roly, heslá a odvolané súhlasy")} →</button>
            <button type="button" className="quiet" onClick={() => onNavigate("clients")}>{t("Pripojení klienti a ukončenie relácií")} →</button>
            <button type="button" className="quiet" onClick={() => setTab("policy")}>{t("Texty súhlasov a pravidlá uchovávania")} →</button>
            <button type="button" className="quiet" onClick={() => setTab("audit")}>{t("História citlivých úkonov")} →</button>
          </div><p className="muted">{t("Registrácia výskumníkov")}: {overview.checks.researcher_registration_enabled ? t("Povolená s pozývacím kľúčom") : t("Vypnutá")}</p></section>
        </div>
      </> : <p className="muted">{loading ? t("Načítavam…") : t("Prehľad nie je dostupný.")}</p>)}
      {tab === "requests" && requests}
      {tab === "policy" && <PolicyEditor csrfToken={csrfToken} isSuperadmin={isSuperadmin} onPublished={() => void refresh()} />}
      {tab === "backups" && overview && <BackupPanel backup={overview.backup} />}
      {tab === "audit" && <AuditPanel />}
    </div>
  </section>;
}

function PolicyEditor({ csrfToken, isSuperadmin, onPublished }: { csrfToken: string; isSuperadmin: boolean; onPublished: () => void }) {
  const { language } = useLanguage();
  const [lang, setLang] = useState<Lang>(language);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [content, setContent] = useState<PolicyContent | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  useEffect(() => { api<Policy>("/api/admin/security/policy").then((data) => { setPolicy(data); setContent(data.content); }).catch((reason) => setMessage(reason instanceof Error ? reason.message : t("Údaje sa nepodarilo načítať."))); }, []);
  function localized(key: "research" | "gdpr" | "purposes" | "recipients", text: string) { setContent((current) => current ? { ...current, [key]: { ...current[key], [lang]: text } } : current); }
  async function publish() {
    if (!policy || !content || !isSuperadmin) return;
    if (!window.confirm(t("Publikovať novú verziu politiky? Nové znenie sa použije pri ďalších súhlasoch; už udelené súhlasy sa nezmenia."))) return;
    setBusy(true); setMessage("");
    try {
      const data = await api<Policy>("/api/admin/security/policy", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ expected_revision: policy.revision, content }) });
      setPolicy(data); setContent(data.content); setMessage(t("Nová politika bola publikovaná.")); onPublished();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : t("Publikovanie sa nepodarilo.")); }
    finally { setBusy(false); }
  }
  return <div className="security-policy-editor">
    {message && <p className="notice" role="status">{message}</p>}
    {!policy || !content ? <p className="muted">{t("Načítavam…")}</p> : <>
      <div className="security-section-heading"><div><h3>{t("Politika spracúvania údajov")}</h3><p className="muted">{t("Publikovaná revízia")}: {policy.revision || t("Východiskové nastavenie")}</p></div><div className="actions"><button type="button" className="quiet compact" onClick={() => setPreview(true)}>{t("Aktuálne znenie")}</button><div className="mode-switch">{(["sk", "en"] as const).map((value) => <button type="button" className={lang === value ? "active" : ""} aria-pressed={lang === value} key={value} onClick={() => setLang(value)}>{value.toUpperCase()}</button>)}</div></div></div>
      {!isSuperadmin && <p className="notice">{t("Znenie môže publikovať iba superadmin. Admin má prístup na čítanie.")}</p>}
      <form onSubmit={(event) => { event.preventDefault(); void publish(); }}>
        <fieldset disabled={!isSuperadmin || busy}>
          <section className="security-panel"><h3>{t("Prevádzkovateľ a kontakty")}</h3><div className="security-form-grid">
            <label>{t("Názov prevádzkovateľa")}<input maxLength={300} value={content.controller_name} onChange={(event) => setContent({ ...content, controller_name: event.target.value })}/></label>
            <label>{t("Kontaktný e-mail")}<input type="email" maxLength={255} value={content.controller_email || ""} onChange={(event) => setContent({ ...content, controller_email: event.target.value || null })}/></label>
            <label>{t("Adresa prevádzkovateľa")}<input maxLength={500} value={content.controller_address} onChange={(event) => setContent({ ...content, controller_address: event.target.value })}/></label>
            <label>{t("Kontakt na DPO / zodpovednú osobu")}<input maxLength={500} value={content.dpo_contact} onChange={(event) => setContent({ ...content, dpo_contact: event.target.value })}/></label>
          </div></section>
          <section className="security-panel"><h3>{t("Texty súhlasov")} · {lang.toUpperCase()}</h3><p className="muted">{t("Prevádzkovateľ, kontakty a lehoty sa k GDPR textu pripájajú z polí nižšie. Každá publikácia vytvorí novú verziu.")}</p><div className="security-form-grid">
            <label>{t("Výskumný súhlas")}<textarea rows={6} required maxLength={20000} value={content.research[lang]} onChange={(event) => localized("research", event.target.value)}/></label>
            <label>{t("GDPR súhlas a informácie")}<textarea rows={6} required maxLength={20000} value={content.gdpr[lang]} onChange={(event) => localized("gdpr", event.target.value)}/></label>
            <label>{t("Účely a právne základy")}<textarea rows={3} maxLength={20000} value={content.purposes[lang]} onChange={(event) => localized("purposes", event.target.value)}/></label>
            <label>{t("Príjemcovia a sprostredkovatelia")}<textarea rows={3} maxLength={20000} value={content.recipients[lang]} onChange={(event) => localized("recipients", event.target.value)}/></label>
          </div></section>
          <section className="security-panel"><h3>{t("Pravidlá uchovávania")} · {lang.toUpperCase()}</h3><p className="muted">{t("Uveď dobu aj udalosť, od ktorej plynie. Tieto pravidlá sa zverejnia účastníkom; nevykonávajú automatický výmaz.")}</p><div className="security-retention-fields">{(Object.keys(retentionLabels) as RetentionKey[]).map((key) => <label key={key}>{t(retentionLabels[key])}<textarea rows={2} maxLength={20000} value={content.retention[key][lang]} onChange={(event) => setContent({ ...content, retention: { ...content.retention, [key]: { ...content.retention[key], [lang]: event.target.value } } })}/></label>)}</div></section>
        </fieldset>
        <div className="security-policy-footer"><p className="muted">{t("Staré súhlasy uchovávajú pôvodný text a verziu. Zmena politiky ich automaticky nenahrádza.")}</p>{isSuperadmin && <button type="submit" className="primary compact" disabled={busy}>{busy ? t("Ukladám…") : t("Publikovať novú verziu")}</button>}</div>
      </form>
      <details className="security-policy-history"><summary>{t("História publikácií")} · {policy.history.length}</summary>{policy.history.length ? policy.history.map((item) => <p key={item.revision}>r{item.revision} · {date(item.published_at)}</p>) : <p className="muted">{t("Používajú sa východiskové texty zo servera.")}</p>}</details>
      {preview && <div className="backdrop" onMouseDown={() => setPreview(false)}><section className="login security-policy-preview" role="dialog" aria-modal="true" aria-labelledby="security-policy-preview-title" onMouseDown={(event) => event.stopPropagation()}><div className="detail-header"><h2 id="security-policy-preview-title">{t("Aktuálne znenie")} · {lang.toUpperCase()}</h2><button type="button" className="quiet compact" onClick={() => setPreview(false)}>{t("Zavrieť")}</button></div>{(["research", "gdpr"] as const).map((key) => <section key={key}><h3>{policy.documents[lang][key].version}</h3><p>{policy.documents[lang][key].text}</p></section>)}</section></div>}
    </>}
  </div>;
}

function BackupPanel({ backup }: { backup: Backup }) {
  const report = backup.report;
  return <section className="security-panel security-backup-panel"><div className="security-section-heading"><div><h3>{t("Zálohy databázy a súborov")}</h3><p className="muted">{t("Prehľad podľa reportu serverového skriptu. Zálohy aplikácia nespúšťa ani neobnovuje.")}</p></div><span className={`security-state ${backup.status === "ok" ? "is-good" : "is-warning"}`}>{t(backupLabels[backup.status])}</span></div>
    <div className="security-checks"><Check label="Posledný pokus" okay={report ? report.last_attempt_status === "success" : undefined} detail={date(report?.last_attempt_at || null)}/><Check label="Šifrovanie archívov" okay={report?.encrypted} detail={report?.encrypted ? t("Hlásené serverovým reportom") : t("Skript vytvára lokálne nešifrované archívy s obmedzeným prístupom.")}/><Check label="Kópia mimo servera" okay={report?.offsite_copy} detail={t("Lokálna záloha sama osebe nepokrýva stratu servera.")}/><Check label="Test obnovy" okay={report?.last_restore_test_at ? true : undefined} detail={report?.last_restore_test_at ? date(report.last_restore_test_at) : t("Úspešné vytvorenie zálohy nepotvrdzuje úspešnú obnovu.")}/></div>
    <details className="security-backup-help"><summary>{t("Ako vytvoriť zálohu na serveri")}</summary><p>{t("Spusti počas servisného okna. Skript dočasne zastaví backend, zazálohuje databázu a súbory, overí archívy a backend znovu spustí.")}</p><code>python3 ops/backup.py --backup-dir /srv/thrust-backups --compose-file docker-compose.yml --compose-file docker-compose.https.yml</code><p className="muted">{t("Plánovanie, kopírovanie mimo servera, šifrovanie a odstraňovanie starých záloh nastavuje správca na serveri.")}</p></details>
    <div className="security-backup-list"><div className="security-backup-row security-list-head"><span>{t("Vytvorená")}</span><span>{t("Obsah")}</span><span>{t("Veľkosť")}</span><span>{t("Integrita")}</span></div>{report?.backups.length ? report.backups.map((item) => <div className="security-backup-row" key={item.name}><time>{date(item.created_at)}</time><span>{item.database ? "DB" : "—"} + {item.files ? t("Súbory") : "—"}</span><span>{bytes(item.size_bytes)}</span><span className={item.checksums_verified ? "security-good-text" : "security-warning-text"}>{item.checksums_verified ? "SHA-256 ✓" : t("Neoverené")}</span></div>) : <p className="muted">{t("Nie je hlásená žiadna úplná záloha.")}</p>}</div>
  </section>;
}

function AuditPanel() {
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ total: number; items: AuditEvent[] }>({ total: 0, items: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ offset: String(offset), limit: "40" });
    if (category) query.set("category", category);
    if (from) query.set("since", `${from}T00:00:00Z`);
    if (to) query.set("until", new Date(Date.parse(`${to}T00:00:00Z`) + 86400000).toISOString());
    setLoading(true); setError("");
    api<{ total: number; items: AuditEvent[] }>(`/api/admin/security/events?${query}`, { signal: controller.signal }).then(setData).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : t("Údaje sa nepodarilo načítať.")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [category, from, to, offset]);
  return <section className="security-panel security-audit-panel"><h3>{t("Audit citlivých úkonov")}</h3><p className="muted">{t("Záznamy vznikajú od nasadenia dashboardu. Obsahujú typ úkonu a technické ID; bez hesiel, tokenov, kontaktných údajov a obsahu žiadostí.")}</p>
    <div className="security-audit-filters"><label>{t("Typ udalosti")}<select value={category} onChange={(event) => { setCategory(event.target.value); setOffset(0); }}><option value="">{t("Všetky typy")}</option>{Object.entries(categoryLabels).map(([key, label]) => <option value={key} key={key}>{t(label)}</option>)}</select></label><label>{t("Od")}<input type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setOffset(0); }}/></label><label>{t("Do")}<input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setOffset(0); }}/></label><button type="button" className="quiet compact" onClick={() => { setCategory(""); setFrom(""); setTo(""); setOffset(0); }}>{t("Zrušiť filtre")}</button></div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="security-audit-list" aria-busy={loading}>{data.items.map((event) => <article className={`security-audit-row security-event-${event.category}`} key={event.id}><time>{date(event.created_at)}</time><div><strong>{t(eventLabels[event.action] || event.action)}</strong><small>{Object.entries(event.details).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`).join(" · ") || t(categoryLabels[event.category] || event.category)}</small></div><span title={event.actor_id || undefined}>{event.actor_role}<small>{event.actor_id?.slice(0, 8) || "—"}</small></span><span title={event.target_id || undefined}>{event.target_id?.slice(0, 8) || "—"}</span></article>)}{!data.items.length && !loading && !error && <p className="muted">{t("Žiadne udalosti pre zvolený filter.")}</p>}</div>
    <div className="security-audit-pagination"><span>{data.total ? `${offset + 1}–${Math.min(offset + 40, data.total)} / ${data.total}` : "0"}</span><button type="button" className="quiet compact" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 40))}>{t("Predchádzajúce")}</button><button type="button" className="quiet compact" disabled={loading || offset + 40 >= data.total} onClick={() => setOffset(offset + 40)}>{t("Ďalšie")}</button></div>
  </section>;
}
