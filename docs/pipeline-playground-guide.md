# Pipeline Playground Demo Guide

**For non-technical presentation panels**

This guide explains what the Pipeline Playground is, how to use it, and how to demo it effectively to a panel that may not be familiar with microservices.

---

## Quick Summary

Pipeline Playground is an interactive web interface that lets you simulate "what-if" scenarios in a microservice system. You can see what happens if a service fails or if you scale a service up/down — before making changes in production. It shows impact (blast radius), affected services, latency changes, and recommendations, all visualized step-by-step.

**Key insight:** It's like a flight simulator for microservices — practice scenarios safely without crashing the real system.

---

## What is Pipeline Playground?

A **microservice** is a small, independent program that does one job (e.g., "show product catalog" or "process checkout"). In modern systems, dozens or hundreds of microservices talk to each other to complete user requests.

**The problem:** If one service fails or slows down, it can create a cascade effect — other services that depend on it also fail or slow down. It's hard to predict the full impact without testing in production (which is risky).

**Pipeline Playground solves this** by letting you:
1. Pick a service (e.g., "frontend" or "cartservice")
2. Choose a scenario:
   - **Failure**: What happens if this service crashes?
   - **Scale**: What happens if we change the number of running copies (pods)?
3. See a **step-by-step simulation** of how the system reacts
4. Get **recommendations** (e.g., "add retry logic", "scale up dependency X")

**Data source:** The tool gets real-time information about service connections (who calls whom) and traffic patterns from a backend system called **Graph Engine**.

---

## Why We Built This

### Problem Statement
- Operators need to understand **blast radius** (how many services break if X fails)
- Teams want to test **scaling decisions** (if we add more pods, does latency improve?)
- Traditional tools show metrics (graphs, logs) but don't predict impact

### Our Solution
- **Predictive simulation** using real service topology and traffic data
- **Visual pipeline trace** showing what happens at each step
- **Operator auditability** (every run is tagged with request ID, timestamp, data source)
- **Demo mode** (stop at any stage to explain what's happening)

### Use Cases
1. **Pre-incident planning**: "If service X fails, which alarms should fire first?"
2. **Scaling decisions**: "Will adding 2 more pods to cartservice reduce latency by 20%?"
3. **Teaching**: Show junior engineers how microservices are connected

---

## Concepts Explained (Plain English)

### Microservice Dependency Graph
Think of it as a map showing which services call which other services. Example:
```
User → Frontend → Cart Service → Product Catalog
                 ↘ Checkout Service
```
If Frontend fails, User requests fail. If Cart Service fails, Frontend can't show cart data.

### Simulation Types

#### Failure Simulation
- **Input**: Pick a service (e.g., "default:frontend"), set max depth (how many connection levels away to check — depth 2 = target + direct neighbors + their neighbors)
- **Output**: 
  - List of **affected callers** (upstream services that send requests TO the target — they lose access when target fails)
  - List of **affected downstream** (services that receive requests FROM the target — they lose incoming traffic when target fails)
  - **Unreachable services** (services completely cut off with no alternate path)
  - **Total lost traffic** (requests per second lost across all affected connections)

#### Scale Simulation
- **Input**: Pick a service, current pods (e.g., 3), new pods (e.g., 5), latency metric (p50/p95/p99)
- **Output**:
  - **Latency estimate** (before/after/delta in milliseconds — how much faster or slower requests become)
  - **Affected callers** (upstream services that send requests to the target — they experience the latency change)
  - **Scaling direction** (up = more pods, down = fewer pods, same = no change)
  - **Recommendations** (e.g., "diminishing returns after 10 pods")

### Pipeline Trace (Stages + Timings)
The backend runs the simulation in **8 stages**:
1. **Scenario Parse**: Validate inputs
2. **Staleness Check**: Confirm graph data is fresh
3. **Fetch Neighborhood**: Get relevant services (k-hop subgraph = services within k connection levels, e.g., depth 2 = target + neighbors + neighbors-of-neighbors)
4. **Build Snapshot**: Identify target service
5. **Apply Scaling Model** (scale only): Calculate new latency
6. **Path Analysis**: Find critical paths (high-traffic routes)
7. **Compute Impact**: Calculate blast radius or latency delta
8. **Recommendations**: Generate actionable advice

Each stage reports timing (in milliseconds). You can see:
- Which stage took longest (performance bottleneck)
- Warnings (e.g., "incomplete data for path X")

### Confidence + Freshness (Trust Indicators)

#### Confidence
- **High**: Graph data complete, all dependencies known
- **Medium**: Some missing data (e.g., traffic metrics for 1-2 edges)
- **Low**: Stale graph or incomplete topology

#### Freshness
- **Fresh** (green): Graph data updated <5 minutes ago
- **Stale** (yellow): Graph data >5 minutes old
- Displayed as: "Fresh (45s ago)" or "Stale (600s ago)"

**Why it matters:** Stale data means predictions may not match current reality.

---

## How to Use It

### Mode Selection: Mock vs Live

At the top of the UI, you see two modes:

#### Mock Mode (Default)
- Uses **pre-recorded example data** (no backend required)
- Service ID: pre-filled with `default:productcatalog`
- Good for: Demos, testing UI features, offline use
- Limitations: Results don't change, always show same mock data

#### Live Mode
- Calls **real backend** (predictive-analysis-engine → graph-engine)
- Service ID: **dropdown autocomplete** with available services
- Shows **service count** (e.g., "12 services available") and **staleness indicator**
- Good for: Real analysis, production-like scenarios
- Requirements: Backend must be running and connected to graph engine

**How to switch:** Click the "Mock" or "Live" button in the top-left corner.

---

### Step-by-Step: Mock Mode Walkthrough

**Goal:** Run a failure simulation on `default:productcatalog` without needing a backend.

1. **Open Pipeline Playground** (navigate to `/pipeline` in the web app)
2. **Confirm mode is "Mock"** (blue "Mock" button should be highlighted)
3. **Scenario Configuration** panel (left side):
   - **Scenario Type**: Select "Failure" (dropdown)
   - **Service ID**: Pre-filled with `default:productcatalog` (you can change it, but mock data won't change)
   - **Max Depth**: Set to `2` (slider: 1-3) — this means analyze the target service + services 1 hop away + services 2 hops away
   - Click **"Run Simulation"** (blue button)

4. **Watch the Pipeline Trace** (center panel):
   - Stages appear one-by-one with checkmarks (✓)
   - Each shows timing (e.g., "Scenario Parse: 12ms")
   - Wait ~3 seconds for all 8 stages to complete

5. **Review Results** (right panels):
   - **Operator Summary**: Shows confidence (high), freshness (fresh/stale), request ID
   - **Affected Callers**: Table showing upstream services (services that call the target) with lost traffic (RPS), error rate
   - **Recommendations**: Action items like "add retry logic"

6. **Playback Controls** (below timeline):
   - Click **"Play"** to replay stages one-by-one
   - Click **"Next"** to step through manually
   - Click **"Reset"** to start over

**Expected result:** You see a complete failure analysis with mock data showing ~150 RPS lost traffic.

---

### Step-by-Step: Live Mode Walkthrough

**Goal:** Run a scale simulation on a real service with live data.

**Prerequisites:**
- Predictive engine backend running (default: `http://localhost:5000`)
- Graph engine backend running (provides service topology)
- At least 1 service in the graph

**Steps:**

1. **Switch to Live mode**: Click the "Live" button (top-left)
   - Health indicator appears: "checking…" → "connected" (green) or "unreachable" (red)
   - If unreachable: backend is down or wrong URL

2. **Service Discovery** (automatic):
   - When Live mode activates, UI fetches service list from backend
   - Watch label: "Loading services..." → "12 services available (fresh)"
   - If stale: "(stale)" appears in yellow

3. **Choose a Service**:
   - Click inside **Service ID** input
   - Dropdown shows all discovered services (e.g., "default:frontend", "default:cartservice")
   - Start typing to filter (e.g., type "cart")
   - Select service or type manually in format: `namespace:name`
   - **Format requirement**: Must be `namespace:name` (e.g., `default:frontend`)
   - If service not in graph: Yellow warning appears: "Service not found in graph. Select from dropdown."

4. **Configure Scenario**:
   - **Scenario Type**: Select "Scale"
   - **Service ID**: (from dropdown, e.g., `default:cartservice`)
   - **Max Depth**: 2 (analyze target + 2 levels of connected services)
   - **Current Pods**: 3
   - **New Pods**: 5
   - **Latency Metric**: p95 (dropdown: p50/p95/p99)

5. **Run Simulation**:
   - Click **"Run Simulation"**
   - Button changes to "Running..." (disabled)
   - Timeline populates with stages (takes 1-5 seconds)

6. **Review Live Results**:
   - **Operator Summary**: 
     - Badge: "🚀 Live" (green)
     - Timestamp: "15s ago (2026-01-04 10:45:22)"
     - Confidence: high/medium/low
     - Freshness: Fresh (30s ago) or Stale (600s ago)
   - **Latency Estimate**:
     - Baseline: 120.5 ms
     - Projected: 85.2 ms
     - Delta: -35.3 ms (green = improvement)
   - **Affected Callers**: Shows upstream services (services that call the target) with latency delta (how much their response time changes)
   - **Recommendations**: e.g., "Scaling will improve latency by ~29%"

7. **Proof of Source** (bottom of Operator Summary):
   - Request ID: `abc123-def456-...` (click "Copy" to copy to clipboard)
   - Generated: ISO timestamp
   - Source badge: "🚀 Live" vs "📋 Mock"

**Common Live Mode Issues:**

- **"Service not found"**: You typed a service not in the graph. Use the dropdown to pick a valid service.
- **503 error**: Graph Engine is down or unreachable. Check backend logs.
- **Stale graph**: Data >5 minutes old. Results may be inaccurate. Check if metrics collection is working.
- **ERR_NETWORK**: Predictive engine backend is down. Verify it's running on port 5000.

---

## Demo Mode (Presentation Features)

### Purpose
Stop the pipeline at a specific stage to explain what's happening without showing all results. Useful for teaching or panel demos.

### How to Use Demo Mode

1. **Open Stage Controls** panel (left side, below Scenario Configuration)
2. **Enable/Disable Stages**:
   - Each stage has a checkbox (e.g., "✓ Scenario Parse")
   - Uncheck stages you want to skip
   - Disabled stages show status "skipped" (yellow)
   - Some stages are scenario-specific (e.g., "Apply Scaling Model" only for scale)

3. **Stop at Stage** (dropdown):
   - Select: "Stop after: Path Analysis" (for example)
   - When you run simulation, it will stop after that stage completes
   - Results panels show: "⏸ Demo Mode: Recommendations Not Available"
   - Message explains: "Pipeline stopped before 'Recommendations' stage completed."

4. **Example Use Case**:
   - Disable "Recommendations" stage → Skip recommendation logic
   - Stop at "Compute Impact" → Show impact results, hide paths/recommendations
   - Good for: "Let me walk you through step 1-5, we'll cover 6-8 later"

### Visual Indicators
- **Timeline**: Shows "⏸ Stopped at stage 5" badge
- **Results**: Yellow box: "⏸ Demo Mode: Recommendations Not Available"
- **Playback**: Only plays enabled stages

---

## How to Demo to a Panel (3-5 Minute Script)

### Pre-Demo Setup Checklist

**Before the panel arrives:**

1. **Backend Services Running**:
   ```bash
   # Terminal 1: Start predictive engine
   cd predictive-analysis-engine
   npm start
   # Should see: "Server started on port 5000"
   
   # Terminal 2: Start graph engine (if using Live mode)
   cd service-graph-engine
   npm start
   # Should see: "Graph Engine listening on port 8080"
   
   # Terminal 3: Start dashboard UI
   cd dashboard-ui
   npm run dev
   # Should see: "Local: http://localhost:5173"
   ```

2. **Verify Health**:
   - Open browser: `http://localhost:5173/pipeline`
   - Switch to Live mode
   - Confirm: "connected" indicator (green)
   - Confirm: "X services available" appears (not "Loading..." or error)

3. **Pre-select Scenario** (optional):
   - Choose a service with known interesting results (e.g., `default:frontend`)
   - Set to Failure, Max Depth 2
   - DO NOT RUN YET (save for live demo)

4. **Close unnecessary browser tabs** (clean demo environment)

---

### Demo Script (Panel Presentation)

**Duration:** 3-5 minutes  
**Mode:** Live (if backend available), otherwise Mock  
**Scenario:** Failure simulation on `default:frontend`

---

#### **Opening (30 seconds)**

> "Good morning/afternoon. Today I'll show you **Pipeline Playground**, a tool we built to predict the impact of failures and scaling changes in microservice systems **before they happen in production**."

> "The problem we're solving: in a system with dozens of interconnected services, it's hard to know — if service X fails, which other services break? How much traffic is lost? What should we do?"

> "This tool answers those questions in under 5 seconds, using real topology and traffic data."

**Action:** Show the UI, point to the three main panels: Configuration (left), Timeline (center), Results (right).

---

#### **Demo Part 1: Pick a Service (1 minute)**

> "Let's simulate a failure. First, I'll pick a service. I'm in **Live mode**, which means the tool is talking to our live graph engine that monitors service connections in real-time."

**Action:**
- Click Service ID input
- Show dropdown: "You can see we have [X] services available. These are discovered automatically from the system."
- Select `default:frontend` (or any high-traffic service)

> "I'm choosing **frontend** because it's a critical service — if it fails, user-facing requests fail immediately."

**Action:**
- Show Max Depth slider: "I'll set max depth to **2**, meaning we'll analyze not just frontend, but also services 1 hop away (direct neighbors) and 2 hops away (neighbors of neighbors)."
- Scenario Type: Confirm "Failure"

---

#### **Demo Part 2: Run the Simulation (1 minute)**

> "Now I'll click **Run Simulation**. Watch the center panel — you'll see the backend process this request in 8 stages, each taking a few hundred milliseconds."

**Action:**
- Click "Run Simulation"
- Point to timeline as stages complete:
  1. "**Scenario Parse**: Validates the input"
  2. "**Staleness Check**: Confirms graph data is fresh — notice it says 'Fresh (30s ago)'"
  3. "**Fetch Neighborhood**: Grabs the relevant services from the graph (not the entire graph, just the 2-hop neighborhood)"
  4. ... (stages populate quickly)
  5. "All 8 stages complete in under 2 seconds."

> "Notice each stage shows timing. If a stage takes 500ms, that's a performance bottleneck we can optimize later."

---

#### **Demo Part 3: Review Impact (1.5 minutes)**

> "Now let's look at the results. The **Operator Summary** at the top shows:"

**Action:** Point to Operator Summary panel:
- **Source badge**: "🚀 Live — this is real data, not mock"
- **Confidence**: "High — graph data is complete"
- **Freshness**: "Fresh (45s ago) — data is recent"
- **Request ID**: "Every run gets a unique ID for auditability. I can copy this and trace it in backend logs."

> "Scroll down — here's the **impact**:"

**Action:** Point to Affected Callers table:
- "If frontend fails, **3 upstream services** (services that send requests TO frontend) lose access. For example, loadgenerator loses 150 RPS (requests per second)."
- "We also see **affected downstream services** — services that frontend sends requests TO. If frontend goes down, those downstream services stop receiving traffic from this path."

> "At the bottom, **recommendations**:"

**Action:** Scroll to Recommendations panel:
- Read one: "Add retry logic for high-traffic callers"
- "This is actionable — our system is telling the operator what to do next."

---

#### **Demo Part 4: Playback Feature (30 seconds, optional)**

> "One more thing — we built a **playback mode** for teaching."

**Action:**
- Click "Reset" button (below timeline)
- Click "Play" button
- Watch stages animate one-by-one with checkmarks

> "This is useful if you want to explain the algorithm step-by-step to a junior engineer or a panel (like this one)."

**Action:** Click "Pause" to stop.

---

#### **Closing (30 seconds)**

> "To summarize:"
> - "Pipeline Playground **predicts failures and scaling impacts** using real microservice topology"
> - "It's **fast** (2-5 seconds), **auditable** (request IDs), and **visual** (step-by-step timeline)"
> - "Operators use it for **pre-incident planning**, **scaling decisions**, and **teaching**"

> "Questions?"

---

### What "Success" Looks Like

- Panel sees: Clear timeline, results populate quickly, no errors
- Panel understands: "This predicts impact before making changes"
- Panel asks: "Can we use this for X?" → You can say: "Yes, as long as you have service topology data"

### If Something Goes Wrong

| Issue | What Panel Sees | What to Say |
|-------|-----------------|-------------|
| 503 error | Red error message | "Graph engine is temporarily down. In production, we'd see a 503 and know to check the backend." |
| Service not found | Yellow warning | "This service isn't in the graph yet. The tool validates inputs and prevents running invalid scenarios." |
| Stale graph | Yellow "(stale)" | "The graph data is stale, meaning predictions might not match current state. This is a trust indicator." |
| Slow response (>10s) | Loading spinner | "Network latency. In production, we'd set a timeout to fail fast instead of hanging." |

---

## Troubleshooting Guide (Non-Technical Language)

### "Service not found in graph"

**What it means:**  
The service you typed doesn't exist in the system's service map (graph). Either:
- You misspelled it (e.g., `default:fronted` instead of `default:frontend`)
- The service is new and hasn't been discovered yet
- The service runs in a different namespace

**What to do:**
1. Click the Service ID input to see the dropdown of valid services
2. Pick one from the list (the tool only shows services that exist)
3. If the service you need is missing: Check if it's running and sending traffic (Graph Engine discovers services from metrics)

**Why the tool blocks you:**  
Running a simulation on a non-existent service wastes computation and produces meaningless results. Validation upfront saves time.

---

### "503 Service Unavailable" or "ERR_NETWORK"

**What it means:**  
The predictive engine backend cannot reach the Graph Engine, or the predictive engine itself is down.

**What to do:**
1. Check backend is running:
   ```bash
   # In predictive-analysis-engine directory:
   npm start
   # Should see: "Server started on port 5000"
   ```
2. Check Graph Engine is running (if using Live mode):
   ```bash
   # In service-graph-engine directory:
   npm start
   # Should see: "Graph Engine listening on port 8080"
   ```
3. Check network:
   - Open browser console (F12 → Network tab)
   - Try running simulation again
   - Look for failed request to `/api/simulate/failure` or `/api/simulate/scale`
   - If red (failed): Backend is down or wrong URL

**Why this happens:**  
Microservices depend on each other. If Graph Engine is down, predictive engine can't get service topology data. The tool is designed to **fail gracefully** (show 503 instead of crashing).

---

### "Stale graph data" (yellow indicator)

**What it means:**  
The service topology data is older than expected (>5 minutes). This could mean:
- Metrics collection stopped
- Graph Engine stopped updating its internal cache
- No new traffic flowing through services (so no new data to collect)

**What to do:**
1. Check timestamp: "Stale (600s ago)" = 10 minutes old
2. If <1 hour old: Results are probably still accurate (topology rarely changes that fast)
3. If >1 hour old: Re-run metrics collection or wait for new data
4. If urgent: Switch to Mock mode to demo without live data

**Why the tool warns you:**  
Predictions based on 10-hour-old data might not reflect current reality (e.g., a service might have been added/removed). The staleness indicator is a **trust signal** — you can still use the results, but with lower confidence.

---

### No services appear in Live mode dropdown

**What it means:**  
Graph Engine has no services in its database, or the `/services` endpoint returned an empty list.

**What to do:**
1. Verify Graph Engine has data:
   ```bash
   curl http://localhost:8080/services | jq
   # Should return: { services: [...], count: X }
   ```
2. If empty: Graph Engine needs to collect metrics first (send traffic through services to populate the graph)
3. If non-empty but UI shows empty: Check browser console for errors (F12 → Console)

**Why this happens:**  
Graph Engine discovers services from metrics (Prometheus/Kiali). If no traffic flows, no services are discovered. This is expected in a fresh/test environment.

---

### Results look wrong (e.g., 0 RPS lost traffic)

**What it means:**  
The graph has topology (service names) but no traffic metrics (RPS, latency). Results are structurally correct but numerically meaningless.

**What to do:**
1. Check if traffic metrics are flowing: Look at Graph Engine health endpoint
   ```bash
   curl http://localhost:5000/health | jq
   # Check: dataFreshness.stale should be false
   ```
2. If missing metrics: Generate load (send traffic through services) or use Mock mode
3. If metrics exist but results still look wrong: Check maxDepth (depth=1 only sees immediate neighbors, depth=3 sees more)

**Why this happens:**  
Predictive engine depends on Graph Engine having both **topology** (who calls whom) and **metrics** (how much traffic). If only topology exists, you get a "skeleton" result with 0 values.

---

## FAQ (Panel Questions + Short Answers)

### Q: Is this real or mock data?
**A:** It depends on the mode:
- **Mock mode** (default): Pre-recorded example data, good for demos/offline use
- **Live mode**: Calls real backend, gets real service topology and traffic metrics

You can tell by the badge in Operator Summary:
- "📋 Mock" (gray) = mock data
- "🚀 Live" (green) = real data

---

### Q: Where does the data come from?
**A:** Two sources:
1. **Graph Engine** (service-graph-engine): Collects service topology and metrics from Prometheus/Kiali (observability stack)
2. **Predictive Engine** (predictive-analysis-engine): Runs simulations using Graph Engine data

Data flow:  
`Services → Prometheus → Graph Engine → Predictive Engine → Dashboard UI`

---

### Q: What does "confidence" mean?
**A:** How complete the input data is:
- **High**: All services, traffic data, and connections are known
- **Medium**: Some missing data (e.g., latency for 1-2 edges, or partial neighborhood)
- **Low**: Stale graph or incomplete topology

Think of it like a weather forecast confidence: "High" means 90% accurate, "Low" means 50% accurate.

---

### Q: Why should we trust it?
**A:** Three reasons:
1. **Determinism**: Same input + same graph = same output (no randomness)
2. **Auditability**: Every run has a request ID + timestamp (traceable in logs)
3. **Transparency**: Pipeline trace shows exactly what the backend did (8 stages with timings)

You can verify results by:
- Checking request ID in backend logs (search for correlationId)
- Comparing predicted impact to real incidents (post-incident analysis)
- Reviewing raw JSON response (click "Raw JSON Response" at bottom of results)

**Limitations:**  
- Predictions assume graph topology stays constant (doesn't predict new service deployments)
- Latency estimates use a formula (bounded sqrt model), not ML (faster but less precise)
- Requires fresh data (>10 min stale = lower confidence)

---

### Q: Can we use this in production?
**A:** Yes, but:
- **Pre-production/staging**: Use it to plan capacity, test scenarios
- **Production**: Use for incident planning ("if X fails, what breaks?") but don't auto-execute changes based on results (requires human review)
- **CI/CD**: Can integrate as a pre-deployment check (e.g., "will this scaling change reduce latency?")

**Not recommended for:** Real-time auto-scaling (too slow, designed for planning not automation).

---

### Q: How long does a simulation take?
**A:** Typically 1-5 seconds:
- Mock mode: ~0.5s (loads pre-recorded JSON)
- Live mode: 1-5s depending on:
  - Graph size (100 services vs 10,000 services)
  - Network latency (local vs remote backend)
  - Max depth (depth=1 is faster than depth=3)

You can see exact timings in the Pipeline Trace (each stage shows milliseconds).

---

### Q: What's the difference between Failure and Scale scenarios?
**A:**

| Aspect | Failure | Scale |
|--------|---------|-------|
| **Question** | "If this service crashes, what breaks?" | "If we change pod count, how does latency change?" |
| **Inputs** | serviceId, maxDepth | serviceId, currentPods, newPods, latencyMetric, maxDepth |
| **Outputs** | Lost traffic (RPS), affected callers/downstream, unreachable services | Latency delta (before/after), scaling direction (up/down), affected callers |
| **Use case** | Incident planning, blast radius analysis | Capacity planning, cost optimization |

---

### Q: What are "pods"?
**A:** In Kubernetes (container orchestration), a "pod" is a running copy of a service. Example:
- 3 pods = 3 copies of cartservice running
- 5 pods = 5 copies (more capacity, can handle more traffic)

Scaling from 3→5 pods usually improves latency (requests distributed across more copies). But there are diminishing returns (5→10 pods might only improve latency by 5%, not 50%).

---

### Q: Can we customize the pipeline stages?
**A:** Not in the current version (stages are hardcoded in backend). But you can:
- **Disable stages** in Stage Controls (e.g., skip Recommendations)
- **Stop at stage** for demo mode (e.g., stop after Path Analysis)

Future enhancement: Plugin architecture to add custom stages (e.g., cost estimation, security analysis).

---

## Appendix

### Exact Endpoints Used (From Evidence)

| Endpoint | Method | Purpose | Request | Response |
|----------|--------|---------|---------|----------|
| `/health` | GET | Health check | None | `{ status, provider, graphApi, config, uptimeSeconds }` |
| `/services` | GET | List services | None | `{ services: [{ serviceId, name, namespace }], count, stale, lastUpdatedSecondsAgo, windowMinutes }` |
| `/simulate/failure` | POST | Failure simulation | `{ serviceId, maxDepth }` | `{ target, neighborhood, affectedCallers, affectedDownstream, unreachableServices, totalLostTrafficRps, recommendations, ... }` |
| `/simulate/scale` | POST | Scale simulation | `{ serviceId, currentPods, newPods, latencyMetric, maxDepth }` | `{ target, scalingDirection, latencyEstimate, affectedCallers, affectedPaths, recommendations, ... }` |

**Base URL (default):** `http://localhost:5000`  
**Query parameter:** `?trace=true` (adds `pipelineTrace` to response)

---

### Example Valid Service IDs

**Format:** `namespace:name` (colon-separated, no spaces)

**From Mock Data:**
- `default:productcatalog`
- `default:checkoutservice`
- `default:frontend`
- `default:cartservice`

**From Live Discovery (example):**
- `default:frontend`
- `default:cartservice`
- `default:productcatalogservice`
- `default:emailservice`
- `istio-system:istiod`

**Invalid formats:**
- `frontend` (missing namespace)
- `default-frontend` (hyphen instead of colon)
- `default: frontend` (space after colon)
- `Frontend` (case-sensitive, must match exactly)

**How to get valid IDs:**
- Live mode: Use the dropdown (auto-populated from `/services` endpoint)
- Mock mode: Use the example services listed above

---

### Glossary

| Term | Definition |
|------|------------|
| **Blast radius** | The set of services affected when one service fails (upstream callers + downstream dependencies) |
| **Caller** | A service that sends requests TO another service (upstream direction, like a customer calling a store) |
| **Confidence** | How complete the graph data is (high/medium/low) |
| **Depth / k-hop** | How many connection levels away to analyze. depth=1 = target + direct neighbors; depth=2 = target + neighbors + neighbors-of-neighbors; depth=3 = 3 levels out |
| **Downstream** | Services that receive requests FROM the target service (downstream direction, like water flowing down from the target) |
| **Freshness** | How recent the graph data is (fresh = <5 min, stale = >5 min) |
| **Graph Engine** | Backend service that collects and exposes service topology + metrics |
| **Latency** | Response time (how long a request takes, measured in milliseconds) |
| **p50/p95/p99** | Percentiles: p95 = 95% of requests are faster than this value (p99 = 99%, more conservative) |
| **Pipeline Trace** | Step-by-step log of what the backend did (8 stages with timings) |
| **Pod** | A running copy of a service (Kubernetes term) |
| **RPS** | Requests per second (traffic volume) |
| **Scaling direction** | Up (more pods), down (fewer pods), or same (no change) |
| **Service** | A microservice (small, independent program in the system) |
| **Simulation** | A "what-if" prediction of system behavior (not a real change) |
| **Staleness** | How old the data is (600s ago = 10 minutes stale) |
| **Topology** | The map of service connections (who calls whom) |
| **Unreachable** | Services completely cut off if the target fails (no alternate path) |

---

## Document Version

**Version:** 1.0  
**Last Updated:** 2026-01-04  
**Authors:** Team Alpha Zero  
**Status:** Ready for panel presentation  

**Evidence Sources:**
- `dashboard-ui/src/pages/pipeline/PipelinePlayground.tsx`
- `dashboard-ui/src/pages/pipeline/components/ScenarioForm.tsx`
- `dashboard-ui/src/pages/pipeline/components/TraceTimeline.tsx`
- `dashboard-ui/src/pages/pipeline/components/PlaybackControls.tsx`
- `dashboard-ui/src/pages/pipeline/components/ResultPanels.tsx`
- `dashboard-ui/src/pages/pipeline/components/OperatorSummary.tsx`
- `dashboard-ui/src/lib/api.ts`
- `predictive-analysis-engine/openapi.yaml`
- `predictive-analysis-engine/index.js`

**No invented data:** All button labels, endpoints, formats, and behaviors are extracted from actual source code.
