import { Router } from "express";
import { getHealth } from "../controllers/healthController.js";
import { getDashboard } from "../controllers/dashboardController.js";
import {
  getCustomerController,
  getCustomerOperationsController,
  getInvoiceController,
  getRecoveryCaseController,
  getTransactionController,
  listActionsController,
  listAuditLogsController,
  listCustomersController,
  listEventsController,
  listInvoicesController,
  listPromisesController,
  listRecoveryCasesController,
  listTransactionsController,
} from "../controllers/operationsController.js";

export const apiRoutes = Router();
apiRoutes.get("/health", getHealth);
apiRoutes.get("/dashboard", getDashboard);
apiRoutes.get("/customers", listCustomersController);
apiRoutes.get("/customers/:id", getCustomerController);
apiRoutes.get("/customers/:id/operations", getCustomerOperationsController);
apiRoutes.get("/transactions", listTransactionsController);
apiRoutes.get("/transactions/:id", getTransactionController);
apiRoutes.get("/invoices", listInvoicesController);
apiRoutes.get("/invoices/:id", getInvoiceController);
apiRoutes.get("/recovery-cases", listRecoveryCasesController);
apiRoutes.get("/recovery-cases/:id", getRecoveryCaseController);
apiRoutes.get("/recovery-cases/:id/actions", listActionsController);
apiRoutes.get("/recovery-cases/:id/promises-to-pay", listPromisesController);
apiRoutes.get("/recovery-cases/:id/payment-events", listEventsController);
apiRoutes.get("/recovery-cases/:id/audit-logs", listAuditLogsController);
apiRoutes.use((_request, response) => response.status(404).json({ error: "API route not found" }));