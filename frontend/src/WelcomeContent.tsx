import type { ReactNode } from "react";
import type { Language } from "./i18n";

export type WelcomeBlock =
  | { id: string; type: "heading"; text: string; level: 1 | 2 | 3 }
  | { id: string; type: "text"; text: string }
  | { id: string; type: "banner"; title: string; body: string; image_id?: string | null }
  | { id: string; type: "image"; image_id: string; alt: string; caption: string }
  | { id: string; type: "metrics" }
  | { id: string; type: "table"; title: string; columns: string[]; rows: string[][] }
  | { id: string; type: "chart"; title: string; unit: string; style: "line" | "bar"; points: { label: string; value: number }[] }
  | { id: string; type: "research"; title: string; value: string; unit: string; source: string };

export type WelcomeMetrics = { participant_count: number | null; measurement_count: number | null; minimum_group_size: number; publishable: boolean } | null;

export function defaultWelcomeBlocks(language: Language): WelcomeBlock[] {
  return language === "sk" ? [
    { id: "intro", type: "heading", level: 1, text: "Za každým letom je človek." },
    { id: "lead", type: "text", text: "THRUST skúma, ako piloti reagujú a ovládajú dron. Spája meranie, analýzu a porovnávanie výsledkov, aby sme ľudskému výkonu pri riadení UAV lepšie rozumeli." },
    { id: "tagline", type: "banner", title: "Od prvého pohybu ovládača až po zmeny výkonu v čase.", body: "" },
    { id: "numbers", type: "metrics" },
  ] : [
    { id: "intro", type: "heading", level: 1, text: "Behind every flight is a person." },
    { id: "lead", type: "text", text: "THRUST explores how pilots respond and control a drone. It brings together measurement, analysis and comparison of results to better understand human performance in UAV control." },
    { id: "tagline", type: "banner", title: "From the first movement of the controls to changes in performance over time.", body: "" },
    { id: "numbers", type: "metrics" },
  ];
}

function Metric({ label, value }: { label: string; value: string | number }): ReactNode {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function WelcomeChart({ block, language }: { block: Extract<WelcomeBlock, { type: "chart" }>; language: Language }) {
  const points = block.points.filter((point) => Number.isFinite(point.value));
  if (points.length < 2) return null;
  const values = points.map((point) => point.value);
  const low = block.style === "bar" ? Math.min(0, ...values) : Math.min(...values);
  const high = block.style === "bar" ? Math.max(0, ...values) : Math.max(...values);
  const span = Math.max(high - low, 1);
  const y = (value: number) => 178 - (value - low) / span * 144;
  const x = (index: number) => 50 + index * 670 / Math.max(points.length - 1, 1);
  const line = points.map((point, index) => `${index ? "L" : "M"} ${x(index)} ${y(point.value)}`).join(" ");
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  return <figure className="welcome-chart">
    <figcaption>{block.title}{block.unit && <small> {block.unit}</small>}</figcaption>
    <svg viewBox="0 0 770 220" role="img" aria-label={block.title} preserveAspectRatio="xMidYMid meet">
      <line x1="50" y1="178" x2="730" y2="178" stroke="#54708d" />
      <line x1="50" y1="34" x2="50" y2="178" stroke="#54708d" />
      <text x="45" y="28" textAnchor="end">{number.format(high)}</text>
      <text x="45" y="185" textAnchor="end">{number.format(low)}</text>
      {block.style === "line" ? <><path d={line} fill="none" stroke="#45d5ff" strokeWidth="3" />{points.map((point, index) => <circle key={index} cx={x(index)} cy={y(point.value)} r="4" fill="#45d5ff" />)}</> : points.map((point, index) => {
        const barWidth = Math.min(48, 560 / points.length);
        const baseY = y(0);
        const valueY = y(point.value);
        return <rect key={index} x={x(index) - barWidth / 2} y={Math.min(baseY, valueY)} width={barWidth} height={Math.max(1, Math.abs(baseY - valueY))} fill="#45d5ff" />;
      })}
      {points.map((point, index) => <text key={index} x={x(index)} y="204" textAnchor="middle">{point.label.length > 13 ? point.label.slice(0, 12) + "…" : point.label}</text>)}
    </svg>
    <table className="visually-hidden"><caption>{block.title}</caption><thead><tr><th>{language === "sk" ? "Bod" : "Point"}</th><th>{language === "sk" ? "Hodnota" : "Value"}</th></tr></thead><tbody>{points.map((point, index) => <tr key={index}><th>{point.label}</th><td>{number.format(point.value)} {block.unit}</td></tr>)}</tbody></table>
  </figure>;
}

export function WelcomeContent({ blocks, language, metrics, assetBase = "/api/public/welcome/assets/" }: { blocks: WelcomeBlock[]; language: Language; metrics: WelcomeMetrics; assetBase?: string }) {
  return <div className="welcome-blocks">{blocks.map((block) => {
    switch (block.type) {
      case "heading": {
        if (block.level === 1) return <h1 key={block.id}>{block.text}</h1>;
        if (block.level === 3) return <h3 key={block.id} className="welcome-heading">{block.text}</h3>;
        return <h2 key={block.id} className="welcome-heading">{block.text}</h2>;
      }
      case "text": return <p key={block.id} className="lead welcome-paragraph">{block.text}</p>;
      case "banner": return <section key={block.id} className={block.image_id ? "welcome-banner with-image" : "welcome-banner"} style={block.image_id ? { backgroundImage: `linear-gradient(90deg, #07101ce6, #07101c80), url("${assetBase}${block.image_id}")` } : undefined}><strong>{block.title}</strong>{block.body && <p>{block.body}</p>}</section>;
      case "image": return <figure key={block.id} className="welcome-image"><img src={`${assetBase}${block.image_id}`} alt={block.alt} />{block.caption && <figcaption>{block.caption}</figcaption>}</figure>;
      case "metrics": return <div key={block.id}><div className="stats"><Metric label={language === "sk" ? "Účastníci" : "Participants"} value={metrics?.participant_count ?? "—"} /><Metric label={language === "sk" ? "Merania" : "Measurements"} value={metrics?.measurement_count ?? "—"} /><Metric label={language === "sk" ? "Testy" : "Tests"} value="SCoPE · SimPLE" /></div>{metrics && !metrics.publishable && <p className="privacy">{language === "sk" ? `Verejné štatistiky sa zobrazia po dosiahnutí minimálnej skupiny ${metrics.minimum_group_size} účastníkov.` : `Public statistics appear once the minimum group size of ${metrics.minimum_group_size} participants is reached.`}</p>}</div>;
      case "table": return <div key={block.id} className="welcome-table"><h2>{block.title}</h2><div className="welcome-table-scroll"><table><thead><tr>{block.columns.map((column, index) => <th key={index}>{column}</th>)}</tr></thead><tbody>{block.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div></div>;
      case "chart": return <WelcomeChart key={block.id} block={block} language={language} />;
      case "research": return <div key={block.id} className="welcome-research"><span>{block.title}</span><strong>{block.value} <small>{block.unit}</small></strong>{block.source && <p>{block.source}</p>}</div>;
    }
  })}</div>;
}
