export async function guestLimitEnabled(db) {
  try {
    const row = await db.prepare("SELECT value FROM site_settings WHERE key='guest_limit_enabled'").first();
    return row?.value !== "0";
  } catch {
    // Keep the existing one-archive limit until production D1 has been migrated.
    return true;
  }
}
