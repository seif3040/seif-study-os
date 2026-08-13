import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerPrivateAuthRoutes } from "./privateAuthRoutes";

let server: ReturnType<typeof express.application.listen>;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerPrivateAuthRoutes(app);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", () => { const address = server.address(); baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`; resolve(); }); });
});

afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

describe("private account endpoint", () => {
  it("accepts only the configured owner credentials", async () => {
    const password = process.env.PRIVATE_LOGIN_PASSWORD ?? "";
    const response = await fetch(`${baseUrl}/api/private-auth/sign-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "seif94803@gmail.com", password }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, email: "seif94803@gmail.com" });
    const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
    const session = await fetch(`${baseUrl}/api/private-auth/session`, { headers: { cookie } });
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ authenticated: true, email: "seif94803@gmail.com" });
    const signedOut = await fetch(`${baseUrl}/api/private-auth/sign-out`, { method: "POST", headers: { cookie } });
    expect(signedOut.status).toBe(200);
    const ended = await fetch(`${baseUrl}/api/private-auth/session`);
    expect(ended.status).toBe(401);
  });

  it("rejects a non-owner password", async () => {
    const response = await fetch(`${baseUrl}/api/private-auth/sign-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "seif94803@gmail.com", password: "not-the-owner-password" }) });
    expect(response.status).toBe(401);
  });
});
