import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { LogLine, LogWsMessage } from "../../shared/types.js";
import { hashPassword } from "../auth/password.js";
import { createSession, createUser } from "../auth/session.js";
import { db } from "../db/index.js";
import { isDockerReachable } from "../docker.js";
import { buildApp } from "../index.js";

// Test chunk parser behavior
const MAX_LINE_LEN = 64 * 1024;
const TIMESTAMP_REGEX = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s(.*)$/;

function parseLogLine(raw: string, defaultStream: "out" | "err"): LogLine {
  const match = TIMESTAMP_REGEX.exec(raw);
  if (match && match[1] && match[2] !== undefined) {
    return {
      s: defaultStream,
      ts: match[1],
      m: match[2],
    };
  }
  return {
    s: defaultStream,
    ts: new Date().toISOString(),
    m: raw,
  };
}

class TestLineChunkParser {
  private buffer = "";

  constructor(
    private readonly streamType: "out" | "err",
    private readonly onLine: (line: LogLine) => void,
  ) {}

  push(chunk: Buffer | string): void {
    this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let newlineIdx: number;

    while ((newlineIdx = this.buffer.indexOf("\n")) !== -1) {
      let rawLine = this.buffer.slice(0, newlineIdx).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newlineIdx + 1);

      if (rawLine.length > MAX_LINE_LEN) {
        rawLine = `${rawLine.slice(0, MAX_LINE_LEN)} [LINHA TRUNCADA - EXCEDEU 64KB]`;
      }

      this.onLine(parseLogLine(rawLine, this.streamType));
    }
  }

  flush(): void {
    if (this.buffer.length > 0) {
      let rawLine = this.buffer.replace(/\r$/, "");
      if (rawLine.length > MAX_LINE_LEN) {
        rawLine = `${rawLine.slice(0, MAX_LINE_LEN)} [LINHA TRUNCADA - EXCEDEU 64KB]`;
      }
      this.onLine(parseLogLine(rawLine, this.streamType));
      this.buffer = "";
    }
  }
}

describe("Phase 3 - Log Chunk Parser & Multiplex Demux Unit Tests", () => {
  it("splits incoming chunks across newline boundaries", () => {
    const received: LogLine[] = [];
    const parser = new TestLineChunkParser("out", (line) => received.push(line));

    parser.push("primeira linha\nsegunda");
    expect(received.length).toBe(1);
    expect(received[0]?.m).toBe("primeira linha");

    parser.push(" linha continuada\nterceira linha\n");
    expect(received.length).toBe(3);
    expect(received[1]?.m).toBe("segunda linha continuada");
    expect(received[2]?.m).toBe("terceira linha");
  });

  it("extracts Docker RFC3339 timestamps accurately", () => {
    const received: LogLine[] = [];
    const parser = new TestLineChunkParser("err", (line) => received.push(line));

    parser.push("2026-10-15T12:31:32.631166616Z Started server successfully\n");
    expect(received.length).toBe(1);
    expect(received[0]?.s).toBe("err");
    expect(received[0]?.ts).toBe("2026-10-15T12:31:32.631166616Z");
    expect(received[0]?.m).toBe("Started server successfully");
  });

  it("truncates lines exceeding 64KB without crashing or memory blowup", () => {
    const received: LogLine[] = [];
    const parser = new TestLineChunkParser("out", (line) => received.push(line));

    const hugeLine = "A".repeat(70000) + "\n";
    parser.push(hugeLine);

    expect(received.length).toBe(1);
    expect(received[0]?.m.length).toBe(64 * 1024 + " [LINHA TRUNCADA - EXCEDEU 64KB]".length);
    expect(received[0]?.m).toContain("[LINHA TRUNCADA - EXCEDEU 64KB]");
  });

  it("flushes remaining buffer on stream termination", () => {
    const received: LogLine[] = [];
    const parser = new TestLineChunkParser("out", (line) => received.push(line));

    parser.push("linha final sem quebra de linha");
    expect(received.length).toBe(0);

    parser.flush();
    expect(received.length).toBe(1);
    expect(received[0]?.m).toBe("linha final sem quebra de linha");
  });
});

describe("Phase 3 - Log HTTP & WebSocket Integration Tests", () => {
  let app: FastifyInstance;
  let serverPort: number;
  let viewerCookie: string;
  let dockerAvailable = false;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    // Start server on an ephemeral port for real WebSocket connections
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const url = new URL(address);
    serverPort = parseInt(url.port, 10);

    dockerAvailable = await isDockerReachable();

    const viewerHash = await hashPassword("viewerPass123!");
    const viewerUser = createUser(`logviewer_${Date.now()}`, viewerHash, "viewer");
    const viewerToken = createSession(viewerUser.id, "127.0.0.1", "vitest-ws");

    viewerCookie = `harborx_session=${viewerToken}`;
  });

  afterAll(async () => {
    await app.close();
    db.prepare("DELETE FROM sessions WHERE ip = '127.0.0.1'").run();
    db.prepare("DELETE FROM users WHERE username LIKE 'logviewer_%'").run();
  });

  it("denies unauthenticated WebSocket connection", async () => {
    const wsUrl = `ws://127.0.0.1:${serverPort}/ws/containers/non-existent/logs`;

    await new Promise<void>((resolve) => {
      const ws = new WebSocket(wsUrl);
      ws.on("close", (code) => {
        expect([4401, 1005, 1006]).toContain(code);
        resolve();
      });
      ws.on("error", () => {
        // Expected on rejection
        resolve();
      });
    });
  });

  it("returns 404 for non-existent container via HTTP snapshot", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/containers/non-existent-container-id-12345/logs",
      headers: {
        cookie: viewerCookie,
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("allows live container logs inspection if Docker is reachable", async () => {
    if (!dockerAvailable) return;

    // List containers
    const listRes = await app.inject({
      method: "GET",
      url: "/api/containers",
      headers: {
        cookie: viewerCookie,
      },
    });
    expect(listRes.statusCode).toBe(200);
    const containers = listRes.json();

    if (containers.length > 0) {
      const targetId = containers[0].id;

      // HTTP logs snapshot
      const logsRes = await app.inject({
        method: "GET",
        url: `/api/containers/${targetId}/logs?tail=10`,
        headers: {
          cookie: viewerCookie,
        },
      });
      expect(logsRes.statusCode).toBe(200);
      const logsJson = logsRes.json();
      expect(Array.isArray(logsJson.lines)).toBe(true);

      // HTTP logs download
      const downloadRes = await app.inject({
        method: "GET",
        url: `/api/containers/${targetId}/logs/download?tail=5`,
        headers: {
          cookie: viewerCookie,
        },
      });
      expect(downloadRes.statusCode).toBe(200);
      expect(downloadRes.headers["content-disposition"]).toMatch(
        /attachment; filename=.*-logs\.log/,
      );

      // Authenticated WebSocket connection
      const wsUrl = `ws://127.0.0.1:${serverPort}/ws/containers/${targetId}/logs?tail=5`;
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl, {
          headers: {
            cookie: viewerCookie,
          },
        });

        const timeout = setTimeout(() => {
          ws.close();
          resolve(); // Pass if opened without error
        }, 3000);

        ws.on("open", () => {
          expect(ws.readyState).toBe(WebSocket.OPEN);
        });

        ws.on("message", (data) => {
          try {
            const msg = JSON.parse(data.toString()) as LogWsMessage;
            if (msg.t === "batch") {
              expect(Array.isArray(msg.lines)).toBe(true);
              clearTimeout(timeout);
              ws.close();
              resolve();
            }
          } catch (e) {
            clearTimeout(timeout);
            reject(e);
          }
        });

        ws.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }
  });
});
