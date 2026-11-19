import { afterEach, expect, it, vi } from "vitest";
import { createExtensionVideoEndToken, createPrivateSession, readExtensionVideoEndToken, readPrivateSession } from "./privateAuth";

afterEach(() => vi.unstubAllEnvs());

it("only accepts signed grants scoped to ending their exact video session", async () => {
  vi.stubEnv("JWT_SECRET", "test-extension-video-secret");
  const token = await createExtensionVideoEndToken(24, 42);
  await expect(readExtensionVideoEndToken(token)).resolves.toEqual({ userId: 24, sessionId: 42 });
  await expect(readExtensionVideoEndToken(token.slice(0, -2) + "!!")).resolves.toBeNull();
  await expect(readExtensionVideoEndToken(await createPrivateSession())).resolves.toBeNull();
  await expect(readPrivateSession(undefined, "Bearer " + token)).resolves.toBeNull();
});
