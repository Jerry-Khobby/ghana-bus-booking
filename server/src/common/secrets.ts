/** A required secret from the environment; the app refuses to start without it. */
export function requireSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name} in .env (any long random string)`);
  }
  return value;
}
