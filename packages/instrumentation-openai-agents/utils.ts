export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

export function safelyJSONStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

export type HrTime = [number, number];

export function isoToHrTime(isoTimestamp: string): HrTime | undefined {
  const epochMilliseconds = Date.parse(isoTimestamp);
  if (Number.isNaN(epochMilliseconds)) return undefined;
  const seconds = Math.floor(epochMilliseconds / 1000);
  let nanoseconds = 0;
  const fractionMatch = /\.(\d+)/.exec(isoTimestamp);
  if (fractionMatch) {
    nanoseconds = parseInt(fractionMatch[1].slice(0, 9).padEnd(9, "0"), 10);
  } else {
    nanoseconds = (epochMilliseconds % 1000) * 1_000_000;
  }
  return [seconds, nanoseconds];
}

export function boundMap<K, V>(map: Map<K, V>, max: number) {
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export function boundSet<T>(set: Set<T>, max: number) {
  while (set.size > max) {
    const oldest = set.values().next().value;
    if (oldest === undefined) break;
    set.delete(oldest);
  }
}
