/**
 * The colours the charts use, and how they were chosen.
 *
 * Not picked by eye. Each pair was put through a colourblind-separation check
 * against the surface it sits on, and the steps that passed live in
 * `globals.css` beside the rest of the design system — the note there records
 * what was measured and what the obvious choice would have cost.
 *
 * Most charts here need only ONE colour, because most of them show one
 * measure: revenue over time, advertisements per category. A second hue is
 * spent only where two series genuinely share an axis, and never to decorate
 * a single series.
 */

/** Series 1. The site's own red. */
export const SERIES_ONE = 'var(--chart-series-1)';
/** Series 2. Blue: warm against cool is what survives colour blindness. */
export const SERIES_TWO = 'var(--chart-series-2)';
/** Grid lines and axes — behind the data, never competing with it. */
export const CHART_GRID = 'var(--chart-grid)';
/** A series present for context rather than as the point. */
export const CHART_MUTED = 'var(--chart-muted)';
