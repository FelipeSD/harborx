# HarborX (Docker Harmony Hub)

> Um gerenciador Docker moderno, visual e de alta performance para VMs e servidores — alternativa leve e elegante ao Portainer, distribuído como um único container Docker.

[🇺🇸 English](README.md) | [🇧🇷 Português](README.pt-BR.md)

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
- **Centro de Notificações em Tempo Real**:
  - Sino ativo no cabeçalho integrado ao `/ws/events` do Docker.
  - Alertas automáticos para containers que iniciam, param inesperadamente ou falham.
  - Histórico de notificações com status visual e persistência local.
- **Interface Responsiva para Dispositivos Móveis**:
  - Menu gaveta lateral deslizante para celulares e tablets.
  - Visualização em cartões de containers adaptada para telas de toque sensíveis.
- **Fichário Elegante de Stacks Docker Compose**:
  - Agrupamento visual de containers por projeto/stack com divisórias de pastas expansíveis.
  - Marcação de dependências e uso de recursos (`inUseBy`) em imagens, volumes e redes.
  - Poda com 1 clique de imagens dangling e do cache de build do Docker BuildKit.
- **Cofre de Registros Privados (AES-256-GCM)**:
  - Autenticação com Docker Hub, GitHub Container Registry (ghcr.io), GitLab e registros privados (Harbor, Nexus).
  - Senhas e tokens de acesso armazenados de forma criptografada usando AES-256-GCM.
- **Stacks Docker Compose & GitOps**:
  - Editor web de arquivos `docker-compose.yml` com modelos prontos (Postgres, Redis, WordPress, Nginx).
  - Sincronização direta com repositórios Git públicos ou privados.
  - URLs de Webhooks únicas por stack para acionar redeploys automáticos a partir do GitHub Actions ou pipelines CI/CD.
- **Segurança & Controle de Acesso (RBAC)**:
  - **Administrador**: Controle irrestrito do sistema, gestão de usuários, backups SQLite e poda de recursos.
  - **Operador**: Criação e controle de containers, logs, terminal interativo, stacks e imagens.
  - **Visualizador**: Acesso de somente leitura para monitoramento seguro e logs.

---

## 🚀 Instalação Rápida em VM / Servidor Linux via Docker Compose

### 1. Criar diretório e configurar segredos

```bash
mkdir -p /opt/harborx && cd /opt/harborx
sudo mkdir -p /opt/harborx/data

# Gerar segredo criptográfico no arquivo .env
echo "HARBORX_SECRET=$(openssl rand -hex 32)" > .env
echo "COOKIE_SECURE=false" >> .env
```

### 2. Criar o arquivo `docker-compose.yml`

```yaml
services:
  harborx:
    image: felipesdam496/harborx:latest
    container_name: harborx
    restart: unless-stopped

    security_opt:
      - no-new-privileges:true

    ports:
      - "8080:8080" # Remova se utilizar proxy reverso (Traefik / Nginx) na rede proxy

    environment:
      HARBORX_SECRET: ${HARBORX_SECRET:?set HARBORX_SECRET in .env}
      HARBORX_DATA_DIR: /opt/harborx/data
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

> [!NOTE]
> Se a rede `proxy` for externa, crie-a antes se ainda não existir:
> `docker network create proxy || true`

### 3. Iniciar o HarborX

```bash
docker compose up -d
```

Acesse: `http://<ip-da-vm>:8080` e crie a conta de administrador inicial.

---

## 🔒 Segurança

- O socket `/var/run/docker.sock` confere controle do Docker Engine local. Mantenha o servidor protegido.
- Ao utilizar SSL/TLS através de proxy reverso (Nginx, Traefik, Caddy), configure `COOKIE_SECURE=true` no `.env`.
- Credenciais de registros privados são criptografadas em repouso no SQLite com cifra AES-256-GCM.

# Comandos Impeccable para UX/UI

| Comando / Intenção | O que o Gemini faz | Exemplo de Prompt |
| :--- | :--- | :--- |
| **`audit`** | Auditoria técnica de UX, acessibilidade (a11y), contraste e responsividade. | *"Impeccable: faça um audit na tela de Containers e no Fichário de Stacks."* |
| **`critique`** | Avaliação heurística de usabilidade, hierarquia visual e fricção da interface. | *"Impeccable: faça um critique do modal de criação de container."* |
| **`polish`** | Acabamento fino de espaçamento, tipografia, microalinhamentos e bordas. | *"Impeccable: faça um polish na página de Webhooks GitOps."* |
| **`harden`** | Prepara a interface para estados de erro, carregamento lento, textos longos e estados vazios (*empty states*). | *"Impeccable: aplique harden na listagem de volumes e redes."* |
| **`bolder` / `quieter`** | Aumenta a presença visual e o contraste (*bolder*) ou suaviza os ruídos visuais (*quieter*). | *"Impeccable: deixe o Dashboard (visão geral) mais bold e contrastante."* |
| **`animate`** | Adiciona microinterações, transições de estado e feedback visual com propósito. | *"Impeccable: adicione microinterações nas mudanças de status dos containers."* |
| **`adapt`** | Adapta layouts complexos para telas pequenas sem comprometer a experiência no desktop. | *"Impeccable: faça o adapt das tabelas de métricas para smartphones."* |

## Como utilizar

1. Identifique a tela ou o componente que deseja melhorar.
2. Escolha o comando mais adequado ao objetivo.
3. Descreva o contexto e o resultado esperado no prompt.
4. Execute a análise ou as alterações e valide o resultado em diferentes tamanhos de tela.

### Exemplo de uso

> Impeccable: faça um audit na tela de Containers, identificando problemas de acessibilidade, contraste, responsividade e hierarquia visual. Apresente os problemas encontrados e as melhorias recomendadas antes de modificar o código.