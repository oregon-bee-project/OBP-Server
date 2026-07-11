# OBP-Server
A full stack web application that fetches bee observation data and creates specimen labels for the Oregon Bee Project

## Stack
Orchestrated with Docker Compose ([`docker-compose.yml`](docker-compose.yml); dev overrides in [`docker-compose.override.yml`](docker-compose.override.yml)): MongoDB, RabbitMQ, an Express API ([`server/`](server)), an R-based worker ([`worker/`](worker)), an nginx reverse proxy, and a Vite/React client ([`client/`](client)).

## Local development
1. Copy [`.env.example`](.env.example) to `.env` and fill it in (generate the secrets with `openssl rand -hex 32`). The server validates required variables at startup via [`shared/lib/config/environment.js`](shared/lib/config/environment.js).
2. Start the backend: `docker compose up --build mongo rabbitmq server nginx`. (The full `docker compose up` additionally builds the R worker image — slow on the first run — and a Vite dev server at http://localhost:5173.)
3. Build the client so nginx can serve it: `cd client && npm run build`, then open http://localhost/.
4. Log in as an Administrator with the `ADMIN_USERNAME` / `ADMIN_PASSWORD` from your `.env` (seeded on startup).

### Gotchas
- **Port 443** is mapped for production TLS but unused in dev. If it collides on your machine, add a gitignored `docker-compose.local.yml` overriding the nginx ports and pass all three files to compose:
  ```yaml
  # docker-compose.local.yml
  services:
      nginx:
          ports: !override
              - '80:80'
  ```
  ```
  docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.local.yml up
  ```
- **First startup** with an empty database seeds occurrences from `shared/data/workingOccurrences.csv`; create an empty file there if it's missing.
