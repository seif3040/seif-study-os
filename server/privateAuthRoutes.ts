import type { Express } from "express";
import { getUserByOpenId, upsertUser } from "./db";
import { createPrivateSession, PRIVATE_SESSION_COOKIE, privateOwnerEmail, privateOwnerOpenId, readPrivateSession, validPrivateCredentials } from "./privateAuth";

function cookieOptions(req: Parameters<Express["post"]>[1] extends (req: infer R, ...args: any[]) => any ? R : never) {
  const secure = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";
  return { httpOnly: true, secure, sameSite: "lax" as const, maxAge: 14 * 24 * 60 * 60 * 1000, path: "/" };
}

async function ensurePrivateOwner() {
  await upsertUser({ openId: privateOwnerOpenId, email: privateOwnerEmail, name: "Seif", loginMethod: "private-password", role: "admin", lastSignedIn: new Date() });
  return getUserByOpenId(privateOwnerOpenId);
}

export function registerPrivateAuthRoutes(app: Express) {
  app.post("/api/private-auth/sign-in", async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (typeof email !== "string" || typeof password !== "string" || !validPrivateCredentials(email, password)) {
      res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة." });
      return;
    }
    const user = await ensurePrivateOwner();
    if (!user) { res.status(500).json({ success: false, message: "تعذّر تجهيز الحساب الخاص." }); return; }
    res.cookie(PRIVATE_SESSION_COOKIE, await createPrivateSession(), cookieOptions(req));
    res.json({ success: true, email: user.email });
  });

  app.get("/api/private-auth/session", async (req, res) => {
    const signedIn = Boolean(await readPrivateSession(req.headers.cookie));
    res.status(signedIn ? 200 : 401).json({ authenticated: signedIn, email: signedIn ? privateOwnerEmail : null });
  });

  app.post("/api/private-auth/sign-out", (req, res) => {
    res.clearCookie(PRIVATE_SESSION_COOKIE, { ...cookieOptions(req), maxAge: -1 });
    res.json({ success: true });
  });
}
