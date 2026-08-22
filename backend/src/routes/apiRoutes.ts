import { Router } from "express";
import { getHealth } from "../controllers/healthController.js";
import { getDashboard } from "../controllers/dashboardController.js";
import {
  loginController,
  signupController,
  meController,
  logoutController,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  analyzeCaseAIController,
  analyzeDemoScenarioController,
  chatAIController,
  createPromiseController,
  executeActionController,
  getCustomerController,
  getCustomerOperationsController,
  getInvoiceController,
  getRecoveryCaseController,
  getTransactionController,
  listActionsController,
  listAllAgentLogsController,
  listAllAuditLogsController,
  listAuditLogsController,
  listCustomersController,
  listDemoScenariosController,
  listEventsController,
  listInvoicesController,
  listPaymentEventsController,
  listPromisesController,
  listRecoveryCasesController,
  listSubscriptionsController,
  listTransactionsController,
  simulateScenarioController,
  updateCaseStatusController,
} from "../controllers/operationsController.js";

export const apiRoutes = Router();

// Public Health & System Probes
apiRoutes.get("/health", getHealth);

// Public Auth Endpoints
apiRoutes.post("/auth/login", loginController);
apiRoutes.post("/auth/signup", signupController);
apiRoutes.get("/auth/me", meController);
apiRoutes.post("/auth/logout", logoutController);

// All operational routes below require valid Supabase Auth session token
apiRoutes.use(requireAuth);

// Core Dashboard
apiRoutes.get("/dashboard", getDashboard);

// Customers
apiRoutes.get("/customers", listCustomersController);
apiRoutes.get("/customers/:id", getCustomerController);
apiRoutes.get("/customers/:id/operations", getCustomerOperationsController);

// Transactions
apiRoutes.get("/transactions", listTransactionsController);
apiRoutes.get("/transactions/:id", getTransactionController);

// Invoices
apiRoutes.get("/invoices", listInvoicesController);
apiRoutes.get("/invoices/:id", getInvoiceController);

// Subscriptions
apiRoutes.get("/subscriptions", listSubscriptionsController);

// Payment Events (Failed payments, checkout drop-offs, mandates)
apiRoutes.get("/payment-events", listPaymentEventsController);

// Recovery Cases
apiRoutes.get("/recovery-cases", listRecoveryCasesController);
apiRoutes.get("/recovery-cases/:id", getRecoveryCaseController);
apiRoutes.patch("/recovery-cases/:id/status", updateCaseStatusController);

// Case Sub-collections & Operations
apiRoutes.get("/recovery-cases/:id/actions", listActionsController);
apiRoutes.post("/recovery-cases/:id/actions", executeActionController);
apiRoutes.get("/recovery-cases/:id/promises-to-pay", listPromisesController);
apiRoutes.post("/recovery-cases/:id/promises-to-pay", createPromiseController);
apiRoutes.get("/recovery-cases/:id/payment-events", listEventsController);
apiRoutes.get("/recovery-cases/:id/audit-logs", listAuditLogsController);

// Global Logs & Intelligence
apiRoutes.get("/audit-logs", listAllAuditLogsController);
apiRoutes.get("/agent-logs", listAllAgentLogsController);

// AI Agent & Intelligence (Gemini API Server-Side)
apiRoutes.post("/ai/analyze-case/:id", analyzeCaseAIController);
apiRoutes.post("/ai/chat", chatAIController);

// Recovery Demo Experience (9 Scenarios with Gemini AI & Supabase Data)
apiRoutes.get("/demo/scenarios", listDemoScenariosController);
apiRoutes.post("/demo/scenarios/:key/analyze", analyzeDemoScenarioController);

// Scenario Simulation Engine (Sandbox simulation)
apiRoutes.post("/scenarios/simulate", simulateScenarioController);

apiRoutes.use((_request, response) => response.status(404).json({ error: "API route not found" }));
