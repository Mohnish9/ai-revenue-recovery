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

app.disable("x-powered-by");
app.use(express.json());
app.use((request, response, next) => {
  const origin = process.env.FRONTEND_URL ?? "*";
  response.header("Access-Control-Allow-Origin", origin);
  response.header("Access-Control-Allow-Headers", "Content-Type");
  response.header("Access-Control-Allow-Methods", "GET,OPTIONS,POST,PUT,PATCH,DELETE");
  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }
  next();
});

app.use("/api", apiRoutes);

// In dev mode, attach Vite middleware. In production, serve dist.
if (process.env.NODE_ENV === "production" && fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_request, response) => {
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

app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({ error: "Internal server error" });
});

ensureDefaultAdminExists().catch(() => {});

app.listen(port, "0.0.0.0", () => {
  console.log(`Recoverly server listening on http://0.0.0.0:${port}`);
});
