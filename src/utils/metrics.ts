/**
 * metrics.ts
 *
 * Centralized Prometheus metrics registry for the logistics dispatch service.
 * Import this module once at app startup to register all metrics.
 * Expose the /metrics endpoint in app.ts to let Prometheus scrape them.
 */

import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

// Single shared registry — avoids "metric already registered" errors in tests
export const metricsRegistry = new Registry();

// Collect Node.js default metrics (event loop lag, memory, GC, etc.)
collectDefaultMetrics({ register: metricsRegistry });

// ── Custom Counters ─────────────────────────────────────────────────────────

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests received',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

export const packagesCreatedTotal = new Counter({
  name: 'packages_created_total',
  help: 'Total number of packages created',
  labelNames: ['company_id'],
  registers: [metricsRegistry],
});

export const deliveriesTotal = new Counter({
  name: 'deliveries_total',
  help: 'Total number of packages marked as delivered',
  labelNames: ['company_id'],
  registers: [metricsRegistry],
});

export const packageStatusChangesTotal = new Counter({
  name: 'package_status_changes_total',
  help: 'Total number of package status transition events',
  labelNames: ['from_status', 'to_status'],
  registers: [metricsRegistry],
});

// ── Histograms ───────────────────────────────────────────────────────────────

export const httpRequestDurationMs = new Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [metricsRegistry],
});
