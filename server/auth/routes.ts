import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { logAudit } from "../services/audit.js";
import { SESSION_COOKIE_NAME } from "./middleware.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  countUsers,
  createSession,
  createUser,
  deleteSession,
  getUserByUsername,
} from "./session.js";

const setupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "O nome de usuário deve ter no mínimo 3 caracteres")
    .max(32, "O nome de usuário deve ter no máximo 32 caracteres")
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      "O nome de usuário pode conter apenas letras, números, hífen, ponto e sublinhado",
    ),
  password: z.string().min(12, "A senha deve conter no mínimo 12 caracteres por segurança"),
});

const loginSchema = z.object({
  username: z.string().trim().min(1, "Informe o nome de usuário"),
  password: z.string().min(1, "Informe a senha"),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/auth/setup-status
  fastify.get("/setup-status", async () => {
    const total = countUsers();
    return { needsSetup: total === 0 };
  });

  // POST /api/auth/setup
  fastify.post(
    "/setup",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const total = countUsers();
      if (total > 0) {
        return reply.status(400).send({
          error: "O setup inicial do HarborX já foi realizado. Utilize a tela de login.",
        });
      }

      const parseResult = setupSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: parseResult.error.errors[0]?.message || "Dados inválidos",
        });
      }

      const { username, password } = parseResult.data;
      const passwordHash = await hashPassword(password);
      const user = createUser(username, passwordHash, "admin");

      logAudit({
        action: "user.setup",
        userId: user.id,
        target: user.username,
        details: { role: user.role },
        ip: request.ip,
      });

      const token = createSession(user.id, request.ip, request.headers["user-agent"]);

      reply.setCookie(SESSION_COOKIE_NAME, token, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: config.cookieSecure,
        maxAge: 12 * 60 * 60, // 12 hours
      });

      return reply.status(201).send({
        success: true,
        user,
      });
    },
  );

  // POST /api/auth/login
  fastify.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const parseResult = loginSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: parseResult.error.errors[0]?.message || "Dados de login inválidos",
        });
      }

      const { username, password } = parseResult.data;
      const userWithHash = getUserByUsername(username);

      if (!userWithHash) {
        logAudit({
          action: "auth.login_failed",
          target: username,
          details: { reason: "user_not_found" },
          ip: request.ip,
        });
        return reply.status(401).send({ error: "Nome de usuário ou senha incorretos." });
      }

      if (userWithHash.disabled) {
        logAudit({
          action: "auth.login_failed",
          userId: userWithHash.id,
          target: username,
          details: { reason: "account_disabled" },
          ip: request.ip,
        });
        return reply
          .status(403)
          .send({ error: "Esta conta está desativada. Contate um administrador." });
      }

      const isValid = await verifyPassword(userWithHash.passwordHash, password);
      if (!isValid) {
        logAudit({
          action: "auth.login_failed",
          userId: userWithHash.id,
          target: username,
          details: { reason: "invalid_password" },
          ip: request.ip,
        });
        return reply.status(401).send({ error: "Nome de usuário ou senha incorretos." });
      }

      const token = createSession(userWithHash.id, request.ip, request.headers["user-agent"]);

      logAudit({
        action: "auth.login",
        userId: userWithHash.id,
        target: username,
        ip: request.ip,
      });

      reply.setCookie(SESSION_COOKIE_NAME, token, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: config.cookieSecure,
        maxAge: 12 * 60 * 60,
      });

      const { passwordHash: _, ...safeUser } = userWithHash;

      return {
        success: true,
        user: safeUser,
      };
    },
  );

  // POST /api/auth/logout
  fastify.post("/logout", async (request, reply) => {
    const token = request.sessionToken || request.cookies[SESSION_COOKIE_NAME];
    if (token) {
      deleteSession(token);
    }

    if (request.user) {
      logAudit({
        action: "auth.logout",
        userId: request.user.id,
        target: request.user.username,
        ip: request.ip,
      });
    }

    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return { success: true };
  });

  // GET /api/auth/me
  fastify.get("/me", async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: "Não autenticado" });
    }
    return { user: request.user };
  });
};
