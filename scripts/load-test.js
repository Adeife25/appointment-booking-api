#!/usr/bin/env node
/**
 * Dependency-free load test for the appointment-booking API.
 *
 * Usage:
 *   node scripts/load-test.js --url http://localhost:3001 --rps 40 --duration 15
 *   node scripts/load-test.js --url http://localhost:3001 --endpoint /api/v1/providers
 *
 * With no args it runs a mixed read mix against the public endpoints:
 * provider list, provider services, and the volatile slots endpoint.
 * No API instance is available to reach a known CUSTOMER/PROVIDER, so the
 * mixed mix stays on read-only routes. It will deliberately exercise the
 * browse rate limit (THROTTLE_PUBLIC_LIMIT=120/min) when rps * seconds
 * exceeds it, returning 429s.
 */

const BASE = process.env.BASE_URL || 'http://localhost:3001';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const value = process.argv[i + 1];
  return value === undefined ? fallback : value;
}

const RPS = parseInt(arg('--rps', '30'), 10);
const DURATION_S = parseInt(arg('--duration', '20'), 10);
let endpoints = parseEndpoints();

function parseEndpoints() {
  const raw = arg('--endpoint', '');
  if (raw) return [raw];
  return ['/api/v1/providers'];
}

const results = [];
let inflight = 0;

function log(line) {
  process.stdout.write(`\r${line.padEnd(60)}`);
}

function randomFromTo() {
  const today = new Date(new Date().toISOString().slice(0, 10));
  const to = new Date(today);
  to.setDate(to.getDate() + 7);
  const iso = (d) => d.toISOString().slice(0, 10);
  return `?from=${iso(today)}&to=${iso(to)}`;
}

async function buildSlotEndpoint() {
  try {
    const res = await fetch(`${BASE}/api/v1/providers`);
    const json = await res.json();
    const provider = json?.data?.items?.[0] ?? json?.data?.[0];
    if (!provider?.id) return null;
    const services = await fetch(
      `${BASE}/api/v1/providers/${provider.id}/services`,
    ).then((r) => r.json());
    const service = services?.data?.items?.[0] ?? services?.data?.[0];
    return service?.id
      ? `/api/v1/providers/${provider.id}/slots${randomFromTo()}`
      : `/api/v1/providers/${provider.id}/services`;
  } catch {
    return null;
  }
}

async function hit(path) {
  const started = Date.now();
  try {
    const res = await fetch(BASE + path);
    await res.arrayBuffer();
    results.push({ status: res.status, ms: Date.now() - started });
  } catch (err) {
    results.push({ status: 0, ms: Date.now() - started, error: String(err) });
  } finally {
    inflight -= 1;
  }
}

async function pump(it, done) {
  for (const path of it) {
    await hit(path);
  }
  done();
}

async function main() {
  const slot = await buildSlotEndpoint();
  if (slot) endpoints.push(slot);
  const servicesIdx = endpoints.length;
  if (slot) {
    endpoints.push(slot); // slots should dominate the mix for cache hits
  }

  const requestIds = [];
  const total = Math.floor(RPS * DURATION_S);
  for (let i = 0; i < total; i += 1) requestIds.push(i);

  const iterator = (async function* () {
    for (const i of requestIds) {
      const path =
        i % 4 === 0 && slot ? endpoints[servicesIdx] : endpoints[i % endpoints.length];
      inflight += 1;
      yield path;
    }
  })();

  const startedAt = Date.now();
  const done = new Promise((resolve) => {
    const workers = Array.from({ length: RPS }, () => pump(iterator, resolve));
  });
  const interval = setInterval(() => {
    const elapsed = (Date.now() - startedAt) / 1000;
    const doneCount = results.length;
    log(
      `sent ${doneCount}/${total} (rps=${(doneCount / (elapsed || 1)).toFixed(0)}) inflight=${inflight}`,
    );
  }, 250);

  await done;
  clearInterval(interval);
  log('');

  const ms = (status) => results.filter((r) => r.status === status).length;
  const latency = results
    .filter((r) => r.status !== 0)
    .map((r) => r.ms)
    .sort((a, b) => a - b);
  const p = (q) =>
    latency.length ? latency[Math.min(latency.length - 1, Math.floor((q / 100) * latency.length))] : 0;

  console.log('\n=== Load test results ===');
  console.log(`requests: ${results.length}`);
  console.log(
    `status: 2xx=${ms(200) + ms(201)} 429=${ms(429)} 4xx=${results.filter((r) => r.status >= 400 && r.status !== 429).length} errors=${ms(0)}`,
  );
  if (latency.length) {
    console.log(`latency: p50=${p(50)}ms p95=${p(95)}ms p99=${p(99)}ms max=${latency.at(-1)}ms`);
  } else {
    console.log('latency: no successful responses');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});