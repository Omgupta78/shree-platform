'use client';

import { useId, useMemo, useState } from 'react';

import { SERIES_ONE, SERIES_TWO } from '@/components/analytics/chart-tokens';
import { AnalyticsEmpty } from '@/components/analytics/empty';

/**
 * A trend over time, with a crosshair.
 *
 * Inline SVG rather than a charting library. Three reasons, in order of how
 * much they matter: the exact value is readable on hover so nobody has to
 * interpret a pixel height; the whole thing renders on the server, so the
 * first paint carries the data instead of a spinner; and a dependency that
 * ships a layout engine to draw eleven line segments is a dependency this
 * repository has consistently declined.
 *
 * At most two series. Beyond that the honest forms are small multiples or a
 * table, and a third generated hue would be one a colourblind reader cannot
 * separate from the first two.
 */

export interface LinePoint {
  /** ISO date, for the axis. */
  bucket: string;
  values: number[];
}

export interface LineSeries {
  label: string;
  /** How the tooltip should render a value — money, or a plain count. */
  format: (value: number) => string;
}

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 52 };

export function LineChart({
  points,
  series,
  labelFor,
  emptyMessage = 'No data available for the selected period.',
}: {
  points: LinePoint[];
  series: LineSeries[];
  /** Turns a bucket into an axis label, in the reporting zone. */
  labelFor: (bucket: string) => string;
  emptyMessage?: string;
}) {
  const titleId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;

    const highest = Math.max(1, ...points.flatMap((p) => p.values));
    // A round ceiling, so the gridlines land on numbers somebody can read.
    const step = Math.pow(10, Math.max(0, String(Math.floor(highest)).length - 1));
    const ceiling = Math.ceil(highest / step) * step || 1;

    const plotW = WIDTH - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const x = (i: number) =>
      PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
    const y = (v: number) => PAD.top + plotH - (v / ceiling) * plotH;

    const paths = series.map((_, s) =>
      points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(p.values[s] ?? 0)}`).join(' '),
    );

    return { ceiling, x, y, paths, plotH };
  }, [points, series]);

  if (!geometry) return <AnalyticsEmpty message={emptyMessage} />;

  const { ceiling, x, y, paths } = geometry;
  const colours = [SERIES_ONE, SERIES_TWO];
  const active = hover === null ? null : points[hover];

  // Enough labels to orient, never so many they collide.
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));

  return (
    <div className="relative">
      {series.length > 1 ? (
        <ul className="mb-2 flex flex-wrap gap-4 text-xs">
          {series.map((s, i) => (
            <li key={s.label} className="flex items-center gap-1.5 text-fg-muted">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-4 rounded-full"
                style={{ background: colours[i] }}
              />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        `-mx-2 overflow-x-auto` rather than a fixed width: on a telephone the
        chart scrolls sideways instead of squashing its labels into each other
        or pushing the whole dashboard wider than the screen.
      */}
      <div className="-mx-2 overflow-x-auto px-2">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-[220px] w-full min-w-[520px]"
          role="img"
          aria-labelledby={titleId}
          onMouseLeave={() => setHover(null)}
        >
          <title id={titleId}>
            {series.map((s) => s.label).join(' and ')} from {labelFor(points[0]?.bucket ?? '')} to{' '}
            {labelFor(points[points.length - 1]?.bucket ?? '')}
          </title>

          {/* Gridlines and their values. Recessive: behind the data, never competing. */}
          {[0, 0.5, 1].map((fraction) => {
            const value = ceiling * (1 - fraction);
            const yy = PAD.top + fraction * (HEIGHT - PAD.top - PAD.bottom);
            return (
              <g key={fraction}>
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={yy}
                  y2={yy}
                  stroke="var(--chart-grid)"
                  strokeWidth="1"
                />
                <text
                  x={PAD.left - 8}
                  y={yy + 4}
                  textAnchor="end"
                  className="fill-fg-subtle text-[10px] tabular-nums"
                >
                  {series[0]?.format(value) ?? value}
                </text>
              </g>
            );
          })}

          {points.map((p, i) =>
            i % labelEvery === 0 ? (
              <text
                key={p.bucket}
                x={x(i)}
                y={HEIGHT - 8}
                textAnchor="middle"
                className="fill-fg-subtle text-[10px]"
              >
                {labelFor(p.bucket)}
              </text>
            ) : null,
          )}

          {paths.map((d, i) => (
            <path
              key={series[i]?.label ?? i}
              d={d}
              fill="none"
              stroke={colours[i]}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* The crosshair, and a marker per series at the hovered bucket. */}
          {hover !== null ? (
            <>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                stroke="var(--chart-grid)"
                strokeWidth="1"
              />
              {series.map((s, i) => (
                <circle
                  key={s.label}
                  cx={x(hover)}
                  cy={y(points[hover]?.values[i] ?? 0)}
                  r="4"
                  fill={colours[i]}
                  stroke="var(--surface)"
                  strokeWidth="2"
                />
              ))}
            </>
          ) : null}

          {/* Hit targets: one full-height band per bucket, far bigger than the mark. */}
          {points.map((p, i) => (
            <rect
              key={`hit-${p.bucket}`}
              x={x(i) - (WIDTH - PAD.left - PAD.right) / Math.max(points.length, 1) / 2}
              y={PAD.top}
              width={(WIDTH - PAD.left - PAD.right) / Math.max(points.length, 1)}
              height={HEIGHT - PAD.top - PAD.bottom}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>
      </div>

      {active ? (
        <div
          role="status"
          className="pointer-events-none absolute top-0 right-0 rounded-sm border border-line bg-surface px-3 py-2 text-xs shadow-md"
        >
          <p className="font-semibold">{labelFor(active.bucket)}</p>
          {series.map((s, i) => (
            <p key={s.label} className="mt-1 flex items-center gap-1.5 text-fg-muted">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: colours[i] }}
              />
              {s.label}:{' '}
              <span className="font-medium tabular-nums text-fg">
                {s.format(active.values[i] ?? 0)}
              </span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
