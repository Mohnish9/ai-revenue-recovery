import type { UserProfile } from "./authService.js";
export type { UserProfile };

/**
 * Determines whether the authenticated user has permission to access a record.
 * 
 * Rules:
 * 1. If unauthenticated, deny access (false).
 * 2. Unassigned seed data or baseline demo records are accessible to any authenticated operator.
 * 3. Tenant records with a specific owner_id are only accessible if recordOwnerId matches user.id or user.email.
 */
export function canUserAccess(user: UserProfile | undefined | null, recordOwnerId?: string | null): boolean {
  if (!user) return false;

  // Unassigned seed demo data, baseline demo records, or system records
  if (
    !recordOwnerId ||
    recordOwnerId === "usr_demo_001" ||
    recordOwnerId === "usr_operator_001" ||
    recordOwnerId === "seed_demo" ||
    recordOwnerId === "system"
  ) {
    return true;
  }

  // Tenant / User ownership check
  return recordOwnerId === user.id || recordOwnerId === user.email;
}

/**
 * Returns the owner identifier to tag newly created records.
 */
export function getOwnerIdForUser(user?: UserProfile | null): string {
  if (!user) return "usr_system";
  return user.id;
}
