# OBP-Server
A full stack web application that fetches bee observation data and creates specimen labels for the Oregon Bee Project

## Stack
Orchestrated with Docker Compose ([`docker-compose.yml`](docker-compose.yml); dev overrides in [`docker-compose.override.yml`](docker-compose.override.yml)): MongoDB, RabbitMQ, an Express API ([`server/`](server)), an R-based worker ([`worker/`](worker)), an nginx reverse proxy, and a Vite/React client ([`client/`](client)).

## Local development
1. Copy [`.env.example`](.env.example) to `.env` and fill it in (generate the secrets with `openssl rand -hex 32`). The server validates required variables at startup via [`shared/lib/config/environment.js`](shared/lib/config/environment.js).
2. Start the backend: `docker compose up --build mongo rabbitmq server nginx`. (The full `docker compose up` additionally builds the R worker image — slow on the first run — and a Vite dev server at http://localhost:5173.)
3. Build the client so nginx can serve it: `cd client && npm run build`, then open http://localhost/.
4. Log in as an Administrator with the `ADMIN_USERNAME` / `ADMIN_PASSWORD` from your `.env` (seeded on startup).

### First startup
Everything under `shared/data/` is gitignored (see [`.gitignore`](.gitignore)), so a fresh clone has to recreate it. An Administrator login at melittologist.org can supply populated copies of the CSVs; empty files are enough to boot.

1. Create the directories the subtasks write their output into:
   ```
   cd shared/data && mkdir -p addresses backups duplicates elevation emails flags labels observations occurrences pivots pulls reports taxonomy uploads
   ```
2. Create the seed and lookup files:
   ```
   touch workingOccurrences.csv backupOccurrences.csv plantList.csv usernames.csv
   ```
   - `workingOccurrences.csv` seeds the occurrences collection when the database is empty on startup ([`server/src/index.js`](server/src/index.js)).
   - `usernames.csv` maps each occurrence's `userLogin` to a volunteer's contact info ([`shared/lib/services/UsernamesService.js`](shared/lib/services/UsernamesService.js)). Without it, every record from the Observations subtask gets a name error flag and never enters the occurrences collection.
   - `plantList.csv` is the Oregon Bee Project plant list served by the plant-list endpoints. (The related iNaturalist taxonomy cache, `plantTaxa.json`, is created automatically.)
3. **Optional — elevation data.** To fill the `elevation` field on pulled records, download 1-arc-second GeoTIFF tiles from the [USGS Earth Explorer](https://www.usgs.gov/faqs/where-can-i-get-global-elevation-data#faq) and unzip them into `shared/data/elevation/` ([`shared/lib/services/ElevationService.js`](shared/lib/services/ElevationService.js)). Skip this if you don't need elevation.

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
