import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { apiRoutes } from "./routes/apiRoutes.js";
import { ensureDefaultAdminExists } from "./services/authService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const frontendDir = path.resolve(rootDir, "frontend");
const distDir = path.resolve(frontendDir, "dist");

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.set("etag", false);
app.disable("x-powered-by");
app.use(express.json());

// CORS & Preflight handler
app.use((request, response, next) => {
  const origin = request.headers.origin || "*";
  response.header("Access-Control-Allow-Origin", origin);
  response.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept");
  response.header("Access-Control-Allow-Methods", "GET,OPTIONS,POST,PUT,PATCH,DELETE");
  if (request.headers.origin) {
    response.header("Access-Control-Allow-Credentials", "true");
  }
  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }
  next();
});

// Cache control headers for all /api endpoints to ensure fresh dynamic state
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

// API Routes (must precede SPA fallback)
app.use("/api", apiRoutes);

// Strict safety boundary: Guarantee that any unhandled /api path returns JSON 404 and never falls through to Vite/SPA HTML
app.all("/api/*", (_request, response) => {
  response.status(404).json({ error: "API route not found" });
});

// In dev mode, attach Vite middleware. In production, serve dist.
if (process.env.NODE_ENV === "production" && fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (request, response) => {
    if (request.path.startsWith("/api")) {
      response.status(404).json({ error: "API route not found" });
      return;
    }
    response.sendFile(path.join(distDir, "index.html"));
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: frontendDir,
    server: {
      middlewareMode: true,
      hmr: false,
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.use((error: Error, req: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(`[Server Error] Path: ${req.method} ${req.originalUrl}:`, error?.message || error);
  response.status(500).json({ error: error?.message || "Internal server error" });
});

ensureDefaultAdminExists().catch(() => {});

app.listen(port, "0.0.0.0", () => {
  console.log(`Recoverly server listening on http://0.0.0.0:${port}`);
});
