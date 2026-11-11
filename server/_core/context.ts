import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema.js";
import { sdk } from "./sdk.js";
import { getUserByOpenId } from "../db.js";
import { privateOwnerEmail, privateOwnerOpenId, readPrivateSession } from "../privateAuth.js";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const oauthUser = await sdk.authenticateRequest(opts.req);
    user = oauthUser?.email?.trim().toLowerCase() === privateOwnerEmail ? oauthUser : null;
  } catch {
    user = null;
  }
  if (!user && await readPrivateSession(opts.req.headers.cookie, opts.req.headers.authorization)) {
    user = await getUserByOpenId(privateOwnerOpenId) ?? null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
