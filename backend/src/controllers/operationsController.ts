import type { Request, Response } from "express";
import {
  analyzeRecoveryCaseWithAI,
  analyzeDemoScenarioWithAI,
  analyzeSandboxIncidentWithAI,
  chatWithRecoveryAI,
  createAndAnalyzeSandboxIncident,
  createSandboxIncident,
  createPromiseToPay,
  deleteSandboxIncident,
  executeRecoveryAction,
  executeSandboxIncidentAction,
  getCustomer,
  getCustomerOperations,
  getDemoScenarioWithContext,
  getInvoice,
  getRecoveryCase,
  getSandboxIncident,
  getTransaction,
  listAllAgentLogs,
  listAllAuditLogs,
  listCaseActions,
  listCaseAuditLogs,
  listCaseEvents,
  listCasePromises,
  listCustomers,
  listDemoScenarios,
  listInvoices,
  listPaymentEvents,
  listRecoveryCases,
  listSandboxIncidents,
  listScenarioTypes,
  listSubscriptions,
  listTransactions,
  parseLimit,
  reassessSandboxIncidentWithAI,
  escalateSandboxIncidentToHuman,
  executeAutonomousLoopStep,
  runFullAutonomousLoop,
  markSandboxIncidentPaid,
  customerResolveIncident,
  triggerScheduledAttemptNow,
  cancelScheduledRecovery,
  simulateRecoveryScenario,
  simulateSandboxIncident,
  updateCaseStatus,
  listHumanEscalations,
  resolveHumanEscalation,
  takeOwnershipOfHumanEscalation,
  addNoteToHumanEscalation,
} from "../services/operationsService.js";
import { sendExotelSmsRecovery } from "../services/smsRecoveryService.js";

function validateId(id: string) {
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    throw new Error("id must be a valid non-empty string identifier");
  }
}

function getId(request: Request) {
  const id = request.params.id;
  if (typeof id !== "string") throw new Error("id must be a single string identifier");
  validateId(id);
  return id.trim();
}

function sendError(response: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to process recovery operation";
  const status = message.includes("must be") || message.includes("not found") || message.includes("Unauthorized") ? (message.includes("Unauthorized") ? 403 : 400) : 500;
  response.status(status).json({ error: message });
}

async function respondWithRecord(response: Response, record: unknown, name: string) {
  if (!record) {
    response.status(404).json({ error: `${name} not found` });
    return;
  }
  response.json(record);
}

export async function listCustomersController(request: Request, response: Response) {
  try {
    const search = typeof request.query.search === "string" ? request.query.search : undefined;
    const user = (request as any).user;
    response.json(await listCustomers(parseLimit(request.query.limit), search, user));
  } catch (error) {
    sendError(response, error);
  }
}

export async function getCustomerController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const user = (request as any).user;
    await respondWithRecord(response, await getCustomer(id, user), "Customer");
  } catch (error) {
    sendError(response, error);
  }
}

export async function getCustomerOperationsController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const user = (request as any).user;
    await respondWithRecord(response, await getCustomerOperations(id, parseLimit(request.query.limit), user), "Customer");
  } catch (error) {
    sendError(response, error);
  }
}

export async function listTransactionsController(request: Request, response: Response) {
  try {
    const status = typeof request.query.status === "string" ? request.query.status : undefined;
    const paymentMethod = typeof request.query.payment_method === "string" ? request.query.payment_method : undefined;
    const user = (request as any).user;
    response.json(await listTransactions(parseLimit(request.query.limit), status, paymentMethod, user));
  } catch (error) {
    sendError(response, error);
  }
}

export async function getTransactionController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const user = (request as any).user;
    await respondWithRecord(response, await getTransaction(id, user), "Transaction");
  } catch (error) {
    sendError(response, error);
  }
}

export async function listInvoicesController(request: Request, response: Response) {
  try {
    const status = typeof request.query.status === "string" ? request.query.status : undefined;
    const user = (request as any).user;
    response.json(await listInvoices(parseLimit(request.query.limit), status, user));
  } catch (error) {
    sendError(response, error);
  }
}

export async function getInvoiceController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const user = (request as any).user;
    await respondWithRecord(response, await getInvoice(id, user), "Invoice");
  } catch (error) {
    sendError(response, error);
  }
}

export async function listSubscriptionsController(request: Request, response: Response) {
  try {
    const status = typeof request.query.status === "string" ? request.query.status : undefined;
    const user = (request as any).user;
    response.json(await listSubscriptions(parseLimit(request.query.limit), status, user));
  } catch (error) {
    sendError(response, error);
  }
}

export async function listPaymentEventsController(request: Request, response: Response) {
  try {
    const eventType = typeof request.query.event_type === "string" ? request.query.event_type : undefined;
    const user = (request as any).user;
    response.json(await listPaymentEvents(parseLimit(request.query.limit), eventType, user));
  } catch (error) {
    sendError(response, error);
  }
}

export async function listRecoveryCasesController(request: Request, response: Response) {
  try {
    const status = typeof request.query.status === "string" ? request.query.status : undefined;
    const priority = typeof request.query.priority === "string" ? request.query.priority : undefined;
    const user = (request as any).user;
    response.json(await listRecoveryCases(parseLimit(request.query.limit), status, priority, user));
  } catch (error) {
    sendError(response, error);
  }
}

export async function getRecoveryCaseController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const user = (request as any).user;
    await respondWithRecord(response, await getRecoveryCase(id, user), "Recovery case");
  } catch (error) {
    sendError(response, error);
  }
}

export async function listAllAuditLogsController(request: Request, response: Response) {
  try {
    const actorType = typeof request.query.actor_type === "string" ? request.query.actor_type : undefined;
    const user = (request as any).user;
    response.json(await listAllAuditLogs(parseLimit(request.query.limit), actorType, user));
  } catch (error) {
    sendError(response, error);
  }
}

export async function listAllAgentLogsController(request: Request, response: Response) {
  try {
    const user = (request as any).user;
    response.json(await listAllAgentLogs(parseLimit(request.query.limit), user));
  } catch (error) {
    sendError(response, error);
  }
}

export async function executeActionController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const { action_type, reason } = request.body || {};
    if (!action_type) {
      response.status(400).json({ error: "action_type is required" });
      return;
    }
    const operator = (request as any).user;
    const result = await executeRecoveryAction(id, action_type, reason, operator);
    response.status(201).json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function createPromiseController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const { customer_id, amount, promise_date } = request.body || {};
    if (!customer_id || amount === undefined || !promise_date) {
      response.status(400).json({ error: "customer_id, amount, and promise_date are required" });
      return;
    }
    const operator = (request as any).user;
    const result = await createPromiseToPay(id, customer_id, Number(amount), promise_date, operator);
    response.status(201).json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function updateCaseStatusController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const { status, assigned_to } = request.body || {};
    if (!status) {
      response.status(400).json({ error: "status is required" });
      return;
    }
    const operator = (request as any).user;
    const result = await updateCaseStatus(id, status, assigned_to, operator);
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function analyzeCaseAIController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const { user_instruction } = request.body || {};
    const user = (request as any).user;
    const analysis = await analyzeRecoveryCaseWithAI(id, user_instruction, user);
    response.json(analysis);
  } catch (error) {
    sendError(response, error);
  }
}

export async function chatAIController(request: Request, response: Response) {
  try {
    const { message, case_id } = request.body || {};
    if (!message) {
      response.status(400).json({ error: "message is required" });
      return;
    }
    const user = (request as any).user;
    const reply = await chatWithRecoveryAI(message, case_id, user);
    response.json(reply);
  } catch (error) {
    sendError(response, error);
  }
}

export function simulateScenarioController(request: Request, response: Response) {
  try {
    const {
      retryCadence = "balanced",
      discountIncentivePct = 0,
      omnichannelEnabled = true,
      gracePeriodDays = 5,
      openCasesCount = 10,
      totalAtRisk = 50000,
    } = request.body || {};

    const simulation = simulateRecoveryScenario({
      retryCadence,
      discountIncentivePct: Number(discountIncentivePct),
      omnichannelEnabled: Boolean(omnichannelEnabled),
      gracePeriodDays: Number(gracePeriodDays),
      openCasesCount: Number(openCasesCount),
      totalAtRisk: Number(totalAtRisk),
    });
    response.json(simulation);
  } catch (error) {
    sendError(response, error);
  }
}

async function caseCollection(request: Request, response: Response, loader: (id: string, limit: number, user?: any) => Promise<unknown[] | null>) {
  try {
    const id = getId(request);
    const user = (request as any).user;
    const records = await loader(id, parseLimit(request.query.limit), user);
    await respondWithRecord(response, records, "Recovery case");
  } catch (error) {
    sendError(response, error);
  }
}

export const listActionsController = (request: Request, response: Response) => caseCollection(request, response, listCaseActions);
export const listPromisesController = (request: Request, response: Response) => caseCollection(request, response, listCasePromises);
export const listEventsController = (request: Request, response: Response) => caseCollection(request, response, listCaseEvents);
export const listAuditLogsController = (request: Request, response: Response) => caseCollection(request, response, listCaseAuditLogs);

export async function listScenarioTypesController(_request: Request, response: Response) {
  try {
    const types = await listScenarioTypes();
    response.json(types);
  } catch (error) {
    sendError(response, error);
  }
}

export async function createAndAnalyzeSandboxIncidentController(request: Request, response: Response) {
  try {
    const input = request.body || {};
    if (!input.scenarioTypeKey) {
      response.status(400).json({ error: "scenarioTypeKey is required" });
      return;
    }
    const user = (request as any).user;
    const result = await createAndAnalyzeSandboxIncident(input, user);
    response.status(201).json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export function simulateSandboxIncidentController(request: Request, response: Response) {
  try {
    const { incidentId, actionType, strategyName, recoveryProbability, amount } = request.body || {};
    if (!incidentId || !actionType) {
      response.status(400).json({ error: "incidentId and actionType are required" });
      return;
    }
    const result = simulateSandboxIncident({
      incidentId,
      actionType,
      strategyName,
      recoveryProbability: recoveryProbability ? Number(recoveryProbability) : undefined,
      amount: Number(amount) || 5000,
    });
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function listDemoScenariosController(_request: Request, response: Response) {
  try {
    const scenarios = await listDemoScenarios();
    response.json(scenarios);
  } catch (error) {
    sendError(response, error);
  }
}

export async function getDemoScenarioController(request: Request, response: Response) {
  try {
    const rawKey = request.params.key;
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!key || typeof key !== "string") {
      response.status(400).json({ error: "Scenario key is required" });
      return;
    }
    const result = await getDemoScenarioWithContext(key);
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function listSandboxIncidentsController(request: Request, response: Response) {
  try {
    const { scenarioType, status, category, limit } = request.query;
    const user = (request as any).user;
    const incidents = await listSandboxIncidents({
      scenarioType: typeof scenarioType === "string" ? scenarioType : undefined,
      status: typeof status === "string" ? status : undefined,
      category: typeof category === "string" ? category : undefined,
      limit: limit ? Number(limit) : undefined,
    }, undefined, user);
    response.json(incidents);
  } catch (error) {
    sendError(response, error);
  }
}

export async function getSandboxIncidentController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const user = (request as any).user;
    const incident = await getSandboxIncident(id, user);
    await respondWithRecord(response, incident, "Sandbox incident");
  } catch (error) {
    sendError(response, error);
  }
}

export async function createSandboxIncidentController(request: Request, response: Response) {
  try {
    const input = request.body || {};
    if (!input.scenarioTypeKey) {
      response.status(400).json({ error: "scenarioTypeKey is required" });
      return;
    }
    const user = (request as any).user;
    const result = await createSandboxIncident(input, user);
    response.status(201).json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function analyzeSandboxIncidentController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const { custom_instruction, customInstruction } = request.body || {};
    const user = (request as any).user;
    const result = await analyzeSandboxIncidentWithAI(id, customInstruction || custom_instruction, user);
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function executeSandboxIncidentActionController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const { actionType, strategyName, reason, operatorInfo } = request.body || {};
    if (!actionType) {
      response.status(400).json({ error: "actionType is required" });
      return;
    }
    const user = (request as any).user;
    const result = await executeSandboxIncidentAction(id, {
      actionType,
      strategyName,
      reason,
      operatorInfo,
    }, user);
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function deleteSandboxIncidentController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const user = (request as any).user;
    const result = await deleteSandboxIncident(id, user);
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function reassessSandboxIncidentController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const { customInstruction, custom_instruction, lastOutcomeNote } = request.body || {};
    const user = (request as any).user;
    const result = await reassessSandboxIncidentWithAI(id, {
      customInstruction: customInstruction || custom_instruction,
      lastOutcomeNote,
    }, user);
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function escalateSandboxIncidentController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const { reason, operatorName } = request.body || {};
    const user = (request as any).user;
    const result = await escalateSandboxIncidentToHuman(id, {
      reason,
      operatorName,
    }, user);
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function executeAutonomousStepController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const { policyConfig, operatorInstruction } = request.body || {};
    const user = (request as any).user;
    const result = await executeAutonomousLoopStep(id, {
      policyConfig,
      operatorInstruction,
    }, user);
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function runFullAutonomousLoopController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const { policyConfig, operatorInstruction } = request.body || {};
    const user = (request as any).user;
    const result = await runFullAutonomousLoop(id, {
      policyConfig,
      operatorInstruction,
    }, user);
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function markSandboxIncidentPaidController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const { operatorName } = request.body || {};
    const user = (request as any).user;
    const result = markSandboxIncidentPaid(id, operatorName, user);
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function customerResolveIncidentController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const { method, notes } = request.body || {};
    const result = customerResolveIncident(id, { method, notes });
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

/**
 * Public portal endpoint for customers paying/resolving their incidents.
 * Intentionally public so customer can open 1-click link from SMS/Email without operator login.
 */
export async function getPublicSandboxIncidentController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const item = await getSandboxIncident(id);
    if (!item) {
      return response.status(404).json({ error: `Incident ${id} not found` });
    }
    const rec = (item as any).record || item.incident;
    return response.json({
      id: item.incident.id,
      customerName: item.customer.name,
      customerEmail: item.customer.email,
      scenarioTypeName: item.incident.scenarioTypeName,
      amount: item.incident.amount,
      currency: item.incident.currency,
      paymentMethod: item.incident.paymentMethod,
      failureReason: item.incident.failureCode,
      status: item.incident.status,
      isResolved: item.incident.status === "RECOVERED" || item.incident.status === "RESOLVED",
      recoveredAmount: rec?.recoveryDossier?.recoveredAmount || item.incident.amount,
      settledTimestamp: rec?.recoveryDossier?.settledTimestamp || null,
    });
  } catch (error) {
    sendError(response, error);
  }
}

export async function triggerScheduledAttemptNowController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const user = (request as any).user;
    const result = await triggerScheduledAttemptNow(id, user);
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function cancelScheduledRecoveryController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const { reason } = request.body || {};
    const user = (request as any).user;
    const result = cancelScheduledRecovery(id, reason, user);
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function listHumanEscalationsController(request: Request, response: Response) {
  try {
    const user = (request as any).user;
    const result = await listHumanEscalations(user);
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function resolveHumanEscalationController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const { resolutionType, notes, settlementAmount, operatorName } = request.body || {};
    const user = (request as any).user;
    const result = await resolveHumanEscalation(id, {
      resolutionType,
      notes,
      settlementAmount: settlementAmount ? Number(settlementAmount) : undefined,
      operatorName,
    }, user);
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function takeOwnershipOfHumanEscalationController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const { operatorName } = request.body || {};
    const user = (request as any).user;
    const result = await takeOwnershipOfHumanEscalation(id, operatorName, user);
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

export async function addNoteToHumanEscalationController(request: Request, response: Response) {
  try {
    const id = getId(request);
    const { note, operatorName } = request.body || {};
    if (!note || typeof note !== "string" || !note.trim()) {
      return response.status(400).json({ error: "Note content is required." });
    }
    const user = (request as any).user;
    const result = await addNoteToHumanEscalation(id, { note: note.trim(), operatorName }, user);
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}

/**
 * Handles Exotel SMS dispatch for recovery cases and sandbox incidents.
 * POST /api/recovery/send-sms or POST /api/operations/send-sms
 */
export async function sendSmsRecoveryController(request: Request, response: Response) {
  try {
    const { incidentId, id, toPhone, phone, customMessage, message, senderId, dltTemplateId, dltEntityId } = request.body || {};
    const targetIncidentId = incidentId || id || request.params.id || "";

    if (!targetIncidentId || typeof targetIncidentId !== "string" || !targetIncidentId.trim()) {
      return response.status(400).json({ error: "incidentId is required to send recovery SMS." });
    }

    const user = (request as any).user;
    const result = await sendExotelSmsRecovery({
      incidentId: targetIncidentId.trim(),
      toPhone: toPhone || phone,
      customMessage: customMessage || message,
      senderId,
      dltTemplateId,
      dltEntityId,
    }, user);

    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
}
