---
name: HarborX
description: Modern, lightweight Docker web management UI & server cockpit
colors:
  primary: "oklch(0.78 0.16 70)"
  primary-foreground: "oklch(0.18 0.02 70)"
  background: "oklch(0.17 0.004 285)"
  surface: "oklch(0.205 0.005 285)"
  card: "oklch(0.215 0.006 285)"
  popover: "oklch(0.23 0.006 285)"
  foreground: "oklch(0.94 0 0)"
  muted: "oklch(0.25 0.005 285)"
  muted-foreground: "oklch(0.66 0.01 285)"
  border: "oklch(1 0 0 / 8%)"
  input: "oklch(1 0 0 / 12%)"
  success: "oklch(0.74 0.15 155)"
  warning: "oklch(0.8 0.15 85)"
  destructive: "oklch(0.65 0.2 25)"
  info: "oklch(0.72 0.12 240)"
typography:
  display:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
  headline:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.3
  micro:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1.2
  nano:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.5625rem"
    fontWeight: 700
    lineHeight: 1
  code:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "16px 20px"
---

# Design System: HarborX

## Overview

**Creative North Star: "The Modern Server Cockpit"**

O HarborX adota a estética de um cockpit operacional de alta precisão: dark mode nativo e imersivo, contraste controlado e densidade de informação equilibrada para operadores de infraestrutura e desenvolvedores. Inspirado em consoles de missões críticas e ferramentas modernas para engenheiros, cada pixel tem propósito funcional.

A interface rejeita elementos puramente decorativos em favor de clareza imediata: dados em tempo real, status de containers comunicados por cores semânticas imediatas, fontes monoespaçadas cirúrgicas para IDs, portas e logs, e acentos em âmbar quente (`primary`) que guiam a ação sem sobrecarregar a visão em sessões noturnas de monitoramento.

**Key Characteristics:**
- **Modo Operate**: foco total em rapidez de escaneamento, previsibilidade de ações e controles táteis confiáveis.
- **Hierarquia Tipográfica Dupla**: `Space Grotesk` para títulos, rótulos e controles; `JetBrains Mono` para identificadores técnicos, hashes, portas, logs e métricas.
- **Tonal Layering Escuro**: superfícies ligeiramente elevadas (`oklch(0.205)`) sobre fundo profundo (`oklch(0.17)`), sem bordas pesadas ou ruídos visuais.
- **Feedback Semântico Rigoroso**: verde para serviços ativos, âmbar para estados parciais/atenção, vermelho para falhas/remoções e ciano para deploys em andamento.

---

## Colors

Paleta dark neutra profunda calibrada no espaço de cor OKLCH com acento primário em âmbar quente/dourado e indicadores semânticos industriais.

- **Background (`--background`)**: `oklch(0.17 0.004 285)` — Base escura de baixo cansaço visual.
- **Surface & Cards (`--surface`, `--card`)**: `oklch(0.205 0.005 285)` / `oklch(0.215 0.006 285)` — Painéis elevados com distinção sutil.
- **Primary Accent (`--primary`)**: `oklch(0.78 0.16 70)` — Âmbar dourado de alta luminosidade para botões principais, seleções ativas e badges em destaque.
- **Borders & Dividers (`--border`)**: `oklch(1 0 0 / 8%)` — Linhas tênues translúcidas que delimitam áreas sem criar caixas duras.
- **Semântica Operacional**:
  - `Running / Operacional`: `oklch(0.74 0.15 155)` (Esmeralda)
  - `Warning / Alerta / Parcial`: `oklch(0.8 0.15 85)` (Âmbar)
  - `Failed / Destrutivo`: `oklch(0.65 0.2 25)` (Carmim / Rosa)
  - `Deploying / Info`: `oklch(0.72 0.12 240)` (Ciano Celeste)

---

## Typography

- **Interface Sans (`--font-sans`)**: `"Space Grotesk", ui-sans-serif, system-ui, sans-serif`
  - Utilizada em cabeçalhos, botões, modais, abas e navegação.
  - Oferece personalidade técnica e moderna com caracteres geométricos legíveis.
- **Código & Dados Mono (`--font-mono`)**: `"JetBrains Mono", ui-monospace, monospace`
  - Obrigatória para nomes de imagens, IDs de containers, portas de rede, variáveis de ambiente, caminhos de volume e terminal web.
  - Alinhamento tabular impecável para números e tabelas de métricas.

---

## Layout

- **Container & Grids**:
  - Grid com coluna única no mobile (`grid-cols-1`) com `minmax(0, 1fr)` para evitar que textos ou blocos de código provoquem scroll horizontal acidental.
  - Quebra progressiva em `sm:grid-cols-2`, `lg:grid-cols-3` e `xl:grid-cols-4` para métricas e indicadores.
- **Espaçamento e Ritmo**:
  - Padrão baseado em múltiplos de 4px (`p-2`, `p-3`, `p-4`, `p-6`).
  - Gaps consistentes de `gap-2` para grupos de botões e `gap-4` a `gap-6` entre painéis.
- **Fichário de Stacks (StackBinderView)**:
  - Agrupamento visual tipo pasta física, destacando a saúde do conjunto no cabeçalho e permitindo expandir/recolher containers internos.
- **Mobile Responsive Cockpit**:
  - No modo smartphone vertical (`320px–430px`), tabelas densas dão lugar a cards táteis verticais com botões confortáveis (`h-8`, `px-2`).
  - Modais ocupam `w-[calc(100dvw-1.5rem)]` com margens de respiro blindadas.

---

## Elevation & Depth

- **Filosofia Tonal**:
  - Profundidade criada principalmente pela luminosidade das camadas (`background` < `surface` < `card` < `popover`), não por sombras escuras artificiais.
- **Bordas Sutis**:
  - As bordas utilizam opacidade baixa (`border-border/60` ou `border-white/8`), funcionando como divisores de luz suave.
- **Glow & Destaque Primário**:
  - Elementos em foco ou estados de deploy ativo utilizam um anel sutil com brilho suave: `0 0 0 1px color-mix(in oklab, var(--primary) 40%, transparent)`.

---

## Shapes

- **Bordas Arredondadas**:
  - Badges e pílulas de status: `rounded-full` ou `rounded-md` (compactos).
  - Botões e inputs: `rounded-md` (6px) para controle cirúrgico.
  - Painéis, cards e gavetas: `rounded-xl` (12px) proporcionando toque refinado.
- **Ícones**:
  - Biblioteca Lucide React com espessura padrão consistente (`size-3.5` para inline, `size-4` para botões padrão, `size-5` para cabeçalhos de seção).

---

## Components

- **StatusPill**: Pílula indicadora com micro-ponto luminoso (`size-1.5 rounded-full`) e texto monoespaçado em caixa baixa (`running`, `exited`, `paused`, `restarting`).
- **TerminalViewer**: Instância xterm.js integrada com addon Fit e WebLinks, fundo `oklch(0.15 0.003 285)` e cursor âmbar piscante.
- **LogViewer**: Terminal virtualizado (`@tanstack/react-virtual`) com suporte a buffers de 50.000+ linhas, filtros por regex e parsing ANSI em tempo real.
- **Sheet de Detalhes com Abas**: Gaveta lateral deslizante que abre diretamente na aba contextual solicitada (`Visão Geral`, `Variáveis`, `Logs`, `Console`, `Métricas`, `Inspecionar`).
- **Modais Destrutivos Seguros**: Exigem confirmação digitando o nome exato do container para exclusões que envolvam bancos de dados ou persistência crítica.

---

## Do's and Don'ts

### Do's:
- **Faça**: Use sempre `min-w-0` e `truncate` em flex items que contenham caminhos, nomes de containers ou URLs longas.
- **Faça**: Mantenha fontes monoespaçadas (`font-mono`) em qualquer ID, hash, porta, comando ou timestamp.
- **Faça**: Trate containers em saúde agregada para que falhas em containers individuais fiquem evidentes no topo da stack.
- **Faça**: Forneça feedback visual contextual imediato em cliques de ação rápida (spinners isolados por linha).

### Don'ts:
- **Não faça**: Nunca utilize `100vw` no layout principal para evitar barras de rolagem horizontais espúrias provocadas pela scrollbar nativa.
- **Não faça**: Não use cores primárias saturadas em fundos inteiros de cards — o âmbar é um acento de precisão, não um plano de fundo.
- **Não faça**: Não execute ações destrutivas sem alerta ou sem verificar a existência de volumes/bancos de dados associados.
- **Não faça**: Não crie tabelas estáticas sem quebra responsiva ou versão em cards para visualização mobile.
