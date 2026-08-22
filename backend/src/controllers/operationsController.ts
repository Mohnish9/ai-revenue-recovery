import type { Request, Response } from "express";
import {
  getCustomer,
  getCustomerOperations,
  getInvoice,
  getRecoveryCase,
  getTransaction,
  listCaseActions,
  listCaseAuditLogs,
  listCaseEvents,
  listCasePromises,
  listCustomers,
  listInvoices,
  listRecoveryCases,
  listTransactions,
  parseLimit,
} from "../services/operationsService.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateId(id: string) {
  if (!uuidPattern.test(id)) throw new Error("id must be a valid UUID");
}

function getId(request: Request) {
  const id = request.params.id;
  if (typeof id !== "string") throw new Error("id must be a single UUID");
  validateId(id);
  return id;
}

function sendError(response: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to load recovery operations";
  const status = message.includes("must be") ? 400 : 503;
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
  try { response.json(await listCustomers(parseLimit(request.query.limit))); } catch (error) { sendError(response, error); }
}

export async function getCustomerController(request: Request, response: Response) {
  try { const id = getId(request); await respondWithRecord(response, await getCustomer(id), "Customer"); } catch (error) { sendError(response, error); }
}

export async function getCustomerOperationsController(request: Request, response: Response) {
  try { const id = getId(request); await respondWithRecord(response, await getCustomerOperations(id, parseLimit(request.query.limit)), "Customer"); } catch (error) { sendError(response, error); }
}

export async function listTransactionsController(request: Request, response: Response) {
  try { response.json(await listTransactions(parseLimit(request.query.limit), typeof request.query.status === "string" ? request.query.status : undefined)); } catch (error) { sendError(response, error); }
}

export async function getTransactionController(request: Request, response: Response) {
  try { const id = getId(request); await respondWithRecord(response, await getTransaction(id), "Transaction"); } catch (error) { sendError(response, error); }
}

export async function listInvoicesController(request: Request, response: Response) {
  try { response.json(await listInvoices(parseLimit(request.query.limit), typeof request.query.status === "string" ? request.query.status : undefined)); } catch (error) { sendError(response, error); }
}

export async function getInvoiceController(request: Request, response: Response) {
  try { const id = getId(request); await respondWithRecord(response, await getInvoice(id), "Invoice"); } catch (error) { sendError(response, error); }
}

export async function listRecoveryCasesController(request: Request, response: Response) {
  try { response.json(await listRecoveryCases(parseLimit(request.query.limit), typeof request.query.status === "string" ? request.query.status : undefined)); } catch (error) { sendError(response, error); }
}

export async function getRecoveryCaseController(request: Request, response: Response) {
  try { const id = getId(request); await respondWithRecord(response, await getRecoveryCase(id), "Recovery case"); } catch (error) { sendError(response, error); }
}

async function caseCollection(request: Request, response: Response, loader: (id: string, limit: number) => Promise<unknown[] | null>) {
  try {
    const id = getId(request);
    const records = await loader(id, parseLimit(request.query.limit));
    await respondWithRecord(response, records, "Recovery case");
  } catch (error) { sendError(response, error); }
}

export const listActionsController = (request: Request, response: Response) => caseCollection(request, response, listCaseActions);
export const listPromisesController = (request: Request, response: Response) => caseCollection(request, response, listCasePromises);
export const listEventsController = (request: Request, response: Response) => caseCollection(request, response, listCaseEvents);
export const listAuditLogsController = (request: Request, response: Response) => caseCollection(request, response, listCaseAuditLogs);