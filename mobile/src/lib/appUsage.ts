export function isUnusedApp(
  app: { lastUsedAt: number; installedAt?: number; isSystem: boolean },
  days: number,
  now: number,
): boolean {
  if (app.isSystem || app.lastUsedAt <= 0 || app.lastUsedAt > now) return false;
  const cutoff = now - days * 86400000;
  return (
    app.lastUsedAt < cutoff && (!app.installedAt || app.installedAt < cutoff)
  );
}
