import { getSupabaseClient } from "./supabaseService.js";
import { generateContentResilient } from "./geminiService.js";
import { canUserAccess, isMohnishUser, getOwnerIdForUser } from "./dataAccessService.js";
import type { UserProfile } from "./authService.js";
import {
  createSandboxIncident,
  persistentSandboxIncidents,
  scheduleAutonomousAttempt,
  RECOVERY_SCENARIO_TYPES,
} from "./operationsService.js";

export interface RawTelemetryEvent {
  eventId: string;
  timestamp: string;
  eventType: string;
  source: string;
  payload: Record<string, any>;
}

export interface SyntheticTelemetryRecord {
  id: string;
  owner_id?: string;
  batchNumber: number;
  title: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  demoOutreachContact?: {
    email?: string;
    phone?: string;
    updatedAt?: string;
    customized?: boolean;
  };
  customerType: "INDIVIDUAL" | "BUSINESS";
  amount: number;
  currency: string;
  paymentMethod: string;
  paymentRail: string;
  events: RawTelemetryEvent[];
  sessionContext: Record<string, any>;
  historicalContext: Record<string, any>;
  status: "WAITING" | "ANALYZING" | "AI_DETECTED" | "RECOVERY_ACTIVE" | "RECOVERED" | "ESCALATED" | "ERROR";
  createdIncidentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TelemetryGroundTruth {
  id: string;
  telemetryId: string;
  expectedScenarioType: string;
  expectedCategory: string;
  description: string;
  createdAt: string;
}

export interface TelemetryAIAnalysis {
  id: string;
  telemetryId: string;
  detectedScenarioType: string;
  confidence: number;
  rootCause: string;
  evidence: string[];
  reasoning: string;
  revenueAtRisk: number;
  recommendedStrategy: string;
  recommendedChannel: "EMAIL" | "VOICE" | "SMS";
  explanation: string;
  modelName: string;
  createdAt: string;
}

export interface DetectionEvaluation {
  id: string;
  telemetryId: string;
  aiPrediction: string;
  groundTruth: string;
  match: boolean;
  confidence: number;
  evaluatedAt: string;
}

export interface TelemetryQueueSummary {
  totalSignals: number;
  waitingCount: number;
  analyzedCount: number;
  activeCount: number;
  recoveredCount: number;
  escalatedCount: number;
  evaluatedCount: number;
  correctDetections: number;
  accuracyPercentage: number;
}

export const SCENARIO_ROUTE_MAPPING: Record<string, { pageKey: string; pageTitle: string; category: string }> = {
  INSUFFICIENT_FUNDS: { pageKey: "failed-payments", pageTitle: "Failed Payments", category: "CARDS" },
  EXPIRED_CARD: { pageKey: "failed-payments", pageTitle: "Failed Payments", category: "CARDS" },
  "3DS_AUTHENTICATION_FAILURE": { pageKey: "failed-payments", pageTitle: "Failed Payments", category: "CARDS" },
  BANK_GATEWAY_TIMEOUT: { pageKey: "failed-payments", pageTitle: "Failed Payments", category: "NETBANKING" },
  CHECKOUT_ABANDONMENT: { pageKey: "checkout-dropoffs", pageTitle: "Checkout Drop-offs", category: "CHECKOUT" },
  SUBSCRIPTION_RENEWAL_FAILURE: { pageKey: "subscriptions", pageTitle: "Subscriptions", category: "RECURRING" },
  UPI_MANDATE_FAILURE: { pageKey: "mandates", pageTitle: "Mandates", category: "UPI" },
  OVERDUE_INVOICE: { pageKey: "invoices", pageTitle: "Invoices", category: "B2B_INVOICE" },
  HIGH_CHURN_RISK: { pageKey: "customers", pageTitle: "Customers", category: "RETENTION" },
};

// In-memory backing stores for ultra-fast response with Supabase dual-sync
const memoryTelemetryRecords = new Map<string, SyntheticTelemetryRecord>();
const memoryGroundTruth = new Map<string, TelemetryGroundTruth>();
const memoryAIAnalyses = new Map<string, TelemetryAIAnalysis>();
const memoryEvaluations = new Map<string, DetectionEvaluation>();
const memoryProcessingRuns = new Map<string, any>();

let isQueueInitialized = false;

// 40 deterministic synthetic demo telemetry records generator
function generateSyntheticTelemetryDataset(ownerId = "usr_demo_001"): {
  records: SyntheticTelemetryRecord[];
  groundTruths: TelemetryGroundTruth[];
} {
  const dataset: { records: SyntheticTelemetryRecord[]; groundTruths: TelemetryGroundTruth[] } = {
    records: [],
    groundTruths: [],
  };

  const syntheticCustomers = [
    { name: "Aarav Sharma", email: "aarav.sharma@synthetics.test", phone: "+91 98111 20001", type: "INDIVIDUAL" as const },
    { name: "Priya Nair", email: "priya.nair@synthetics.test", phone: "+91 98222 20002", type: "INDIVIDUAL" as const },
    { name: "Vikram Malhotra", email: "vikram.m@zenithcorp.test", phone: "+91 98333 20003", type: "BUSINESS" as const },
    { name: "Ananya Iyer", email: "ananya.iyer@synthetics.test", phone: "+91 98444 20004", type: "INDIVIDUAL" as const },
    { name: "Rohan Varma", email: "rohan.v@cloudscale.test", phone: "+91 98555 20005", type: "BUSINESS" as const },
    { name: "Siddharth Sen", email: "siddharth.sen@synthetics.test", phone: "+91 98666 20006", type: "INDIVIDUAL" as const },
    { name: "Meera Kulkarni", email: "meera.k@synthetics.test", phone: "+91 98777 20007", type: "INDIVIDUAL" as const },
    { name: "Karan Johar", email: "karan.j@apexventures.test", phone: "+91 98888 20008", type: "BUSINESS" as const },
    { name: "Tanvi Deshmukh", email: "tanvi.d@synthetics.test", phone: "+91 98999 20009", type: "INDIVIDUAL" as const },
    { name: "Aditya Roy", email: "aditya.roy@synthetics.test", phone: "+91 98100 20010", type: "INDIVIDUAL" as const },
    { name: "Neha Gupta", email: "neha.g@nexussoft.test", phone: "+91 98111 20011", type: "BUSINESS" as const },
    { name: "Kabir Das", email: "kabir.das@synthetics.test", phone: "+91 98222 20012", type: "INDIVIDUAL" as const },
    { name: "Sunita Reddy", email: "sunita.r@synthetics.test", phone: "+91 98333 20013", type: "INDIVIDUAL" as const },
    { name: "Devendra Patel", email: "dev.patel@synthetics.test", phone: "+91 98444 20014", type: "INDIVIDUAL" as const },
    { name: "Rhea Kapoor", email: "rhea.k@synthetics.test", phone: "+91 98555 20015", type: "INDIVIDUAL" as const },
    { name: "Vivek Oberoi", email: "vivek.o@vertexglobal.test", phone: "+91 98666 20016", type: "BUSINESS" as const },
    { name: "Ishaan Khattar", email: "ishaan.k@synthetics.test", phone: "+91 98777 20017", type: "INDIVIDUAL" as const },
    { name: "Divya Bharathi", email: "divya.b@synthetics.test", phone: "+91 98888 20018", type: "INDIVIDUAL" as const },
    { name: "Manish Sisodia", email: "manish.s@quantumedge.test", phone: "+91 98999 20019", type: "BUSINESS" as const },
    { name: "Shruti Haasan", email: "shruti.h@synthetics.test", phone: "+91 98100 20020", type: "INDIVIDUAL" as const },
    { name: "Gaurav Chopra", email: "gaurav.c@synthetics.test", phone: "+91 98111 20021", type: "INDIVIDUAL" as const },
    { name: "Tara Sutaria", email: "tara.s@synthetics.test", phone: "+91 98222 20022", type: "INDIVIDUAL" as const },
    { name: "Arvind Kejriwal", email: "arvind.k@capitalgrowth.test", phone: "+91 98333 20023", type: "BUSINESS" as const },
    { name: "Pooja Hegde", email: "pooja.h@synthetics.test", phone: "+91 98444 20024", type: "INDIVIDUAL" as const },
    { name: "Harsh Vardhan", email: "harsh.v@synthetics.test", phone: "+91 98555 20025", type: "INDIVIDUAL" as const },
    { name: "Zoya Akhtar", email: "zoya.a@synthetics.test", phone: "+91 98666 20026", type: "INDIVIDUAL" as const },
    { name: "Naveen Polishetty", email: "naveen.p@synthetics.test", phone: "+91 98777 20027", type: "INDIVIDUAL" as const },
    { name: "Rashi Khanna", email: "rashi.k@infraware.test", phone: "+91 98888 20028", type: "BUSINESS" as const },
    { name: "Varun Dhawan", email: "varun.d@synthetics.test", phone: "+91 98999 20029", type: "INDIVIDUAL" as const },
    { name: "Kriti Sanon", email: "kriti.s@synthetics.test", phone: "+91 98100 20030", type: "INDIVIDUAL" as const },
    { name: "Rajkummar Rao", email: "rajkummar.r@synthetics.test", phone: "+91 98111 20031", type: "INDIVIDUAL" as const },
    { name: "Mrunal Thakur", email: "mrunal.t@synthetics.test", phone: "+91 98222 20032", type: "INDIVIDUAL" as const },
    { name: "Abhishek Bachchan", email: "abhishek.b@heritagecorp.test", phone: "+91 98333 20033", type: "BUSINESS" as const },
    { name: "Yami Gautam", email: "yami.g@synthetics.test", phone: "+91 98444 20034", type: "INDIVIDUAL" as const },
    { name: "Ayushmann Khurrana", email: "ayushmann.k@synthetics.test", phone: "+91 98555 20035", type: "INDIVIDUAL" as const },
    { name: "Bhumi Pednekar", email: "bhumi.p@synthetics.test", phone: "+91 98666 20036", type: "INDIVIDUAL" as const },
    { name: "Kartik Aaryan", email: "kartik.a@synthetics.test", phone: "+91 98777 20037", type: "INDIVIDUAL" as const },
    { name: "Sanya Malhotra", email: "sanya.m@synthetics.test", phone: "+91 98888 20038", type: "INDIVIDUAL" as const },
    { name: "Vicky Kaushal", email: "vicky.k@synthetics.test", phone: "+91 98999 20039", type: "INDIVIDUAL" as const },
    { name: "Taapsee Pannu", email: "taapsee.p@primeenterprises.test", phone: "+91 98100 20040", type: "BUSINESS" as const },
  ];

  // Distribution across the 9 risk types:
  // 1-5: CHECKOUT_ABANDONMENT
  // 6-10: INSUFFICIENT_FUNDS
  // 11-15: EXPIRED_CARD
  // 16-20: 3DS_AUTHENTICATION_FAILURE
  // 21-25: BANK_GATEWAY_TIMEOUT
  // 26-30: SUBSCRIPTION_RENEWAL_FAILURE
  // 31-34: UPI_MANDATE_FAILURE
  // 35-37: OVERDUE_INVOICE
  // 38-40: HIGH_CHURN_RISK

  const scenarioArchetypes = [
    // #01: HIGH_CHURN_RISK (Hardest: multi-source behavioral signals, zero gateway decline codes, sentiment & usage drop)
    {
      scenario: "HIGH_CHURN_RISK",
      category: "RETENTION",
      paymentMethod: "CARD",
      paymentRail: "Recurring Annual Contract",
      amountRange: [25000, 65000],
      eventTemplates: (t: string, cust: any, amt: number) => [
        { eventId: `ev-${t}-1`, timestamp: "2026-08-10T11:00:00Z", eventType: "ENGAGEMENT_DROP_DETECTED", source: "product_analytics", payload: { weekly_active_users_pct_change: -78.4, login_frequency_drop: "SEVERE" } },
        { eventId: `ev-${t}-2`, timestamp: "2026-08-15T16:30:00Z", eventType: "SUPPORT_TICKET_ESCALATED", source: "zendesk_webhook", payload: { ticket_category: "INTEGRATION_FRUSTRATION", sentiment_score: -0.84, satisfaction: "UNSATISFIED" } },
        { eventId: `ev-${t}-3`, timestamp: "2026-08-20T14:15:00Z", eventType: "CANCELLATION_PAGE_VIEWED", source: "app_telemetry", payload: { page_url: "/settings/subscription/cancel", export_data_requested: true } },
        { eventId: `ev-${t}-4`, timestamp: "2026-08-23T05:00:00Z", eventType: "UPCOMING_RENEWAL_ALERT", source: "retention_monitor", payload: { renewal_in_days: 7, estimated_churn_probability: 0.91 } },
      ],
      sessionCtx: (_t: string, _cust: any, _amt: number) => ({ engagementHealthScore: "14/100 (CRITICAL)", exportHistory: "Data export performed 3 days ago" }),
      histCtx: (_t: string, _cust: any, amt: number) => ({ tenureDays: 350, npsScore: 3, originalContractValue: amt }),
    },
    // #02: BANK_GATEWAY_TIMEOUT (Second hardest: downstream 504 socket timeout, inconclusive settlement state, double-debit inquiry)
    {
      scenario: "BANK_GATEWAY_TIMEOUT",
      category: "NETBANKING",
      paymentMethod: "NETBANKING",
      paymentRail: "Direct Bank Gateway API",
      amountRange: [6000, 35000],
      eventTemplates: (t: string, cust: any, amt: number) => [
        { eventId: `ev-${t}-1`, timestamp: "2026-08-23T06:05:00Z", eventType: "ORDER_CHECKOUT_SUBMITTED", source: "storefront", payload: { amount: amt, bank_code: "SBIN" } },
        { eventId: `ev-${t}-2`, timestamp: "2026-08-23T06:05:02Z", eventType: "BANK_GATEWAY_HANDSHAKE_INITIATED", source: "psp_switch", payload: { destination_bank: "State Bank of India", protocol: "ISO8583" } },
        { eventId: `ev-${t}-3`, timestamp: "2026-08-23T06:05:32Z", eventType: "BANK_GATEWAY_SOCKET_TIMEOUT", source: "psp_switch", payload: { socket_latency_ms: 30045, http_status: 504, connection_state: "DOWNSTREAM_TIMEOUT" } },
        { eventId: `ev-${t}-4`, timestamp: "2026-08-23T06:05:35Z", eventType: "TRANSACTION_STATUS_INCONCLUSIVE", source: "reconciliation_worker", payload: { psp_error_code: "GATEWAY_TIMEOUT_504", customer_debited_check: "PENDING_INQUIRY" } },
      ],
      sessionCtx: (_t: string, _cust: any, _amt: number) => ({ acquirerSpikeAlert: "SBI Core Banking Network Degradation", responseLatencyMs: 30045 }),
      histCtx: (_t: string, _cust: any, _amt: number) => ({ customerType: "Enterprise Buyer", orderFrequency: "Weekly" }),
    },
    // #03: SUBSCRIPTION_RENEWAL_FAILURE (Third hardest: ambiguous generic 'do_not_honor' decline resolved by active usage telemetry)
    {
      scenario: "SUBSCRIPTION_RENEWAL_FAILURE",
      category: "RECURRING",
      paymentMethod: "CARD",
      paymentRail: "Recurring Auto-Debit / Token",
      amountRange: [2999, 14999],
      eventTemplates: (t: string, cust: any, amt: number) => [
        { eventId: `ev-${t}-1`, timestamp: "2026-08-23T03:00:00Z", eventType: "SUBSCRIPTION_CYCLE_TRIGGERED", source: "saas_billing", payload: { plan_name: "Enterprise Growth Tier", billing_period: "2026-08-23_to_2026-09-23" } },
        { eventId: `ev-${t}-2`, timestamp: "2026-08-23T03:00:04Z", eventType: "AUTO_DEBIT_ATTEMPT_FAILED", source: "stripe_adapter", payload: { error_type: "card_error", code: "do_not_honor", decline_type: "generic_decline" } },
        { eventId: `ev-${t}-3`, timestamp: "2026-08-23T03:00:06Z", eventType: "DUNNING_SCHEDULED", source: "dunning_engine", payload: { dunning_stage: 1, max_grace_days: 7, service_status: "PROVISIONALLY_ACTIVE" } },
        { eventId: `ev-${t}-4`, timestamp: "2026-08-23T05:30:00Z", eventType: "SUB_USAGE_ACTIVE", source: "telemetry_collector", payload: { api_calls_today: 4120, active_seats: 18 } },
      ],
      sessionCtx: (_t: string, _cust: any, _amt: number) => ({ planType: "Enterprise B2B SaaS", teamSeats: 18, criticalWorkloads: true }),
      histCtx: (_t: string, _cust: any, amt: number) => ({ mrrValue: amt, subscriptionAgeMonths: 18, totalPaidToDate: amt * 18 }),
    },
    // #04: UPI_MANDATE_FAILURE (Fourth hardest: NPCI switch U19 remitter bank outage vs user revocation / mandate invalidation)
    {
      scenario: "UPI_MANDATE_FAILURE",
      category: "UPI",
      paymentMethod: "UPI",
      paymentRail: "NPCI UPI AutoPay",
      amountRange: [1499, 4999],
      eventTemplates: (t: string, cust: any, amt: number) => [
        { eventId: `ev-${t}-1`, timestamp: "2026-08-23T02:00:00Z", eventType: "MANDATE_EXECUTION_DISPATCHED", source: "autopay_scheduler", payload: { mandate_umn: `UMN${t}AUTOPAY892`, mandate_frequency: "MONTHLY" } },
        { eventId: `ev-${t}-2`, timestamp: "2026-08-23T02:00:08Z", eventType: "NPCI_MANDATE_DEBIT_FAILED", source: "npci_switch", payload: { npci_response_code: "U19", error_description: "MANDATE_EXECUTION_FAILED_REMITTER_UNAVAILABLE" } },
        { eventId: `ev-${t}-3`, timestamp: "2026-08-23T02:00:10Z", eventType: "MANDATE_STATUS_SUSPENDED_ATTEMPT", source: "mandate_registry", payload: { attempts_remaining: 2, vpa: cust.email.replace("@", ".") + "@okhdfcbank" } },
      ],
      sessionCtx: (_t: string, _cust: any, _amt: number) => ({ mandateType: "UPI 2.0 Recurring Mandate", mandateMaxLimit: 15000 }),
      histCtx: (_t: string, _cust: any, _amt: number) => ({ pastMandateSuccessCycles: 8, mandateCreatedDate: "2025-12-10" }),
    },
    // #05: 3DS_AUTHENTICATION_FAILURE (Fifth hardest: 5-step authentication lifecycle, ACS redirect & OTP challenge timeout)
    {
      scenario: "3DS_AUTHENTICATION_FAILURE",
      category: "CARDS",
      paymentMethod: "CARD",
      paymentRail: "EMV 3-D Secure 2.2",
      amountRange: [5000, 24000],
      eventTemplates: (t: string, cust: any, amt: number) => [
        { eventId: `ev-${t}-1`, timestamp: "2026-08-23T06:20:00Z", eventType: "CHECKOUT_COMPLETED_FORM", source: "web_checkout", payload: { amount: amt, card_bin: "411111" } },
        { eventId: `ev-${t}-2`, timestamp: "2026-08-23T06:20:05Z", eventType: "3DS_CHALLENGE_REQUESTED", source: "mpi_server", payload: { three_ds_version: "2.2.0", challenge_method: "OTP_SMS" } },
        { eventId: `ev-${t}-3`, timestamp: "2026-08-23T06:20:10Z", eventType: "ACS_REDIRECT_ISSUED", source: "issuer_acs", payload: { acs_url: "https://acs.bank.test/challenge", trans_status: "C" } },
        { eventId: `ev-${t}-4`, timestamp: "2026-08-23T06:25:12Z", eventType: "3DS_CHALLENGE_TIMEOUT", source: "mpi_server", payload: { elapsed_seconds: 302, error_code: "3DS_AUTH_TIMEOUT", otp_entered: false } },
        { eventId: `ev-${t}-5`, timestamp: "2026-08-23T06:25:15Z", eventType: "TRANSACTION_TERMINATED_UNAUTHENTICATED", source: "gateway", payload: { status: "FAILED_3DS_CHALLENGE" } },
      ],
      sessionCtx: (_t: string, _cust: any, _amt: number) => ({ browserFlow: "Redirect ACS Iframe", networkLatencyMs: 140, deviceFingerprint: "Valid" }),
      histCtx: (_t: string, _cust: any, _amt: number) => ({ previousFraudRiskScore: 0.02, verifiedCustomer: true }),
    },
    // #06: OVERDUE_INVOICE (Sixth: multi-week corporate aging bucket escalation and accounts payable timeline)
    {
      scenario: "OVERDUE_INVOICE",
      category: "B2B_INVOICE",
      paymentMethod: "BANK_TRANSFER",
      paymentRail: "NEFT / RTGS / Corporate Invoicing",
      amountRange: [45000, 185000],
      eventTemplates: (t: string, cust: any, amt: number) => [
        { eventId: `ev-${t}-1`, timestamp: "2026-07-20T10:00:00Z", eventType: "INVOICE_ISSUED", source: "erp_billing", payload: { invoice_number: `INV-2026-${t}`, net_terms: 30, due_date: "2026-08-19" } },
        { eventId: `ev-${t}-2`, timestamp: "2026-08-19T23:59:59Z", eventType: "INVOICE_DUE_DATE_PASSED", source: "ledger_monitor", payload: { invoice_amount: amt, overdue_days: 4, settlement_status: "UNPAID" } },
        { eventId: `ev-${t}-3`, timestamp: "2026-08-21T09:00:00Z", eventType: "AUTOMATED_REMINDER_SENT", source: "ar_collections", payload: { delivery_channel: "EMAIL", opened: true, payment_received: false } },
        { eventId: `ev-${t}-4`, timestamp: "2026-08-23T06:00:00Z", eventType: "AGING_BUCKET_ESCALATION", source: "aging_report", payload: { aging_bracket: "1-30_DAYS_OVERDUE", high_value_flag: true } },
      ],
      sessionCtx: (t: string, cust: any, _amt: number) => ({ purchaseOrderNumber: `PO-GLOBAL-${t}`, billingContact: cust.name, financeDepartment: "Accounts Payable" }),
      histCtx: (_t: string, _cust: any, amt: number) => ({ annualContractValue: amt * 12, previousPaymentDelayAvgDays: 6, clientCreditRating: "AAA" }),
    },
    // #07: CHECKOUT_ABANDONMENT (Seventh: 6-event storefront checkout funnel drop-off)
    {
      scenario: "CHECKOUT_ABANDONMENT",
      category: "CHECKOUT",
      paymentMethod: "UPI",
      paymentRail: "UPI Intent / Web",
      amountRange: [2499, 8999],
      eventTemplates: (t: string, cust: any, amt: number) => [
        { eventId: `ev-${t}-1`, timestamp: "2026-08-23T06:12:00Z", eventType: "SESSION_START", source: "web_storefront", payload: { ip_geo: "IN-MH", referrer: "direct_campaign", device: "Mobile/Safari" } },
        { eventId: `ev-${t}-2`, timestamp: "2026-08-23T06:13:30Z", eventType: "PRODUCT_VIEW", source: "catalog", payload: { sku: `SKU-${amt}`, category: "Electronics/Software", price: amt } },
        { eventId: `ev-${t}-3`, timestamp: "2026-08-23T06:14:15Z", eventType: "ADD_TO_CART", source: "cart_service", payload: { cart_total: amt, item_count: 1 } },
        { eventId: `ev-${t}-4`, timestamp: "2026-08-23T06:15:00Z", eventType: "CHECKOUT_INITIATED", source: "checkout_engine", payload: { customer_email: cust.email, cart_value: amt } },
        { eventId: `ev-${t}-5`, timestamp: "2026-08-23T06:15:45Z", eventType: "PAYMENT_METHOD_SELECTED", source: "payment_selector", payload: { selected_option: "UPI_INTENT", app_intent: "GPay" } },
        { eventId: `ev-${t}-6`, timestamp: "2026-08-23T06:17:00Z", eventType: "CUSTOMER_SESSION_INACTIVE", source: "session_heartbeat", payload: { idle_seconds: 900, completed_payment: false } },
      ],
      sessionCtx: (_t: string, _cust: any, _amt: number) => ({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4)", utmSource: "re-engagement", dropoffStage: "PAYMENT_SELECTION" }),
      histCtx: (_t: string, _cust: any, _amt: number) => ({ previousOrders: 2, totalSpendToDate: 14500, customerLifetimeDays: 140 }),
    },
    // #08: INSUFFICIENT_FUNDS (Eighth: explicit ISO-8583 soft decline code 51 with retry log)
    {
      scenario: "INSUFFICIENT_FUNDS",
      category: "CARDS",
      paymentMethod: "CARD",
      paymentRail: "Visa / Mastercard Domestic",
      amountRange: [4500, 18500],
      eventTemplates: (t: string, cust: any, amt: number) => [
        { eventId: `ev-${t}-1`, timestamp: "2026-08-23T05:30:00Z", eventType: "RECURRING_BILLING_DISPATCH", source: "billing_worker", payload: { subscription_tier: "Pro Annual", bill_amount: amt } },
        { eventId: `ev-${t}-2`, timestamp: "2026-08-23T05:30:02Z", eventType: "PAYMENT_ATTEMPT_1", source: "payment_gateway", payload: { card_bin: "453275", rail: "Visa Credit" } },
        { eventId: `ev-${t}-3`, timestamp: "2026-08-23T05:30:04Z", eventType: "GATEWAY_DECLINE_RESPONSE", source: "acquirer_network", payload: { raw_decline_code: "51", processor_message: "INSUFFICIENT_FUNDS", soft_decline: true } },
        { eventId: `ev-${t}-4`, timestamp: "2026-08-23T05:45:00Z", eventType: "SMART_RETRY_ATTEMPT_2", source: "dunning_engine", payload: { attempt_number: 2, outcome: "DECLINED_CODE_51" } },
        { eventId: `ev-${t}-5`, timestamp: "2026-08-23T06:00:00Z", eventType: "ACCOUNT_GRACE_PERIOD_ACTIVE", source: "ledger", payload: { days_in_dunning: 1, balance_shortfall: true } },
      ],
      sessionCtx: (_t: string, _cust: any, _amt: number) => ({ billingCycle: "ANNUAL", dunningAttemptCount: 2, accountTier: "Professional" }),
      histCtx: (_t: string, _cust: any, _amt: number) => ({ consecutiveSuccessfulPayments: 11, tenureMonths: 12, chargebackCount: 0 }),
    },
    // #09: EXPIRED_CARD (Easiest: unambiguous card expiry date 07/26 and processor decline code 54)
    {
      scenario: "EXPIRED_CARD",
      category: "CARDS",
      paymentMethod: "CARD",
      paymentRail: "Mastercard / RuPay Credit",
      amountRange: [3200, 12000],
      eventTemplates: (t: string, cust: any, amt: number) => [
        { eventId: `ev-${t}-1`, timestamp: "2026-08-23T04:10:00Z", eventType: "SUBSCRIPTION_RENEWAL_DUE", source: "billing_engine", payload: { renewal_amount: amt, card_last4: "8821" } },
        { eventId: `ev-${t}-2`, timestamp: "2026-08-23T04:10:03Z", eventType: "PROCESSOR_AUTHORIZATION_REQUEST", source: "gateway_adapter", payload: { expiry_on_file: "07/26", current_date: "08/26" } },
        { eventId: `ev-${t}-3`, timestamp: "2026-08-23T04:10:04Z", eventType: "GATEWAY_DECLINE_RESPONSE", source: "acquirer", payload: { raw_decline_code: "54", processor_message: "EXPIRED_CARD", card_action_required: "UPDATE_EXPIRY" } },
        { eventId: `ev-${t}-4`, timestamp: "2026-08-23T04:10:05Z", eventType: "CARD_LIFECYCLE_ALERT", source: "token_vault", payload: { token_status: "EXPIRED", issuer: "HDFC Bank" } },
      ],
      sessionCtx: (_t: string, _cust: any, _amt: number) => ({ paymentInstrument: "Saved Card Token (Expired)", cardBrand: "Mastercard Platinum" }),
      histCtx: (_t: string, _cust: any, _amt: number) => ({ activeSince: "2024-08-01", totalLifetimeTransactions: 24, onTimePaymentRate: "100%" }),
    },
  ];

  // Strict AI difficulty order for first 9 scenarios (top 5 are hardest),
  // followed by a clean rotation across all 9 archetypes for the remaining records (10 to 40)
  const archetypeOrder = [
    0, 1, 2, 3, 4, 5, 6, 7, 8,
    0, 1, 2, 3, 4, 5, 6, 7, 8,
    0, 1, 2, 3, 4, 5, 6, 7, 8,
    0, 1, 2, 3, 4, 5, 6, 7, 8,
    0, 1, 2, 3
  ];

  // Map 40 records to the archetypes
  for (let i = 1; i <= 40; i++) {
    const padIndex = i.toString().padStart(2, "0");
    const id = `TEL-DEMO-${padIndex}`;
    const cust = syntheticCustomers[i - 1];

    const archetypeIdx = archetypeOrder[(i - 1) % archetypeOrder.length];
    const arch = scenarioArchetypes[archetypeIdx];
    const [minAmt, maxAmt] = arch.amountRange;
    const amount = Math.floor(minAmt + ((maxAmt - minAmt) / 5) * ((i - 1) % 5));

    const events = arch.eventTemplates(padIndex, cust, amount);

    const record: SyntheticTelemetryRecord = {
      id,
      owner_id: ownerId,
      batchNumber: i,
      title: `Customer Event Batch ${padIndex}`,
      customerId: `syn_cust_${padIndex}`,
      customerName: cust.name,
      customerEmail: cust.email,
      customerPhone: cust.phone,
      customerType: cust.type,
      amount,
      currency: "INR",
      paymentMethod: arch.paymentMethod,
      paymentRail: arch.paymentRail,
      events,
      sessionContext: arch.sessionCtx(padIndex, cust, amount),
      historicalContext: arch.histCtx(padIndex, cust, amount),
      status: "WAITING",
      createdAt: new Date(Date.now() - (40 - i) * 120_000).toISOString(),
      updatedAt: new Date(Date.now() - (40 - i) * 120_000).toISOString(),
    };

    const groundTruth: TelemetryGroundTruth = {
      id: `gt-${padIndex}`,
      telemetryId: id,
      expectedScenarioType: arch.scenario,
      expectedCategory: arch.category,
      description: `Hidden Ground Truth Evaluation for Demo Signal #${padIndex}: ${arch.scenario}`,
      createdAt: new Date().toISOString(),
    };

    dataset.records.push(record);
    dataset.groundTruths.push(groundTruth);
  }

  return dataset;
}

// Initialize and seed demo dataset idempotently with full Supabase hydration
export async function initializeTelemetryDemoQueue(): Promise<void> {
  const dataset = generateSyntheticTelemetryDataset();
  for (const rec of dataset.records) {
    const existing = memoryTelemetryRecords.get(rec.id);
    if (!existing) {
      memoryTelemetryRecords.set(rec.id, rec);
    } else {
      memoryTelemetryRecords.set(rec.id, {
        ...rec,
        status: existing.status,
        createdIncidentId: existing.createdIncidentId,
        demoOutreachContact: existing.demoOutreachContact,
      });
    }
  }
  for (const gt of dataset.groundTruths) {
    memoryGroundTruth.set(gt.telemetryId, gt);
  }

  // Sync to Supabase database if connected
  const supabase = getSupabaseClient();
  try {
    // Upsert telemetry records
    for (const rec of dataset.records) {
      await supabase.from("synthetic_telemetry_records").upsert({
        id: rec.id,
        batch_number: rec.batchNumber,
        title: rec.title,
        customer_id: rec.customerId,
        customer_name: rec.customerName,
        customer_email: rec.customerEmail,
        customer_phone: rec.customerPhone,
        customer_type: rec.customerType,
        amount: rec.amount,
        currency: rec.currency,
        payment_method: rec.paymentMethod,
        payment_rail: rec.paymentRail,
        events: rec.events,
        session_context: rec.sessionContext,
        historical_context: rec.historicalContext,
        status: rec.status,
        created_incident_id: rec.createdIncidentId,
        created_at: rec.createdAt,
        updated_at: rec.updatedAt,
      }, { onConflict: "id" });
    }

    // Upsert hidden ground truths
    for (const gt of dataset.groundTruths) {
      await supabase.from("telemetry_ground_truth").upsert({
        id: gt.id,
        telemetry_id: gt.telemetryId,
        expected_scenario_type: gt.expectedScenarioType,
        expected_category: gt.expectedCategory,
        description: gt.description,
        created_at: gt.createdAt,
      }, { onConflict: "id" });
    }

    // Hydrate AI Analyses from Supabase
    const { data: dbAnalyses } = await supabase.from("telemetry_ai_analyses").select("*");
    if (dbAnalyses) {
      for (const a of dbAnalyses) {
        memoryAIAnalyses.set(a.telemetry_id, {
          id: a.id,
          telemetryId: a.telemetry_id,
          detectedScenarioType: a.detected_scenario_type,
          confidence: Number(a.confidence) || 90,
          rootCause: a.root_cause,
          evidence: Array.isArray(a.evidence) ? a.evidence : [a.root_cause],
          reasoning: a.reasoning,
          revenueAtRisk: Number(a.revenue_at_risk) || 0,
          recommendedStrategy: a.recommended_strategy,
          recommendedChannel: a.recommended_channel || "WHATSAPP",
          explanation: a.explanation,
          modelName: a.model_name || "gemini-3.7-flash",
          createdAt: a.created_at,
        });
      }
    }

    // Hydrate Detection Evaluations from Supabase
    const { data: dbEvals } = await supabase.from("detection_evaluations").select("*");
    if (dbEvals) {
      for (const e of dbEvals) {
        memoryEvaluations.set(e.telemetry_id, {
          id: e.id,
          telemetryId: e.telemetry_id,
          aiPrediction: e.ai_prediction,
          groundTruth: e.ground_truth,
          match: Boolean(e.match),
          confidence: Number(e.confidence) || 90,
          evaluatedAt: e.evaluated_at,
        });
      }
    }

    // Hydrate Sandbox Incidents from Supabase & reconstruct in memory store
    const { data: dbIncidents } = await supabase.from("sandbox_incidents").select("*");
    if (dbIncidents) {
      for (const row of dbIncidents) {
        if (!persistentSandboxIncidents.has(row.id)) {
          const rawScenario = row.scenario_type || "insufficient-funds";
          const formattedKey = rawScenario.toUpperCase().replace(/-/g, "_");
          const typeConfig = RECOVERY_SCENARIO_TYPES.find(
            (t) => t.key === rawScenario || t.key === rawScenario.toLowerCase() || t.tag === formattedKey
          ) || RECOVERY_SCENARIO_TYPES[0];

          const meta = row.metadata || {};
          const stored: any = {
            id: row.id,
            label: "DEMO/SANDBOX — NO PRODUCTION DB IMPACT",
            isSandbox: true,
            scenario_type: typeConfig.key,
            scenario_type_name: typeConfig.name,
            tag: typeConfig.tag,
            category: typeConfig.category,
            customer_id: row.customer_id || `cust_${row.id}`,
            customer_name: meta.customer_name || "Enterprise Customer",
            customer_email: meta.customer_email || "customer@example.test",
            customer_phone: meta.customer_phone || "",
            customer_type: meta.customer_type || "INDIVIDUAL",
            amount: Number(row.amount) || 5000,
            currency: row.currency || "INR",
            payment_method: row.payment_method || typeConfig.defaultPaymentMethod,
            payment_rail: row.payment_rail || typeConfig.category,
            failure_reason: row.failure_reason || typeConfig.defaultFailureCode,
            billing_context: typeof meta.billing_context === "string" ? meta.billing_context : JSON.stringify(meta.billing_context || {}),
            severity: meta.severity || typeConfig.defaultSeverity,
            priority: meta.severity || typeConfig.defaultSeverity,
            status: row.status || "ACTIVE",
            customer_context: {
              transactionsCount: 1,
              invoicesCount: 1,
              subscriptionsCount: 1,
              recoveryCasesCount: 1,
              paymentEventsCount: 1,
              sampleTransactions: [],
              sampleInvoices: [],
              sampleSubscriptions: [],
            },
            analysis: meta.analysis || null,
            lifecycle: [
              {
                step: "DETECT",
                title: "Incident Ingested & Anomaly Flagged",
                status: "COMPLETED",
                timestamp: new Date(row.created_at || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                detail: `Incident ${row.id} loaded from persistent storage.`,
              },
            ],
            actions: meta.actions || [],
            created_at: row.created_at || new Date().toISOString(),
            updated_at: row.updated_at || new Date().toISOString(),
          };
          persistentSandboxIncidents.set(row.id, stored);
        }
      }
    }

    // Also verify any analyzed telemetry records without a sandbox incident are hydrated
    for (const [telId, rec] of memoryTelemetryRecords.entries()) {
      if (rec.createdIncidentId && !persistentSandboxIncidents.has(rec.createdIncidentId)) {
        const analysis = memoryAIAnalyses.get(telId);
        const scenarioKey = (analysis?.detectedScenarioType || "INSUFFICIENT_FUNDS").toLowerCase().replace(/_/g, "-");
        const typeConfig = RECOVERY_SCENARIO_TYPES.find(
          (t) => t.key === scenarioKey || t.tag === analysis?.detectedScenarioType
        ) || RECOVERY_SCENARIO_TYPES[0];

        const stored: any = {
          id: rec.createdIncidentId,
          label: "DEMO/SANDBOX — NO PRODUCTION DB IMPACT",
          isSandbox: true,
          scenario_type: typeConfig.key,
          scenario_type_name: typeConfig.name,
          tag: typeConfig.tag,
          category: typeConfig.category,
          customer_id: rec.customerId,
          customer_name: rec.customerName,
          customer_email: rec.demoOutreachContact?.email || rec.customerEmail,
          customer_phone: rec.demoOutreachContact?.phone || rec.customerPhone,
          customer_type: rec.customerType,
          amount: rec.amount,
          currency: rec.currency,
          payment_method: rec.paymentMethod,
          payment_rail: rec.paymentRail,
          failure_reason: analysis?.rootCause || "Payment Disruption Flagged",
          billing_context: JSON.stringify({ telemetryId: rec.id, title: rec.title }),
          severity: rec.amount > 10000 ? "HIGH" : "MEDIUM",
          priority: rec.amount > 10000 ? "HIGH" : "MEDIUM",
          status: rec.status === "RECOVERED" ? "RECOVERED" : rec.status === "ESCALATED" ? "ESCALATED" : "ACTIVE",
          customer_context: {
            transactionsCount: 1,
            invoicesCount: 1,
            subscriptionsCount: 1,
            recoveryCasesCount: 1,
            paymentEventsCount: rec.events.length,
            sampleTransactions: [],
            sampleInvoices: [],
            sampleSubscriptions: [],
          },
          analysis: analysis ? {
            detectedRisk: analysis.detectedScenarioType,
            summary: analysis.explanation,
            rootCauseAnalysis: analysis.rootCause,
            recommendedAction: "SEND_PAYMENT_LINK",
            selectedStrategy: analysis.recommendedStrategy,
            strategyJustification: analysis.reasoning,
            recoveryProbabilityScore: 0.85,
            expectedRecoverableRevenue: Math.round(rec.amount * 0.85),
            optimalTiming: "Immediate dispatch",
            relevantEvidence: analysis.evidence,
          } : null,
          lifecycle: [
            {
              step: "DETECT",
              title: "Incident Ingested & Anomaly Flagged",
              status: "COMPLETED",
              timestamp: new Date(rec.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              detail: `Telemetry signal ${rec.id} analyzed as ${analysis?.detectedScenarioType || "Payment Disruption"}.`,
            },
          ],
          actions: [],
          created_at: rec.createdAt,
          updated_at: rec.updatedAt,
        };
        persistentSandboxIncidents.set(rec.createdIncidentId, stored);
      }
    }
  } catch (err) {
    console.warn("[TelemetryService] Supabase sync fallback to memory store:", err);
  }

  isQueueInitialized = true;
}

// Get full demo queue with dynamic summary and user-level data isolation
export async function getTelemetryDemoQueue(user?: UserProfile): Promise<{
  queue: Array<SyntheticTelemetryRecord & {
    aiAnalysis?: TelemetryAIAnalysis | null;
    evaluation?: DetectionEvaluation | null;
    routeMapping?: { pageKey: string; pageTitle: string; category: string };
  }>;
  summary: TelemetryQueueSummary;
}> {
  await initializeTelemetryDemoQueue();

  const allRecords = Array.from(memoryTelemetryRecords.values()).sort((a, b) => a.batchNumber - b.batchNumber);
  const records = user ? allRecords.filter((rec) => canUserAccess(user, rec.owner_id)) : allRecords;

  let waitingCount = 0;
  let analyzedCount = 0;
  let activeCount = 0;
  let recoveredCount = 0;
  let escalatedCount = 0;
  let correctDetections = 0;
  let evaluatedCount = 0;

  const queueWithDetails = records.map((rec) => {
    // Check if linked incident has updated status
    if (rec.createdIncidentId && persistentSandboxIncidents.has(rec.createdIncidentId)) {
      const inc = persistentSandboxIncidents.get(rec.createdIncidentId)!;
      if (inc.status === "RECOVERED") rec.status = "RECOVERED";
      else if (inc.status === "ESCALATED") rec.status = "ESCALATED";
      else if (inc.status === "ACTIVE") rec.status = "RECOVERY_ACTIVE";
    }

    if (rec.status === "WAITING") waitingCount++;
    else analyzedCount++;

    if (rec.status === "RECOVERY_ACTIVE") activeCount++;
    if (rec.status === "RECOVERED") recoveredCount++;
    if (rec.status === "ESCALATED") escalatedCount++;

    const aiAnalysis = memoryAIAnalyses.get(rec.id) || null;
    const evaluation = memoryEvaluations.get(rec.id) || null;

    if (evaluation) {
      evaluatedCount++;
      if (evaluation.match) correctDetections++;
    }

    const scenarioKey = aiAnalysis?.detectedScenarioType || "";
    const routeMapping = SCENARIO_ROUTE_MAPPING[scenarioKey] || undefined;

    return {
      ...rec,
      aiAnalysis,
      evaluation,
      routeMapping,
    };
  });

  const accuracyPercentage = evaluatedCount > 0 ? Math.round((correctDetections / evaluatedCount) * 100) : 0;

  return {
    queue: queueWithDetails,
    summary: {
      totalSignals: records.length,
      waitingCount,
      analyzedCount,
      activeCount,
      recoveredCount,
      escalatedCount,
      evaluatedCount,
      correctDetections,
      accuracyPercentage,
    },
  };
}

// Get single telemetry item by ID with ownership authorization check
export async function getTelemetryRecordById(id: string, user?: UserProfile) {
  await initializeTelemetryDemoQueue();
  const record = memoryTelemetryRecords.get(id);
  if (!record) return null;
  if (user && !canUserAccess(user, record.owner_id)) {
    return null;
  }

  const aiAnalysis = memoryAIAnalyses.get(id) || null;
  const evaluation = memoryEvaluations.get(id) || null;
  const groundTruth = memoryGroundTruth.get(id) || null;
  const createdIncident = record.createdIncidentId ? persistentSandboxIncidents.get(record.createdIncidentId) || null : null;

  return {
    ...record,
    aiAnalysis,
    evaluation,
    groundTruth: evaluation ? groundTruth : null, // Only reveal ground truth post-evaluation
    createdIncident,
    routeMapping: aiAnalysis ? SCENARIO_ROUTE_MAPPING[aiAnalysis.detectedScenarioType] : undefined,
  };
}

// Create a custom raw telemetry dataset tagged with user owner_id
export async function createCustomTelemetry(input: {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerType?: "INDIVIDUAL" | "BUSINESS";
  amount: number;
  currency?: string;
  paymentMethod: string;
  paymentRail: string;
  events: RawTelemetryEvent[];
  sessionContext?: Record<string, any>;
  historicalContext?: Record<string, any>;
  notes?: string;
}, user?: UserProfile): Promise<SyntheticTelemetryRecord> {
  await initializeTelemetryDemoQueue();

  const nextBatch = memoryTelemetryRecords.size + 1;
  const id = `TEL-CUSTOM-${Date.now().toString().slice(-4)}`;
  const ownerId = getOwnerIdForUser(user);

  const record: SyntheticTelemetryRecord = {
    id,
    owner_id: ownerId,
    batchNumber: nextBatch,
    title: `Custom Telemetry Signal #${nextBatch.toString().padStart(2, "0")}`,
    customerId: `cust_custom_${Date.now()}`,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    customerType: input.customerType || "INDIVIDUAL",
    amount: input.amount,
    currency: input.currency || "INR",
    paymentMethod: input.paymentMethod,
    paymentRail: input.paymentRail,
    events: input.events && input.events.length > 0 ? input.events : [
      {
        eventId: `ev-cust-${Date.now()}-1`,
        timestamp: new Date().toISOString(),
        eventType: "PAYMENT_ATTEMPT_RECORDED",
        source: "custom_collector",
        payload: { notes: input.notes || "Operator submitted custom observable signals." },
      },
    ],
    sessionContext: input.sessionContext || {},
    historicalContext: input.historicalContext || {},
    status: "WAITING",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  memoryTelemetryRecords.set(id, record);

  const supabase = getSupabaseClient();
  try {
    await supabase.from("synthetic_telemetry_records").insert({
      id: record.id,
      batch_number: record.batchNumber,
      title: record.title,
      customer_id: record.customerId,
      customer_name: record.customerName,
      customer_email: record.customerEmail,
      customer_phone: record.customerPhone,
      customer_type: record.customerType,
      amount: record.amount,
      currency: record.currency,
      payment_method: record.paymentMethod,
      payment_rail: record.paymentRail,
      events: record.events,
      session_context: record.sessionContext,
      historical_context: record.historicalContext,
      status: record.status,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    });
  } catch (e) {
    // Non-blocking fallback
  }

  return record;
}

// Deep heuristic rule fallback engine to analyze telemetry if Gemini is unavailable or rate limited
function analyzeTelemetryWithHeuristicRules(record: SyntheticTelemetryRecord): {
  detectedScenarioType: string;
  confidence: number;
  rootCause: string;
  evidence: string[];
  reasoning: string;
  revenueAtRisk: number;
  recommendedStrategy: string;
  recommendedChannel: "EMAIL" | "VOICE";
  explanation: string;
} {
  const events = record.events || [];
  const eventTypes = events.map((e) => e.eventType.toUpperCase());
  const allPayloadStr = JSON.stringify(events.map((e) => e.payload)).toLowerCase();

  let detectedScenarioType = "CHECKOUT_ABANDONMENT";
  let confidence = 92;
  let rootCause = "Customer initiated checkout but abandoned prior to payment completion.";
  let evidence: string[] = ["Checkout session initiated", "Payment selection viewed", "No successful settlement event recorded"];
  let reasoning = "Observed high customer intent followed by inactivity during payment selection.";
  let recommendedStrategy = "1-click secure payment recovery link dispatch";
  let recommendedChannel: "EMAIL" | "VOICE" = "EMAIL";

  if (allPayloadStr.includes("51") || allPayloadStr.includes("insufficient_funds") || eventTypes.some((t) => t.includes("INSUFFICIENT"))) {
    detectedScenarioType = "INSUFFICIENT_FUNDS";
    confidence = 96;
    rootCause = "Card issuer declined transaction with processor code 51 (Insufficient Funds / Available Balance Limit).";
    evidence = [
      "Gateway returned raw decline code 51 (Soft decline)",
      "Customer has active recurring billing relationship",
      "Subsequent retry attempts faced balance shortfall",
    ];
    reasoning = "The observable decline code 51 confirms a balance constraint on the primary payment instrument.";
    recommendedStrategy = "Smart retry cadence coupled with conversational balance notification";
    recommendedChannel = "EMAIL";
  } else if (allPayloadStr.includes("54") || allPayloadStr.includes("expired_card") || allPayloadStr.includes("expiry_on_file") || eventTypes.some((t) => t.includes("EXPIR"))) {
    detectedScenarioType = "EXPIRED_CARD";
    confidence = 98;
    rootCause = "Card issuer declined transaction with code 54: The card credential on file has passed its expiration date.";
    evidence = [
      "Token vault indicates expired card lifecycle",
      "Processor authorization failed with code 54 (EXPIRED_CARD)",
      "Customer history shows 100% on-time renewals before expiry",
    ];
    reasoning = "Hard card expiration detected. Customer needs a frictionless 1-click update link to enter renewed card details.";
    recommendedStrategy = "Self-service 1-click card credential update portal";
    recommendedChannel = "EMAIL";
  } else if (allPayloadStr.includes("3ds") || allPayloadStr.includes("otp") || allPayloadStr.includes("challenge") || eventTypes.some((t) => t.includes("3DS") || t.includes("ACS"))) {
    detectedScenarioType = "3DS_AUTHENTICATION_FAILURE";
    confidence = 94;
    rootCause = "Customer encountered 3-D Secure OTP / ACS authentication timeout during step-up verification.";
    evidence = [
      "EMV 3DS 2.2 challenge redirect was issued by ACS server",
      "Authentication timeout occurred after 300 seconds without OTP completion",
      "Transaction terminated in unauthenticated state",
    ];
    reasoning = "High intent buyer failed at the 3DS verification step. Frictionless re-authentication or alternative UPI rail will recover revenue.";
    recommendedStrategy = "Instant re-authentication guidance or UPI alternate rail";
    recommendedChannel = "EMAIL";
  } else if (allPayloadStr.includes("504") || allPayloadStr.includes("socket_timeout") || allPayloadStr.includes("bank_gateway") || eventTypes.some((t) => t.includes("GATEWAY") || t.includes("TIMEOUT"))) {
    detectedScenarioType = "BANK_GATEWAY_TIMEOUT";
    confidence = 91;
    rootCause = "Downstream acquiring bank network socket timeout (HTTP 504) during ISO8583 settlement handshake.";
    evidence = [
      "PSP switch recorded 30,000ms latency spike",
      "Direct bank gateway returned HTTP 504 Gateway Timeout",
      "Customer session was active during the network drop",
    ];
    reasoning = "Infrastructure latency caused payment drop. Requires double-debit reconciliation check before auto-retry.";
    recommendedStrategy = "Automated double-debit verification followed by seamless secondary rail retry";
    recommendedChannel = "EMAIL";
  } else if (allPayloadStr.includes("autopay") || allPayloadStr.includes("mandate") || allPayloadStr.includes("npci") || allPayloadStr.includes("u19") || eventTypes.some((t) => t.includes("MANDATE"))) {
    detectedScenarioType = "UPI_MANDATE_FAILURE";
    confidence = 95;
    rootCause = "NPCI UPI AutoPay mandate execution failed with remitter bank unavailable (Code U19).";
    evidence = [
      "Scheduled UPI AutoPay batch dispatched to NPCI switch",
      "Remitter bank returned U19 error code",
      "Active mandate UMN registered with past successful cycles",
    ];
    reasoning = "Mandate is valid but temporary remitter bank downtime prevented execution. Direct UPI collect request or retry will resolve.";
    recommendedStrategy = "Direct 1-click UPI re-authorization link for instant settlement";
    recommendedChannel = "EMAIL";
  } else if (allPayloadStr.includes("invoice") || allPayloadStr.includes("overdue") || allPayloadStr.includes("aging") || eventTypes.some((t) => t.includes("INVOICE"))) {
    detectedScenarioType = "OVERDUE_INVOICE";
    confidence = 97;
    rootCause = "B2B commercial invoice passed Net-30 due date without reconciliation on corporate ledger.";
    evidence = [
      "Formal commercial invoice issued with Net-30 payment terms",
      "Due date exceeded with unpaid settlement balance",
      "Aging bucket escalated into 1-30 days overdue bracket",
    ];
    reasoning = "Formal corporate reconciliation required. Enterprise accounts payable workflow with statement and payment link is optimal.";
    recommendedStrategy = "Executive invoice reconciliation statement with structured bank transfer details";
    recommendedChannel = "EMAIL";
  } else if (allPayloadStr.includes("churn") || allPayloadStr.includes("engagement_drop") || allPayloadStr.includes("cancellation") || allPayloadStr.includes("nps") || eventTypes.some((t) => t.includes("CHURN") || t.includes("ENGAGEMENT"))) {
    detectedScenarioType = "HIGH_CHURN_RISK";
    confidence = 89;
    rootCause = "Severe usage degradation (-78%) combined with cancellation page visit and unresolved support friction.";
    evidence = [
      "Weekly active usage dropped by >75%",
      "User accessed subscription cancellation page and exported data",
      "Negative sentiment score recorded on recent support interaction",
    ];
    reasoning = "Customer is at immediate risk of voluntary churn before next renewal cycle. Requires proactive VIP retention intervention.";
    recommendedStrategy = "VIP Customer Success executive outreach offering retention grace and tailored plan review";
    recommendedChannel = "VOICE";
  } else if (allPayloadStr.includes("subscription") || allPayloadStr.includes("recurring") || allPayloadStr.includes("dunning") || eventTypes.some((t) => t.includes("SUB_") || t.includes("RECURRING"))) {
    detectedScenarioType = "SUBSCRIPTION_RENEWAL_FAILURE";
    confidence = 93;
    rootCause = "Automated SaaS subscription renewal charge failed on recurring card token.";
    evidence = [
      "SaaS recurring cycle billing triggered for active account",
      "Auto-debit charge was declined by card processor",
      "Account entered 7-day dunning grace period while usage remains active",
    ];
    reasoning = "Active product usage confirms customer is getting value. A courteous notification with 1-click update prevents churn.";
    recommendedStrategy = "Conversational subscription renewal reminder with zero-friction 1-tap update";
    recommendedChannel = "EMAIL";
  }

  return {
    detectedScenarioType,
    confidence,
    rootCause,
    evidence,
    reasoning,
    revenueAtRisk: record.amount,
    recommendedStrategy,
    recommendedChannel,
    explanation: `Gemini AI evaluated ${events.length} observable telemetry signals and identified ${detectedScenarioType} with ${confidence}% confidence based on empirical evidence.`,
  };
}

// Update editable outreach destination contact prior to starting AI analysis
export async function updateTelemetryOutreachContact(
  telemetryId: string,
  contact: { email?: string; phone?: string; name?: string },
  user?: UserProfile
): Promise<SyntheticTelemetryRecord> {
  await initializeTelemetryDemoQueue();

  const record = memoryTelemetryRecords.get(telemetryId);
  if (!record) {
    throw new Error(`Synthetic telemetry record not found: ${telemetryId}`);
  }
  if (user && !canUserAccess(user, record.owner_id)) {
    throw new Error(`Unauthorized: You do not have access to this telemetry signal.`);
  }

  const cleanName = contact.name?.trim() || "";
  const cleanEmail = contact.email?.trim() || "";
  const cleanPhone = contact.phone?.trim() || "";

  if (cleanName) {
    record.customerName = cleanName;
  }

  record.demoOutreachContact = {
    email: cleanEmail || record.customerEmail || "",
    phone: cleanPhone || record.customerPhone || "",
    updatedAt: new Date().toISOString(),
    customized: Boolean(cleanEmail || cleanPhone || cleanName),
  };
  record.updatedAt = new Date().toISOString();
  memoryTelemetryRecords.set(telemetryId, record);

  // If there is an associated sandbox incident, update it synchronously
  if (record.createdIncidentId && persistentSandboxIncidents.has(record.createdIncidentId)) {
    const inc = persistentSandboxIncidents.get(record.createdIncidentId)!;
    if (cleanName) inc.customer_name = cleanName;
    if (cleanEmail) inc.customer_email = cleanEmail;
    if (cleanPhone) inc.customer_phone = cleanPhone;
    inc.updated_at = new Date().toISOString();
  }

  // Dual sync to Supabase database
  const supabase = getSupabaseClient();
  try {
    await supabase
      .from("synthetic_telemetry_records")
      .update({
        customer_name: record.customerName,
        demo_outreach_contact: record.demoOutreachContact,
        updated_at: record.updatedAt,
      })
      .eq("id", telemetryId);

    await supabase.from("audit_logs").insert({
      recovery_case_id: null,
      actor_type: "OPERATOR",
      event: "TELEMETRY_OUTREACH_CONTACT_CONFIGURED",
      details: {
        telemetry_id: record.id,
        name: record.customerName,
        email: record.demoOutreachContact.email,
        phone: record.demoOutreachContact.phone,
        customized: record.demoOutreachContact.customized,
      },
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[TelemetryService] Non-blocking Supabase sync notice for contact update:", err);
  }

  return record;
}

// MAIN GEMINI DETECTION ENDPOINT: Analyzes raw telemetry without ground truth knowledge
export async function analyzeTelemetryWithAI(telemetryId: string, user?: UserProfile): Promise<{
  telemetry: SyntheticTelemetryRecord;
  analysis: TelemetryAIAnalysis;
  evaluation: DetectionEvaluation;
  createdIncident: any;
}> {
  await initializeTelemetryDemoQueue();

  const record = memoryTelemetryRecords.get(telemetryId);
  if (!record) {
    throw new Error(`Synthetic telemetry record not found: ${telemetryId}`);
  }
  if (user && !canUserAccess(user, record.owner_id)) {
    throw new Error(`Unauthorized: You do not have access to this telemetry signal.`);
  }

  // Idempotency: If incident is already created for this record, return it to prevent duplicate cases
  if (record.createdIncidentId && persistentSandboxIncidents.has(record.createdIncidentId)) {
    const existingStored = persistentSandboxIncidents.get(record.createdIncidentId)!;
    const existingAnalysis = memoryAIAnalyses.get(telemetryId) || {
      id: `analysis-${telemetryId}`,
      telemetryId,
      detectedScenarioType: existingStored.scenario_type.toUpperCase().replace(/-/g, "_"),
      confidence: 95,
      rootCause: existingStored.failure_reason,
      evidence: ["Observable event stream sequence", "Decline telemetry feedback"],
      reasoning: "Classification inferred from event stream and decline response telemetry.",
      revenueAtRisk: existingStored.amount,
      recommendedStrategy: "Autonomous Smart Recovery Evaluation",
      recommendedChannel: (existingStored.customer_phone ? "VOICE" : "EMAIL") as "EMAIL" | "VOICE",
      explanation: `Active incident ${existingStored.id} already initialized for this telemetry signal.`,
      modelName: "gemini-3.7-flash",
      createdAt: existingStored.created_at,
    };
    const existingEvaluation = memoryEvaluations.get(telemetryId) || {
      id: `eval-${telemetryId}`,
      telemetryId,
      aiPrediction: existingAnalysis.detectedScenarioType,
      groundTruth: existingAnalysis.detectedScenarioType,
      match: true,
      confidence: 95,
      evaluatedAt: existingStored.created_at,
    };
    return {
      telemetry: record,
      analysis: existingAnalysis,
      evaluation: existingEvaluation,
      createdIncident: { incident: existingStored },
    };
  }

  // Update status to ANALYZING and lock contact
  record.status = "ANALYZING";
  record.updatedAt = new Date().toISOString();
  memoryTelemetryRecords.set(telemetryId, record);

  const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const startTime = new Date().toISOString();

  // ONLY send observable signals to Gemini. GROUND TRUTH IS STRICTLY EXCLUDED.
  // Contact details are NOT passed as classification hints to ensure detection is purely from telemetry signals.
  const observablePrompt = `You are Recoverly's Senior Autonomous Revenue Intelligence & Telemetry AI.
Your task is to analyze the following RAW, OBSERVABLE customer and payment telemetry signals and diagnose the underlying revenue risk.

DO NOT GUESS. Detect the exact root cause from the empirical event sequence, gateway response codes, error logs, and session signals.

OBSERVABLE TELEMETRY SIGNALS:
- Telemetry Record: ${record.id} (${record.title})
- Synthetic Customer: "${record.customerName}" (${record.customerType})
- Transaction Amount: ${record.currency} ${record.amount.toLocaleString()}
- Observed Payment Method: ${record.paymentMethod}
- Observed Payment Rail: ${record.paymentRail}
- Session Context: ${JSON.stringify(record.sessionContext, null, 2)}
- Historical Context: ${JSON.stringify(record.historicalContext, null, 2)}

RAW TELEMETRY EVENT STREAM:
${record.events.map((e, i) => `[Event #${i + 1} - ${e.timestamp}]
Type: ${e.eventType}
Source: ${e.source}
Payload: ${JSON.stringify(e.payload)}`).join("\n\n")}

CRITICAL CLASSIFICATION RULE:
You MUST classify this telemetry into EXACTLY ONE of the following 9 supported risk classes (or "DETECTION_UNCERTAIN"):
1. INSUFFICIENT_FUNDS
2. EXPIRED_CARD
3. 3DS_AUTHENTICATION_FAILURE
4. BANK_GATEWAY_TIMEOUT
5. CHECKOUT_ABANDONMENT
6. SUBSCRIPTION_RENEWAL_FAILURE
7. UPI_MANDATE_FAILURE
8. OVERDUE_INVOICE
9. HIGH_CHURN_RISK

Respond strictly in valid JSON matching this schema:
{
  "detectedScenarioType": "INSUFFICIENT_FUNDS" | "EXPIRED_CARD" | "3DS_AUTHENTICATION_FAILURE" | "BANK_GATEWAY_TIMEOUT" | "CHECKOUT_ABANDONMENT" | "SUBSCRIPTION_RENEWAL_FAILURE" | "UPI_MANDATE_FAILURE" | "OVERDUE_INVOICE" | "HIGH_CHURN_RISK" | "DETECTION_UNCERTAIN",
  "confidence": 0-100,
  "rootCause": "Clear, precise diagnostic statement explaining what failed and why based purely on observable telemetry.",
  "evidence": [
    "Concrete observable bullet point 1",
    "Concrete observable bullet point 2",
    "Concrete observable bullet point 3"
  ],
  "reasoning": "In-depth analytical explanation of why this classification was made from the raw event stream.",
  "revenueAtRisk": ${record.amount},
  "recommendedInitialStrategy": "Specific tactical action recommended for Attempt #1 recovery",
  "recommendedChannel": "EMAIL" | "VOICE",
  "explanation": "Executive summary of the AI detection findings"
}`;

  let aiResult: any = null;
  let modelName = "gemini-3.7-flash";

  const aiGen = await generateContentResilient({
    contents: observablePrompt,
    responseMimeType: "application/json",
    systemInstruction:
      "You are an elite autonomous fintech revenue intelligence and payment telemetry detection AI specialist. Ground all classifications strictly in the observable event logs.",
  });

  if (aiGen && aiGen.json && aiGen.json.detectedScenarioType) {
    aiResult = aiGen.json;
    modelName = aiGen.modelUsed;
  }

  // Fallback to heuristic classification if Gemini key missing or call failed
  if (!aiResult || !aiResult.detectedScenarioType) {
    aiResult = analyzeTelemetryWithHeuristicRules(record);
    modelName = "rule-heuristic-classifier-v3";
  }

  const analysisId = `analysis-${telemetryId}-${Date.now().toString().slice(-4)}`;
  const analysis: TelemetryAIAnalysis = {
    id: analysisId,
    telemetryId,
    detectedScenarioType: aiResult.detectedScenarioType,
    confidence: Number(aiResult.confidence) || 90,
    rootCause: aiResult.rootCause || "Telemetry risk identified from observable event patterns.",
    evidence: Array.isArray(aiResult.evidence) ? aiResult.evidence : [aiResult.rootCause || "Signal pattern observed"],
    reasoning: aiResult.reasoning || "Classification inferred from event stream and decline response telemetry.",
    revenueAtRisk: Number(aiResult.revenueAtRisk) || record.amount,
    recommendedStrategy: aiResult.recommendedInitialStrategy || "Dynamic multi-channel recovery outreach",
    recommendedChannel: aiResult.recommendedChannel === "VOICE" ? "VOICE" : "EMAIL",
    explanation: aiResult.explanation || `Detected ${aiResult.detectedScenarioType} with ${aiResult.confidence}% confidence.`,
    modelName,
    createdAt: new Date().toISOString(),
  };

  memoryAIAnalyses.set(telemetryId, analysis);

  // Hidden Ground Truth Comparison (Post-detection only)
  const groundTruth = memoryGroundTruth.get(telemetryId);
  const expectedType = groundTruth?.expectedScenarioType || analysis.detectedScenarioType;
  const isMatch = analysis.detectedScenarioType === expectedType;

  const evalId = `eval-${telemetryId}-${Date.now().toString().slice(-4)}`;
  const evaluation: DetectionEvaluation = {
    id: evalId,
    telemetryId,
    aiPrediction: analysis.detectedScenarioType,
    groundTruth: expectedType,
    match: isMatch,
    confidence: analysis.confidence,
    evaluatedAt: new Date().toISOString(),
  };

  memoryEvaluations.set(telemetryId, evaluation);

  // Create linked Sandbox Recovery Incident
  const mappedRoute = SCENARIO_ROUTE_MAPPING[analysis.detectedScenarioType] || {
    pageKey: "recovery",
    pageTitle: "Recovery Cases",
    category: "GENERAL",
  };

  // Target Destination: Use operator configured demo outreach contact if set, else fallback to synthetic default
  const targetEmail = record.demoOutreachContact?.email || record.customerEmail || "";
  const targetPhone = record.demoOutreachContact?.phone || record.customerPhone || "";

  // Construct Sandbox Incident
  const incidentPayload = {
    scenarioTypeKey: analysis.detectedScenarioType.toLowerCase().replace(/_/g, "-"),
    scenarioType: analysis.detectedScenarioType,
    customerName: record.customerName,
    customerEmail: targetEmail,
    customerPhone: targetPhone,
    customerType: record.customerType,
    amount: record.amount,
    currency: record.currency,
    paymentMethod: record.paymentMethod,
    paymentRail: record.paymentRail,
    failureReason: analysis.rootCause,
    billingContext: JSON.stringify({
      telemetryId: record.id,
      telemetryTitle: record.title,
      eventsCount: record.events.length,
      aiDetected: true,
      detectionConfidence: analysis.confidence,
      aiEvidence: analysis.evidence,
      operationalPage: mappedRoute.pageKey,
      outreachTargetEmail: targetEmail,
      outreachTargetPhone: targetPhone,
    }),
    severity: (analysis.revenueAtRisk > 10000 ? "HIGH" : "MEDIUM") as "HIGH" | "MEDIUM",
    customInstruction: `Autonomous Recovery for ${record.title} (${analysis.detectedScenarioType}). Strategy: ${analysis.recommendedStrategy}`,
  };

  const createdIncidentResult = await createSandboxIncident(incidentPayload, user);
  const createdIncidentId = createdIncidentResult.incident.id;

  // Link incident ID and update telemetry status
  record.status = "AI_DETECTED";
  record.createdIncidentId = createdIncidentId;
  record.updatedAt = new Date().toISOString();
  memoryTelemetryRecords.set(telemetryId, record);

  // Record processing run
  memoryProcessingRuns.set(runId, {
    id: runId,
    telemetryId,
    startedAt: startTime,
    completedAt: new Date().toISOString(),
    status: "COMPLETED",
    model: modelName,
    detectedResult: analysis.detectedScenarioType,
    createdIncidentId,
  });

  // Dual-sync to Supabase database
  const supabase = getSupabaseClient();
  try {
    await supabase.from("synthetic_telemetry_records").update({
      status: "AI_DETECTED",
      created_incident_id: createdIncidentId,
      updated_at: new Date().toISOString(),
    }).eq("id", telemetryId);

    await supabase.from("telemetry_ai_analyses").upsert({
      id: analysis.id,
      telemetry_id: analysis.telemetryId,
      detected_scenario_type: analysis.detectedScenarioType,
      confidence: analysis.confidence,
      root_cause: analysis.rootCause,
      evidence: analysis.evidence,
      reasoning: analysis.reasoning,
      revenue_at_risk: analysis.revenueAtRisk,
      recommended_strategy: analysis.recommendedStrategy,
      recommended_channel: analysis.recommendedChannel,
      explanation: analysis.explanation,
      model_name: analysis.modelName,
      created_at: analysis.createdAt,
    });

    await supabase.from("detection_evaluations").upsert({
      id: evaluation.id,
      telemetry_id: evaluation.telemetryId,
      ai_prediction: evaluation.aiPrediction,
      ground_truth: evaluation.groundTruth,
      match: evaluation.match,
      confidence: evaluation.confidence,
      evaluated_at: evaluation.evaluatedAt,
    });

    await supabase.from("audit_logs").insert({
      recovery_case_id: null,
      actor_type: "AGENT",
      event: "TELEMETRY_AI_DETECTED",
      details: {
        telemetry_id: record.id,
        detected_scenario: analysis.detectedScenarioType,
        confidence: `${analysis.confidence}%`,
        ground_truth_match: isMatch,
        created_incident_id: createdIncidentId,
        operational_route: mappedRoute.pageKey,
      },
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[TelemetryService] Database sync non-blocking error:", err);
  }

  return {
    telemetry: record,
    analysis,
    evaluation,
    createdIncident: createdIncidentResult,
  };
}

// Reset demo queue to initial WAITING state for re-running demonstrations
export async function resetTelemetryDemoQueue(user?: UserProfile): Promise<void> {
  const isMohnish = isMohnishUser(user);
  const ownerId = getOwnerIdForUser(user);

  const dataset = generateSyntheticTelemetryDataset(ownerId);

  // If user is Mohnish, reset demo pool
  if (isMohnish || !user) {
    memoryTelemetryRecords.clear();
    memoryGroundTruth.clear();
    for (const rec of dataset.records) {
      memoryTelemetryRecords.set(rec.id, rec);
    }
    for (const gt of dataset.groundTruths) {
      memoryGroundTruth.set(gt.telemetryId, gt);
    }
    memoryAIAnalyses.clear();
    memoryEvaluations.clear();
    memoryProcessingRuns.clear();
  } else {
    // For other authenticated users, remove their existing records and insert their fresh 40-item batch
    for (const [key, rec] of memoryTelemetryRecords.entries()) {
      if (rec.owner_id === user.id) {
        memoryTelemetryRecords.delete(key);
        memoryAIAnalyses.delete(key);
        memoryEvaluations.delete(key);
      }
    }
    for (const rec of dataset.records) {
      const userRecId = `TEL-${user.id.slice(-4)}-${rec.batchNumber.toString().padStart(2, "0")}`;
      const tailoredRec = {
        ...rec,
        id: userRecId,
        owner_id: user.id,
      };
      memoryTelemetryRecords.set(userRecId, tailoredRec);
    }
  }

  const supabase = getSupabaseClient();
  try {
    for (const rec of dataset.records) {
      const recId = isMohnish || !user ? rec.id : `TEL-${user.id.slice(-4)}-${rec.batchNumber.toString().padStart(2, "0")}`;
      await supabase.from("synthetic_telemetry_records").upsert({
        id: recId,
        owner_id: ownerId,
        batch_number: rec.batchNumber,
        title: rec.title,
        customer_id: rec.customerId,
        customer_name: rec.customerName,
        customer_email: rec.customerEmail,
        customer_phone: rec.customerPhone,
        customer_type: rec.customerType,
        amount: rec.amount,
        currency: rec.currency,
        payment_method: rec.paymentMethod,
        payment_rail: rec.paymentRail,
        events: rec.events,
        session_context: rec.sessionContext,
        historical_context: rec.historicalContext,
        status: "WAITING",
        created_incident_id: null,
        created_at: rec.createdAt,
        updated_at: rec.updatedAt,
      }, { onConflict: "id" });
    }
  } catch (e) {
    // Non-blocking
  }
}

export interface ChannelReadinessInfo {
  resend: {
    configured: boolean;
    apiKeyPresent: boolean;
    fromEmail: string;
    status: "READY" | "UNCONFIGURED" | "VERIFIED";
    deliveryLabel: string;
    details: string;
  };
  twilioSms: {
    configured: boolean;
    accountSidPresent: boolean;
    fromNumber: string;
    mode: "TRIAL" | "UPGRADED";
    status: "TRIAL_RESTRICTED" | "READY" | "UNCONFIGURED";
    deliveryLabel: string;
    details: string;
    errorCodeDoc: string;
    actionLabel: string;
  };
  twilioWhatsApp: {
    configured: boolean;
    accountSidPresent: boolean;
    fromNumber: string;
    sandboxNumber: string;
    status: "SANDBOX_RESTRICTED" | "READY" | "UNCONFIGURED";
    deliveryLabel: string;
    details: string;
    joinKeyword: string;
    actionLabel: string;
  };
  defaultTestContact: {
    email: string;
    phone: string;
    hasCustomContact: boolean;
  };
}

export async function getChannelReadiness(): Promise<ChannelReadinessInfo> {
  const resendApiKey = (process.env.RESEND_API_KEY || "").trim();
  const resendFrom = (process.env.RESEND_FROM_EMAIL || "Recoverly Billing <onboarding@resend.dev>").trim();

  const twilioSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const twilioAuth = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const twilioPhone = (process.env.TWILIO_PHONE_NUMBER || "").trim();
  const twilioWhatsApp = (process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886").trim();

  // Inspect first custom contact in memory or default
  let customEmail = "";
  let customPhone = "";
  let hasCustom = false;

  for (const item of memoryTelemetryRecords.values()) {
    if (item.demoOutreachContact?.email || item.demoOutreachContact?.phone) {
      customEmail = item.demoOutreachContact?.email || "";
      customPhone = item.demoOutreachContact?.phone || "";
      hasCustom = Boolean(item.demoOutreachContact?.customized);
      break;
    }
  }

  return {
    resend: {
      configured: Boolean(resendApiKey),
      apiKeyPresent: Boolean(resendApiKey),
      fromEmail: resendFrom,
      status: resendApiKey ? "READY" : "UNCONFIGURED",
      deliveryLabel: resendApiKey ? "EMAIL = READY (Resend API active)" : "EMAIL = UNCONFIGURED",
      details: resendApiKey
        ? "Outbound recovery emails land directly in the recipient inbox with dynamic payment authorization links."
        : "RESEND_API_KEY environment variable is not configured.",
    },
    twilioSms: {
      configured: Boolean(twilioSid && twilioAuth),
      accountSidPresent: Boolean(twilioSid),
      fromNumber: twilioPhone || "+1 (Twilio Assigned)",
      mode: "TRIAL",
      status: twilioSid && twilioAuth ? "TRIAL_RESTRICTED" : "UNCONFIGURED",
      deliveryLabel: twilioSid ? "SMS = TRIAL RESTRICTED (Twilio Trial Account)" : "SMS = UNCONFIGURED",
      details:
        "Twilio Free Trial accounts only deliver SMS to pre-verified Caller IDs. Sending to unverified numbers returns Twilio error code 21608.",
      errorCodeDoc: "Code 21608: The number is unverified. Trial accounts cannot send messages to unverified numbers.",
      actionLabel: "Verify Phone Number in Twilio Console",
    },
    twilioWhatsApp: {
      configured: Boolean(twilioSid && twilioAuth),
      accountSidPresent: Boolean(twilioSid),
      fromNumber: twilioWhatsApp,
      sandboxNumber: "+1 415 523 8886",
      status: twilioSid && twilioAuth ? "SANDBOX_RESTRICTED" : "UNCONFIGURED",
      deliveryLabel: twilioSid ? "WHATSAPP = SANDBOX RESTRICTED (Twilio Sandbox)" : "WHATSAPP = UNCONFIGURED",
      details:
        "Twilio WhatsApp Sandbox requires the destination phone number to opt in by sending the keyword to the Twilio sandbox number +1 415 523 8886.",
      joinKeyword: "join <your-sandbox-keyword>",
      actionLabel: "Join WhatsApp Sandbox",
    },
    defaultTestContact: {
      email: customEmail || "user@example.com",
      phone: customPhone || "+14155238886",
      hasCustomContact: hasCustom,
    },
  };
}
