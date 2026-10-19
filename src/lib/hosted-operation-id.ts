// Stable during transport retries; never persisted in a reading workspace/backup.
const operations = new Map<string, string>();
export function hostedTransportId(id: string) {
  let value = operations.get(id);
  if (!value) { value = `${Date.now()}_${crypto.randomUUID()}`; operations.set(id, value); }
  return value;
}
export function releaseHostedTransport(id: string) { operations.delete(id); }
