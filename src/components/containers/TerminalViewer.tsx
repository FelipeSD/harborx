import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  AlertCircle,
  Folder,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  Square,
  Terminal as TerminalIcon,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/auth-context.js";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";

interface TerminalViewerProps {
  containerId: string;
  containerName?: string;
  containerState?: string;
  className?: string;
}

export function TerminalViewer({
  containerId,
  containerName,
  containerState = "running",
  className = "",
}: TerminalViewerProps) {
  const { user } = useAuth();
  const isViewer = user?.role === "viewer";

  const [shell, setShell] = useState<string>("/bin/sh");
  const [execUser, setExecUser] = useState<string>("root");
  const [workdir, setWorkdir] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const terminalElementRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const isRunning = containerState === "running";

  const connectTerminal = () => {
    if (isViewer || !isRunning) return;

    // Disconnect any existing session
    disconnectTerminal();

    setIsConnecting(true);
    setStatusMessage(null);

    const termElement = terminalElementRef.current;
    if (!termElement) return;

    // Clear previous DOM contents
    termElement.innerHTML = "";

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 13,
      lineHeight: 1.25,
      fontFamily:
        'ui-monospace, SFMono-Regular, "JetBrains Mono", "Fira Code", Menlo, Consolas, monospace',
      theme: {
        background: "#09090b", // zinc-950
        foreground: "#f4f4f5", // zinc-100
        cursor: "#06b6d4", // cyan-500
        cursorAccent: "#09090b",
        selectionBackground: "#155e75", // cyan-900
        black: "#27272a",
        red: "#ef4444",
        green: "#10b981",
        yellow: "#f59e0b",
        blue: "#3b82f6",
        magenta: "#ec4899",
        cyan: "#06b6d4",
        white: "#f4f4f5",
        brightBlack: "#52525b",
        brightRed: "#f87171",
        brightGreen: "#34d399",
        brightYellow: "#fbbf24",
        brightBlue: "#60a5fa",
        brightMagenta: "#f472b6",
        brightCyan: "#22d3ee",
        brightWhite: "#ffffff",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(termElement);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln(
      `\x1b[36m[HarborX]\x1b[0m Conectando ao container \x1b[1m${containerName || containerId}\x1b[0m via \x1b[33m${shell}\x1b[0m...`,
    );

    // Build WebSocket URL
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const params = new URLSearchParams();
    params.set("shell", shell);
    if (execUser) params.set("user", execUser);
    if (workdir) params.set("workdir", workdir);
    params.set("cols", String(term.cols));
    params.set("rows", String(term.rows));

    const wsUrl = `${protocol}//${host}/ws/containers/${containerId}/exec?${params.toString()}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setIsConnecting(false);
      term.focus();
    };

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    ws.onclose = (event) => {
      setIsConnected(false);
      setIsConnecting(false);
      if (event.code !== 1000) {
        term.writeln(
          `\r\n\x1b[31m[HarborX] Conexão encerrada (código ${event.code}: ${event.reason || "desconectado"})\x1b[0m`,
        );
      }
    };

    ws.onerror = () => {
      setIsConnected(false);
      setIsConnecting(false);
      setStatusMessage("Erro de conexão com o terminal");
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  };

  const disconnectTerminal = () => {
    if (wsRef.current) {
      wsRef.current.close(1000, "User disconnected");
      wsRef.current = null;
    }
    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  };

  // ResizeObserver for auto-fit
  useEffect(() => {
    const termElement = terminalElementRef.current;
    if (!termElement) return;

    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && termRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          fitAddonRef.current.fit();
          const { cols, rows } = termRef.current;
          wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
        } catch {
          // Ignore resize layout errors
        }
      }
    });

    resizeObserver.observe(termElement);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectTerminal();
    };
  }, []);

  const handleClear = () => {
    if (termRef.current) {
      termRef.current.clear();
      termRef.current.focus();
    }
  };

  if (isViewer) {
    return (
      <div className={`p-6 rounded-lg border bg-zinc-950 text-zinc-100 ${className}`}>
        <Alert className="border-amber-500/40 bg-amber-500/10">
          <AlertCircle className="size-4 text-amber-500" />
          <AlertTitle>Permissão de Operador Necessária</AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground mt-1">
            Seu usuário atual possui papel de <strong>Visualizador</strong> (apenas leitura). A
            execução de terminal interativo (<code>docker exec</code>) requer permissão de{" "}
            <strong>Operador</strong> ou <strong>Administrador</strong>.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!isRunning) {
    return (
      <div className={`p-6 rounded-lg border bg-zinc-950 text-zinc-100 ${className}`}>
        <Alert className="border-amber-500/40 bg-amber-500/10">
          <AlertCircle className="size-4 text-amber-500" />
          <AlertTitle>Container Não Está em Execução</AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground mt-1">
            Para entrar no console do container, o mesmo precisa estar no estado{" "}
            <span className="text-emerald-400 font-semibold">running</span>. Inicie o container
            antes de abrir o terminal.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-zinc-950 text-zinc-100 rounded-lg border border-zinc-800 overflow-hidden ${
        isFullscreen
          ? "fixed inset-0 z-50 rounded-none border-none"
          : "min-h-[350px] h-[55dvh] sm:h-[620px]"
      } ${className}`}
    >
      {/* Terminal Settings & Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-800 text-xs">
        {/* Left Side: Shell Options */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Shell Dropdown */}
          <div className="flex items-center gap-1.5">
            <TerminalIcon className="size-3.5 text-cyan-400" />
            <select
              value={shell}
              onChange={(e) => setShell(e.target.value)}
              disabled={isConnected || isConnecting}
              className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 outline-none disabled:opacity-50"
            >
              <option value="/bin/sh">/bin/sh (Universal)</option>
              <option value="/bin/bash">/bin/bash (Ubuntu/Debian)</option>
              <option value="/bin/ash">/bin/ash (Alpine)</option>
              <option value="/bin/zsh">/bin/zsh</option>
              <option value="powershell">powershell (Windows)</option>
            </select>
          </div>

          {/* User Input */}
          <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5">
            <UserIcon className="size-3 text-zinc-500" />
            <input
              type="text"
              value={execUser}
              onChange={(e) => setExecUser(e.target.value)}
              disabled={isConnected || isConnecting}
              placeholder="root"
              className="w-16 bg-transparent text-xs text-zinc-200 outline-none disabled:opacity-50"
              title="Usuário no container (ex: root, 1000:1000)"
            />
          </div>

          {/* Workdir Input */}
          <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5">
            <Folder className="size-3 text-zinc-500" />
            <input
              type="text"
              value={workdir}
              onChange={(e) => setWorkdir(e.target.value)}
              disabled={isConnected || isConnecting}
              placeholder="/ (workdir)"
              className="w-24 bg-transparent text-xs text-zinc-200 outline-none disabled:opacity-50"
              title="Diretório de trabalho inicial"
            />
          </div>

          {/* Connect / Disconnect Button */}
          {isConnected ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={disconnectTerminal}
              className="h-7 px-2.5 text-xs font-sans gap-1"
            >
              <Square className="size-3 fill-current" />
              Desconectar
            </Button>
          ) : (
            <Button
              size="sm"
              variant="default"
              onClick={connectTerminal}
              disabled={isConnecting}
              className="h-7 px-2.5 text-xs font-sans gap-1 bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              <Play className="size-3 fill-current" />
              {isConnecting ? "Conectando..." : "Conectar"}
            </Button>
          )}
        </div>

        {/* Right Side: Tools & Fullscreen */}
        <div className="flex items-center gap-1.5">
          {isConnected && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClear}
              className="h-7 px-2 text-zinc-400 hover:text-white text-xs font-sans"
              title="Limpar tela do terminal"
            >
              <Trash2 className="size-3.5 mr-1" />
              Limpar
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsFullscreen((v) => !v)}
            className="h-7 px-2 text-zinc-400 hover:text-white text-xs font-sans"
            title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
          >
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>

          {/* Connection status dot */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-800">
            <span
              className={`size-2 rounded-full ${
                isConnected
                  ? "bg-emerald-500 animate-pulse"
                  : isConnecting
                    ? "bg-amber-500 animate-ping"
                    : "bg-zinc-600"
              }`}
            />
            <span className="text-[11px] text-zinc-400 font-sans">
              {isConnected ? "Conectado" : isConnecting ? "Conectando..." : "Desconectado"}
            </span>
          </div>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="relative flex-1 bg-zinc-950 p-2 overflow-hidden overscroll-contain">
        {!isConnected && !isConnecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 z-10 space-y-3">
            <TerminalIcon className="size-8 text-zinc-600" />
            <p className="text-zinc-400 text-xs font-sans text-center max-w-sm px-4">
              Console interativo dentro do container <strong>{containerName || containerId}</strong>
              . Clique em <strong>Conectar</strong> para abrir uma sessão shell.
            </p>
            <Button
              size="sm"
              onClick={connectTerminal}
              className="bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5 font-sans text-xs"
            >
              <Play className="size-3.5 fill-current" />
              Iniciar Terminal
            </Button>
          </div>
        )}

        <div ref={terminalElementRef} className="h-full w-full" />
      </div>

      {/* Footer info bar */}
      <div className="flex flex-wrap items-center justify-between gap-1 px-3 py-1 bg-zinc-900 border-t border-zinc-800 text-[11px] text-zinc-500 font-sans select-none">
        <div className="truncate">
          Shell: <code className="text-zinc-400">{shell}</code> | Usuário:{" "}
          <code className="text-zinc-400">{execUser || "padrão"}</code>
        </div>
        <div className="hidden sm:block">
          <span>xterm.js + PTY Stream via Docker Exec</span>
        </div>
      </div>
    </div>
  );
}
