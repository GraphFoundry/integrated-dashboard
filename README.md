# Dashboard UI

Modern frontend dashboard for the Predictive Analysis Engine. Built with Vite, React, TypeScript, and Tailwind CSS.

## Features

- **Pipeline Playground**: Interactive simulation runner with trace visualization
  - Support for Failure and Scale scenarios
  - Mock mode (works offline) and Live mode (connects to backend API)
  - Real-time pipeline trace viewer with stage breakdown
  - Results viewer with affected services, paths, and recommendations
  
- **Alerts Placeholder**: Reserved route for future Alert Engine UI integration

## Tech Stack

- **Framework**: React 18
- **Build Tool**: Vite 5
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Routing**: React Router 6

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
cd dashboard-ui
npm install
```

### Environment Configuration

Create a `.env` file (copy from `.env.example`):

```bash
cp .env.example .env
```

Edit `.env` to set your backend API URL:

```env
VITE_API_BASE_URL=http://localhost:7000
```

### Development

Start the development server:

```bash
npm run dev
```

The UI will be available at `http://localhost:3000`

### Build for Production

```bash
npm run build
```

Build output will be in `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Usage

### Mock Mode (Default)

Mock mode uses pre-defined JSON files from `src/mocks/` to simulate API responses. This allows you to explore the UI without running the backend.

1. Select a scenario type (Failure or Scale)
2. Fill in the form fields
3. Click "Run Simulation"
4. View the pipeline trace and results

### Live Mode (Development)

Live mode connects to the actual backend API. In development, **Vite's proxy handles CORS automatically** — no backend configuration needed.

**How it works:**
- UI runs on `http://localhost:3000`
- API calls go to `/api/simulate/...` (relative URL)
- Vite proxy forwards `/api/*` → `http://localhost:7000/*`
- No CORS issues because browser sees same-origin requests

**Prerequisites:**
- Backend must be running on port 7000:
  ```bash
  cd ../predictive-analysis-engine
  npm start
  # Server listening on :7000
  ```

**Steps:**
1. Start the UI: `npm run dev`
2. Toggle to "Live" mode in the top-right corner
3. Configure your scenario
4. Click "Run Simulation"
5. View real-time results from the backend

**Network requests will show:** `/api/simulate/failure?trace=true` (proxied to backend)

### Live Mode (Production)

For production builds, set the `VITE_API_BASE_URL` environment variable:

```bash
VITE_API_BASE_URL=https://api.example.com npm run build
```

The production bundle will call the backend directly (ensure backend has CORS configured for production).

### API Endpoints Used

- **Health Check**: `GET /health`
- **Failure Simulation**: `POST /simulate/failure?trace=true`
- **Scale Simulation**: `POST /simulate/scale?trace=true`

## Project Structure

```
dashboard-ui/
├── src/
│   ├── app/
│   │   ├── App.tsx              # Root component
│   │   ├── routes.tsx           # Route definitions
│   │   └── layout/
│   │       ├── DashboardLayout.tsx
│   │       ├── Sidebar.tsx
│   │       └── Topbar.tsx
│   ├── pages/
│   │   ├── pipeline/
│   │   │   ├── PipelinePlayground.tsx
│   │   │   └── components/
│   │   │       ├── ScenarioForm.tsx
│   │   │       ├── TraceTimeline.tsx
│   │   │       └── ResultPanels.tsx
│   │   └── alerts/
│   │       └── AlertsPlaceholder.tsx
│   ├── lib/
│   │   ├── api.ts               # API client
│   │   └── types.ts             # TypeScript types
│   ├── mocks/
│   │   ├── failure-trace.json
│   │   └── scale-trace.json
│   ├── styles/
│   │   └── index.css
│   └── main.tsx                 # Entry point
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
└── README.md
```

## Validation Rules

### Failure Scenario
- `serviceId`: Required, non-empty string
- `maxDepth`: 1-3 (inclusive)

### Scale Scenario
- `serviceId`: Required, non-empty string
- `maxDepth`: 1-3 (inclusive)
- `currentPods`: Positive integer
- `newPods`: Positive integer, must differ from `currentPods`
- `latencyMetric`: One of `p50`, `p95`, `p99`

## Extending

### Adding New Pages

1. Create page component in `src/pages/[category]/`
2. Add route in `src/app/routes.tsx`
3. Add navigation item in `src/app/layout/Sidebar.tsx`

### Adding Mock Data

Add new JSON files to `src/mocks/` following the existing structure:

```json
{
  "pipelineTrace": {
    "options": { "trace": true },
    "stages": [...],
    "generatedAt": "ISO-8601 timestamp"
  },
  ...
}
```

## Future Work

- **Alerts UI**: Full implementation of alerts dashboard
- **Graph Visualization**: Network topology viewer
- **Historical Data**: Trace history and comparison
- **Export Features**: Download results as JSON/CSV

## Troubleshooting

### Port Already in Use

Change the port in `vite.config.ts`:

```ts
server: {
  port: 3001, // or any available port
}
```

### API Connection Errors

1. Verify backend is running
2. Check `VITE_API_BASE_URL` in `.env`
3. Try Mock mode to verify UI functionality

### Build Errors

Clear cache and reinstall:

```bash
rm -rf node_modules dist
npm install
npm run build
```

## License

Part of the Predictive Analysis Engine project.
