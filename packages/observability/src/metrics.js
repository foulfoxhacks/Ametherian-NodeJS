/**
 * In-process metrics with bounded label cardinality: once a metric has
 * `maxSeries` label combinations, new combinations are folded into a single
 * overflow series instead of growing memory without bound.
 */
import { validateOptions } from '@foulfoxhacks/ametherian-core';

const NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
export const OVERFLOW_LABEL = '__overflow__';
export const DEFAULT_BUCKETS = Object.freeze([5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]);

function labelKey(labels) {
  const keys = Object.keys(labels).sort();
  return JSON.stringify(keys.map((k) => [k, String(labels[k])]));
}

/**
 * @param {{ maxSeries?: number }} [options]
 */
export function createMetrics(options) {
  const o = validateOptions(options, { maxSeries: { type: 'integer', min: 1, default: 1000 } }, { name: 'metrics options' });
  /** @type {Map<string, { type: string, help: string, buckets?: number[], series: Map<string, any> }>} */
  const metrics = new Map();

  function define(name, type, help, buckets) {
    if (!NAME.test(name)) throw new TypeError(`Invalid metric name: ${name}`);
    const existing = metrics.get(name);
    if (existing) {
      if (existing.type !== type) throw new TypeError(`Metric ${name} already defined as ${existing.type}`);
      return existing;
    }
    const m = { type, help, buckets, series: new Map() };
    metrics.set(name, m);
    return m;
  }

  function seriesFor(m, labels, init) {
    let key = labelKey(labels);
    let s = m.series.get(key);
    if (!s) {
      if (m.series.size >= o.maxSeries) {
        key = labelKey({ [OVERFLOW_LABEL]: 'true' });
        labels = { [OVERFLOW_LABEL]: 'true' };
        s = m.series.get(key);
      }
      if (!s) {
        s = { labels: Object.freeze({ ...labels }), ...init() };
        m.series.set(key, s);
      }
    }
    return s;
  }

  return Object.freeze({
    counter(name, help = '') {
      const m = define(name, 'counter', help);
      return Object.freeze({
        inc(labels = {}, by = 1) {
          if (!(by >= 0) || !Number.isFinite(by)) throw new RangeError('counter increments must be finite and >= 0');
          seriesFor(m, labels, () => ({ value: 0 })).value += by;
        },
      });
    },
    gauge(name, help = '') {
      const m = define(name, 'gauge', help);
      return Object.freeze({
        set(labels = {}, value) {
          if (!Number.isFinite(value)) throw new RangeError('gauge values must be finite');
          seriesFor(m, labels, () => ({ value: 0 })).value = value;
        },
        add(labels = {}, by = 1) {
          seriesFor(m, labels, () => ({ value: 0 })).value += by;
        },
      });
    },
    histogram(name, help = '', buckets = DEFAULT_BUCKETS) {
      const sorted = [...buckets].sort((a, b) => a - b);
      const m = define(name, 'histogram', help, sorted);
      return Object.freeze({
        observe(labels = {}, value) {
          if (!Number.isFinite(value)) throw new RangeError('observations must be finite');
          const s = seriesFor(m, labels, () => ({ counts: new Array(m.buckets.length).fill(0), sum: 0, count: 0 }));
          for (let i = 0; i < m.buckets.length; i++) if (value <= m.buckets[i]) s.counts[i]++;
          s.sum += value;
          s.count++;
        },
      });
    },
    /** Plain-object snapshot of every metric and series. */
    snapshot() {
      const out = {};
      for (const [name, m] of metrics) {
        out[name] = {
          type: m.type,
          help: m.help,
          ...(m.buckets ? { buckets: [...m.buckets] } : {}),
          series: [...m.series.values()].map((s) =>
            m.type === 'histogram'
              ? { labels: s.labels, counts: [...s.counts], sum: s.sum, count: s.count }
              : { labels: s.labels, value: s.value },
          ),
        };
      }
      return out;
    },
    /** Prometheus text exposition format. */
    toPrometheus() {
      const lines = [];
      const fmt = (labels, extra = {}) => {
        const all = { ...labels, ...extra };
        const parts = Object.keys(all).map((k) => `${k}="${String(all[k]).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`);
        return parts.length ? `{${parts.join(',')}}` : '';
      };
      for (const [name, m] of metrics) {
        if (m.help) lines.push(`# HELP ${name} ${m.help.replace(/\n/g, ' ')}`);
        lines.push(`# TYPE ${name} ${m.type}`);
        for (const s of m.series.values()) {
          if (m.type === 'histogram') {
            m.buckets.forEach((b, i) => lines.push(`${name}_bucket${fmt(s.labels, { le: b })} ${s.counts[i]}`));
            lines.push(`${name}_bucket${fmt(s.labels, { le: '+Inf' })} ${s.count}`);
            lines.push(`${name}_sum${fmt(s.labels)} ${s.sum}`);
            lines.push(`${name}_count${fmt(s.labels)} ${s.count}`);
          } else {
            lines.push(`${name}${fmt(s.labels)} ${s.value}`);
          }
        }
      }
      return `${lines.join('\n')}\n`;
    },
  });
}
