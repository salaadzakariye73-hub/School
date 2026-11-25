import mongoose from 'mongoose';

export function asString(val: unknown, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  return val.trim();
}

export function asOptionalString(val: unknown): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function asNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = Number(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function asBoolean(val: unknown, fallback = false): boolean {
  if (typeof val === 'boolean') return val;
  return fallback;
}

export function asStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  const cleaned: string[] = [];
  for (const item of val) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed && !cleaned.includes(trimmed)) {
        cleaned.push(trimmed);
      }
    }
  }
  return cleaned;
}

export function isValidObjectId(val: unknown): val is string {
  return typeof val === 'string' && mongoose.Types.ObjectId.isValid(val);
}

export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
