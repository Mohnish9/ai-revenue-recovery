import { databaseTables, getDatabaseStatus } from "../services/supabaseService.js";

const status = await getDatabaseStatus();
console.log(`Supabase connected: ${status.connected}`);
for (const table of status.tables) {
  console.log(`${table.available ? "OK" : "MISSING"} ${table.table}`);
}

if (!status.connected) {
  console.error(status.error ?? `Expected tables: ${databaseTables.join(", ")}`);
  process.exit(1);
}