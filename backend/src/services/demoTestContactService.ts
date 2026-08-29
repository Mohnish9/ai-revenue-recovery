// Demo Test Contact Configuration Service
// Manages verified test contact details (email & phone) for real provider testing with Twilio and Resend
// When enabled, the synthetic customer telemetry and risk data remain untouched, but outbound messages are routed to the verified test contact.

export interface DemoTestContactConfig {
  enabled: boolean;
  verifiedEmail: string;
  verifiedPhone: string;
  name: string;
  updatedAt: string;
}

let demoTestContactState: DemoTestContactConfig = {
  enabled: false,
  verifiedEmail: (process.env.DEMO_TEST_EMAIL || "").trim(),
  verifiedPhone: (process.env.DEMO_TEST_PHONE || process.env.TWILIO_VERIFIED_TO || "").trim(),
  name: "Demo Test Operator",
  updatedAt: new Date().toISOString(),
};

export function getDemoTestContactConfig(): DemoTestContactConfig {
  return { ...demoTestContactState };
}

export function updateDemoTestContactConfig(updates: Partial<DemoTestContactConfig>): DemoTestContactConfig {
  demoTestContactState = {
    ...demoTestContactState,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  return { ...demoTestContactState };
}
