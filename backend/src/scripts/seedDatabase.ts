import { getSupabaseClient } from "../services/supabaseService.js";

const supabase = getSupabaseClient();

const customers = [
  { name: "Aarav Mehta", email: "aarav.mehta@example.test", phone: "+91 90000 10001", customer_type: "BUSINESS" },
  { name: "Nisha Iyer", email: "nisha.iyer@example.test", phone: "+91 90000 10002", customer_type: "INDIVIDUAL" },
  { name: "Vikram Shah", email: "vikram.shah@example.test", phone: "+91 90000 10003", customer_type: "BUSINESS" },
  { name: "Kavya Rao", email: "kavya.rao@example.test", phone: "+91 90000 10004", customer_type: "INDIVIDUAL" },
];

const { data: insertedCustomers, error: customerError } = await supabase
  .from("customers")
  .upsert(customers, { onConflict: "email" })
  .select("id,email");

if (customerError || !insertedCustomers) throw customerError ?? new Error("Customers were not returned");
const customerId = (email: string) => insertedCustomers.find((customer) => customer.email === email)!.id;

const { data: transactions, error: transactionError } = await supabase.from("transactions").upsert([
  { customer_id: customerId("aarav.mehta@example.test"), amount: 24500, currency: "INR", payment_method: "UPI", status: "SUCCESS", transaction_reference: "txn_demo_success_001" },
  { customer_id: customerId("nisha.iyer@example.test"), amount: 7800, currency: "INR", payment_method: "CARD", status: "FAILED", failure_reason: "INSUFFICIENT_FUNDS", transaction_reference: "txn_demo_failed_001" },
  { customer_id: customerId("vikram.shah@example.test"), amount: 12900, currency: "INR", payment_method: "CARD", status: "FAILED", failure_reason: "EXPIRED_CARD", transaction_reference: "txn_demo_failed_002" },
], { onConflict: "transaction_reference" }).select("id,transaction_reference,customer_id,amount");
if (transactionError || !transactions) throw transactionError ?? new Error("Transactions were not returned");

const transactionId = (reference: string) => transactions.find((transaction) => transaction.transaction_reference === reference)!.id;

const { error: subscriptionError } = await supabase.from("subscriptions").upsert([
  { customer_id: customerId("aarav.mehta@example.test"), amount: 4999, currency: "INR", billing_cycle: "MONTHLY", status: "ACTIVE", next_payment_date: "2026-09-01", failure_count: 0 },
  { customer_id: customerId("kavya.rao@example.test"), amount: 2499, currency: "INR", billing_cycle: "MONTHLY", status: "PAST_DUE", next_payment_date: "2026-08-15", failure_count: 2 },
], { onConflict: "customer_id" });
if (subscriptionError) throw subscriptionError;

const { data: invoices, error: invoiceError } = await supabase.from("invoices").upsert([
  { customer_id: customerId("vikram.shah@example.test"), invoice_number: "INV-DEMO-1001", amount: 18500, currency: "INR", issue_date: "2026-07-01", due_date: "2026-07-15", status: "OVERDUE", promise_date: "2026-08-28" },
  { customer_id: customerId("nisha.iyer@example.test"), invoice_number: "INV-DEMO-1002", amount: 6200, currency: "INR", issue_date: "2026-08-01", due_date: "2026-08-15", status: "PAID" },
], { onConflict: "invoice_number" }).select("id,invoice_number,customer_id,amount");
if (invoiceError || !invoices) throw invoiceError ?? new Error("Invoices were not returned");

const { data: cases, error: caseError } = await supabase.from("recovery_cases").upsert([
  { customer_id: customerId("nisha.iyer@example.test"), case_type: "PAYMENT_FAILED", source_event_id: transactionId("txn_demo_failed_001"), amount_at_risk: 7800, currency: "INR", reason: "Insufficient funds on primary card", priority: "HIGH", status: "OPEN", recovery_probability: 0.72 },
  { customer_id: customerId("vikram.shah@example.test"), case_type: "INVOICE_OVERDUE", source_event_id: invoices.find((invoice) => invoice.invoice_number === "INV-DEMO-1001")!.id, amount_at_risk: 18500, currency: "INR", reason: "Invoice passed due date", priority: "MEDIUM", status: "PROMISE_TO_PAY", recovery_probability: 0.61 },
  { customer_id: customerId("kavya.rao@example.test"), case_type: "SUBSCRIPTION_FAILED", amount_at_risk: 2499, currency: "INR", reason: "Recurring payment failed twice", priority: "HIGH", status: "ESCALATED", recovery_probability: 0.34 },
  { customer_id: customerId("aarav.mehta@example.test"), case_type: "PAYMENT_DEGRADATION", source_event_id: transactionId("txn_demo_success_001"), amount_at_risk: 24500, currency: "INR", reason: "Payment recovered after a temporary degradation", priority: "LOW", status: "RECOVERED", recovery_probability: 0.94, resolved_at: "2026-08-20T09:20:00Z" },
], { onConflict: "id" }).select("id,customer_id,case_type,amount_at_risk");
if (caseError || !cases) throw caseError ?? new Error("Recovery cases were not returned");

const paymentEvents = [
  { customer_id: customerId("aarav.mehta@example.test"), transaction_id: transactionId("txn_demo_success_001"), event_type: "PAYMENT_SUCCESS", amount: 24500, metadata: { source: "demo_seed" }, occurred_at: "2026-08-20T09:15:00Z" },
  { customer_id: customerId("nisha.iyer@example.test"), transaction_id: transactionId("txn_demo_failed_001"), event_type: "PAYMENT_FAILED", amount: 7800, metadata: { failure_code: "INSUFFICIENT_FUNDS", source: "demo_seed" }, occurred_at: "2026-08-20T10:30:00Z" },
  { customer_id: customerId("vikram.shah@example.test"), transaction_id: transactionId("txn_demo_failed_002"), event_type: "PAYMENT_METHOD_FAILED", amount: 12900, metadata: { failure_code: "EXPIRED_CARD", source: "demo_seed" }, occurred_at: "2026-08-19T11:45:00Z" },
  { customer_id: customerId("kavya.rao@example.test"), event_type: "CHECKOUT_ABANDONED", amount: 4999, metadata: { checkout_id: "checkout_demo_001", source: "demo_seed" }, occurred_at: "2026-08-18T15:20:00Z" },
  { customer_id: customerId("kavya.rao@example.test"), event_type: "MANDATE_FAILED", amount: 2499, metadata: { mandate_reference: "mandate_demo_001", source: "demo_seed" }, occurred_at: "2026-08-17T08:05:00Z" },
];
const { error: eventError } = await supabase.from("payment_events").insert(paymentEvents);
if (eventError) throw eventError;

const { error: promiseError } = await supabase.from("promises_to_pay").upsert([
  { recovery_case_id: cases.find((item) => item.case_type === "INVOICE_OVERDUE")!.id, customer_id: customerId("vikram.shah@example.test"), amount: 18500, promise_date: "2026-08-28", status: "OPEN" },
], { onConflict: "recovery_case_id" });
if (promiseError) throw promiseError;

const { error: actionError } = await supabase.from("recovery_actions").insert([
  { recovery_case_id: cases.find((item) => item.case_type === "PAYMENT_FAILED")!.id, action_type: "SEND_PAYMENT_LINK", reason: "Offer an alternate completion path", status: "PENDING" },
  { recovery_case_id: cases.find((item) => item.case_type === "INVOICE_OVERDUE")!.id, action_type: "RECORD_PROMISE_TO_PAY", reason: "Customer committed to a future payment date", status: "EXECUTED", result: "Promise recorded" },
  { recovery_case_id: cases.find((item) => item.case_type === "SUBSCRIPTION_FAILED")!.id, action_type: "ESCALATE", reason: "Repeated payment failure requires human review", status: "EXECUTED", result: "Escalated to operations" },
]);
if (actionError) throw actionError;

const { error: agentLogError } = await supabase.from("agent_logs").insert([
  { recovery_case_id: cases.find((item) => item.case_type === "PAYMENT_FAILED")!.id, event_type: "POLICY_RECOMMENDATION", message: "Payment link recommended because the case is high priority and the failure reason is insufficient funds.", action_type: "SEND_PAYMENT_LINK" },
]);
if (agentLogError) throw agentLogError;

const { error: auditError } = await supabase.from("audit_logs").insert([
  { recovery_case_id: cases.find((item) => item.case_type === "PAYMENT_FAILED")!.id, actor_type: "SYSTEM", event: "CASE_CREATED", details: { source: "demo_seed" } },
  { recovery_case_id: cases.find((item) => item.case_type === "INVOICE_OVERDUE")!.id, actor_type: "HUMAN", event: "PROMISE_RECORDED", details: { promise_date: "2026-08-28", source: "demo_seed" } },
]);
if (auditError) throw auditError;

console.log(`Seeded ${insertedCustomers.length} customers, ${transactions.length} transactions, ${invoices.length} invoices, ${cases.length} recovery cases, and ${paymentEvents.length} payment events.`);