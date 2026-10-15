# HarborX (Docker Harmony Hub)

> Um gerenciador Docker moderno, visual e de alta performance para VMs e servidores — alternativa leve e elegante ao Portainer, distribuído como um único container Docker.

---

## ⚡ Principais Funcionalidades

- **Dashboard 100% em Tempo Real**: Métricas de host (CPU %, RAM, Disco) com histórico de 24h, contagem de containers ativos e streaming contínuo de eventos do Docker Engine.
- **Visualizador de Logs com ANSI & Virtualização**:
  - WebSocket bidirecional streaming logs demuxados (stdout / stderr).
  - Virtualização com `@tanstack/react-virtual` para suportar 50.000+ linhas sem travamento.
  - Busca regex/texto, coloração ANSI com `anser`, pausa de buffer e auto-scroll inteligente.
- **Console Web Interativo (Exec / Terminal)**:
  - Terminal real no navegador motorizado por `@xterm/xterm` e `@xterm/addon-fit`.
  - Suporte completo a PTY interativo com redimensionamento dinâmico de janela (`resize`).
  - Detecção automática de shells disponíveis (`/bin/bash`, `/bin/sh`, `/bin/ash`, `/bin/zsh`, `powershell`).
- **Métricas de Containers ao Vivo**: Gráficos de CPU %, Memória MB/%, Tráfego de Rede (RX/TX KB/s), E/S de bloco e contagem de threads/PIDs em tempo real.
- **Gestão Completa de Containers**:
  - Assistente de criação com mapeamento de portas, volumes, variáveis de ambiente e limites de recursos.
  - Ações de ciclo de vida com 1 clique: Iniciar, Parar, Reiniciar, Pausar, Despausar, Duplicar, Renomear, Recriar com pull da imagem mais recente e Remoção forçada.
  - Proteção contra auto-exclusão do container do HarborX.
- **Imagens com Download em Tempo Real**:
  - Download streaming camada por camada (progresso visual de download e extração).
  - Inspeção de camadas e histórico do Dockerfile.
  - Poda (prune) de imagens dangling/não utilizadas.
- **Redes & Volumes Inteligentes**:
  - Criação de redes bridge, macvlan e overlay com subnets isoladas.
  - Conexão e desconexão de containers em tempo de execução.
  - Detecção e exibição visual de quais containers estão usando cada volume persistente para evitar perda acidental de dados.
- **Cofre de Registros Privados (AES-256-GCM)**:
  - Autenticação com Docker Hub, GitHub Container Registry (ghcr.io), GitLab e registros privados (Harbor, Nexus).
  - Senhas e tokens de acesso armazenados de forma criptografada usando AES-256-GCM.
- **Stacks Docker Compose & GitOps**:
  - Editor web de arquivos `docker-compose.yml` com modelos prontos (Postgres, Redis, WordPress, Nginx).
  - Sincronização direta com repositórios Git públicos ou privados.
  - URLs de Webhooks únicas por stack para acionar redeploys automáticos a partir do GitHub Actions ou pipelines CI/CD.
- **Segurança & Controle de Acesso (RBAC)**:
  - Perfis de acesso rígidos:
    - **Administrador**: Controle total, gestão de usuários, backups e limpeza do sistema.
    - **Operador**: Criação e controle de containers, logs, terminal interativo, stacks e imagens.
    - **Visualizador**: Acesso de somente leitura para monitoramento seguro e logs.
  - Trilha de auditoria completa gravada em SQLite WAL.
  - Proteção CSRF, cookies HttpOnly e senhas criptografadas com Argon2id.

---

## 🚀 Instalação Rápida em VM / Servidor Linux

### Opção 1: Via Docker Run (1 comando)

```bash
docker run -d \
  --name harborx \
  --restart always \
  -p 3000:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v harborx-data:/data \
  -e HARBORX_SECRET="$(openssl rand -hex 32)" \
  felip/harborx:latest
```

Acesse: `http://<ip-da-vm>:3000` e configure a conta de administrador inicial.

---

### Opção 2: Via Docker Compose

Crie um arquivo `docker-compose.yml`:

```yaml
services:
  harborx:
    image: felip/harborx:latest
    container_name: harborx
    restart: unless-stopped
    ports:
      - "3000:8080"
    environment:
      - NODE_ENV=production
      - HARBORX_SECRET=crie_uma_chave_secreta_com_pelo_menos_32_caracteres_hex
      - HARBORX_DATA_DIR=/data
      - COOKIE_SECURE=false # Defina como true se usar HTTPS com proxy reverso (Nginx, Traefik, Caddy)
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - harborx-data:/data

volumes:
  harborx-data:
```

Execute:
```bash
docker compose up -d
```

---

## 🔄 GitOps: Auto-deploy com GitHub Actions

Cada stack criada no HarborX gera uma URL de webhook única. Para acionar o deploy automático ao fazer push no GitHub, adicione o seguinte step no seu workflow `.github/workflows/deploy.yml`:

```yaml
name: Deploy to HarborX

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger HarborX Redeploy
        run: |
          curl -fsS -X POST "http://sua-vm:3000/api/public/hooks/SEU_TOKEN_DE_WEBHOOK"
```

---

## 🛠️ Desenvolvimento Local

Requisitos: [Bun](https://bun.sh) ou Node.js 22+.

```bash
# Instalar dependências
bun install

# Executar suíte de testes (Vitest)
bun run test

# Executar em modo de desenvolvimento
bun run dev

# Compilar aplicação completa (Front-end SPA + Fastify Server)
bun run build
bun run build:server
```

---

## 🔒 Segurança

- O acesso ao socket `/var/run/docker.sock` confere privilégios equivalentes a root na máquina host.
- Em ambientes de produção abertos para a internet, utilize um proxy reverso com certificado SSL/TLS (Caddy, Traefik ou Nginx) e defina `COOKIE_SECURE=true`.
- Todos os segredos e credenciais de registros privados são protegidos no banco de dados local com cifra de fluxo autenticada **AES-256-GCM**.
