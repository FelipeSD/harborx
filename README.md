# HarborX

> Modern, lightweight, and high-performance Docker web management UI for virtual machines and servers. A sleek, fast alternative to Portainer packaged as a single lightweight Docker container.

[🇺🇸 English](README.md) | [🇧🇷 Português](README.pt-BR.md)

[![Docker Pulls](https://img.shields.io/docker/pulls/felipesdam496/harborx?style=flat-square&logo=docker)](https://hub.docker.com/r/felipesdam496/harborx)
[![Image Size](https://img.shields.io/docker/image-size/felipesdam496/harborx/latest?style=flat-square)](https://hub.docker.com/r/felipesdam496/harborx)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

## ⚡ Features

- **Real-Time Host & Container Dashboard**: Live CPU %, RAM, and disk utilization graphs (24h history) with Docker daemon event streaming.
- **Interactive Web Terminal (Exec / Console)**: Full xterm.js PTY shell in your browser with dynamic terminal resizing and auto-detected shells (`bash`, `sh`, `zsh`, `ash`).
- **Live Logs Viewer with ANSI & Virtualization**: Fast streaming stdout/stderr with `@tanstack/react-virtual` handling 50,000+ lines with regex search and pause buffer.
- **Docker Compose Stacks & GitOps**: Built-in compose editor, Git repository sync, and unique webhook endpoints for automated CI/CD redeployments.
- **Binder-style Stack Organizer**: Beautiful visual folders grouping containers by stack with resource usage tagging (`inUseBy`) across images, volumes, and networks.
- **Live Notification Center**: Header bell with real-time alerts for container failures, starts, and image downloads via WebSocket.
- **100% Mobile Responsive**: Dedicated slide-over drawer and touch-friendly container cards designed for smartphone management on the go.
- **Lightweight Footprint**: Embedded SQLite with WAL mode, consuming only ~45–75 MB of RAM and negligible CPU.
- **Role-Based Access Control (RBAC)**: Fine-grained `admin`, `operator`, and `viewer` roles with Argon2id passwords and encrypted credential vaults (AES-256-GCM).

---

## 🚀 Quickstart: Run on a Linux VM via Terminal

Deploy HarborX on your virtual machine using Docker Compose in 3 simple terminal steps.

### Step 1: Create the directory and `.env` file

Connect to your server terminal via SSH and run:

```bash
# 1. Create HarborX directories
sudo mkdir -p /opt/harborx/data && cd /opt/harborx

# 2. Generate a secure random 32-byte secret in your .env file
cat <<EOF > .env
HARBORX_SECRET=$(openssl rand -hex 32)
COOKIE_SECURE=false
EOF
```

> [!NOTE]
> If you are serving HarborX through HTTPS (behind a reverse proxy such as Nginx, Traefik, or Caddy), set `COOKIE_SECURE=true`.

---

### Step 2: Create `docker-compose.yml`

Create your `docker-compose.yml` file in `/opt/harborx/docker-compose.yml`:

```yaml
services:
  harborx:
    image: felipesdam496/harborx:latest
    container_name: harborx
    restart: unless-stopped

    security_opt:
      - no-new-privileges:true

    # If accessing directly without a reverse proxy, expose port 8080:
    ports:
      - "8080:8080"

    environment:
      # Generate with: openssl rand -hex 32 (placed in .env file)
      HARBORX_SECRET: ${HARBORX_SECRET:?set HARBORX_SECRET in .env}
      # Must be the SAME path inside and outside the container for stack bind mounts.
      HARBORX_DATA_DIR: /opt/harborx/data
      # Set to "true" when serving through HTTPS.
      COOKIE_SECURE: ${COOKIE_SECURE:-false}

    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /opt/harborx/data:/opt/harborx/data

volumes:
  harborx-data:

networks:
  proxy:
    external: true
```

> [!TIP]
> **Using an external `proxy` network?**
> If your `proxy` network does not exist yet, create it once:
>
> ```bash
> docker network create proxy 2>/dev/null || true
> ```
>
> If you don't use an external proxy network, you can remove the `networks:` block or set `networks: [default]`.

---

### Step 3: Start HarborX

Launch the container in detached mode:

```bash
docker compose up -d
```

Check the status:

```bash
docker compose logs -f harborx
```

---

## 🔑 Initial Setup & First Login

1. Open your web browser and navigate to:
   ```text
   http://<YOUR_VM_IP>:8080
   ```
2. When launching HarborX for the first time, you will be automatically prompted to create the **primary Administrator account**.
3. Choose your administrator username and password to access the full management dashboard.

---

## ⚙️ Environment Variables Reference

| Variable           | Required |       Default       | Description                                                                                                         |
| :----------------- | :------: | :-----------------: | :------------------------------------------------------------------------------------------------------------------ |
| `HARBORX_SECRET`   | **Yes**  |          —          | 32-byte hexadecimal secret key used for session signing and AES-256-GCM encryption.                                 |
| `HARBORX_DATA_DIR` |    No    | `/opt/harborx/data` | Path on the host where SQLite database, stacks, and Git repositories are stored. Must match host & container paths. |
| `COOKIE_SECURE`    |    No    |       `false`       | Enables the `Secure` flag on cookies. Set to `true` when running behind an SSL/TLS reverse proxy.                   |
| `PORT`             |    No    |       `8080`        | Internal port Fastify listens on inside the container.                                                              |
| `NODE_ENV`         |    No    |    `production`     | Application execution mode.                                                                                         |

---

## 🌐 Reverse Proxy Examples

### Nginx Proxy Manager / Nginx

```nginx
server {
    server_name harborx.yourdomain.com;

    location / {
        proxy_pass http://harborx:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400; # Necessary for long-lived WebSocket connections (logs and exec)
    }
}
```

### Traefik (Docker Labels)

Add these labels to the `harborx` service in `docker-compose.yml`:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.harborx.rule=Host(`harborx.yourdomain.com`)"
  - "traefik.http.routers.harborx.entrypoints=websecure"
  - "traefik.http.routers.harborx.tls.certresolver=letsencrypt"
  - "traefik.http.services.harborx.loadbalancer.server.port=8080"
```

---

## 🔒 Security Best Practices

- **Docker Socket Access**: `/var/run/docker.sock` grants root-equivalent control over the host Docker daemon. Keep HarborX protected behind strong credentials and HTTPS.
- **`no-new-privileges`**: The compose file enables `no-new-privileges:true` to prevent privilege escalation attacks.
- **Zero Cloud Leakage**: HarborX runs completely self-contained on your infrastructure. All metrics, audit logs, and configs remain inside the local SQLite database.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
