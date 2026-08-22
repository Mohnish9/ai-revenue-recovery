import express from "express";
import { apiRoutes } from "./routes/apiRoutes.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.disable("x-powered-by");
app.use(express.json());
app.use((request, response, next) => {
  const origin = process.env.FRONTEND_URL ?? "*";
  response.header("Access-Control-Allow-Origin", origin);
  response.header("Access-Control-Allow-Headers", "Content-Type");
  response.header("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }
  next();
});
app.use("/api", apiRoutes);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({ error: "Internal server error" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Revenue Recovery API listening on port ${port}`);
});