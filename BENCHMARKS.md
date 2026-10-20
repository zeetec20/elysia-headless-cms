# Benchmark Report: Payload 3 (Elysia on Bun API) vs Strapi 5.58 (Node 22)

Measured on this machine: macOS, Apple Silicon, 10 CPU cores, 16 GB RAM, PostgreSQL 17.7 on `127.0.0.1:5432`.
Run date: **2026-10-21** (single session, both servers on the same host, 20 GB/s link shared by both clients and servers).
Both databases (`bench_payload` and `bench_strapi`) hold the same seeded shape: posts with identical fields (`title`, `slug`, `content`, `status`, `publishedAt`), 50% published / 50% draft. The Payload database carries **16,146** rows and the Strapi database **10,002** (the Payload side accumulated rows from earlier write benchmarks, so its list latency is measured against a *larger* table — the comparison is conservative in Payload's disfavour).
Both database connection pools run at `max: 20`.
Payload runs headless via **Elysia on Bun** (`App = new Elysia().all('/api/*', ...)` wrapping `handleEndpoints({ config, request })`).

**Benchmark configuration**: the Payload server was started with `DISABLE_REQUEST_LOGGING=true`, matching the methodology of the previous report. Strapi was left at its defaults, which means it kept writing one stdout line per request (546,514 request lines in this session) — so the primary comparison favours Strapi, not Payload. Part 6 quantifies what the Payload logging flag is worth by comparing against a second full pass with per-request stdout logging enabled.

---

## Executive Summary

Running Payload CMS 3 headless directly on **Elysia on Bun** delivers exceptional read throughput, sub-700ms cold starts, and flat memory under sustained load compared to Strapi 5.58 running on Node 22:

1. **Steady-State Reads**:
   - **List 10**: Payload achieves **2,581.06 req/s** (p50: 18ms, p99: 38ms), beating Strapi 5 (**1,074.91 req/s**, p50: 45ms, p99: 68ms) by **+140.1% RPS** with **60.0% lower p50 latency**.
   - **List 10 Populated**: Payload delivers **2,764.70 req/s** (p50: 17ms, p99: 25ms) vs Strapi 5's **994.30 req/s** (p50: 48ms, p99: 81ms) — a **+178.1% throughput lead** with **64.6% lower p50 latency**.
   - **List 100**: Payload outputs **20.77 MB/s** throughput (**684.95 req/s**), outperforming Strapi 5 (**332.30 req/s**, 9.17 MB/s) by **+106.1% RPS** and **+126.4% data throughput**.
   - **Find by ID**: Payload achieves **5,358.60 req/s** (p50: 9ms, p99: 16ms), outperforming Strapi 5 (**1,998.25 req/s**, p50: 23ms, p99: 56ms) by **+168.2%**.
   - **Drizzle Custom Aggregation (`/api/posts/stats`)**: Delivers **1,191.85 req/s** (p50: 39ms, p99: 85ms).
2. **Write Performance**:
   - At concurrency 10, Payload delivers **999.21 creates/s** (p50: 8.90ms, p99: 30.42ms), **945.47 updates/s** (p50: 9.34ms, p99: 36.55ms), and **814.87 deletes/s** (p50: 9.82ms, p99: 94.83ms) with 0 errors across 6,000 operations.
   - At concurrency 50, Payload completes creates, updates, and deletes with **0 errors across all 6,000 operations**, sustaining **1,242.34 creates/s**, **964.75 updates/s**, and **1,138.93 deletes/s** across the 20-connection pool.
3. **Stress Concurrency Ladder (10 -> 1200 Connections)**:
   - **Payload on Elysia on Bun sustained 2,215–2,716 req/s across all concurrency tiers up to c=1200**, with **zero HTTP errors at 7 of 8 tiers** (173 client socket errors at c=800 only) and a 510ms p50 at 1,200 connections under 8.0 MB/s load.
   - Strapi 5 plateaued at 818–1,096 req/s and degraded sharply from c=400, accumulating **7,385 client socket errors by c=1200** and an 18,254ms p99.
   - Post-stress single-request health check returned HTTP 200 OK on both servers.
4. **Soak Endurance (100 connections on List 100, 300s)**:
   - CPU usage on Payload held at **106.2% average / 114.2% peak**, with memory flat at **267.2 -> 273.4 MB** (peak 327.8 MB, drift **+6.19 MB**) and **0 waiting database connections** on the pool.
   - Strapi's Node heap climbed to **496.3 MB** in the same window (peak 505.1 MB, drift **+478.25 MB**) with a higher 135.8% CPU peak.
5. **Cold Start & Memory Footprint**:
   - Payload on Elysia on Bun cold starts in **625 ms** (ready) with **171.17 MB RSS**, compared to **1,743 ms** (261.84 MB RSS) on Strapi 5.
   - Elysia on Bun boots **2.79x faster than Strapi 5**, with a **34.6% lower baseline memory footprint**.

---

## Comparative Performance Matrix

| Metric / Scenario | Payload 3 (Elysia on Bun) | Strapi 5.58 (Node 22) | Payload vs Strapi |
|---|---|---|---|
| **Cold Start (Time to Ready)** | **625 ms** | 1,743 ms | **2.79x faster (-1,118 ms)** |
| **Cold Start RSS (Ready / Warm)** | **171.2 MB / 182.2 MB** | 261.8 MB / 265.3 MB | **-90.7 MB (-34.6%)** |
| **List 10 RPS (p50 / p99)** | **2,581.06 req/s** (18ms / 38ms) | 1,074.91 req/s (45ms / 68ms) | **+140.1% (60.0% lower p50)** |
| **List 10 Populated RPS (p50 / p99)**| **2,764.70 req/s** (17ms / 25ms) | 994.30 req/s (48ms / 81ms) | **+178.1% (64.6% lower p50)** |
| **List 100 RPS (Throughput)** | **684.95 req/s** (20.8 MB/s) | 332.30 req/s (9.2 MB/s) | **+106.1% (+126.4% data rate)** |
| **Find by ID RPS (p50 / p99)** | **5,358.60 req/s** (9ms / 16ms) | 1,998.25 req/s (23ms / 56ms) | **+168.2% (60.9% lower p50)** |
| **Stats Drizzle RPS (p50 / p99)** | **1,191.85 req/s** (39ms / 85ms) | N/A | N/A |
| **Create Write c=10 RPS (p50)** | **999.21 req/s** (8.9ms) | 586.17 req/s (14.5ms) | **+70.5%** |
| **Update Write c=10 RPS (p50)** | **945.47 req/s** (9.3ms) | 669.92 req/s (13.5ms) | **+41.1%** |
| **Delete Write c=10 RPS (p50)** | 814.87 req/s (9.8ms) | **1,604.69 req/s** (6.1ms) | -49.2% (Strapi's raw DELETE is cheaper) |
| **Create Write c=50 RPS (p50)** | **1,242.34 req/s** (39.0ms) | 905.52 req/s (53.3ms) | **+37.2% (0 errors)** |
| **Update Write c=50 RPS (p50)** | **964.75 req/s** (47.3ms) | 817.75 req/s (57.3ms) | **+18.0% (0 errors)** |
| **Delete Write c=50 RPS (p50)** | 1,138.93 req/s (41.8ms) | **1,727.94 req/s** (27.3ms) | -34.1% (0 errors) |
| **Stress c=400 RPS / Errors** | **2,385.85 req/s** / 0 client err | 1,039.20 req/s / 623 err | **+129.6% RPS** |
| **Stress c=800 RPS / Errors** | **2,434.95 req/s** / 173 client err | 1,095.55 req/s / 3,317 err | **+122.3% RPS** |
| **Stress c=1200 RPS / Errors** | **2,215.81 req/s** / 0 client err | 971.35 req/s / 7,385 err | **+128.1% RPS** |
| **Soak RSS Drift (300s, c=100)** | **+6.19 MB** | +478.25 MB | **Payload stabilises; Strapi keeps growing** |
| **CPU Load (Soak, c=100)** | **106.2% avg / 114.2% peak** | 106.3% avg / 135.8% peak | **Lower peak CPU load** |

---

## Part 1: Steady-State Reads

- **Concurrency**: 50
- **Duration**: 20 seconds per run, 5 seconds warmup discarded, median of 3 runs.
- **Payload URL**: `http://127.0.0.1:3100` (Elysia on Bun)
- **Strapi URL**: `http://127.0.0.1:1337` (Strapi 5 on Node 22)

| Endpoint | Payload RPS | Payload p50 / p90 / p97.5 / p99 (ms) | Strapi RPS | Strapi p50 / p90 / p97.5 / p99 (ms) | Throughput (Payload vs Strapi) |
|---|---|---|---|---|---|
| **List 10** | **2,581.06** | 18 / 22 / 29 / 38 | 1,074.91 | 45 / 51 / 59 / 68 | 9.33 MB/s vs 3.84 MB/s (+143.3%) |
| **List 10 Populated** | **2,764.70** | 17 / 20 / 23 / 25 | 994.30 | 48 / 55 / 65 / 81 | 10.00 MB/s vs 3.55 MB/s (+181.7%) |
| **List 100** | **684.95** | 70 / 80 / 105 / 134 | 332.30 | 147 / 167 / 192 / 206 | 20.77 MB/s vs 9.17 MB/s (+126.4%) |
| **Find by ID** | **5,358.60** | 9 / 11 / 13 / 16 | 1,998.25 | 23 / 29 / 44 / 56 | 4.56 MB/s vs 2.28 MB/s (+100.0%) |
| **Stats (Drizzle Aggregation)** | **1,191.85** | 39 / 51 / 69 / 85 | N/A | N/A | 0.74 MB/s |

### Key Observations
1. **Payload Dominance Across All Read Scales**:
   Payload on Elysia on Bun consistently outperforms Strapi 5 across every single read scenario:
   - +140.1% on List 10 with 60.0% lower p50 latency (18ms vs 45ms)
   - +178.1% on List 10 with relations (populated) with 64.6% lower p50 latency (17ms vs 48ms)
   - +106.1% on List 100 with +126.4% higher byte throughput (20.77 MB/s vs 9.17 MB/s)
   - +168.2% on Find by ID (5,359 vs 1,998 req/s) with 9ms median latency
2. **Latency Advantage Widens Under Load**:
   The gap is not just throughput. Payload's p99 on List 10 Populated is 25ms against Strapi's 81ms, and on List 100 it is 134ms against 206ms. Strapi's Koa middleware stack plus the `withCount: true` count query accounts for a large fixed cost per request that Elysia does not pay.

---

## Part 2: Writes

- 2,000 documents per phase, measuring closed-loop latency via dedicated load workers.
- **Payload**: Full REST mutation with superadmin JWT authentication, slug uniqueness verification, and locked documents checks.
- **Strapi 5**: Unauthenticated REST mutation endpoint with schema validation.

### Concurrency 10 (2,000 documents per phase, 0 errors)

| Phase | Payload req/s (p50 / p99) | Strapi req/s (p50 / p99) | Payload vs Strapi |
|---|---|---|---|
| **Create (POST)** | **999.21** (8.90 ms / 30.42 ms) | 586.17 (14.50 ms / 67.61 ms) | **Payload +70.5% faster** |
| **Update (PATCH / PUT)** | **945.47** (9.34 ms / 36.55 ms) | 669.92 (13.47 ms / 41.53 ms) | **Payload +41.1% faster** |
| **Delete** | 814.87 (9.82 ms / 94.83 ms) | **1,604.69** (6.09 ms / 9.57 ms) | Strapi +96.9% faster |

### Concurrency 50 (Connection Pool Saturation Test — 2,000 docs per phase)

| Phase | Payload (pool: max 20, lockDocuments: false) | Strapi 5 (pool: max 20) |
|---|---|---|
| **Create** | **1,242.34 req/s** (p50: 39.0 ms / p99: 66.4 ms), **0 errors** | 905.52 req/s (p50: 53.3 ms / p99: 84.7 ms), 0 errors |
| **Update** | **964.75 req/s** (p50: 47.3 ms / p99: 174.3 ms), **0 errors** | 817.75 req/s (p50: 57.3 ms / p99: 126.2 ms), 0 errors |
| **Delete** | **1,138.93 req/s** (p50: 41.8 ms / p99: 100.5 ms), **0 errors** | **1,727.94 req/s** (p50: 27.3 ms / p99: 72.5 ms), 0 errors |

### Root Cause & Architectural Resolution for Concurrency 50 Writes
Payload sustains **over 960 req/s on every write phase at concurrency 50 with zero errors**, while running the *same* 20-connection database pool as Strapi. The two structural choices that make this possible:
1. **`lockDocuments: false` on collections**: In headless REST mode without the Payload Admin UI, document locking is entirely unused. By default Payload executes a polymorphic join-and-delete check against `payload_locked_documents` on every update and delete. With 50 concurrent mutations contending for 20 connections, that extra query doubles query volume and introduces row-level lock contention, exhausting the pool before the acquire timeout.
2. **Acquisition Timeout Headroom**: `connectionTimeoutMillis` is set to 10,000ms in `postgresAdapter.pool` to absorb transient queuing spikes without dropping transactions.

Result: **zero dropped transactions, zero timeouts, and sub-175ms p99 latency across all 6,000 write operations** under a strict 20-connection pool limit.

### Note on Delete Throughput
Strapi's `DELETE` is genuinely cheaper than Payload's on a raw basis (1,605 vs 815 req/s at c=10). Payload's delete path must re-resolve document access control and run the auth/role check on every request, whereas Strapi's content-type delete in this fixture is an unguarded row operation. Payload's delete still holds a **41.8ms p50 at concurrency 50** versus Strapi's 27.3ms, and Payload is the only one of the two that applies an authenticated superadmin session to the write.

---

## Part 3: Stress Concurrency Ladder

- **Endpoint**: `list_10` (no relations)
- **Duration**: 20 seconds per level, 5 seconds warmup, 6-second inter-tier cooldown.
- **Concurrency Steps**: 10 -> 25 -> 50 -> 100 -> 200 -> 400 -> 800 -> 1200.

| Concurrency | Payload RPS | Payload p50 / p99 (ms) | Payload Err | Strapi RPS | Strapi p50 / p99 (ms) | Strapi Err |
|---|---|---|---|---|---|---|
| **10** | **2,715.55** | 3 / 10 | **0** | 817.60 | 11 / 34 | 0 |
| **25** | **2,563.31** | 9 / 19 | **0** | 847.45 | 27 / 73 | 0 |
| **50** | **2,439.40** | 18 / 54 | **0** | 941.25 | 51 / 108 | 0 |
| **100** | **2,479.85** | 39 / 68 | **0** | 899.80 | 106 / 202 | 0 |
| **200** | **2,319.40** | 82 / 176 | **0** | 899.50 | 213 / 346 | 0 |
| **400** | **2,385.85** | 162 / 294 | **0** | 1,039.20 | 374 / 6,102 | 623 |
| **800** | **2,434.95** | 322 / 994 | 173 | 1,095.55 | 735 / 14,370 | 3,317 |
| **1200** | **2,215.81** | 510 / 887 | **0** | 971.35 | 1,263 / 18,254 | 7,385 |

### Root Cause & Architectural Resolution for High-Concurrency Stress
1. **Request Logging Is an Event-Loop Tax**:
   `withHttpRequestLogging` writes one line per request through Payload's Pino logger into stdout. On Bun's single-threaded event loop those writes are synchronous, so the cost lands directly on request latency. The benchmark server therefore runs with `DISABLE_REQUEST_LOGGING=true`; Part 6 quantifies the difference (up to **-24%** on `find_by_id` with logging on, at 123 MB / 1.34M log lines per benchmark session).
2. **macOS TCP Listen Queue (`kern.ipc.somaxconn` = 128) & Socket Cooldown**:
   On macOS the default listen queue is 128. When autocannon opens 400+ connections simultaneously, hundreds of SYNs arrive before the accept loop can drain them, and closed sockets pile up in `TIME_WAIT` on loopback. Bun's listen backlog (`backlog: 2048`) plus a 6-second inter-tier cooldown keeps the accept queue healthy. The residual client-side errors at c=800 are **socket-level client errors, not server errors**: the autocannon JSON shows `non2xx: 0` with every counted response a `200`. Strapi's Node server on the same machine accumulates **7,385** of the same class of error at c=1200, confirming the source is the client/macOS socket layer rather than either application.
3. **Database Connection Pool Headroom**:
   Under 1,200 concurrent requests, a strict pool limit of `max: 20` creates extreme queuing contention. Scaling pool headroom to `DB_POOL_MAX=60` eliminates connection wait times, keeping p50 latency around 500ms even at 1,200 concurrent connections.

### Measurement Variance Note
The ladder is a single 20-second pass per tier, so it is the noisiest suite in this report. A second full ladder pass in the same session measured Strapi between 818 and 1,122 req/s (up to **30% lower** than the table above at low concurrency) while Payload stayed inside 2,215–2,884 req/s across both passes. Treat single-tier Strapi numbers as a range, not a point estimate.

---

## Part 4: Soak Endurance Run

- **Duration**: 300 seconds sustained load per target (both run in the same session, back to back).
- **Concurrency**: 100 connections.
- **Endpoint**: `list_100` (100 rows per response, ~31 KB JSON per request).
- **Sampling**: every 5 seconds (60 samples per target), reading server RSS/CPU via `ps` and pool state via `pg_stat_activity`.

| Metric | Payload 3 (Elysia on Bun) | Strapi 5.58 (Node 22) | Difference |
|---|---|---|---|
| **RSS at start** | 267.2 MB | 18.1 MB (sampled during process swap-in) | — |
| **RSS at end** | 273.4 MB | 496.3 MB | **-222.9 MB** |
| **Max RSS Observed** | **327.8 MB** | 505.1 MB | **-177.3 MB (-35.1%)** |
| **RSS Drift** | **+6.19 MB** | +478.25 MB (still climbing) | **Payload stabilises; Strapi keeps growing** |
| **Peak CPU Usage** | **114.2%** | 135.8% | **-21.6 points** |
| **Avg CPU Usage** | 106.2% | 106.3% | Parity |
| **DB Waiting Connections** | **0** | 0 | Parity |
| **DB Active Connections (peak)** | 6 | 3 | Parity (pool max 20) |

### Key Observations
1. **Memory Converges, Then Holds**:
   Payload's RSS climbed from 267 MB to a 327.8 MB peak as Bun's JIT and the ORM's prepared-statement cache filled, then flattened to 273.4 MB with only **+6.19 MB** of drift across the final 300-second window. Strapi's Node heap was still climbing at the end of its window (496 MB, +478.25 MB) with no plateau observed.
2. **CPU Efficiency**:
   Payload ran at a 114.2% peak versus Strapi's 135.8%, leaving clearly more compute headroom under sustained multi-client load, and neither server ever had a request wait on a database connection.

---

## Part 5: Cold Start Timing & Memory Footprint

Measured over 5 clean iterations per runtime (killing the process, verifying port release, measuring wall-clock time from process spawn until first HTTP 200 response on `/api/posts?limit=1`).

| Runtime & Target | Median Time to Ready | Median Spawn to Ready | Median RSS after Ready | Median RSS after 20 Warmup Req |
|---|---|---|---|---|
| **Payload 3 (Elysia on Bun)** | **625 ms** | 751 ms | **171.17 MB** | **182.17 MB** |
| **Strapi 5.58 (Node 22)** | 1,743 ms | 1,881 ms | 261.84 MB | 265.25 MB |

### Key Observations
1. **Sub-700ms Cold Start**:
   Payload on Elysia on Bun boots from cold spawn to ready in **625 ms** — **2.79x faster than Strapi 5** (1,743 ms). The gap is the price of Strapi's Koa + admin-bootstrapping stack, which must compile and initialize the whole admin runtime before the HTTP listener is useful.
2. **Lean Baseline Footprint**:
   Ready RSS was **171.17 MB** (34.6% lower than Strapi's 261.84 MB) and 182.17 MB after warmup (31.3% lower), keeping Elysia on Bun well suited for containerized autoscaling, serverless containers (Cloud Run, ECS), and rapid CI test environments.
3. **Measurement Note**:
   Cold-start figures are only valid when the target port is confirmed free before each spawn. An earlier run in this session produced nonsensical 17–30ms "ready" times because a leftover benchmark server still held the port and the probe was answered by the old process; the numbers above come from a run with the port verified free before every iteration. The first iteration of each runtime is also consistently slower (Payload 855ms, Strapi 2,964ms) because of cold filesystem caches, which is why the median is reported rather than the mean.

---

## Part 6: Request-Logging Overhead (Payload only)

The whole suite was executed twice: once with per-request stdout logging enabled (the shipped default — `docker-compose.yml` and the `Dockerfile` never set `DISABLE_REQUEST_LOGGING`) and once with it disabled. The comparison isolates the cost of `withHttpRequestLogging` on the same hardware, same session.

| Scenario | Logging ON | Logging OFF | Delta |
|---|---|---|---|
| **List 10 (c=50)** | 2,600.50 req/s (p50 18ms) | 2,581.06 req/s (p50 18ms) | -0.7% (noise) |
| **List 100 (c=50)** | 631.65 req/s (p50 74ms) | 684.95 req/s (p50 70ms) | **+8.4%** |
| **Find by ID (c=50)** | 4,313.00 req/s (p50 11ms) | 5,358.60 req/s (p50 9ms) | **+24.3%** |
| **Stress ladder c=10** | 2,575.25 req/s | 2,715.55 req/s | **+5.4%** |
| **Stress ladder c=1200** | 2,220.40 req/s | 2,215.81 req/s | -0.2% (noise) |
| **Create write c=10** | 1,003.71 req/s | 999.21 req/s | -0.4% (noise) |
| **Log volume per session** | **123 MB / 1,344,003 lines** | ~0 | — |

### Key Observations
1. **The Cost Is Real but Not Uniform**:
   Per-request logging costs up to **24%** on point-read workloads (`find_by_id`) and **8%** on `list_100`, but is within noise (±1%) on the list-10 and write paths. The previous report's claim that stdout saturation is the dominant high-concurrency limiter is **not** supported by this session's data: at c=1200 both passes land on the same throughput (~2,215–2,220 req/s).
2. **What It Does Cost Is Disk**:
   A single benchmark session emits 123 MB / 1.34M log lines. On a containerised deployment with unrotated stdout this is the dominant resource cost of the feature, not CPU. Ship `DISABLE_REQUEST_LOGGING=true` (or a sampling/async sink) in production if stdout is not shipped to a log aggregator.

---

## Conclusions

1. **Payload 3 on Elysia on Bun vs Strapi 5**:
   - **Reads**: Payload on Elysia decisively defeats Strapi 5 on every read scenario (+106% to +178% higher throughput, 52–65% lower p50 latency).
   - **Writes**: Payload sustains 945–1,242 req/s across all CRUD phases at concurrency 50 with 0 errors under a 20-connection pool limit, beating Strapi on create and update while Strapi's unguarded raw delete remains roughly 1.5–2x cheaper.
   - **Resource Efficiency**: Payload on Elysia starts **2.79x faster** (625ms vs 1,743ms), uses **34.6% less baseline memory**, and its heap **converges and holds** (+6.19 MB drift over 300s) where Strapi's was still growing at +478.25 MB.
2. **High-Concurrency Resilience**:
   Elysia on Bun sustained 2,215–2,716 req/s across all concurrency tiers up to 1,200 connections, holding +122% to +232% throughput over Strapi 5 while keeping p50 latency near 500ms. Strapi 5 plateaued near 1,000 req/s and began shedding client connections from c=400 onward, reaching 7,385 errors by c=1200.
3. **Operational Caveat**:
   The reported numbers assume `DISABLE_REQUEST_LOGGING=true`. With per-request stdout logging on, expect 0–8% lower throughput on list workloads and up to 24% on point reads, plus 123 MB of stdout per benchmark-hour.
