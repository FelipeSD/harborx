# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

DevOps, engenheiros de software, administradores de sistemas e entusiastas de homelab gerenciando containers Docker, stacks Compose e recursos de infraestrutura em servidores virtuais (VMs) na nuvem ou bare-metal.

## Product Purpose

Prover uma plataforma web moderna, rápida e extremamente leve para gerenciar e monitorar recursos Docker (containers, imagens, volumes, redes e stacks) em servidores remotos, com terminal interativo, streaming de logs e GitOps automatizado, dispensando o terminal SSH para tarefas rotineiras do dia a dia.

## Positioning

Alternativa moderna e enxuta ao Portainer e Dockge: consome apenas ~50–75 MB de RAM graças ao SQLite WAL embarcado e backend Fastify, com Fichário visual de Stacks, web terminal integrado (xterm.js) e webhooks GitOps nativos para CI/CD sem dependências externas pesadas.

## Operating Context

Painel de controle em produção e homelabs acessado via navegador web (desktop e mobile), operando diretamente sobre o socket `/var/run/docker.sock` em VMs Linux (Ubuntu, Debian, etc.), frequentemente exposto atrás de proxies reversos (Cloudflare, Nginx Proxy Manager, Traefik, Caddy).

## Capabilities and Constraints

- Monitoramento de métricas em tempo real (CPU, RAM, disco) com histórico de 24h.
- Gerenciamento completo do ciclo de vida de containers (iniciar, pausar, parar, reiniciar, recriar com repull, duplicar, renomear e remoção segura com backup de banco).
- Logs ao vivo virtualizados com xterm e TanStack Virtual capazes de manipular 50.000+ linhas sem lentidão.
- Terminal interativo web (exec/PTY) com auto-detecção de shells (`bash`, `sh`, `zsh`, `ash`).
- Organização em Fichário visual de Stacks com cálculo dinâmico de saúde e colorização por estado.
- GitOps com sincronização de repositórios Git, editor de docker-compose e webhooks com repull automático para CI/CD.
- RBAC com papéis `admin`, `operator` e `viewer`, senhas Argon2id e cofre de credenciais encriptado com AES-256-GCM.
- Restrições: Operação baseada no Docker Engine socket local; single-tenant por instância com RBAC interno; branch sincronizada com Lovable sem reescrita de histórico git.

## Brand Commitments

- Nome: HarborX.
- Tom de voz: Técnico, direto, conciso, confiável e focado em produtividade operacional.
- Identidade visual: "The Modern Server Cockpit" — Dark mode nativo com acentos âmbar dourados, tipografia de alta legibilidade (Space Grotesk e JetBrains Mono).

## Evidence on Hand

- Repositório com arquitetura cliente-servidor completa (TanStack Start/Vite + Fastify).
- Imagem Docker oficial multi-arquitetura (`felipesdam496/harborx:latest` para linux/amd64 e linux/arm64).
- Documentação bilíngue de instalação (`README.md` e `README.pt-BR.md`).
- Conjunto de testes automatizados com Vitest e tipagem estrita com TypeScript.

## Product Principles

1. **Leveza e Desempenho Operacional**: Carregamento instantâneo, baixo consumo de memória (~50MB) e zero sobrecarga no host Docker.
2. **Segurança sem Fricção**: Autenticação com Argon2id, sessões seguras, proteção contra exclusão acidental (exigindo digitação do nome e backup automático de bancos de dados) e cofre criptografado.
3. **Visibilidade Imediata da Infraestrutura**: Status visual claro da saúde dos serviços de relance (cores de fichário, badges, gráficos de métricas ao vivo e notificações).
4. **Pronto para Automação (GitOps First)**: Webhooks únicos por stack para atualização contínua acionada por pipelines como GitHub Actions.
5. **Responsividade Total (Mobile Cockpit)**: Todas as ações de gerenciamento e monitoramento de emergência utilizáveis em smartphones no modo retrato sem overflow.

## Accessibility & Inclusion

- Contraste semântico em dark mode para estados operacionais (verde esmeralda, âmbar alerta, vermelho destrutivo, azul ciano informativo).
- Ações críticas e destrutivas exigem confirmação explícita com proteção contra digitação incorreta.
- Navegação fluida por teclado e compatibilidade com leitores de tela em tabelas e modais.

