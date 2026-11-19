import { createHash, timingSafeEqual } from "crypto";
import { jwtVerify, SignJWT } from "jose";
import { parse } from "cookie";

export const PRIVATE_SESSION_COOKIE = "seif_private_session";
export const privateOwnerEmail = (process.env.PRIVATE_OWNER_EMAIL ?? "").trim().toLowerCase();
export const privateOwnerOpenId = `private-owner:${privateOwnerEmail}`;

function signingKey() {
  return createHash("sha256").update(process.env.JWT_SECRET || process.env.PRIVATE_LOGIN_PASSWORD || "unconfigured").digest();
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function validPrivateCredentials(email: string, password: string) {
  const configuredPassword = process.env.PRIVATE_LOGIN_PASSWORD ?? "";
  if (!privateOwnerEmail || configuredPassword.length < 12) return false;
  const emailMatches = email.trim().toLowerCase() === privateOwnerEmail;
  return emailMatches && timingSafeEqual(digest(password), digest(configuredPassword));
}

export async function createPrivateSession() {
  return new SignJWT({ scope: "private-owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(privateOwnerOpenId)
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(signingKey());
}

async function readPrivateSessionToken(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey());
    return payload.sub === privateOwnerOpenId && payload.scope === "private-owner" ? privateOwnerOpenId : null;
  } catch {
    return null;
  }
}

export async function readPrivateSession(cookieHeader: string | undefined, authorizationHeader?: string) {
  const cookieToken = parse(cookieHeader ?? "")[PRIVATE_SESSION_COOKIE];
  const bearerToken = authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  return readPrivateSessionToken(bearerToken ?? cookieToken);
}
export async function createExtensionVideoEndToken(userId: number, sessionId: number) {
  if (!(process.env.JWT_SECRET || process.env.PRIVATE_LOGIN_PASSWORD)) {
    throw new Error("لا يمكن ربط إنهاء الجلسة بالإضافة.");
  }
  return new SignJWT({ userId, sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("seif-extension-video-end")
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(signingKey());
}

export async function readExtensionVideoEndToken(token: string) {
  if (!(process.env.JWT_SECRET || process.env.PRIVATE_LOGIN_PASSWORD)) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey(), { audience: "seif-extension-video-end", algorithms: ["HS256"] });
    const { userId, sessionId } = payload;
    return typeof userId === "number" && Number.isSafeInteger(userId) && userId > 0 &&
      typeof sessionId === "number" && Number.isSafeInteger(sessionId) && sessionId > 0 ? { userId, sessionId } : null;
  } catch {
    return null;
  }
}
