import { useVirtualizer } from "@tanstack/react-virtual";
import anser from "anser";
import {
  AlertCircle,
  ArrowDown,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
  Pause,
  Play,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { LogLine, LogWsMessage } from "../../../shared/types.js";
import { WebSocketClient, type WsStatus } from "../../lib/ws.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";

const MAX_BUFFER_LINES = 10000;

interface LogViewerProps {
  containerId: string;
  containerName?: string;
  className?: string;
}

interface AnserSpan {
  content: string;
  color?: string | null;
  bg?: string | null;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export function LogViewer({ containerId, containerName, className = "" }: LogViewerProps) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const [isPaused, setIsPaused] = useState(false);
  const [pausedCount, setPausedCount] = useState(0);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [streamFilter, setStreamFilter] = useState<"all" | "out" | "err">("all");
  const [tailCount, setTailCount] = useState<number>(200);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [onlyShowMatches, setOnlyShowMatches] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);
  const wsClientRef = useRef<WebSocketClient<LogWsMessage> | null>(null);
  const pausedQueueRef = useRef<LogLine[]>([]);
  const lastTimestampRef = useRef<string>("");
  const isAutoScrollRef = useRef(isAutoScroll);
  isAutoScrollRef.current = isAutoScroll;
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  // Raf batching buffer
  const incomingBatchRef = useRef<LogLine[]>([]);
  const rafIdRef = useRef<number | null>(null);

  // Connect to WebSocket
  useEffect(() => {
    let active = true;

    const buildWsUrl = () => {
      const params = new URLSearchParams();
      params.set("tail", String(tailCount));
      params.set("timestamps", "1");
      if (lastTimestampRef.current) {
        const sinceSec = Math.floor(new Date(lastTimestampRef.current).getTime() / 1000);
        if (sinceSec > 0) {
          params.set("since", String(sinceSec));
        }
      }
      return `/ws/containers/${containerId}/logs?${params.toString()}`;
    };

    const processIncomingBatch = () => {
      rafIdRef.current = null;
      if (!active || incomingBatchRef.current.length === 0) return;

      const newBatch = incomingBatchRef.current;
      incomingBatchRef.current = [];

      if (isPausedRef.current) {
        pausedQueueRef.current.push(...newBatch);
        setPausedCount(pausedQueueRef.current.length);
        return;
      }

      setLines((prev) => {
        const combined = [...prev, ...newBatch];
        if (combined.length > MAX_BUFFER_LINES) {
          return combined.slice(-MAX_BUFFER_LINES);
        }
        return combined;
      });

      // Update highest timestamp
      const lastLine = newBatch[newBatch.length - 1];
      if (lastLine?.ts) {
        lastTimestampRef.current = lastLine.ts;
      }
    };

    const client = new WebSocketClient<LogWsMessage>({
      url: buildWsUrl(),
      onStatusChange: (status) => {
        if (active) setWsStatus(status);
      },
      onMessage: (msg) => {
        if (!active) return;
        if (msg.t === "batch" && Array.isArray(msg.lines)) {
          incomingBatchRef.current.push(...msg.lines);
          if (!rafIdRef.current) {
            rafIdRef.current = requestAnimationFrame(processIncomingBatch);
          }
        }
      },
    });

    wsClientRef.current = client;
    client.connect();

    return () => {
      active = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      client.disconnect();
    };
  }, [containerId, tailCount]);

  // Handle resume from pause
  const togglePause = () => {
    if (isPaused) {
      if (pausedQueueRef.current.length > 0) {
        const queue = pausedQueueRef.current;
        pausedQueueRef.current = [];
        setPausedCount(0);
        setLines((prev) => {
          const combined = [...prev, ...queue];
          return combined.length > MAX_BUFFER_LINES ? combined.slice(-MAX_BUFFER_LINES) : combined;
        });
      }
      setIsPaused(false);
    } else {
      setIsPaused(true);
    }
  };

  const handleClear = () => {
    setLines([]);
    pausedQueueRef.current = [];
    setPausedCount(0);
  };

  const handleDownload = () => {
    const content = lines
      .map((l) => `${showTimestamps ? `[${l.ts}] ` : ""}[${l.s.toUpperCase()}] ${l.m}`)
      .join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${containerName || containerId}-logs.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered lines
  const filteredLines = useMemo(() => {
    return lines.filter((line) => {
      if (streamFilter === "out" && line.s !== "out") return false;
      if (streamFilter === "err" && line.s !== "err") return false;
      if (onlyShowMatches && searchQuery.trim()) {
        return line.m.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [lines, streamFilter, onlyShowMatches, searchQuery]);

  // Search match indices
  const matchIndices = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const indices: number[] = [];
    filteredLines.forEach((l, idx) => {
      if (l.m.toLowerCase().includes(query)) {
        indices.push(idx);
      }
    });
    return indices;
  }, [filteredLines, searchQuery]);

  // Virtualizer
  const rowVirtualizer = useVirtualizer({
    count: filteredLines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 25,
  });

  // Auto-scroll to bottom
  useEffect(() => {
    if (isAutoScroll && !isPaused && filteredLines.length > 0) {
      rowVirtualizer.scrollToIndex(filteredLines.length - 1, { align: "end" });
    }
  }, [filteredLines.length, isAutoScroll, isPaused, rowVirtualizer]);

  // Scroll detection to disable auto-scroll when user scrolls up
  const handleScroll = () => {
    if (!parentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    if (isAtBottom !== isAutoScrollRef.current) {
      setIsAutoScroll(isAtBottom);
    }
  };

  const jumpToMatch = (direction: "next" | "prev") => {
    if (matchIndices.length === 0) return;
    let nextIndex = direction === "next" ? currentMatchIndex + 1 : currentMatchIndex - 1;
    if (nextIndex >= matchIndices.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = matchIndices.length - 1;

    setCurrentMatchIndex(nextIndex);
    const targetRow = matchIndices[nextIndex];
    if (targetRow !== undefined) {
      setIsAutoScroll(false);
      rowVirtualizer.scrollToIndex(targetRow, { align: "center" });
    }
  };

  return (
    <div
      className={`flex flex-col h-full bg-zinc-950 text-zinc-100 font-mono text-xs rounded-lg border border-zinc-800 overflow-hidden ${className}`}
    >
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-800 text-zinc-300 select-none">
        {/* Left side actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Pause / Resume */}
          <Button
            size="sm"
            variant={isPaused ? "default" : "outline"}
            onClick={togglePause}
            className="h-7 px-2.5 text-xs font-sans gap-1"
          >
            {isPaused ? (
              <>
                <Play className="size-3.5 fill-current" />
                Retomar {pausedCount > 0 && `(${pausedCount})`}
              </>
            ) : (
              <>
                <Pause className="size-3.5 fill-current" />
                Pausar
              </>
            )}
          </Button>

          {/* Follow toggle */}
          <Button
            size="sm"
            variant={isAutoScroll ? "secondary" : "ghost"}
            onClick={() => {
              setIsAutoScroll(true);
              if (filteredLines.length > 0) {
                rowVirtualizer.scrollToIndex(filteredLines.length - 1, { align: "end" });
              }
            }}
            className="h-7 px-2.5 text-xs font-sans gap-1"
          >
            <ArrowDown className="size-3.5" />
            Seguir
          </Button>

          {/* Stream Filter */}
          <div className="flex items-center gap-1 bg-zinc-950 rounded-md border border-zinc-800 p-0.5">
            <button
              onClick={() => setStreamFilter("all")}
              className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                streamFilter === "all"
                  ? "bg-zinc-800 text-white font-medium"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setStreamFilter("out")}
              className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                streamFilter === "out"
                  ? "bg-zinc-800 text-emerald-400 font-medium"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              stdout
            </button>
            <button
              onClick={() => setStreamFilter("err")}
              className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                streamFilter === "err"
                  ? "bg-zinc-800 text-amber-400 font-medium"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              stderr
            </button>
          </div>

          {/* Timestamps toggle */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowTimestamps((v) => !v)}
            className={`h-7 px-2 text-xs font-sans ${showTimestamps ? "text-cyan-400" : "text-zinc-400"}`}
            title="Alternar exibição de timestamps"
          >
            {showTimestamps ? "Timestamps ON" : "Timestamps OFF"}
          </Button>

          {/* Tail selector */}
          <div className="flex items-center gap-1 text-[11px] text-zinc-400 font-sans">
            <span>Tail:</span>
            <select
              value={tailCount}
              onChange={(e) => setTailCount(Number(e.target.value))}
              className="bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-200 outline-none"
            >
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={2000}>2000</option>
              <option value={5000}>5000</option>
            </select>
          </div>
        </div>

        {/* Right side search & utilities */}
        <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
          {/* Search bar */}
          <div className="relative flex-1 sm:flex-initial flex items-center min-w-[140px]">
            <Search className="size-3.5 absolute left-2 text-zinc-500 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentMatchIndex(0);
              }}
              placeholder="Buscar nos logs..."
              className="h-7 w-full sm:w-44 pl-7 pr-16 bg-zinc-950 border-zinc-800 text-xs text-zinc-200 focus-visible:ring-1 focus-visible:ring-cyan-500"
            />
            {searchQuery && (
              <div className="absolute right-1.5 flex items-center gap-1 text-[10px] text-zinc-400">
                <span>
                  {matchIndices.length > 0
                    ? `${currentMatchIndex + 1}/${matchIndices.length}`
                    : "0"}
                </span>
                <button
                  onClick={() => jumpToMatch("prev")}
                  disabled={matchIndices.length === 0}
                  className="hover:text-white disabled:opacity-30 p-0.5"
                >
                  <ChevronUp className="size-3" />
                </button>
                <button
                  onClick={() => jumpToMatch("next")}
                  disabled={matchIndices.length === 0}
                  className="hover:text-white disabled:opacity-30 p-0.5"
                >
                  <ChevronDown className="size-3" />
                </button>
              </div>
            )}
          </div>

          <Button
            size="sm"
            variant={onlyShowMatches ? "secondary" : "ghost"}
            onClick={() => setOnlyShowMatches((v) => !v)}
            className={`h-7 px-2 text-xs font-sans ${onlyShowMatches ? "text-cyan-400" : "text-zinc-400"}`}
            title="Filtrar apenas linhas que coincidem com a busca"
          >
            <Filter className="size-3.5 mr-1" />
            Filtrar
          </Button>

          {/* Clear screen */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleClear}
            className="h-7 px-2 text-zinc-400 hover:text-white font-sans text-xs"
            title="Limpar tela atual"
          >
            <Trash2 className="size-3.5 mr-1" />
            Limpar
          </Button>

          {/* Download log */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDownload}
            className="h-7 px-2 text-zinc-400 hover:text-white font-sans text-xs"
            title="Baixar arquivo de log (.log)"
          >
            <Download className="size-3.5 mr-1" />
            Baixar
          </Button>

          {/* Connection status */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-800">
            <span
              className={`size-2 rounded-full ${
                wsStatus === "connected"
                  ? "bg-emerald-500 animate-pulse"
                  : wsStatus === "reconnecting"
                    ? "bg-amber-500 animate-ping"
                    : "bg-red-500"
              }`}
            />
            <span className="text-[11px] text-zinc-400 font-sans capitalize">
              {wsStatus === "connected"
                ? "Ao vivo"
                : wsStatus === "reconnecting"
                  ? "Reconectando..."
                  : "Desconectado"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Virtualized Log Output */}
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-contain p-2 font-mono text-[12px] leading-5 select-text"
      >
        {filteredLines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-2 py-12">
            <AlertCircle className="size-6 text-zinc-600" />
            <p className="font-sans text-sm">
              {wsStatus === "connecting"
                ? "Conectando ao stream do container..."
                : "Nenhuma linha de log registrada ou encontrada com os filtros atuais."}
            </p>
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const line = filteredLines[virtualRow.index];
              if (!line) return null;

              const isMatch =
                searchQuery.trim().length > 0 &&
                line.m.toLowerCase().includes(searchQuery.toLowerCase());
              const isSelectedMatch = matchIndices[currentMatchIndex] === virtualRow.index;

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={`flex items-start gap-2 px-1 rounded transition-colors ${
                    line.s === "err" ? "bg-amber-950/20 text-amber-200" : "text-zinc-200"
                  } ${
                    isSelectedMatch
                      ? "bg-cyan-950/60 ring-1 ring-cyan-500"
                      : isMatch
                        ? "bg-yellow-950/40"
                        : "hover:bg-zinc-900/60"
                  }`}
                >
                  {/* Line index */}
                  <span className="w-10 shrink-0 text-right text-zinc-600 select-none text-[11px]">
                    {virtualRow.index + 1}
                  </span>

                  {/* Timestamp */}
                  {showTimestamps && (
                    <span className="shrink-0 text-zinc-500 select-none text-[11px]">
                      {line.ts ? line.ts.slice(11, 23) : "--:--:--.---"}
                    </span>
                  )}

                  {/* Stream Indicator badge */}
                  <span
                    className={`shrink-0 px-1 py-0.2 rounded text-[10px] select-none uppercase font-bold ${
                      line.s === "err"
                        ? "bg-amber-900/40 text-amber-400"
                        : "bg-emerald-950 text-emerald-400"
                    }`}
                  >
                    {line.s}
                  </span>

                  {/* Log Content rendered safely with ANSI */}
                  <span className="flex-1 whitespace-pre-wrap break-all">
                    <AnsiLineContent text={line.m} searchQuery={searchQuery} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating scroll to bottom button if user scrolled up */}
      {!isAutoScroll && filteredLines.length > 0 && (
        <div className="absolute bottom-4 right-4 z-20">
          <Button
            size="sm"
            variant="default"
            onClick={() => {
              setIsAutoScroll(true);
              rowVirtualizer.scrollToIndex(filteredLines.length - 1, { align: "end" });
            }}
            className="shadow-lg bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5 font-sans text-xs"
          >
            <ArrowDown className="size-3.5" />
            Rolar até o final (Seguir)
          </Button>
        </div>
      )}

      {/* Footer bar */}
      <div className="flex flex-wrap items-center justify-between gap-1 px-3 py-1 bg-zinc-900/80 border-t border-zinc-800 text-[11px] text-zinc-500 font-sans select-none">
        <div>
          Total de linhas: {filteredLines.length.toLocaleString()}{" "}
          {filteredLines.length !== lines.length &&
            `(filtradas de ${lines.length.toLocaleString()})`}
        </div>
        <div className="hidden sm:flex items-center gap-3">
          {isPaused && (
            <span className="text-amber-400 font-medium animate-pulse">
              [PAUSADO - novas linhas sendo acumuladas]
            </span>
          )}
          <span>HarborX Live Log Streamer</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Parses ANSI escape codes to structured spans safely without dangerouslySetInnerHTML.
 * Also highlights matching search queries.
 */
function AnsiLineContent({ text, searchQuery }: { text: string; searchQuery: string }) {
  const spans = useMemo(() => {
    try {
      const parsed = anser.ansiToJson(text, { remove_empty: true }) as AnserSpan[];
      return parsed.length > 0 ? parsed : [{ content: text }];
    } catch {
      return [{ content: text }];
    }
  }, [text]);

  const query = searchQuery.trim().toLowerCase();

  return (
    <>
      {spans.map((span, idx) => {
        const style: React.CSSProperties = {};
        if (span.color) style.color = span.color;
        if (span.bg) style.backgroundColor = span.bg;
        if (span.bold) style.fontWeight = "bold";
        if (span.italic) style.fontStyle = "italic";
        if (span.underline) style.textDecoration = "underline";

        // If no search query, render directly
        if (!query || !span.content.toLowerCase().includes(query)) {
          return (
            <span key={idx} style={style}>
              {span.content}
            </span>
          );
        }

        // Highlight matching query within this ANSI span
        const parts: React.ReactNode[] = [];
        const content = span.content;
        let lastPos = 0;
        let matchIdx: number;

        while ((matchIdx = content.toLowerCase().indexOf(query, lastPos)) !== -1) {
          if (matchIdx > lastPos) {
            parts.push(content.substring(lastPos, matchIdx));
          }
          parts.push(
            <mark
              key={`${idx}-${matchIdx}`}
              className="bg-yellow-400 text-zinc-950 rounded-xs px-0.5 font-bold"
            >
              {content.substring(matchIdx, matchIdx + query.length)}
            </mark>,
          );
          lastPos = matchIdx + query.length;
        }

        if (lastPos < content.length) {
          parts.push(content.substring(lastPos));
        }

        return (
          <span key={idx} style={style}>
            {parts}
          </span>
        );
      })}
    </>
  );
}
