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
app.use(express.urlencoded({ extended: true }));

// CORS & Preflight handler
app.use((request, response, next) => {
  const configuredFrontend = (process.env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
  const requestOrigin = request.headers.origin;

  if (configuredFrontend) {
    if (
      !requestOrigin ||
      requestOrigin === configuredFrontend ||
      requestOrigin.endsWith(".vercel.app") ||
      requestOrigin.includes("localhost") ||
      requestOrigin.includes("127.0.0.1") ||
      requestOrigin.includes(".run.app")
    ) {
      response.header("Access-Control-Allow-Origin", requestOrigin || configuredFrontend);
    } else {
      response.header("Access-Control-Allow-Origin", configuredFrontend);
    }
  } else {
    response.header("Access-Control-Allow-Origin", requestOrigin || "*");
  }

  response.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
  response.header("Access-Control-Allow-Methods", "GET,OPTIONS,POST,PUT,PATCH,DELETE,HEAD");
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
app.all("/api", (_request, response) => {
  response.status(404).json({ error: "API route not found" });
});

// In production mode, serve static dist if available; otherwise serve standalone API mode.
// Vite dev middleware is only loaded in non-production environments.
if (process.env.NODE_ENV === "production") {
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get("*", (request, response) => {
      if (request.path.startsWith("/api")) {
        response.status(404).json({ error: "API route not found" });
        return;
      }
      response.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    // Standalone API Backend mode (e.g. Render)
    app.get("/", (_request, response) => {
      response.json({
        status: "ok",
        service: "Recoverly API Backend",
        version: "0.1.0",
        environment: "production",
      });
    });
    app.get("*", (request, response) => {
      if (request.path.startsWith("/api")) {
        response.status(404).json({ error: "API route not found" });
        return;
      }
      response.status(404).json({ error: "Route not found. Backend running in standalone API mode." });
    });
  }
} else {
  // Development mode: attach Vite dev server middleware if available
  try {
    const viteModuleName = "vite";
    const viteModule = (await import(/* @vite-ignore */ viteModuleName)) as {
      createServer: (options: Record<string, unknown>) => Promise<{ middlewares: express.Handler }>;
    };
    const vite = await viteModule.createServer({
      root: frontendDir,
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } catch (err) {
    console.warn("[Vite Middleware] Vite dev middleware not attached:", (err as Error)?.message || err);
  }
}

app.use((error: Error, req: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(`[Server Error] Path: ${req.method} ${req.originalUrl}:`, error?.message || error);
  response.status(500).json({ error: error?.message || "Internal server error" });
});

ensureDefaultAdminExists().catch(() => {});

app.listen(port, "0.0.0.0", () => {
  console.log(`Recoverly server listening on http://0.0.0.0:${port}`);
});
