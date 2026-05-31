# All Dancity containers die around midnight (platform issue)

When **user dashboard**, **backend**, **landing page**, and **admin** all go **Dead** at the same time (often near midnight), the cause is almost always on the **server or Dokploy**, not inside one app repo.

Individual app code does not schedule a shared shutdown. Treat this as **infrastructure**.

### Pattern: DB stays up, only apps die

If **MongoDB / Redis / ClickHouse** (or other DB containers) **never go down** but **Node / Next / nginx apps** all die together, that usually rules out a **full VPS reboot** or **total host crash**. Typical explanations:

| Likely cause | Why DB is fine but apps die |
|--------------|-----------------------------|
| **OOM killer** | Linux kills high-RAM **Node/Next** processes first; DB often has lower footprint or reserved memory |
| **Dokploy redeploys app stack only** | Scheduled update hits user dashboard + backend + landing + admin, not the database app |
| **App health checks** | Nest/Next still starting or briefly unhealthy → Swarm replaces tasks; DB has no HTTP health check or is more stable |
| **Per-app memory limits** | Apps capped at 256–512MB; DB service has higher limit or none |
| **Midnight backup on DB** | Backup spikes CPU/disk I/O and RAM; apps get starved and OOM, DB keeps running |

Focus fixes on **application services in Dokploy**, not the database containers.

---

## 1. Confirm it is platform-wide

On the Docker host (SSH):

```bash
docker service ls
# or
docker ps -a

# Failed tasks in the last 24h (Swarm)
docker service ps $(docker service ls -q) --filter "desired-state=shutdown" --no-trunc 2>/dev/null | head -50

# Host OOM (Linux killed processes)
sudo dmesg -T | grep -iE 'oom|killed process' | tail -30

# Cron jobs that run at midnight
sudo crontab -l
sudo cat /etc/crontab 2>/dev/null
ls -la /etc/cron.d/
```

If **every** service restarts within the same minute → check items below.

---

## 2. Most common causes (all services at once)

| Cause | What to look for |
|--------|------------------|
| **Host OOM** | `dmesg` OOM killer; Dokploy memory limits too low; backup + DB + all containers at once |
| **`docker system prune` cron** | `/etc/cron.d/*`, `0 0 * * *` in root crontab |
| **VPS reboot / maintenance** | Provider panel, `last reboot`, `/var/log/syslog` around 00:00 |
| **Dokploy / Traefik update** | Dokploy logs, “Auto Deploy”, stack redeploy |
| **SSL renewal** | `certbot renew` cron → proxy reload → brief outage |
| **Disk full** | `df -h`; containers fail to start and get replaced |
| **Swarm node drain** | `docker node ls`, `docker service ps` → “shutdown” on all |

**Timezone:** Server may use **UTC**. “Midnight” in Nigeria (WAT) = **23:00 UTC** previous day or **00:00 UTC** depending on host TZ. Check with `timedatectl`.

---

## 3. Get logs when containers are already Dead

Do **not** rely on `docker logs <dead-container-id>`.

```bash
# Swarm — logs survive task replacement
docker service logs dancity-userdashboard --since 24h --timestamps 2>&1 | tail -100
docker service logs dancity-backend --since 24h --timestamps 2>&1 | tail -100
# Use exact service names from: docker service ls

# Last exit per service
docker service ps <service-name> --no-trunc
```

In **Dokploy**: open each app → **Logs** → set range to the failure time.

---

## 4. Dokploy settings (all apps)

Apply to **user dashboard**, **backend**, **landing**, **admin**:

| Setting | Recommendation |
|---------|----------------|
| **Memory** | User FE / Admin: ≥ 512MB–1GB; Backend: ≥ 1–2GB |
| **Health check** | **Off** while stabilizing (see below). Traefik/routing still works without it. |
| **Start period** | Only if you re-enable health checks: ≥ 120s for Next/Nest |
| **Restart policy** | `on-failure`, not aggressive loop |
| **Auto deploy** | Disable scheduled redeploy at 00:00 unless intentional |
| **Replicas** | 1 is fine; if 0 after midnight, something killed the stack |

---

## 5. Repo images (this monorepo)

| App | Dockerfile | Port | Notes |
|-----|------------|------|--------|
| User dashboard | `dancity-user-frontend-v2/Dockerfile` | 3000 | Next.js, `NODE_OPTIONS` heap cap |
| Backend API | `dancity-backend-v2/Dockerfile` | 6565 | NestJS, `NODE_OPTIONS` heap cap |
| Admin | `dancity-admin-frontend/Dockerfile` | 80 | nginx static |
| Landing page | *(separate repo / Dokploy app)* | varies | Same host checks as above |

After Dockerfile changes: rebuild images, push tags, redeploy in Dokploy.

---

## 6. Reduce midnight load on the same VPS (DB up, apps down)

Backend runs **continuous** crons (eSIM every minute, ClickHouse sync every 5 min). They add steady RAM/CPU on the **API container only**.

If **DB containers stay healthy** while apps die, the midnight event is often:

1. **MongoDB backup** (`mongodump`, snapshot) → RAM spike → OOM kills **backend + frontends** first  
2. **ClickHouse** merge/backup at night → same effect  
3. **Dokploy “redeploy all applications”** job that **excludes** database apps  

Mitigations (apps only):

- In Dokploy, **raise memory** on backend (1.5–2GB) and user dashboard (768MB–1GB)  
- **Disable or loosen HTTP health checks** until apps are stable (or `start-period` ≥ 120s)  
- **Stagger DB backups** (e.g. 03:00 WAT) or run backups off-host  
- Do **not** lower app memory to “save RAM” for DB — that makes OOM more likely  
- Optional: set **OOM score** lower for DB in compose (advanced); apps die first by default anyway  

---

## 7. Watch the next failure window

```bash
# Run before midnight, leave running
docker events 2>&1 | tee /tmp/docker-events.log
```

When services die, inspect `/tmp/docker-events.log` for `die`, `oom`, `destroy`, `update`.

---

## 8. Turn off health check in Dokploy (recommended while debugging)

For each **application** (backend, user dashboard, admin, landing):

1. Open the app → **Advanced** tab (`a`)
2. **Swarm settings** → **Health check**
3. **Disable** or clear all health-check fields (test command, interval, retries, start period)
4. **Save** → **Redeploy**

Docker images in this repo **do not** embed `HEALTHCHECK` anymore, so Swarm will not auto-restart tasks for “unhealthy” during slow startup.

You can turn health checks back on later with e.g.:

- **Test:** `CMD-SHELL` `wget -qO- http://127.0.0.1:3000/ || exit 1` (adjust port/path per app)
- **Start period:** `120s`
- **Interval:** `30s`
- **Retries:** `3`

---

## 9. Quick checklist

- [ ] `dmesg` shows OOM? → increase RAM or limits  
- [ ] Root cron at `0 0 * * *`? → change time or disable prune  
- [ ] Dokploy auto-deploy at midnight? → disable  
- [ ] All services same minute? → host/Dokploy, not single app  
- [ ] `docker service ps` shows health check failure? → longer `start-period`, more memory  
