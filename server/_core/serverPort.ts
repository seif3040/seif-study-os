export function mustUseProvidedPort(environment: NodeJS.ProcessEnv) {
  return environment.NODE_ENV === "production" || Boolean(environment.K_SERVICE);
}
