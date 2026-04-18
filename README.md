# Orion — Device Intelligence Platform

**by Vortan** · `orion.vortan.io`

Orion is a data-agnostic device intelligence platform for hardware projects, research systems, industrial deployments, fleet monitoring, telemetry visualization, and remote control.

---

## Architecture

```
orion/
├── apps/
│   ├── api/              Fastify REST API + Socket.IO realtime server
│   ├── web/              React 18 frontend (Vite + Tailwind + ECharts + Leaflet)
│   └── ingestion/        (planned) Dedicated multi-protocol ingestion gateway
├── packages/
│   ├── shared/           TypeScript types shared across backend + frontend
│   ├── ui/               (planned) Shared component library
│   ├── parsers/          (planned) Multi-format payload parsers
│   ├── rules-engine/     (planned) Standalone rules evaluation engine
│   ├── device-sdk/       (planned) Device SDK for embedded clients
│   └── maps/             (planned) Geo utilities and geofencing
├── infra/
│   └── mosquitto.conf    MQTT broker configuration
└── docker-compose.yml    Full local stack
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Charts | Apache ECharts via echarts-for-react |
| Maps | Leaflet + react-leaflet |
| State | Zustand + TanStack Query |
| Animations | Framer Motion |
| API | Fastify 4, TypeScript, Node.js 20 |
| Realtime | Socket.IO 4 |
| Database | MongoDB 7 (Mongoose) |
| Cache/Queue | Redis 7 (ioredis) |
| Auth | JWT + bcrypt (refresh token rotation) |
| MQTT | Eclipse Mosquitto 2 |
| Container | Docker + Nginx |
| Monorepo | pnpm workspaces + Turborepo |

---

## Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 (`npm install -g pnpm@9`)
- Docker + Docker Compose (for MongoDB, Redis, MQTT)

### 1. Start infrastructure

```bash
docker-compose up mongodb redis mosquitto -d
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your settings
```

### 4. Seed demo data

```bash
pnpm db:seed
```

This creates:
- **Organization**: Vortan Demo
- **Admin user**: `admin@vortan.io` / `demo1234`
- **12 demo devices** across all categories
- **200 telemetry points** per device (realistic data)
- **Sample alerts, rules, and a default dashboard**

### 5. Start development servers

```bash
# Start all services
pnpm dev

# Or individually
pnpm dev:api    # API on http://localhost:3001
pnpm dev:web    # Web on http://localhost:5173
```

---

## Production Deployment

### Docker Compose (recommended)

```bash
# Set environment variables
export JWT_SECRET="your-secure-secret-here"
export JWT_REFRESH_SECRET="your-refresh-secret-here"
export FRONTEND_URL="https://orion.vortan.io"

# Build and start all services
docker-compose up --build -d

# Seed initial data
docker-compose exec api node dist/seed/index.js
```

---

## Data Ingestion

Devices send data to Orion via the ingestion endpoint:

### HTTP (JSON)

```bash
curl -X POST https://orion.vortan.io/api/v1/telemetry/ingest \
  -H "X-API-Key: dev_your_device_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "temperature": 24.3,
    "humidity": 65.1,
    "pressure": 1013.2,
    "timestamp": "2024-03-11T10:00:00Z"
  }'
```

### GPS / Tracker

```bash
curl -X POST https://orion.vortan.io/api/v1/telemetry/ingest \
  -H "X-API-Key: dev_your_device_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 1.3521,
    "longitude": 103.8198,
    "speed": 45.2,
    "heading": 270,
    "altitude": 12.5,
    "battery": 87
  }'
```

Orion automatically detects `lat`/`latitude`/`lng`/`longitude`/`lon`/`long` fields and routes them into the location tracking system.

### Supported Protocols

| Protocol | Status | Notes |
|----------|--------|-------|
| HTTP/HTTPS | ✅ Ready | REST endpoint with API key |
| MQTT | ✅ Ready | Connect to Mosquitto broker |
| WebSocket | ✅ Ready | Via Socket.IO client |
| TCP | 🚧 Planned | Raw socket adapter |
| CoAP | 🚧 Planned | CoAP adapter |

---

## API Reference

### Authentication

```http
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

### Devices

```http
GET    /api/v1/devices
GET    /api/v1/devices/stats
GET    /api/v1/devices/:id
POST   /api/v1/devices
PATCH  /api/v1/devices/:id
DELETE /api/v1/devices/:id
POST   /api/v1/devices/:id/regenerate-key
```

### Telemetry

```http
POST /api/v1/telemetry/ingest         # Device ingestion (API key)
GET  /api/v1/telemetry               # Query telemetry
GET  /api/v1/telemetry/latest        # Latest reading for device
GET  /api/v1/telemetry/series        # Time-series for a field
GET  /api/v1/telemetry/location-history  # GPS route history
```

### Commands

```http
GET  /api/v1/commands
POST /api/v1/commands
POST /api/v1/commands/:id/cancel
POST /api/v1/commands/ack            # Device acknowledgement
```

### Dashboards

```http
GET    /api/v1/dashboards
GET    /api/v1/dashboards/:id
POST   /api/v1/dashboards
PATCH  /api/v1/dashboards/:id
DELETE /api/v1/dashboards/:id
```

### Rules

```http
GET    /api/v1/rules
POST   /api/v1/rules
PATCH  /api/v1/rules/:id
DELETE /api/v1/rules/:id
POST   /api/v1/rules/:id/toggle
```

### Alerts

```http
GET  /api/v1/alerts
POST /api/v1/alerts/:id/acknowledge
POST /api/v1/alerts/:id/resolve
```

---

## Realtime Events (Socket.IO)

Connect with your JWT token:

```javascript
import { io } from 'socket.io-client';

const socket = io('https://orion.vortan.io', {
  auth: { token: 'your-jwt-token' },
  path: '/socket.io',
});

// Subscribe to a device
socket.emit('subscribe:device', 'device-id');

// Listen for events
socket.on('telemetry.update', (event) => { /* ... */ });
socket.on('device.online', (event) => { /* ... */ });
socket.on('device.offline', (event) => { /* ... */ });
socket.on('alert.created', (event) => { /* ... */ });
socket.on('location.update', (event) => { /* ... */ });
socket.on('command.executed', (event) => { /* ... */ });
```

---

## Role-Based Access Control

| Role | Description |
|------|-------------|
| `super_admin` | Full platform access |
| `admin` | Full org access, manage users |
| `operator` | Devices, commands, dashboards |
| `researcher` | Data access, dashboards, reports |
| `technician` | Devices, commands, OTA |
| `viewer` | Read-only access |

---

## Device Categories

Orion supports any device type. Built-in categories:

`tracker` · `environmental` · `energy` · `water` · `pump` · `gateway` · `mobile` · `fixed` · `research` · `industrial` · `telemetry` · `custom`

---

## Location Field Auto-Detection

Orion automatically maps incoming fields to the location system:

| Detected as | Field names recognized |
|-------------|----------------------|
| Latitude | `lat`, `latitude`, `Lat`, `Latitude` |
| Longitude | `lng`, `lon`, `long`, `longitude`, `Lng`, `Lon`, `Long`, `Longitude` |
| Altitude | `alt`, `altitude`, `Alt`, `Altitude` |
| Speed | `speed`, `Speed`, `spd` |
| Heading | `heading`, `Heading`, `course`, `bearing` |

---

## Development Guide

### Run type checking

```bash
pnpm typecheck
```

### Build production

```bash
pnpm build
```

### Project conventions

- All shared types live in `packages/shared/src/types/`
- API routes are under `apps/api/src/routes/`
- Frontend pages are under `apps/web/src/pages/`
- Use `cn()` from `@/lib/utils` for conditional classnames
- Use TanStack Query for all data fetching in the frontend
- Socket events use the `RealtimeEventType` enum from `@orion/shared`

---

## Brand

**Product**: Orion  
**Brand**: Vortan  
**Domain**: orion.vortan.io  
**Theme**: Intelligent, guided, reliable, expansive — deep navy with violet-indigo accent

---

© 2024 Vortan Technologies. All rights reserved.
