import type { JsonValue, Sha256 } from './types';

export function canonicalJson(value: JsonValue): string {
  return serialize(value);
}

export function canonicalJsonBytes(value: JsonValue): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}

export async function canonicalHash(value: JsonValue): Promise<Sha256> {
  const canonical = canonicalJsonBytes(value);
  const schema = schemaDomain(value);
  const payload = schema === null
    ? canonical
    : concatBytes(new TextEncoder().encode(`${schema}\0`), canonical);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return `sha256:${hex(new Uint8Array(digest))}`;
}

function serialize(value: JsonValue): string {
  if (value === null || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'string') {
    rejectLoneSurrogates(value);
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return serializeNumber(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => serialize(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const pairs = keys.map((key) => {
    rejectLoneSurrogates(key);
    return `${JSON.stringify(key)}:${serialize(value[key])}`;
  });
  return `{${pairs.join(',')}}`;
}

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error('JCS_NUMBER_NONFINITE');
  }
  return JSON.stringify(value);
}

function rejectLoneSurrogates(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) {
        throw new Error('JCS_LONE_SURROGATE');
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error('JCS_LONE_SURROGATE');
    }
  }
}

function schemaDomain(value: JsonValue): string | null {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    return null;
  }
  const schema = value.schema;
  return typeof schema === 'string' && schema.length > 0 ? schema : null;
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const output = new Uint8Array(left.length + right.length);
  output.set(left, 0);
  output.set(right, left.length);
  return output;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}
