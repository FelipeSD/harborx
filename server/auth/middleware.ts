import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { User, UserRole } from "../../shared/types.js";
import { validateSession } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
    sessionToken?: string;
  }
}

export const SESSION_COOKIE_NAME = "harborx_session";

const PUBLIC_API_ROUTES = new Set([
  "/api/health",
  "/api/auth/setup-status",
  "/api/auth/setup",
  "/api/auth/login",
]);

function isPublicRoute(urlPath: string): boolean {
  const cleanPath = urlPath.split("?")[0] || urlPath;
  if (PUBLIC_API_ROUTES.has(cleanPath)) return true;
  if (cleanPath.startsWith("/api/hooks/") || cleanPath.startsWith("/api/public/")) return true;
  if (!cleanPath.startsWith("/api") && !cleanPath.startsWith("/ws")) return true;
  return false;
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0"
  );
}

function checkCsrf(request: FastifyRequest, reply: FastifyReply): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }

  // Se a requisição inclui cabeçalhos customizados enviados pelo frontend (X-Requested-With ou X-HarborX-Client),
  // a proteção contra CSRF via formulários cross-site HTML tradicionais é garantida pelos navegadores.
  const requestedWith = request.headers["x-requested-with"];
  const harborxClient = request.headers["x-harborx-client"];
  if (requestedWith === "XMLHttpRequest" || harborxClient === "web") {
    return true;
  }

  // Validação por Sec-Fetch-Site (suportado por navegadores modernos Chromium, Safari, Firefox)
  const secFetchSite = request.headers["sec-fetch-site"];
  if (secFetchSite === "same-origin" || secFetchSite === "none") {
    return true;
  }

  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }

  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host;
    const originHostname = originUrl.hostname;

    const requestHost = request.headers.host;
    const forwardedHost = request.headers["x-forwarded-host"] as string | undefined;

    // Correspondência direta com host ou x-forwarded-host (reverse proxy / Vite dev proxy)
    if (originHost === requestHost || (forwardedHost && originHost === forwardedHost)) {
      return true;
    }

    // Suporte a desenvolvimento e proxy local (localhost <-> 127.0.0.1 em portas diferentes)
    const requestHostname = requestHost ? requestHost.split(":")[0] : "";
    const forwardedHostname = forwardedHost ? forwardedHost.split(":")[0] : "";

    const isOriginLoopback = isLoopback(originHostname);
    const isTargetLoopback =
      isLoopback(requestHostname) || (forwardedHostname && isLoopback(forwardedHostname));

    if (isOriginLoopback && isTargetLoopback) {
      return true;
    }

    reply.status(403).send({ error: "Origem da requisição inválida (CSRF detectado)" });
    return false;
  } catch {
    reply.status(403).send({ error: "Cabeçalho de origem malformado" });
    return false;
  }
}

export function registerAuthHooks(fastify: FastifyInstance): void {
  fastify.decorateRequest("user", undefined);
  fastify.decorateRequest("sessionToken", undefined);

  fastify.addHook("preHandler", async (request, reply) => {
    const path = request.url;

    if (isPublicRoute(path)) {
      return;
    }

    if (!checkCsrf(request, reply)) {
      return;
    }

    const token = request.cookies[SESSION_COOKIE_NAME];
    if (!token) {
      reply.status(401).send({ error: "Sessão não encontrada ou expirada. Faça login novamente." });
      return;
    }

    const result = validateSession(token);
    if (!result) {
      reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
      reply.status(401).send({ error: "Sessão inválida ou expirada. Faça login novamente." });
      return;
    }

    request.user = result.user;
    request.sessionToken = token;
  });
}

export function requireRole(...allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      reply.status(401).send({ error: "Autenticação obrigatória" });
      return;
    }

    if (!allowedRoles.includes(request.user.role)) {
      reply.status(403).send({
        error: `Acesso negado: seu papel atual (${request.user.role}) não tem permissão para esta ação.`,
      });
      return;
    }
  };
}
