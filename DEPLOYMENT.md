# Production deployment

## Architecture

- **API**: Node.js + Express (`backend/`), port **4000** in Docker examples.
- **Web**: Next.js (`web/`), port **3000**.
- **MongoDB**: Atlas (managed) or self-hosted (Docker `mongo` service).
- **Redis**: Upstash, ElastiCache, or Docker `redis` service — required for trending, view dedupe, and time-window ranking.

## Environment variables

### API (`backend`)

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | Atlas connection string or `mongodb://mongo:27017/...` in Compose |
| `REDIS_URL` | Recommended | `redis://redis:6379` or TLS URL from cloud provider |
| `JWT_SECRET` | Yes | Long random string (32+ chars) |
| `JWT_EXPIRES_IN` | No | Default `7d` |
| `FRONTEND_URL` | Yes | Primary browser origin (e.g. `https://app.example.com`) |
| `CORS_EXTRA` | No | Comma-separated extra origins |
| `OPENAI_API_KEY` | No | Enables OpenAI Moderations on post create |
| `PORT` | No | Default `3000` in code; use `4000` behind reverse proxy |
| `TRUST_PROXY` | If behind LB | Set `1` when using `X-Forwarded-*` |
| `COMMUNITY_VERIFY_THRESHOLD` | No | Votes to promote cluster to community verified (default `5`) |

### Web (`web`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Public API URL the **browser** will call (e.g. `https://api.example.com`) |

## MongoDB Atlas

1. Create a cluster (M10+ for production workloads).
2. Database Access → create user with read/write on your DB.
3. Network Access → allow your server IPs or `0.0.0.0/0` (less secure; prefer VPC peering or private endpoint).
4. Connect → Drivers → copy URI, replace `<password>`, set `MONGODB_URI`.

## Redis (cloud)

- **Upstash**: create database, copy `rediss://` URL into `REDIS_URL`.
- **AWS ElastiCache**: use primary endpoint with TLS; set `REDIS_URL` accordingly.
- Ensure API can reach Redis over network/security groups.

## Docker (local / single VM)

```bash
cp backend/.env.example backend/.env
# Set JWT_SECRET, optionally OPENAI_API_KEY
docker compose up --build
```

- API: `http://localhost:4000`
- Web: `http://localhost:3000` (set `NEXT_PUBLIC_API_URL=http://localhost:4000` at **web build** time for the browser).

For Compose, rebuild `web` when changing `NEXT_PUBLIC_API_URL`:

```bash
docker compose build web --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000
```

## Cloud deployment (typical)

1. **Container registry**: Build and push `backend` and `web` images (or use platform buildpacks).
2. **API service**: Run backend container with env vars; attach to Atlas and Redis.
3. **Web service**: Run Next with `NEXT_PUBLIC_API_URL` pointing to the **public** API hostname.
4. **Ingress / TLS**: Terminate HTTPS at load balancer; set `TRUST_PROXY=1` on API if needed.
5. **Socket.io**: Same host as API or sticky sessions + WebSocket upgrade through the load balancer.

## OpenAI moderation

With `OPENAI_API_KEY` set, new posts call the Moderations API (`omni-moderation-latest` with fallback). High-risk posts get `moderationStatus` `pending` or `escalated` and are hidden from public lists until reviewed.

## Health checks

- HTTP: `GET /api/health`
- Use for Kubernetes `livenessProbe` / `readinessProbe`.
