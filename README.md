# Orion — Device Intelligence Platform

**by Vortan** · `orion.vortan.io`

Orion is a data-agnostic IoT platform for hardware projects, research systems, industrial deployments, fleet monitoring, telemetry visualization, and remote control. Devices connect over any protocol; data flows in any format; commands go back out in real time.

---

## Architecture

```
orion/
├── apps/
│   ├── api/          Fastify REST API + Socket.IO realtime + multi-protocol ingestion
│   └── web/          React 18 frontend (Vite + Tailwind + ECharts + Google Maps)
├── packages/
│   └── shared/       TypeScript types shared across backend + frontend
└── infra/
    └── mosquitto.conf MQTT broker configuration
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Charts | Apache ECharts via echarts-for-react |
| Maps | Google Maps (`@vis.gl/react-google-maps`) |
| State | Zustand + TanStack Query |
| Animations | Framer Motion |
| API | Fastify 4, TypeScript, Node.js 20 |
| Realtime (dashboard) | Socket.IO 4 |
| Realtime (devices) | Native WebSocket (`@fastify/websocket`) |
| Database | MongoDB 7 (Mongoose) |
| Cache | Redis 7 (ioredis) |
| Auth | JWT + bcrypt (refresh token rotation) |
| MQTT | Eclipse Mosquitto / custom broker |
| Monorepo | pnpm workspaces |

---

## Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 (`npm install -g pnpm@9`)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Create `apps/api/.env`:

```env
NODE_ENV=development
PORT=7001
MONGODB_URI=mongodb+srv://...
REDIS_URL=redis://localhost:6379

JWT_SECRET=change-me
JWT_REFRESH_SECRET=change-me-too
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

MQTT_BROKER_URL=mqtt://your-broker:1883
INGESTION_SECRET=your-ingestion-secret

FRONTEND_URL=http://localhost:6002
CORS_ORIGIN=http://localhost:6002

TCP_PORT=8883
UDP_PORT=8884
COAP_PORT=5683
```

Create `apps/web/.env`:

```env
VITE_API_URL=http://localhost:7001/api/v1
VITE_SOCKET_URL=http://localhost:7001
VITE_GOOGLE_MAPS_API_KEY=your-key
VITE_GOOGLE_MAP_ID=your-map-id
```

### 3. Seed demo data

```bash
pnpm db:seed
```

Creates:
- **Organization**: Vortan Demo
- **Admin**: `admin@vortan.io` / `demo1234`
- **12 demo devices** across all categories
- **200 telemetry points** per device
- Sample alerts, rules, and a default dashboard

### 4. Start development

```bash
pnpm dev         # all services
pnpm dev:api     # API only — http://localhost:7001
pnpm dev:web     # Web only — http://localhost:6002
```

---

## Production Deployment

### With PM2 (recommended)

```bash
# Build
pnpm build

# Start API
pm2 start apps/api/dist/index.js --name orion-api

# Serve frontend (after build, put dist/ behind Nginx)
pnpm --filter @orion/web build
```

### Environment checklist before going live

- [ ] Set real `JWT_SECRET` and `JWT_REFRESH_SECRET`
- [ ] Point `MONGODB_URI` to your production cluster
- [ ] Enable MQTT broker authentication — update `MQTT_BROKER_URL=mqtt://user:pass@host:port`
- [ ] Put Nginx/Caddy in front with TLS (Let's Encrypt)
- [ ] Open firewall ports: `443` (HTTPS), `1883` (MQTT), `8883` (TCP), `8884` (UDP), `5683` (CoAP/UDP)

---

## Data Ingestion

Every device gets a unique API key on creation. Supported ingestion protocols:

| Protocol | Status | Port / Endpoint |
|----------|--------|-----------------|
| HTTP/HTTPS | ✅ Live | `POST /api/v1/telemetry/ingest` with `X-API-Key` header |
| MQTT | ✅ Live | Broker — topic `/{serial}/data` |
| WebSocket | ✅ Live | `ws://host/ws?apiKey=...` |
| TCP | ✅ Live | Port `8883` — line-delimited, API key on first line |
| UDP | ✅ Live | Port `8884` — datagram format: `apiKey\|payload` |
| CoAP | ✅ Live | Port `5683` — `POST coap://host/telemetry` |

### HTTP example

```bash
curl -X POST https://orion.vortan.io/api/v1/telemetry/ingest \
  -H "X-API-Key: your_device_api_key" \
  -H "Content-Type: application/json" \
  -d '{"temperature": 24.3, "humidity": 65.1}'
```

### Payload formats

Orion parses all four formats automatically based on the device's configured `payloadFormat`:

| Format | Example |
|--------|---------|
| JSON | `{"temp": 24.3, "hum": 65}` |
| XML | `<data><temp>24.3</temp><hum>65</hum></data>` |
| CSV | `temp,hum\n24.3,65` |
| Raw key=value | `temp=24.3 hum=65` |

### GPS / Location auto-detection

Orion auto-detects location fields in any payload:

| Field | Accepted names |
|-------|---------------|
| Latitude | `lat`, `latitude`, `Lat`, `Latitude` |
| Longitude | `lng`, `lon`, `long`, `longitude` |
| Altitude | `alt`, `altitude` |
| Speed | `speed`, `spd` |
| Heading | `heading`, `course`, `bearing` |

---

## Command Delivery

Commands are sent from the dashboard and delivered to devices over their registered protocol:

| Protocol | Delivery method |
|----------|----------------|
| MQTT | Published to `/{serial}/commands` |
| WebSocket | Pushed as `{type:"command", ...}` message |
| HTTP | Returned in next ingest response (response mode) or polled via `GET /commands/pending?apiKey=` |
| TCP | Pushed as `CMD:{id}:{json}\n` on the open connection |
| CoAP | Polled via `GET coap://host/commands/pending?apiKey=` |
| UDP | Telemetry-only (stateless — no command delivery) |

ACKs: devices confirm delivery via `POST /api/v1/commands/ack`, the MQTT ACK topic `/{serial}/commands/{id}/ack`, or WebSocket `{type:"ack"}` message.

---

## MQTT Topics

| Direction | Topic pattern | Description |
|-----------|---------------|-------------|
| Device → Server | `/{serial}/data` | Telemetry payload |
| Server → Device | `/{serial}/commands` | Command delivery |
| Device → Server | `/{serial}/commands/{id}/ack` | Command acknowledgement |

---

## API Reference

### Auth

```http
POST  /api/v1/auth/register
POST  /api/v1/auth/login
POST  /api/v1/auth/refresh
POST  /api/v1/auth/logout
GET   /api/v1/auth/me
PATCH /api/v1/auth/me           # Update display name
PATCH /api/v1/auth/password     # Change password
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
POST /api/v1/telemetry/ingest            # Device ingestion (API key auth)
GET  /api/v1/telemetry                   # Query telemetry
GET  /api/v1/telemetry/latest            # Latest reading
GET  /api/v1/telemetry/series            # Time-series for a field
GET  /api/v1/telemetry/location-history  # GPS route history
```

### Commands

```http
GET  /api/v1/commands
POST /api/v1/commands
POST /api/v1/commands/:id/cancel
POST /api/v1/commands/ack                # Device ACK
GET  /api/v1/commands/pending?apiKey=    # Device polling
```

### Alerts & Rules

```http
GET  /api/v1/alerts
POST /api/v1/alerts/:id/acknowledge
POST /api/v1/alerts/:id/resolve
GET    /api/v1/rules
POST   /api/v1/rules
PATCH  /api/v1/rules/:id
DELETE /api/v1/rules/:id
POST   /api/v1/rules/:id/toggle
```

### Dashboards

```http
GET    /api/v1/dashboards
GET    /api/v1/dashboards/:id
POST   /api/v1/dashboards
PATCH  /api/v1/dashboards/:id
DELETE /api/v1/dashboards/:id
```

### Organization

```http
GET   /api/v1/org
PATCH /api/v1/org     # Admin only — update name, settings, retention
```

### Users

```http
GET    /api/v1/users
POST   /api/v1/users/invite
PATCH  /api/v1/users/:id
DELETE /api/v1/users/:id
```

### OTA

```http
GET    /api/v1/ota/firmware
POST   /api/v1/ota/firmware
DELETE /api/v1/ota/firmware/:id
GET    /api/v1/ota/jobs
POST   /api/v1/ota/jobs
PATCH  /api/v1/ota/jobs/:id
```

### Health

```http
GET /health
```

---

## Realtime — Dashboard (Socket.IO)

```javascript
import { io } from 'socket.io-client';

const socket = io('https://orion.vortan.io', {
  auth: { token: 'your-jwt-token' },
  path: '/socket.io',
});

socket.emit('subscribe:device', 'device-id');

socket.on('telemetry.update',   (e) => { /* new reading */ });
socket.on('device.online',      (e) => { /* device connected */ });
socket.on('device.offline',     (e) => { /* device disconnected */ });
socket.on('alert.created',      (e) => { /* alert fired */ });
socket.on('location.update',    (e) => { /* GPS update */ });
socket.on('command.executed',   (e) => { /* command ACKed */ });
```

## Realtime — Device WebSocket

```javascript
const ws = new WebSocket('wss://orion.vortan.io/ws?apiKey=your_key');

// Send telemetry
ws.send(JSON.stringify({ type: 'telemetry', payload: { temp: 24.3 } }));

// Receive command
ws.onmessage = (msg) => {
  const { type, commandId, name, payload } = JSON.parse(msg.data);
  if (type === 'command') {
    // execute command ...
    ws.send(JSON.stringify({ type: 'ack', commandId, status: 'success' }));
  }
};
```

---

## Role-Based Access Control

| Role | Capabilities |
|------|-------------|
| `super_admin` | Full platform access |
| `admin` | Full org access, manage users and settings |
| `operator` | Devices, commands, dashboards, rules |
| `researcher` | Read data, dashboards, reports |
| `technician` | Devices, commands, OTA |
| `viewer` | Read-only |

---

## Device Categories

`tracker` · `environmental` · `energy` · `water` · `pump` · `gateway` · `mobile` · `fixed` · `research` · `industrial` · `telemetry` · `custom`

---

## Project Conventions

- Shared types → `packages/shared/src/types/`
- API routes → `apps/api/src/routes/`
- Frontend pages → `apps/web/src/pages/`
- Use `cn()` from `@/lib/utils` for conditional classnames
- Use TanStack Query for all data fetching
- Socket events use `RealtimeEventType` from `@orion/shared`

---

## Brand

**Product**: Orion  
**Brand**: Vortan  
**Domain**: orion.vortan.io

---

© 2025 Vortan Technologies. All rights reserved.
