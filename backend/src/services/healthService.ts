export function getHealthStatus() {
  return {
    ok: true,
    service: "revenue-recovery-api",
    environment: process.env.NODE_ENV ?? "development",
  };
}