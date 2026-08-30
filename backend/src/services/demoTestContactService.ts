// Demo Test Contact Configuration Service
// Manages verified test contact details (email & phone) for real provider testing with Exotel and Resend
// When enabled, the synthetic customer telemetry and risk data remain untouched, but outbound messages are routed to the verified test contact.

export interface DemoTestContactConfig {
  enabled: boolean;
  verifiedEmail: string;
  verifiedPhone: string;
  testEmail: string;
  testPhone: string;
  autoFormatPhone?: boolean;
  notes?: string;
  name: string;
  updatedAt: string;
}

const initialEmail = (process.env.RESEND_TEST_EMAIL || process.env.DEMO_TEST_EMAIL || "").trim();
const initialPhone = (process.env.EXOTEL_TEST_PHONE || process.env.DEMO_TEST_PHONE || process.env.TWILIO_VERIFIED_TO || "").trim();
const defaultEnabled = Boolean(initialEmail || initialPhone);

let demoTestContactState: DemoTestContactConfig = {
  enabled: defaultEnabled,
  verifiedEmail: initialEmail,
  verifiedPhone: initialPhone,
  testEmail: initialEmail,
  testPhone: initialPhone,
  autoFormatPhone: true,
  notes: "Verified demo contact for live Exotel Voice & Resend Email test dispatches",
  name: "Demo Test Operator",
  updatedAt: new Date().toISOString(),
};

export function getDemoTestContactConfig(): DemoTestContactConfig {
  return { ...demoTestContactState };
}

export function updateDemoTestContactConfig(updates: Partial<DemoTestContactConfig> & {
  testEmail?: string;
  testPhone?: string;
}): DemoTestContactConfig {
  const email = (updates.testEmail ?? updates.verifiedEmail ?? demoTestContactState.verifiedEmail).trim();
  const phone = (updates.testPhone ?? updates.verifiedPhone ?? demoTestContactState.verifiedPhone).trim();

  demoTestContactState = {
    ...demoTestContactState,
    ...updates,
    verifiedEmail: email,
    testEmail: email,
    verifiedPhone: phone,
    testPhone: phone,
    updatedAt: new Date().toISOString(),
  };
  return { ...demoTestContactState };
}

