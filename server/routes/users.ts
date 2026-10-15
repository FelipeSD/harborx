import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/middleware.js";
import { hashPassword } from "../auth/password.js";
import {
  createUser,
  deleteUser,
  getUserById,
  getUserByUsername,
  listUsers,
  updateUser,
} from "../auth/session.js";
import { logAudit } from "../services/audit.js";

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "O nome de usuário deve ter no mínimo 3 caracteres")
    .max(32, "O nome de usuário deve ter no máximo 32 caracteres")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Nome de usuário contém caracteres inválidos"),
  password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres"),
  role: z.enum(["admin", "operator", "viewer"]).default("operator"),
});

const updateUserSchema = z.object({
  role: z.enum(["admin", "operator", "viewer"]).optional(),
  disabled: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // All endpoints require Admin role
  fastify.addHook("preHandler", requireRole("admin"));

  // GET /api/users - List users
  fastify.get("/users", async () => {
    return listUsers();
  });

  // POST /api/users - Create user
  fastify.post("/users", async (request, reply) => {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        issues: parsed.error.issues,
      });
    }

    const { username, password, role } = parsed.data;

    const existing = getUserByUsername(username);
    if (existing) {
      return reply.status(409).send({ error: "Já existe um usuário com este nome" });
    }

    const passwordHash = await hashPassword(password);
    const user = createUser(username, passwordHash, role);

    logAudit({
      userId: request.user?.id,
      action: "user.create",
      target: user.username,
      details: { role: user.role },
      ip: request.ip,
    });

    return reply.status(201).send(user);
  });

  // PATCH /api/users/:id - Update user
  fastify.patch<{ Params: { id: string } }>("/users/:id", async (request, reply) => {
    const { id } = request.params;
    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        issues: parsed.error.issues,
      });
    }

    const targetUser = getUserById(id);
    if (!targetUser) {
      return reply.status(404).send({ error: "Usuário não encontrado" });
    }

    // Prevent admin from disabling themselves or demoting themselves
    if (request.user?.id === id) {
      if (parsed.data.disabled === true) {
        return reply
          .status(400)
          .send({ error: "Você não pode desativar sua própria conta de administrador" });
      }
      if (parsed.data.role && parsed.data.role !== "admin") {
        return reply
          .status(400)
          .send({ error: "Você não pode revogar seus próprios privilégios de administrador" });
      }
    }

    let passwordHash: string | undefined;
    if (parsed.data.password) {
      passwordHash = await hashPassword(parsed.data.password);
    }

    const updated = updateUser(id, {
      role: parsed.data.role,
      disabled: parsed.data.disabled,
      passwordHash,
    });

    logAudit({
      userId: request.user?.id,
      action: "user.update",
      target: targetUser.username,
      details: {
        roleChanged: Boolean(parsed.data.role),
        statusChanged: parsed.data.disabled !== undefined,
        passwordReset: Boolean(parsed.data.password),
      },
      ip: request.ip,
    });

    return updated;
  });

  // DELETE /api/users/:id - Delete user
  fastify.delete<{ Params: { id: string } }>("/users/:id", async (request, reply) => {
    const { id } = request.params;

    if (request.user?.id === id) {
      return reply.status(400).send({ error: "Você não pode excluir sua própria conta" });
    }

    const targetUser = getUserById(id);
    if (!targetUser) {
      return reply.status(404).send({ error: "Usuário não encontrado" });
    }

    deleteUser(id);

    logAudit({
      userId: request.user?.id,
      action: "user.delete",
      target: targetUser.username,
      ip: request.ip,
    });

    return { success: true };
  });
};
