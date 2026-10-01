import { useState, type ReactNode } from "react";
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
  | { id: string; type: "featured_comparison"; title: string; description: string; mode: "SCOPE" | "SIMPLE"; metrics: string[]; bins: number; show_response: boolean; test_definition_id?: string | null }
  | { id: string; type: "paper"; title: string; authors: string[]; journal: string; publisher: string; year: number | null; volume: string; issue: string; pages: string; doi: string; url: string; abstract: string };

export type MetricTrend = { metric: string; axis: "month" | "test"; statistic: "mean" | "median" };
export type MetricCatalogItem = { key: string; label: string; unit: string; participant_count: number };
export type TestCatalogItem = { id: string; label: string; mode?: "SCOPE" | "SIMPLE" };
export type WelcomePoint = { label: string; date?: string; value: number; participant_count?: number };
export type FeaturedMetric = { key: string; cohort_average: number | null; participant_count: number | null; bins: { start: number; end: number; count: number | null; suppressed: boolean }[] };
export type FeaturedComparisonData = { available: boolean; participant_count: number | null; metrics: FeaturedMetric[]; response_curve: { time_fraction: number[]; cohort_mean: number[]; cohort_std: number[] } | null };
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
  comparison?: FeaturedComparisonData;
}>;

export type WelcomeMetrics = { participant_count: number | null; measurement_count: number | null; minimum_group_size: number; publishable: boolean } | null;

export const featuredMetricOptions: Record<"SCOPE" | "SIMPLE", string[]> = {
  SCOPE: ["reaction_delay_s", "rise_time_s", "overshoot_pct", "settling_time_s", "steady_state_error_pct", "tracking_rmse", "mean_std"],
  SIMPLE: ["mean_target_error_m", "median_target_error_m", "rms_target_error_m", "time_in_zone_pct", "reaction_delay_s", "rise_time_s", "overshoot_pct", "settling_time_s", "steady_state_error_pct", "tracking_rmse", "mean_std", "action_count", "reset_count", "crash_count"],
};

const featuredLabels: Record<string, { sk: string; en: string; unit: string }> = {
  reaction_delay_s: { sk: "Oneskorenie reakcie", en: "Reaction delay", unit: "s" },
  rise_time_s: { sk: "Čas nábehu", en: "Rise time", unit: "s" },
  overshoot_pct: { sk: "Presiahnutie cieľa", en: "Overshoot", unit: "%" },
  settling_time_s: { sk: "Čas ustálenia", en: "Settling time", unit: "s" },
  steady_state_error_pct: { sk: "Chyba po ustálení", en: "Steady-state error", unit: "%" },
  tracking_rmse: { sk: "Chyba sledovania", en: "Tracking error", unit: "" },
  mean_std: { sk: "Kolísanie odozvy", en: "Response variability", unit: "" },
  mean_target_error_m: { sk: "Priemerná chyba cieľa", en: "Mean target error", unit: "m" },
  median_target_error_m: { sk: "Medián chyby cieľa", en: "Median target error", unit: "m" },
  rms_target_error_m: { sk: "RMS chyba cieľa", en: "RMS target error", unit: "m" },
  time_in_zone_pct: { sk: "Čas v cieľovej zóne", en: "Time in target zone", unit: "%" },
  action_count: { sk: "Počet akcií", en: "Actions", unit: "" },
  reset_count: { sk: "Resetovania", en: "Resets", unit: "" },
  crash_count: { sk: "Nárazy", en: "Crashes", unit: "" },
};
export function featuredMetricLabel(key: string, language: Language): string {
  return featuredLabels[key]?.[language] ?? key;
}

export function defaultWelcomeBlocks(language: Language): WelcomeBlock[] {
  return language === "sk" ? [
    { id: "eyebrow", type: "eyebrow", text: "LETECKÁ FAKULTA TUKE · VÝSKUM RIADENIA UAV" },
    { id: "intro", type: "heading", level: 1, text: "Za každým letom je človek." },
    { id: "lead", type: "text", text: "THRUST skúma, ako piloti reagujú a ovládajú dron. Spája meranie, analýzu a porovnávanie výsledkov, aby sme ľudskému výkonu pri riadení UAV lepšie rozumeli." },
    { id: "numbers", type: "metrics", items: ["participants", "measurements", "active_tests"], trends: [] },
    { id: "scope-spotlight", type: "featured_comparison", title: "Ako skupina reaguje na zmenu", description: "Priemery všetkých osí · SCoPE", mode: "SCOPE", metrics: ["reaction_delay_s", "tracking_rmse", "overshoot_pct"], bins: 8, show_response: true, test_definition_id: null },
    { id: "simple-spotlight", type: "featured_comparison", title: "Presnosť v simulovanom lete", description: "Pohľad na pohyb a riadenie · SimPLE", mode: "SIMPLE", metrics: ["mean_target_error_m", "time_in_zone_pct", "reaction_delay_s"], bins: 8, show_response: true, test_definition_id: null },
    { id: "tagline", type: "banner", title: "Od prvého pohybu ovládača až po zmeny výkonu v čase.", body: "" },
  ] : [
    { id: "eyebrow", type: "eyebrow", text: "FACULTY OF AERONAUTICS TUKE · UAV CONTROL RESEARCH" },
    { id: "intro", type: "heading", level: 1, text: "Behind every flight is a person." },
    { id: "lead", type: "text", text: "THRUST explores how pilots respond and control a drone. It brings together measurement, analysis and comparison of results to better understand human performance in UAV control." },
    { id: "numbers", type: "metrics", items: ["participants", "measurements", "active_tests"], trends: [] },
    { id: "scope-spotlight", type: "featured_comparison", title: "How the group responds to change", description: "All-axis averages · SCoPE", mode: "SCOPE", metrics: ["reaction_delay_s", "tracking_rmse", "overshoot_pct"], bins: 8, show_response: true, test_definition_id: null },
    { id: "simple-spotlight", type: "featured_comparison", title: "Precision in simulated flight", description: "Movement and control · SimPLE", mode: "SIMPLE", metrics: ["mean_target_error_m", "time_in_zone_pct", "reaction_delay_s"], bins: 8, show_response: true, test_definition_id: null },
    { id: "tagline", type: "banner", title: "From the first movement of the controls to changes in performance over time.", body: "" },
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

function FeaturedHistogram({ metric, language }: { metric: FeaturedMetric | undefined; language: Language }) {
  const bins = metric?.bins ?? [];
  if (!bins.length || !bins.some((bin) => bin.count != null && bin.count > 0)) {
    return <p className="muted welcome-featured-empty">{language === "sk" ? "Rozdelenie sa zobrazí, keď bude v intervaloch dosť účastníkov." : "The distribution appears when enough participants fall into each interval."}</p>;
  }
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  const left = 50, right = 620, top = 20, bottom = 204;
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count ?? 0));
  const width = (right - left) / bins.length;
  return <svg className="welcome-featured-svg" viewBox="0 0 660 270" role="img" aria-label={language === "sk" ? "Rozdelenie skupinových priemerov" : "Distribution of group averages"}>
    {[0, .5, 1].map((fraction) => { const count = Math.round(maxCount * fraction); const y = bottom - (count / maxCount) * (bottom - top); return <g key={fraction}><line className="welcome-featured-grid" x1={left} x2={right} y1={y} y2={y} /><text x={left - 8} y={y + 4} textAnchor="end">{count}</text></g>; })}
    {bins.map((bin, index) => {
      const height = bin.suppressed ? 10 : ((bin.count ?? 0) / maxCount) * (bottom - top);
      return <rect key={index} x={left + index * width + 2} y={bottom - height} width={Math.max(1, width - 4)} height={height} rx="4" className={bin.suppressed ? "welcome-featured-bar suppressed" : "welcome-featured-bar"}>
        <title>{bin.suppressed ? (language === "sk" ? "Malá skupina · skryté" : "Small group · hidden") : `${number.format(bin.start)}–${number.format(bin.end)}: ${bin.count}`}</title>
      </rect>;
    })}
    <line className="welcome-featured-axis" x1={left} x2={right} y1={bottom} y2={bottom} />
    {[0, .5, 1].map((fraction) => { const value = bins[0].start + fraction * (bins[bins.length - 1].end - bins[0].start); return <text key={fraction} x={left + fraction * (right - left)} y={bottom + 21} textAnchor={fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"}>{number.format(value)}</text>; })}
    <text x={(left + right) / 2} y="258" textAnchor="middle">{language === "sk" ? "Priemer na účastníka" : "Average per participant"}</text>
  </svg>;
}

function FeaturedResponse({ response, language }: { response: NonNullable<FeaturedComparisonData["response_curve"]>; language: Language }) {
  const points = response.cohort_mean;
  const std = response.cohort_std;
  if (points.length < 2) return null;
  const lower = points.map((value, index) => value - (std[index] || 0));
  const upper = points.map((value, index) => value + (std[index] || 0));
  const low = Math.min(-.2, ...lower), high = Math.max(1.2, ...upper);
  const left = 50, right = 620, top = 20, bottom = 204;
  const x = (index: number) => left + index * (right - left) / (points.length - 1);
  const y = (value: number) => bottom - (value - low) * (bottom - top) / Math.max(.001, high - low);
  const line = points.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const band = [...upper.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`), ...lower.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).reverse()].join(" ");
  return <svg className="welcome-featured-svg" viewBox="0 0 660 270" role="img" aria-label={language === "sk" ? "Skupinový priebeh všetkých osí" : "Group trace across all axes"}>
    {[0, .5, 1].map((fraction) => <g key={fraction}><line className="welcome-featured-grid" x1={left} x2={right} y1={top + fraction * (bottom - top)} y2={top + fraction * (bottom - top)} /><text x={left - 8} y={top + fraction * (bottom - top) + 4} textAnchor="end">{(high - fraction * (high - low)).toFixed(1)}</text><text x={left + fraction * (right - left)} y={bottom + 21} textAnchor="middle">{Math.round(fraction * 100)}%</text></g>)}
    <polygon className="welcome-featured-band" points={band} /><polyline className="welcome-featured-line" points={line} />
    <line className="welcome-featured-axis" x1={left} x2={right} y1={bottom} y2={bottom} />
    <text x={(left + right) / 2} y="258" textAnchor="middle">{language === "sk" ? "Normalizovaný čas" : "Normalized time"}</text>
  </svg>;
}

function WelcomeFeaturedComparison({ block, comparison, language }: { block: Extract<WelcomeBlock, { type: "featured_comparison" }>; comparison?: FeaturedComparisonData; language: Language }) {
  const [selectedKey, setSelectedKey] = useState(block.metrics[0] ?? "");
  const selected = comparison?.metrics.find((metric) => metric.key === selectedKey) ?? comparison?.metrics[0];
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  const label = selected ? featuredMetricLabel(selected.key, language) : "";
  const unit = selected ? featuredLabels[selected.key]?.unit ?? "" : "";
  return <section className="welcome-featured">
    <div className="welcome-featured-heading">
      <div><div className="eyebrow">{block.mode === "SCOPE" ? "SCoPE" : "SimPLE"} · {language === "sk" ? "ANONYMIZOVANÉ VÝSLEDKY" : "ANONYMOUS RESULTS"}</div><h2>{block.title}</h2>{block.description && <p>{block.description}</p>}</div>
      {comparison?.participant_count != null && <span className="welcome-featured-count">{comparison.participant_count} {language === "sk" ? "účastníkov" : "participants"}</span>}
    </div>
    <div className={block.show_response ? "welcome-featured-grid-layout" : "welcome-featured-grid-layout single"}>
      <div className="welcome-featured-card">
        <div className="welcome-featured-card-header"><span>{language === "sk" ? "ROZDELENIE VÝSLEDKOV" : "RESULT DISTRIBUTION"}</span><strong>{label || (language === "sk" ? "Ukazovateľ" : "Metric")}</strong></div>
        <div className="welcome-featured-tabs" role="tablist" aria-label={language === "sk" ? "Vybrať ukazovateľ" : "Choose a metric"}>
          {block.metrics.map((key) => <button key={key} type="button" role="tab" aria-selected={selected?.key === key} className={selected?.key === key ? "active" : ""} onClick={() => setSelectedKey(key)}>{featuredMetricLabel(key, language)}</button>)}
        </div>
        {selected?.cohort_average != null && <div className="welcome-featured-average"><span>{language === "sk" ? "Skupinový priemer" : "Group average"}</span><strong>{number.format(selected.cohort_average)}{unit && <small> {unit}</small>}</strong></div>}
        <FeaturedHistogram metric={selected} language={language} />
      </div>
      {block.show_response && <div className="welcome-featured-card">
        <div className="welcome-featured-card-header"><span>{language === "sk" ? "PRIEMERNÝ PRIEBEH" : "AVERAGE TRACE"}</span><strong>{language === "sk" ? "Odozva všetkých osí" : "Response across all axes"}</strong></div>
        {comparison?.response_curve ? <><FeaturedResponse response={comparison.response_curve} language={language} /><p className="welcome-featured-note">{language === "sk" ? "Čiara: priemer skupiny · pásmo: rozptyl medzi účastníkmi" : "Line: group mean · band: spread across participants"}</p></> : <p className="muted welcome-featured-empty">{language === "sk" ? "Priebeh sa zobrazí po získaní dostatočnej skupiny s uloženou analýzou." : "The trace appears once enough participants have saved analyses."}</p>}
      </div>}
    </div>
    <p className="welcome-featured-note">{language === "sk" ? "Každý účastník má rovnakú váhu. Počet intervalov sa prispôsobí veľkosti anonymnej skupiny." : "Each participant has equal weight. The number of bins adapts to the anonymous group size."}</p>
  </section>;
}

function Metric({ label, value }: { label: string; value: string | number }): ReactNode {
  return <div className="welcome-mini-stat"><span>{label}</span><strong>{value}</strong></div>;
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
        return <div key={block.id}>{itemKeys.length > 0 && <div className="welcome-mini-stats">{itemKeys.map((key) => <Metric key={key} label={labels[key]} value={live?.items?.find((item) => item.key === key)?.value ?? "—"} />)}</div>}{metrics && !metrics.publishable && itemKeys.some((key) => key !== "active_tests") && <p className="privacy">{language === "sk" ? `Verejné štatistiky sa zobrazia po dosiahnutí minimálnej skupiny ${metrics.minimum_group_size} účastníkov.` : `Public statistics appear once the minimum group size of ${metrics.minimum_group_size} participants is reached.`}</p>}{trends.map((trend, index) => { const result = live?.trends?.[index]; return result ? <WelcomeChart key={`${trend.metric}-${index}`} title={result.title} unit={result.unit} points={result.points} style="line" language={language} /> : null; })}</div>;
      }
      case "data_chart": { const live = data[block.id]; return live?.points?.length ? <WelcomeChart key={block.id} title={block.title} unit={live.unit ?? ""} points={live.points} style={block.style} language={language} /> : <div key={block.id} className="welcome-chart"><strong>{block.title}</strong><p className="muted">{language === "sk" ? "Graf sa zobrazí po získaní dostatočného počtu meraní." : "The chart appears when enough measurements are available."}</p></div>; }
      case "histogram": { const live = data[block.id]; return <WelcomeHistogram key={block.id} title={block.title} unit={live?.unit ?? ""} bins={live?.bins ?? []} publishable={Boolean(live?.publishable)} language={language} />; }
      case "average_response": { const live = data[block.id]; return <WelcomeResponseCurve key={block.id} title={block.title} test={live?.test ?? ""} channel={block.channel} points={live?.response_points ?? []} language={language} />; }
      case "featured_comparison": return <WelcomeFeaturedComparison key={block.id} block={block} comparison={data[block.id]?.comparison} language={language} />;
      case "data_table": { const live = data[block.id]; return <div key={block.id} className="welcome-table"><h2>{block.title}</h2>{live?.columns?.length ? <div className="welcome-table-scroll"><table><thead><tr><th>{live.axis === "month" ? (language === "sk" ? "Mesiac" : "Month") : (language === "sk" ? "Test" : "Test")}</th>{live.columns.map((column) => <th key={column.key}>{column.label}{column.unit ? ` (${column.unit})` : ""}</th>)}</tr></thead><tbody>{live.rows?.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{typeof cell === "number" ? number.format(cell) : cell ?? "—"}</td>)}</tr>)}</tbody></table></div> : <p className="muted">{language === "sk" ? "Tabuľka sa zobrazí po získaní dostatočného počtu meraní." : "The table appears when enough measurements are available."}</p>}</div>; }
      case "paper": return <article key={block.id} className="welcome-paper"><h2>{block.title}</h2><p className="welcome-paper-authors">{block.authors.join(", ")}{block.year ? ` · ${block.year}` : ""}</p><p className="welcome-paper-journal">{[block.journal, block.volume && `Vol. ${block.volume}`, block.issue && `No. ${block.issue}`, block.pages && `pp. ${block.pages}`, block.publisher].filter(Boolean).join(" · ")}</p>{block.abstract && <p>{block.abstract}</p>}{block.doi && <p>DOI: {block.doi}</p>}{block.url.startsWith("https://") && <a href={block.url} target="_blank" rel="noreferrer">{language === "sk" ? "Otvoriť publikáciu" : "Open publication"}</a>}</article>;
    }
  })}</div>;
}
