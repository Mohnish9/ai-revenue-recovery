import type { UserProfile } from "./authService.js";
export type { UserProfile };

/**
 * Checks if the given authenticated user is Mohnish Kaplish.
 * Mohnish's account is authorized to view and manage the original seed demo dataset.
 */
export function isMohnishUser(user?: UserProfile | null): boolean {
  if (!user) return false;
  const email = (user.email || "").toLowerCase().trim();
  return email === "mohnishkaplish92@gmail.com" || user.id === "usr_demo_001";
}

/**
 * Determines whether the authenticated user has permission to access a record.
 * 
 * Rules:
 * 1. If unauthenticated, deny access (false).
 * 2. If record is owned by "usr_demo_001", "usr_operator_001", or is unassigned seed data,
 *    only Mohnish Kaplish (or authorized demo account) can access it.
 * 3. If record has an owner_id, it is only accessible if recordOwnerId matches user.id or user.email.
 * 4. A new user with their own user ID will only access records stamped with their user ID.
 */
export function canUserAccess(user: UserProfile | undefined | null, recordOwnerId?: string | null): boolean {
  if (!user) return false;

  // Unassigned seed demo data or Mohnish's demo owner ID
  if (!recordOwnerId || recordOwnerId === "usr_demo_001" || recordOwnerId === "usr_operator_001" || recordOwnerId === "seed_demo") {
    return isMohnishUser(user);
  }

  // Tenant / User ownership check
  return recordOwnerId === user.id || recordOwnerId === user.email;
}

/**
 * Returns the owner identifier to tag newly created records.
 */
export function getOwnerIdForUser(user?: UserProfile | null): string {
  if (!user) return "usr_demo_001";
  if (isMohnishUser(user)) return "usr_demo_001";
  return user.id;
}
