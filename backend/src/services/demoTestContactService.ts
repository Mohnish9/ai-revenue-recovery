// Demo Test Contact Configuration Service
// Manages verified test contact details (email & phone) for real provider testing with Exotel and Resend
// When enabled, outbound test messages are routed to the user's verified test contact.

import type { UserProfile } from "./authService.js";

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

const userTestContactsMap = new Map<string, DemoTestContactConfig>();

export function getDemoTestContactConfig(user?: UserProfile): DemoTestContactConfig {
  const userKey = user?.id || user?.email || "default_user";

  if (userTestContactsMap.has(userKey)) {
    return { ...userTestContactsMap.get(userKey)! };
  }

  const userEmail = user?.email || initialEmail;
  const userName = user?.name || "Revenue Specialist";

  const config: DemoTestContactConfig = {
    enabled: defaultEnabled,
    verifiedEmail: userEmail,
    verifiedPhone: initialPhone,
    testEmail: userEmail,
    testPhone: initialPhone,
    autoFormatPhone: true,
    notes: "Verified operator contact for Exotel Voice, SMS, and Resend Email test dispatches",
    name: userName,
    updatedAt: new Date().toISOString(),
  };

  userTestContactsMap.set(userKey, config);
  return { ...config };
}

export function updateDemoTestContactConfig(
  updates: Partial<DemoTestContactConfig> & {
    testEmail?: string;
    testPhone?: string;
  },
  user?: UserProfile
): DemoTestContactConfig {
  const userKey = user?.id || user?.email || "default_user";
  const current = getDemoTestContactConfig(user);

  const email = (updates.testEmail ?? updates.verifiedEmail ?? current.verifiedEmail).trim();
  const phone = (updates.testPhone ?? updates.verifiedPhone ?? current.verifiedPhone).trim();

  const updated: DemoTestContactConfig = {
    ...current,
    ...updates,
    verifiedEmail: email,
    testEmail: email,
    verifiedPhone: phone,
    testPhone: phone,
    name: updates.name ?? current.name,
    updatedAt: new Date().toISOString(),
  };

  userTestContactsMap.set(userKey, updated);
  return { ...updated };
}
