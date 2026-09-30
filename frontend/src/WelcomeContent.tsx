import type { ReactNode } from "react";
import type { Language } from "./i18n";

export type WelcomeBlock =
  | { id: string; type: "eyebrow"; text: string }
  | { id: string; type: "heading"; text: string; level: 1 | 2 | 3 }
  | { id: string; type: "text"; text: string }
  | { id: string; type: "banner"; title: string; body: string; image_id?: string | null }
  | { id: string; type: "image"; image_id: string; alt: string; caption: string }
  | { id: string; type: "metrics"; items: ("participants" | "measurements" | "active_tests")[]; trends: MetricTrend[] }
  | { id: string; type: "data_chart"; title: string; metric: string; axis: "month" | "test"; statistic: "mean" | "median"; style: "line" | "bar" }
  | { id: string; type: "data_table"; title: string; metrics: string[]; axis: "month" | "test"; statistic: "mean" | "median" }
  | { id: string; type: "histogram"; title: string; metric: string; bins: number; test_definition_id?: string | null }
  | { id: string; type: "average_response"; title: string; test_definition_id: string; channel: "LX" | "LY" | "RX" | "RY" }
  | { id: string; type: "paper"; title: string; authors: string[]; journal: string; publisher: string; year: number | null; volume: string; issue: string; pages: string; doi: string; url: string; abstract: string };

export type MetricTrend = { metric: string; axis: "month" | "test"; statistic: "mean" | "median" };
export type MetricCatalogItem = { key: string; label: string; unit: string; participant_count: number };
export type TestCatalogItem = { id: string; label: string };
export type WelcomePoint = { label: string; date?: string; value: number; participant_count?: number };
export type WelcomeData = Record<string, {
  items?: { key: string; label: string; value: number | null }[];
  trends?: { metric: string; axis: "month" | "test"; statistic: "mean" | "median"; title: string; unit: string; points: WelcomePoint[] }[];
  metric?: string;
  unit?: string;
  points?: WelcomePoint[];
  axis?: "month" | "test";
  columns?: { key: string; label: string; unit: string }[];
  rows?: (string | number | null)[][];
  bins?: { start: number; end: number; count: number | null; suppressed: boolean }[];
  publishable?: boolean;
  test?: string;
  response_points?: { time_s: number; value: number | null }[];
}>;

export type WelcomeMetrics = { participant_count: number | null; measurement_count: number | null; minimum_group_size: number; publishable: boolean } | null;

export function defaultWelcomeBlocks(language: Language): WelcomeBlock[] {
  return language === "sk" ? [
    { id: "eyebrow", type: "eyebrow", text: "LETECKÁ FAKULTA TUKE · VÝSKUM RIADENIA UAV" },
    { id: "intro", type: "heading", level: 1, text: "Za každým letom je človek." },
    { id: "lead", type: "text", text: "THRUST skúma, ako piloti reagujú a ovládajú dron. Spája meranie, analýzu a porovnávanie výsledkov, aby sme ľudskému výkonu pri riadení UAV lepšie rozumeli." },
    { id: "tagline", type: "banner", title: "Od prvého pohybu ovládača až po zmeny výkonu v čase.", body: "" },
    { id: "numbers", type: "metrics", items: ["participants", "measurements", "active_tests"], trends: [] },
  ] : [
    { id: "eyebrow", type: "eyebrow", text: "FACULTY OF AERONAUTICS TUKE · UAV CONTROL RESEARCH" },
    { id: "intro", type: "heading", level: 1, text: "Behind every flight is a person." },
    { id: "lead", type: "text", text: "THRUST explores how pilots respond and control a drone. It brings together measurement, analysis and comparison of results to better understand human performance in UAV control." },
    { id: "tagline", type: "banner", title: "From the first movement of the controls to changes in performance over time.", body: "" },
    { id: "numbers", type: "metrics", items: ["participants", "measurements", "active_tests"], trends: [] },
  ];
}


function WelcomeHistogram({ title, unit, bins, publishable, language }: { title: string; unit: string; bins: NonNullable<WelcomeData[string]["bins"]>; publishable: boolean; language: Language }) {
  if (!publishable || !bins.length) return <div className="welcome-chart"><strong>{title}</strong><p className="muted">{language === "sk" ? "Histogram sa zobrazí po získaní dostatočného počtu účastníkov." : "The histogram appears when enough participants are available."}</p></div>;
  const max = Math.max(1, ...bins.map((bin) => bin.count ?? 0));
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  return <figure className="welcome-chart welcome-histogram"><figcaption>{title}{unit && <small> {unit}</small>}</figcaption><svg viewBox="0 0 770 220" role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
    <line x1="50" y1="178" x2="730" y2="178" stroke="#54708d" /><line x1="50" y1="34" x2="50" y2="178" stroke="#54708d" />
    {bins.map((bin, index) => { const width = 650 / bins.length - 5, x = 60 + index * 670 / bins.length, height = bin.count == null ? 12 : (bin.count / max) * 130; return <g key={index}><rect x={x} y={178 - height} width={width} height={height} rx="4" fill={bin.suppressed ? "#66788d" : "#45d5ff"} /><text x={x + width / 2} y="199" textAnchor="middle">{number.format(bin.start)}</text>{bin.count != null && <text x={x + width / 2} y={170 - height} textAnchor="middle">{bin.count}</text>}</g>; })}
    <text x="390" y="217" textAnchor="middle">{language === "sk" ? "Hodnota" : "Value"}{unit ? " (" + unit + ")" : ""}</text>
  </svg></figure>;
}

function WelcomeResponseCurve({ title, test, channel, points, language }: { title: string; test: string; channel: string; points: NonNullable<WelcomeData[string]["response_points"]>; language: Language }) {
  const valid = points.filter((point) => typeof point.value === "number" && Number.isFinite(point.value));
  if (valid.length < 2) return <div className="welcome-chart"><strong>{title}</strong><p className="muted">{language === "sk" ? "Priemerná odozva sa zobrazí po získaní dostatočného počtu meraní." : "The average response appears when enough measurements are available."}</p></div>;
  const low = Math.min(0, ...valid.map((point) => point.value as number)), high = Math.max(1, ...valid.map((point) => point.value as number));
  const y = (value: number) => 178 - (value - low) / Math.max(high - low, 0.01) * 144, x = (time: number) => 50 + time / 1.5 * 680;
  const path = valid.map((point, index) => (index ? "L" : "M") + " " + x(point.time_s) + " " + y(point.value as number)).join(" ");
  return <figure className="welcome-chart"><figcaption>{title}<small> · {test} · {channel}</small></figcaption><svg viewBox="0 0 770 220" role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
    <line x1="50" y1="178" x2="730" y2="178" stroke="#54708d" /><line x1="50" y1="34" x2="50" y2="178" stroke="#54708d" /><line x1="50" y1={y(1)} x2="730" y2={y(1)} stroke="#54708d" strokeDasharray="4 5" opacity=".6" /><path d={path} fill="none" stroke="#45d5ff" strokeWidth="3" />
    {[0, .5, 1, 1.5].map((time) => <g key={time}><line x1={x(time)} y1="178" x2={x(time)} y2="182" stroke="#54708d" /><text x={x(time)} y="199" textAnchor="middle">{time.toFixed(1)}</text></g>)}
    <text x="390" y="217" textAnchor="middle">{language === "sk" ? "Čas od povelu [s]" : "Time from command [s]"}</text><text x="45" y="32" textAnchor="end">1.0</text><text x="45" y="181" textAnchor="end">{low.toFixed(1)}</text>
  </svg></figure>;
}

function Metric({ label, value }: { label: string; value: string | number }): ReactNode {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function WelcomeChart({ title, unit, points: sourcePoints, style, language }: { title: string; unit: string; points: WelcomePoint[]; style: "line" | "bar"; language: Language }) {
  const points = sourcePoints.filter((point) => Number.isFinite(point.value));
  if (points.length < 1) return null;
  const values = points.map((point) => point.value);
  const low = style === "bar" ? Math.min(0, ...values) : Math.min(...values);
  const high = style === "bar" ? Math.max(0, ...values) : Math.max(...values);
  const span = Math.max(high - low, 1);
  const y = (value: number) => 178 - (value - low) / span * 144;
  const x = (index: number) => 50 + index * 670 / Math.max(points.length - 1, 1);
  const line = points.map((point, index) => `${index ? "L" : "M"} ${x(index)} ${y(point.value)}`).join(" ");
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  return <figure className="welcome-chart">
    <figcaption>{title}{unit && <small> {unit}</small>}</figcaption>
    <svg viewBox="0 0 770 220" role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
      <line x1="50" y1="178" x2="730" y2="178" stroke="#54708d" />
      <line x1="50" y1="34" x2="50" y2="178" stroke="#54708d" />
      <text x="45" y="28" textAnchor="end">{number.format(high)}</text>
      <text x="45" y="185" textAnchor="end">{number.format(low)}</text>
      {style === "line" ? <><path d={line} fill="none" stroke="#45d5ff" strokeWidth="3" />{points.map((point, index) => <circle key={index} cx={x(index)} cy={y(point.value)} r="4" fill="#45d5ff" />)}</> : points.map((point, index) => {
        const barWidth = Math.min(48, 560 / points.length);
        const baseY = y(0);
        const valueY = y(point.value);
        return <rect key={index} x={x(index) - barWidth / 2} y={Math.min(baseY, valueY)} width={barWidth} height={Math.max(1, Math.abs(baseY - valueY))} fill="#45d5ff" />;
      })}
      {points.map((point, index) => <text key={index} x={x(index)} y="204" textAnchor="middle">{point.label.length > 13 ? point.label.slice(0, 12) + "…" : point.label}</text>)}
    </svg>
    <table className="visually-hidden"><caption>{title}</caption><thead><tr><th>{language === "sk" ? "Bod" : "Point"}</th><th>{language === "sk" ? "Hodnota" : "Value"}</th></tr></thead><tbody>{points.map((point, index) => <tr key={index}><th>{point.label}</th><td>{number.format(point.value)} {unit}</td></tr>)}</tbody></table>
  </figure>;
}

export function WelcomeContent({ blocks, language, metrics, data = {}, assetBase = "/api/public/welcome/assets/" }: { blocks: WelcomeBlock[]; language: Language; metrics: WelcomeMetrics; data?: WelcomeData; assetBase?: string }) {
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  return <div className="welcome-blocks">{blocks.map((block) => {
    switch (block.type) {
      case "eyebrow": return <div key={block.id} className="eyebrow">{block.text}</div>;
      case "heading": {
        if (block.level === 1) return <h1 key={block.id}>{block.text}</h1>;
        if (block.level === 3) return <h3 key={block.id} className="welcome-heading">{block.text}</h3>;
        return <h2 key={block.id} className="welcome-heading">{block.text}</h2>;
      }
      case "text": return <p key={block.id} className="lead welcome-paragraph">{block.text}</p>;
      case "banner": return <section key={block.id} className={block.image_id ? "welcome-banner with-image" : "welcome-banner"} style={block.image_id ? { backgroundImage: `linear-gradient(90deg, #07101ce6, #07101c80), url("${assetBase}${block.image_id}")` } : undefined}><strong>{block.title}</strong>{block.body && <p>{block.body}</p>}</section>;
      case "image": return <figure key={block.id} className="welcome-image"><img src={`${assetBase}${block.image_id}`} alt={block.alt} />{block.caption && <figcaption>{block.caption}</figcaption>}</figure>;
      case "metrics": {
        const live = data[block.id];
        const itemKeys = block.items ?? ["participants", "measurements", "active_tests"];
        const trends = block.trends ?? [];
        const labels: Record<string, string> = language === "sk" ? { participants: "Účastníci", measurements: "Merania", active_tests: "Aktívne testy" } : { participants: "Participants", measurements: "Measurements", active_tests: "Active tests" };
        return <div key={block.id}>{itemKeys.length > 0 && <div className="stats" style={{ gridTemplateColumns: `repeat(${itemKeys.length}, minmax(0, 1fr))` }}>{itemKeys.map((key) => <Metric key={key} label={labels[key]} value={live?.items?.find((item) => item.key === key)?.value ?? "—"} />)}</div>}{metrics && !metrics.publishable && itemKeys.some((key) => key !== "active_tests") && <p className="privacy">{language === "sk" ? `Verejné štatistiky sa zobrazia po dosiahnutí minimálnej skupiny ${metrics.minimum_group_size} účastníkov.` : `Public statistics appear once the minimum group size of ${metrics.minimum_group_size} participants is reached.`}</p>}{trends.map((trend, index) => { const result = live?.trends?.[index]; return result ? <WelcomeChart key={`${trend.metric}-${index}`} title={result.title} unit={result.unit} points={result.points} style="line" language={language} /> : null; })}</div>;
      }
      case "data_chart": { const live = data[block.id]; return live?.points?.length ? <WelcomeChart key={block.id} title={block.title} unit={live.unit ?? ""} points={live.points} style={block.style} language={language} /> : <div key={block.id} className="welcome-chart"><strong>{block.title}</strong><p className="muted">{language === "sk" ? "Graf sa zobrazí po získaní dostatočného počtu meraní." : "The chart appears when enough measurements are available."}</p></div>; }
      case "histogram": { const live = data[block.id]; return <WelcomeHistogram key={block.id} title={block.title} unit={live?.unit ?? ""} bins={live?.bins ?? []} publishable={Boolean(live?.publishable)} language={language} />; }
      case "average_response": { const live = data[block.id]; return <WelcomeResponseCurve key={block.id} title={block.title} test={live?.test ?? ""} channel={block.channel} points={live?.response_points ?? []} language={language} />; }
      case "data_table": { const live = data[block.id]; return <div key={block.id} className="welcome-table"><h2>{block.title}</h2>{live?.columns?.length ? <div className="welcome-table-scroll"><table><thead><tr><th>{live.axis === "month" ? (language === "sk" ? "Mesiac" : "Month") : (language === "sk" ? "Test" : "Test")}</th>{live.columns.map((column) => <th key={column.key}>{column.label}{column.unit ? ` (${column.unit})` : ""}</th>)}</tr></thead><tbody>{live.rows?.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{typeof cell === "number" ? number.format(cell) : cell ?? "—"}</td>)}</tr>)}</tbody></table></div> : <p className="muted">{language === "sk" ? "Tabuľka sa zobrazí po získaní dostatočného počtu meraní." : "The table appears when enough measurements are available."}</p>}</div>; }
      case "paper": return <article key={block.id} className="welcome-paper"><h2>{block.title}</h2><p className="welcome-paper-authors">{block.authors.join(", ")}{block.year ? ` · ${block.year}` : ""}</p><p className="welcome-paper-journal">{[block.journal, block.volume && `Vol. ${block.volume}`, block.issue && `No. ${block.issue}`, block.pages && `pp. ${block.pages}`, block.publisher].filter(Boolean).join(" · ")}</p>{block.abstract && <p>{block.abstract}</p>}{block.doi && <p>DOI: {block.doi}</p>}{block.url.startsWith("https://") && <a href={block.url} target="_blank" rel="noreferrer">{language === "sk" ? "Otvoriť publikáciu" : "Open publication"}</a>}</article>;
    }
  })}</div>;
}
