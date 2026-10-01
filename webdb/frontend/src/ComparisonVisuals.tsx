import { t, tf } from "./i18n";

export type ComparisonHistogram = { minimum: number; maximum: number; counts: number[]; own_value: number | null };
export type ComparisonMetric = { key: string; own_value: number | null; cohort_average: number | null; histogram: ComparisonHistogram | null };
export type ComparisonResponseCurve = { time_fraction: number[]; own_mean: number[] | null; cohort_mean: number[]; cohort_std: number[] };

function comparisonMetricUnit(key: string): string {
  if (key.endsWith("_s")) return " s";
  if (key.endsWith("_pct")) return " %";
  if (key.endsWith("_m")) return " m";
  return "";
}

export function formatComparisonValue(value: number | null, key: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(comparisonMetricUnit(key) === " %" ? 1 : 2) + comparisonMetricUnit(key);
}

export function ComparisonHistogramPlot({ metric }: { metric: ComparisonMetric }) {
  const histogram = metric.histogram;
  if (!histogram || !histogram.counts.length) return <div className="chart-empty">{t("Histogram nie je dostupný.")}</div>;
  const width = 760, height = 340, left = 62, right = 730, top = 36, bottom = 270;
  const counts = histogram.counts;
  const maxCount = Math.max(1, ...counts);
  const step = (right - left) / counts.length;
  const x = (value: number) => left + ((value - histogram.minimum) / Math.max(.000001, histogram.maximum - histogram.minimum)) * (right - left);
  const ownX = histogram.own_value == null ? null : Math.max(left, Math.min(right, x(histogram.own_value)));
  const y = (count: number) => bottom - (count / maxCount) * (bottom - top);
  const xTicks = [0, .5, 1].map((fraction) => histogram.minimum + fraction * (histogram.maximum - histogram.minimum));
  return <svg className="comparison-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("Histogram porovnania účastníkov")}>
    {[0, .5, 1].map((fraction) => {
      const countTick = Math.round(maxCount * fraction);
      return <g key={fraction}><line className="comparison-grid-line" x1={left} x2={right} y1={y(countTick)} y2={y(countTick)} /><text className="comparison-axis-label" x={left - 10} y={y(countTick) + 4} textAnchor="end">{countTick}</text></g>;
    })}
    {counts.map((count, index) => {
      const barHeight = bottom - y(count);
      return <rect key={index} className="comparison-histogram-bar" x={left + index * step + 2} y={y(count)} width={Math.max(1, step - 4)} height={barHeight} rx="4"><title>{tf("Počet účastníkov: {0}", count)}</title></rect>;
    })}
    <line className="comparison-axis" x1={left} x2={right} y1={bottom} y2={bottom} />
    <line className="comparison-axis" x1={left} x2={left} y1={top} y2={bottom} />
    {ownX != null && <><line className="comparison-student-line" x1={ownX} x2={ownX} y1={top} y2={bottom} /><text className="comparison-student-label" x={Math.max(left + 4, Math.min(right - 4, ownX))} y={top - 10} textAnchor={ownX > right - 120 ? "end" : "start"}>{t("Ty")}: {formatComparisonValue(histogram.own_value, metric.key)}{histogram.own_value! < histogram.minimum ? " ←" : histogram.own_value! > histogram.maximum ? " →" : ""}</text></>}
    <text className="comparison-axis-label" x={(left + right) / 2} y={height - 20} textAnchor="middle">{t("Priemer na účastníka")}</text>
    <text className="comparison-axis-label" transform={`rotate(-90 17 ${(top + bottom) / 2})`} x="17" y={(top + bottom) / 2} textAnchor="middle">{t("Počet účastníkov")}</text>
    {xTicks.map((value, index) => <text key={index} className="comparison-axis-label" x={left + index * ((right - left) / 2)} y={bottom + 18} textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}>{value.toFixed(1)}</text>)}
  </svg>;
}

export function ComparisonResponsePlot({ data }: { data: ComparisonResponseCurve }) {
  const own = data.own_mean ?? [];
  const cohort = data.cohort_mean ?? [];
  const std = data.cohort_std ?? [];
  const count = Math.min(data.time_fraction.length, cohort.length, own.length || cohort.length);
  if (count < 2) return <div className="chart-empty">{t("Priebeh odozvy nie je dostupný.")}</div>;
  const lower = cohort.slice(0, count).map((value, index) => value - (std[index] || 0));
  const upper = cohort.slice(0, count).map((value, index) => value + (std[index] || 0));
  const allValues = [...lower, ...upper, ...own.slice(0, count)].filter(Number.isFinite);
  const min = Math.min(-.2, ...allValues), max = Math.max(1.2, ...allValues);
  const width = 760, height = 340, left = 62, right = 730, top = 30, bottom = 270;
  const x = (index: number) => left + (index / Math.max(1, count - 1)) * (right - left);
  const y = (value: number) => bottom - ((value - min) / Math.max(.001, max - min)) * (bottom - top);
  const line = (values: number[]) => values.slice(0, count).map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const area = [...upper.slice(0, count).map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`), ...lower.slice(0, count).map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).reverse()].join(" ");
  return <svg className="comparison-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("Priemerný priebeh odozvy všetkých osí")}>
    {[0, .5, 1].map((fraction) => <g key={fraction}><line className="comparison-grid-line" x1={left} x2={right} y1={top + fraction * (bottom - top)} y2={top + fraction * (bottom - top)} /><line className="comparison-grid-line" x1={left + fraction * (right - left)} x2={left + fraction * (right - left)} y1={top} y2={bottom} /><text className="comparison-axis-label" x={left + fraction * (right - left)} y={bottom + 18} textAnchor="middle">{Math.round(fraction * 100)}%</text></g>)}
    <polygon points={area} className="comparison-response-band" />
    <polyline points={line(cohort)} className="comparison-cohort-line" />
    {own.length > 1 && <polyline points={line(own)} className="comparison-student-line-path" />}
    <line className="comparison-axis" x1={left} x2={right} y1={bottom} y2={bottom} /><line className="comparison-axis" x1={left} x2={left} y1={top} y2={bottom} />
    <text className="comparison-axis-label" x={width / 2} y={height - 20} textAnchor="middle">{t("Normalizovaný čas")}</text>
    <text className="comparison-axis-label" transform={`rotate(-90 17 ${(top + bottom) / 2})`} x="17" y={(top + bottom) / 2} textAnchor="middle">{t("Normalizovaná odozva")}</text>
  </svg>;
}

