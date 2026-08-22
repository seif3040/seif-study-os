import { describe, expect, it } from "vitest";
import { mustUseProvidedPort } from "./serverPort";

describe("server port strategy", () => {
  it("uses the provided port for production and Cloud Run", () => {
    expect(mustUseProvidedPort({ NODE_ENV: "production" })).toBe(true);
    expect(mustUseProvidedPort({ K_SERVICE: "seif-study-os" })).toBe(true);
    expect(mustUseProvidedPort({ NODE_ENV: "development" })).toBe(false);
  });
});
