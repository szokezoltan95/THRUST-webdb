import { useEffect, useState, type ChangeEvent } from "react";
import type { Language } from "./i18n";
import { WelcomeContent, defaultWelcomeBlocks, type WelcomeBlock, type WelcomeMetrics } from "./WelcomeContent";

type EditorState = { draft: WelcomeBlock[]; published: WelcomeBlock[] | null; revision: number; published_at: string | null };
type BlockType = WelcomeBlock["type"];

const labels: Record<Language, Record<BlockType, string>> = {
  sk: { heading: "Nadpis", text: "Text", banner: "Banner", image: "Obrázok", metrics: "Verejné metriky", table: "Tabuľka", chart: "Graf", research: "Výskumný výsledok" },
  en: { heading: "Heading", text: "Text", banner: "Banner", image: "Image", metrics: "Public metrics", table: "Table", chart: "Chart", research: "Research result" },
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...options });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    if (Array.isArray(data?.detail) && data.detail.length) {
      const first = data.detail[0] as { loc?: unknown[]; msg?: string };
      throw new Error(`${first.loc?.slice(2).join(" / ") || "Content"}: ${first.msg || "Invalid value"}`);
    }
    throw new Error(typeof data?.detail === "string" ? data.detail : `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function newBlock(type: BlockType, language: Language): WelcomeBlock {
  const id = crypto.randomUUID().replaceAll("-", "");
  const sk = language === "sk";
  switch (type) {
    case "heading": return { id, type, level: 2, text: sk ? "Nový nadpis" : "New heading" };
    case "text": return { id, type, text: sk ? "Nový text" : "New text" };
    case "banner": return { id, type, title: sk ? "Nový banner" : "New banner", body: "" };
    case "image": return { id, type, image_id: "", alt: "", caption: "" };
    case "metrics": return { id, type };
    case "table": return { id, type, title: sk ? "Nová tabuľka" : "New table", columns: [sk ? "Stĺpec 1" : "Column 1", sk ? "Stĺpec 2" : "Column 2"], rows: [["", ""]] };
    case "chart": return { id, type, title: sk ? "Nový graf" : "New chart", unit: "", style: "line", points: [{ label: "A", value: 0 }, { label: "B", value: 1 }] };
    case "research": return { id, type, title: sk ? "Výsledok" : "Result", value: "0", unit: "", source: "" };
  }
}

export function WelcomeEditor({ csrfToken, initialLanguage, metrics }: { csrfToken: string; initialLanguage: Language; metrics: WelcomeMetrics }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [blocks, setBlocks] = useState<WelcomeBlock[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const selectedBlock = blocks.find((block) => block.id === selected);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMessage("");
    api<EditorState>(`/api/admin/welcome?lang=${language}`).then((page) => {
      if (!alive) return;
      const next = page.revision === 0 && !page.published ? defaultWelcomeBlocks(language) : page.draft;
      setBlocks(next);
      setSelected(next[0]?.id ?? null);
      setRevision(page.revision);
      setPublishedAt(page.published_at);
      setDirty(page.revision === 0 && !page.published);
    }).catch((reason) => { if (alive) setMessage(String(reason)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [language]);

  function update(id: string, patch: Partial<WelcomeBlock>) {
    setBlocks((current) => current.map((block) => block.id === id ? { ...block, ...patch } as WelcomeBlock : block));
    setDirty(true);
  }

  function changeLanguage(next: Language) {
    if (next === language) return;
    if (dirty && !window.confirm(language === "sk" ? "Neuložené zmeny sa stratia. Pokračovať?" : "Unsaved changes will be lost. Continue?")) return;
    setLanguage(next);
  }

  function add(type: BlockType) {
    if (blocks.length >= 30) return;
    const block = newBlock(type, language);
    setBlocks((current) => [...current, block]);
    setSelected(block.id);
    setDirty(true);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    setBlocks((current) => {
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
    setDirty(true);
  }

  function remove(id: string) {
    const next = blocks.filter((block) => block.id !== id);
    setBlocks(next);
    setSelected(next[0]?.id ?? null);
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ revision: number }>(`/api/admin/welcome/draft?lang=${language}`, { method: "PUT", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ blocks, revision }) });
      setRevision(result.revision);
      setDirty(false);
      setMessage(language === "sk" ? "Návrh bol uložený." : "Draft saved.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function publish() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ revision: number; published_at: string }>(`/api/admin/welcome/publish?lang=${language}`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ revision }) });
      setRevision(result.revision);
      setPublishedAt(result.published_at);
      setMessage(language === "sk" ? "Stránka je publikovaná." : "Page published.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>, block: WelcomeBlock) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!(["image/png", "image/jpeg", "image/webp"].includes(file.type)) || file.size > 5_000_000) {
      setMessage(language === "sk" ? "Použi PNG, JPEG alebo WebP do 5 MB." : "Use PNG, JPEG or WebP up to 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Image read failed"));
        reader.readAsDataURL(file);
      });
      const result = await api<{ image_id: string }>("/api/admin/welcome/assets", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body: JSON.stringify({ image_base64: base64 }) });
      update(block.id, { image_id: result.image_id });
      setMessage(language === "sk" ? "Obrázok je nahraný. Ulož návrh." : "Image uploaded. Save the draft.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); event.target.value = ""; }
  }

  function fields(block: WelcomeBlock) {
    const field = (label: string, value: string, key: string, multiline = false) => <label className="welcome-field" key={key}>{label}{multiline ? <textarea rows={4} value={value} onChange={(event) => update(block.id, { [key]: event.target.value })} /> : <input value={value} onChange={(event) => update(block.id, { [key]: event.target.value })} />}</label>;
    switch (block.type) {
      case "heading": return <>{field(language === "sk" ? "Nadpis" : "Heading", block.text, "text")}<label className="welcome-field">{language === "sk" ? "Veľkosť" : "Size"}<select value={block.level} onChange={(event) => update(block.id, { level: Number(event.target.value) as 1 | 2 | 3 })}><option value={1}>H1</option><option value={2}>H2</option><option value={3}>H3</option></select></label></>;
      case "text": return field(language === "sk" ? "Text" : "Text", block.text, "text", true);
      case "banner": return <>{field(language === "sk" ? "Nadpis banneru" : "Banner title", block.title, "title")}{field(language === "sk" ? "Doplnkový text" : "Supporting text", block.body, "body", true)}<label className="welcome-field">{language === "sk" ? "Pozadie (voliteľné)" : "Background (optional)"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void upload(event, block)} /></label></>;
      case "image": return <><label className="welcome-field">{language === "sk" ? "Nahrať obrázok" : "Upload image"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void upload(event, block)} /></label>{field(language === "sk" ? "Alternatívny opis" : "Alternative description", block.alt, "alt")}{field(language === "sk" ? "Popis pod obrázkom" : "Caption", block.caption, "caption")}</>;
      case "metrics": return <p className="muted">{language === "sk" ? "Počty sa načítajú z verejných štatistík. Prah anonymity zostáva zachovaný." : "Counts come from public statistics. The anonymity threshold still applies."}</p>;
      case "research": return <>{field(language === "sk" ? "Názov výsledku" : "Result title", block.title, "title")}{field(language === "sk" ? "Hodnota" : "Value", block.value, "value")}{field(language === "sk" ? "Jednotka" : "Unit", block.unit, "unit")}{field(language === "sk" ? "Zdroj / poznámka" : "Source / note", block.source, "source")}</>;
      case "table": return <>{field(language === "sk" ? "Názov tabuľky" : "Table title", block.title, "title")}<div className="welcome-cell-grid">{block.columns.map((column, index) => <label key={index} className="welcome-field">{language === "sk" ? `Stĺpec ${index + 1}` : `Column ${index + 1}`}<input value={column} onChange={(event) => update(block.id, { columns: block.columns.map((item, i) => i === index ? event.target.value : item) })} /></label>)}{block.rows.map((row, rowIndex) => row.map((cell, columnIndex) => <label key={`${rowIndex}-${columnIndex}`} className="welcome-field">{rowIndex + 1} / {columnIndex + 1}<input value={cell} onChange={(event) => update(block.id, { rows: block.rows.map((item, i) => i === rowIndex ? item.map((value, j) => j === columnIndex ? event.target.value : value) : item) })} /></label>))}</div><div className="actions welcome-small-actions"><button type="button" className="quiet compact" disabled={block.rows.length >= 30} onClick={() => update(block.id, { rows: [...block.rows, block.columns.map(() => "")] })}>{language === "sk" ? "+ Riadok" : "+ Row"}</button><button type="button" className="quiet compact" disabled={block.rows.length === 0} onClick={() => update(block.id, { rows: block.rows.slice(0, -1) })}>−</button><button type="button" className="quiet compact" disabled={block.columns.length >= 6} onClick={() => update(block.id, { columns: [...block.columns, ""], rows: block.rows.map((row) => [...row, ""]) })}>{language === "sk" ? "+ Stĺpec" : "+ Column"}</button><button type="button" className="quiet compact" disabled={block.columns.length <= 2} onClick={() => update(block.id, { columns: block.columns.slice(0, -1), rows: block.rows.map((row) => row.slice(0, -1)) })}>−</button></div></>;
      case "chart": return <>{field(language === "sk" ? "Názov grafu" : "Chart title", block.title, "title")}{field(language === "sk" ? "Jednotka" : "Unit", block.unit, "unit")}<label className="welcome-field">{language === "sk" ? "Typ grafu" : "Chart type"}<select value={block.style} onChange={(event) => update(block.id, { style: event.target.value as "line" | "bar" })}><option value="line">{language === "sk" ? "Čiarový" : "Line"}</option><option value="bar">{language === "sk" ? "Stĺpcový" : "Bar"}</option></select></label><div className="welcome-cell-grid">{block.points.map((point, index) => <div key={index} className="welcome-point"><input aria-label={`${index + 1} ${language === "sk" ? "označenie" : "label"}`} value={point.label} onChange={(event) => update(block.id, { points: block.points.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /><input aria-label={`${index + 1} ${language === "sk" ? "hodnota" : "value"}`} type="number" step="any" value={point.value} onChange={(event) => update(block.id, { points: block.points.map((item, i) => i === index ? { ...item, value: Number(event.target.value) } : item) })} /></div>)}</div><div className="actions welcome-small-actions"><button type="button" className="quiet compact" disabled={block.points.length >= 30} onClick={() => update(block.id, { points: [...block.points, { label: "", value: 0 }] })}>{language === "sk" ? "+ Bod" : "+ Point"}</button><button type="button" className="quiet compact" disabled={block.points.length <= 2} onClick={() => update(block.id, { points: block.points.slice(0, -1) })}>−</button></div></>;
    }
  }

  return <div className="welcome-editor">
    <div className="welcome-editor-toolbar"><div><div className="eyebrow">{language === "sk" ? "OBSAH STRÁNKY" : "PAGE CONTENT"}</div><p className="muted">{language === "sk" ? "Úpravy sa prejavia návštevníkom až po publikovaní." : "Visitors see changes only after publication."}</p></div><div className="welcome-editor-actions"><div className="language-switch" role="group" aria-label={language === "sk" ? "Jazyk obsahu" : "Content language"}><button type="button" aria-pressed={language === "sk"} onClick={() => changeLanguage("sk")}>SK</button><button type="button" aria-pressed={language === "en"} onClick={() => changeLanguage("en")}>EN</button></div><button type="button" className="quiet" disabled={busy || loading || !dirty} onClick={() => void save()}>{language === "sk" ? "Uložiť návrh" : "Save draft"}</button><button type="button" className="primary" disabled={busy || loading || dirty || !blocks.length} onClick={() => void publish()}>{language === "sk" ? "Publikovať" : "Publish"}</button></div></div>
    {publishedAt && <small className="muted">{language === "sk" ? "Publikované" : "Published"}: {new Date(publishedAt).toLocaleString(language)}</small>}
    {message && <p className="notice" role="status">{message}</p>}
    {loading ? <p className="muted">{language === "sk" ? "Načítavam editor…" : "Loading editor…"}</p> : <div className="welcome-editor-grid">
      <aside className="welcome-editor-panel"><h2>{language === "sk" ? "Bloky" : "Blocks"}</h2><div className="welcome-block-list">{blocks.map((block, index) => <div key={block.id} className={selected === block.id ? "welcome-list-item selected" : "welcome-list-item"}><button type="button" onClick={() => setSelected(block.id)}>{index + 1}. {labels[language][block.type]}</button><button type="button" aria-label={language === "sk" ? "Posunúť vyššie" : "Move up"} disabled={!index} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={language === "sk" ? "Posunúť nižšie" : "Move down"} disabled={index === blocks.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" aria-label={language === "sk" ? "Odstrániť blok" : "Remove block"} onClick={() => remove(block.id)}>×</button></div>)}</div><h3>{language === "sk" ? "Pridať blok" : "Add block"}</h3><div className="welcome-add-grid">{(Object.keys(labels[language]) as BlockType[]).map((type) => <button key={type} type="button" className="quiet compact" disabled={blocks.length >= 30} onClick={() => add(type)}>+ {labels[language][type]}</button>)}</div></aside>
      <section className="welcome-editor-preview"><div className="welcome-preview-label">{language === "sk" ? "ŽIVÝ NÁHĽAD" : "LIVE PREVIEW"}</div><div className="eyebrow">{language === "sk" ? "LETECKÁ FAKULTA TUKE · VÝSKUM RIADENIA UAV" : "FACULTY OF AERONAUTICS TUKE · UAV CONTROL RESEARCH"}</div>{blocks.map((block) => <div key={block.id} role="button" tabIndex={0} aria-label={labels[language][block.type]} className={selected === block.id ? "welcome-preview-block selected" : "welcome-preview-block"} onClick={() => setSelected(block.id)} onKeyDown={(event) => { if (event.key === "Enter") setSelected(block.id); }}>{block.type === "image" && !block.image_id ? <div className="welcome-image-placeholder">{language === "sk" ? "Nahraj obrázok" : "Upload an image"}</div> : <WelcomeContent blocks={[block]} language={language} metrics={metrics} assetBase="/api/admin/welcome/assets/" />}</div>)}</section>
      <aside className="welcome-editor-panel welcome-properties"><h2>{selectedBlock ? labels[language][selectedBlock.type] : language === "sk" ? "Vyber blok" : "Select a block"}</h2>{selectedBlock && fields(selectedBlock)}</aside>
    </div>}
  </div>;
}
