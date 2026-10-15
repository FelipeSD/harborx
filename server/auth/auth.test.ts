import { afterEach, describe, expect, it } from "vitest";
import { db } from "../db/index";
import { hashPassword, verifyPassword } from "./password";
import {
  createSession,
  createUser,
  deleteSession,
  getUserById,
  getUserByUsername,
  validateSession,
} from "./session";

describe("Password hashing with argon2", () => {
  it("hashes password and verifies correctly", async () => {
    const raw = "MySecureAdminPassword123!";
    const hash = await hashPassword(raw);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(raw);
    expect(hash.startsWith("$argon2")).toBe(true);

    const match = await verifyPassword(hash, raw);
    expect(match).toBe(true);

    const wrongMatch = await verifyPassword(hash, "WrongPassword123!");
    expect(wrongMatch).toBe(false);
  });
});

describe("User & Session management", () => {
  afterEach(() => {
    db.prepare("DELETE FROM sessions WHERE ip = '127.0.0.1'").run();
    db.prepare(
      "DELETE FROM users WHERE username LIKE 'testuser_%' OR username LIKE 'sessuser_%'",
    ).run();
  });

  it("creates user and verifies existence", async () => {
    const testUsername = `testuser_${Date.now()}`;
    const hash = await hashPassword("supersecret123");
    const user = createUser(testUsername, hash, "operator");

    expect(user.id).toBeDefined();
    expect(user.username).toBe(testUsername);
    expect(user.role).toBe("operator");

    const fetched = getUserByUsername(testUsername);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(user.id);
    expect(fetched?.role).toBe("operator");

    const byId = getUserById(user.id);
    expect(byId).not.toBeNull();
    expect(byId?.username).toBe(testUsername);
  });

  it("creates, validates, and terminates a session", async () => {
    const testUsername = `sessuser_${Date.now()}`;
    const hash = await hashPassword("supersecret123");
    const user = createUser(testUsername, hash, "viewer");

    const token = createSession(user.id, "127.0.0.1", "Vitest");
    expect(token).toBeDefined();
    expect(token.length).toBe(64); // 32 bytes in hex

    const validation = validateSession(token);
    expect(validation).not.toBeNull();
    expect(validation?.user.id).toBe(user.id);
    expect(validation?.user.username).toBe(testUsername);
    expect(validation?.user.role).toBe("viewer");

    // After deleting session, validation fails
    deleteSession(token);
    const afterDelete = validateSession(token);
    expect(afterDelete).toBeNull();
  });
});
