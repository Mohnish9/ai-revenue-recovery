import { Router } from "express";
import { getHealth } from "../controllers/healthController.js";
import { getDashboard, getDebugSummaryController } from "../controllers/dashboardController.js";
import {
  loginController,
  signupController,
  meController,
  logoutController,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  analyzeCaseAIController,
  analyzeSandboxIncidentController,
  chatAIController,
  createAndAnalyzeSandboxIncidentController,
  createSandboxIncidentController,
  createPromiseController,
  deleteSandboxIncidentController,
  escalateSandboxIncidentController,
  executeActionController,
  executeAutonomousStepController,
  executeSandboxIncidentActionController,
  getCustomerController,
  getCustomerOperationsController,
  getInvoiceController,
  getRecoveryCaseController,
  getSandboxIncidentController,
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
  listSandboxIncidentsController,
  listScenarioTypesController,
  listSubscriptionsController,
  listTransactionsController,
  reassessSandboxIncidentController,
  runFullAutonomousLoopController,
  markSandboxIncidentPaidController,
  customerResolveIncidentController,
  getPublicSandboxIncidentController,
  triggerScheduledAttemptNowController,
  cancelScheduledRecoveryController,
  simulateSandboxIncidentController,
  simulateScenarioController,
  updateCaseStatusController,
  listHumanEscalationsController,
  resolveHumanEscalationController,
  takeOwnershipOfHumanEscalationController,
  addNoteToHumanEscalationController,
  sendSmsRecoveryController,
} from "../controllers/operationsController.js";
import {
  getTelemetryQueueController,
  getTelemetryRecordController,
  createCustomTelemetryController,
  analyzeTelemetryController,
  resetTelemetryQueueController,
  updateTelemetryContactController,
  getChannelReadinessController,
} from "../controllers/telemetryController.js";
import {
  getDetailedChannelReadinessController,
  getDemoTestContactController,
  updateDemoTestContactController,
  startPhoneVerificationController,
  checkPhoneVerificationController,
  updateContactController,
} from "../controllers/providerController.js";
import {
  getVoiceRecoveryMessageController,
  dispatchVoiceCallController,
  exotelCallbackController,
} from "../controllers/voiceController.js";

export const apiRoutes = Router();

// Public Health & System Probes
apiRoutes.get("/health", getHealth);

// Public Exotel Dynamic Voice Recovery & Webhook Callback Probes (No Auth Required)
apiRoutes.all("/voice/recovery-message", getVoiceRecoveryMessageController);
apiRoutes.all("/voice/passthru", getVoiceRecoveryMessageController);
apiRoutes.all("/voice/script", getVoiceRecoveryMessageController);
apiRoutes.all("/voice/message", getVoiceRecoveryMessageController);
apiRoutes.all("/voice/exotel-passthru", getVoiceRecoveryMessageController);
apiRoutes.all("/voice/exotel-callback", exotelCallbackController);

// Public Customer Self-Service Payment & Incident Resolution Endpoints (No Auth Required)
apiRoutes.get("/sandbox/incidents/:id/public", getPublicSandboxIncidentController);
apiRoutes.post("/sandbox/incidents/:id/resolve", customerResolveIncidentController);
apiRoutes.post("/sandbox/incidents/:id/customer-resolve", customerResolveIncidentController);

// Public Auth Endpoints
apiRoutes.post("/auth/login", loginController);
apiRoutes.post("/auth/signup", signupController);
apiRoutes.get("/auth/me", meController);
apiRoutes.post("/auth/logout", logoutController);

// All operational routes below require valid Supabase Auth session token
apiRoutes.use(requireAuth);

// Core Dashboard
apiRoutes.get("/dashboard", getDashboard);
apiRoutes.get("/dashboard/summary", getDashboard);
apiRoutes.get("/debug/recovery-summary", getDebugSummaryController);

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

// Recovery Cases & Human Escalations
apiRoutes.get("/recovery-cases", listRecoveryCasesController);
apiRoutes.get("/recovery-cases/:id", getRecoveryCaseController);
apiRoutes.patch("/recovery-cases/:id/status", updateCaseStatusController);
apiRoutes.get("/human-escalations", listHumanEscalationsController);
apiRoutes.get("/recovery/human-escalations", listHumanEscalationsController);
apiRoutes.post("/human-escalations/:id/resolve", resolveHumanEscalationController);
apiRoutes.post("/human-escalations/:id/take-ownership", takeOwnershipOfHumanEscalationController);
apiRoutes.post("/human-escalations/:id/notes", addNoteToHumanEscalationController);

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

// Provider Channel Readiness & Verification Workflows
apiRoutes.get("/provider/readiness", getDetailedChannelReadinessController);
apiRoutes.get("/provider/demo-test-contact", getDemoTestContactController);
apiRoutes.post("/provider/demo-test-contact", updateDemoTestContactController);
apiRoutes.patch("/provider/demo-test-contact", updateDemoTestContactController);
apiRoutes.post("/provider/twilio/verify/start", startPhoneVerificationController);
apiRoutes.post("/provider/twilio/verify/check", checkPhoneVerificationController);

// SMS Recovery Operations (Exotel Outbound Dispatch)
apiRoutes.post("/recovery/send-sms", sendSmsRecoveryController);
apiRoutes.post("/operations/send-sms", sendSmsRecoveryController);
apiRoutes.post("/sms/send-recovery-sms", sendSmsRecoveryController);
apiRoutes.post("/sms/send-sms", sendSmsRecoveryController);
apiRoutes.post("/sandbox/incidents/:id/sms", sendSmsRecoveryController);

// Voice Recovery Operations (Exotel Outbound Dispatch)
apiRoutes.post("/voice/recovery-call", dispatchVoiceCallController);
apiRoutes.post("/voice/dispatch-call", dispatchVoiceCallController);
apiRoutes.post("/voice/call", dispatchVoiceCallController);

// Dynamic Sandbox Incidents REST API
apiRoutes.get("/sandbox/incidents", listSandboxIncidentsController);
apiRoutes.post("/sandbox/incidents", createSandboxIncidentController);
apiRoutes.get("/sandbox/incidents/:id", getSandboxIncidentController);
apiRoutes.put("/sandbox/incidents/:id/contact", updateContactController);
apiRoutes.patch("/sandbox/incidents/:id/contact", updateContactController);
apiRoutes.post("/sandbox/incidents/:id/analyze", analyzeSandboxIncidentController);
apiRoutes.post("/sandbox/incidents/:id/actions", executeSandboxIncidentActionController);
apiRoutes.post("/sandbox/incidents/:id/reassess", reassessSandboxIncidentController);
apiRoutes.post("/sandbox/incidents/:id/escalate", escalateSandboxIncidentController);
apiRoutes.post("/sandbox/incidents/:id/autonomous-step", executeAutonomousStepController);
apiRoutes.post("/sandbox/incidents/:id/run-loop", runFullAutonomousLoopController);
apiRoutes.post("/sandbox/incidents/:id/mark-paid", markSandboxIncidentPaidController);
apiRoutes.post("/sandbox/incidents/:id/customer-resolve", customerResolveIncidentController);
apiRoutes.post("/sandbox/incidents/:id/resolve", customerResolveIncidentController);
apiRoutes.post("/sandbox/incidents/:id/trigger-now", triggerScheduledAttemptNowController);
apiRoutes.post("/sandbox/incidents/:id/cancel", cancelScheduledRecoveryController);
apiRoutes.delete("/sandbox/incidents/:id", deleteSandboxIncidentController);

// Synthetic Telemetry Demonstration Queue (Raw Signals -> Gemini Detection -> Sandbox Incident)
apiRoutes.get("/telemetry/demo-queue", getTelemetryQueueController);
apiRoutes.get("/demo-queue", getTelemetryQueueController);
apiRoutes.get("/telemetry/queue", getTelemetryQueueController);
apiRoutes.get("/telemetry/channel-readiness", getChannelReadinessController);
apiRoutes.get("/channel-readiness", getChannelReadinessController);
apiRoutes.get("/telemetry/:id", getTelemetryRecordController);
apiRoutes.patch("/telemetry/:id/contact", updateTelemetryContactController);
apiRoutes.put("/telemetry/:id/contact", updateTelemetryContactController);
apiRoutes.post("/telemetry", createCustomTelemetryController);
apiRoutes.post("/telemetry/:id/analyze", analyzeTelemetryController);
apiRoutes.post("/telemetry/reset-queue", resetTelemetryQueueController);

// Recovery Demo Scenario Types & Sandbox Fast-Path Actions
apiRoutes.get("/demo/scenario-types", listScenarioTypesController);
apiRoutes.post("/demo/incidents/create-and-analyze", createAndAnalyzeSandboxIncidentController);
apiRoutes.post("/demo/incidents/simulate", simulateSandboxIncidentController);
apiRoutes.get("/demo/scenarios", listDemoScenariosController);

// Scenario Simulation Engine (Sandbox simulation)
apiRoutes.post("/scenarios/simulate", simulateScenarioController);

apiRoutes.use((_request, response) => response.status(404).json({ error: "API route not found" }));
