import { plainToInstance, Transform } from 'class-transformer';

type Constructor<T> = new () => T;

/**
 * Form fields and query strings carry booleans as text, so `true`/`false` have
 * to be recovered before `@IsBoolean` runs. JSON bodies already send a boolean
 * and pass through. Anything else is returned as-is so validation reports it.
 */
export function ToBoolean(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  });
}

/**
 * Accepts a string list as a repeated form field, a JSON array string, or a
 * comma-separated string, so the same DTO serves form and JSON requests.
 */
export function StringArray(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (Array.isArray(value)) return value.map(String);
    if (typeof value !== 'string') return value;
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Not JSON, so fall through to the comma-separated form.
    }
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  });
}

/**
 * Parses a JSON-encoded object sent as a form field. JSON bodies already send
 * an object and pass through untouched.
 */
export function JsonObject(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  });
}

/**
 * Multipart form fields arrive as strings, so a JSON-encoded object list has to
 * be parsed and rebuilt into DTO instances for nested validation to apply. JSON
 * request bodies already provide an array and pass straight through. An
 * unparseable value is returned as-is so `@IsArray` reports it.
 */
export function JsonArray<T>(cls: Constructor<T>): PropertyDecorator {
  return Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
      const raw = obj[key];
      if (raw === undefined || raw === null || raw === '') return undefined;
      let source: unknown = raw;
      if (typeof source === 'string') {
        try {
          source = JSON.parse(source) as unknown;
        } catch {
          return raw;
        }
      }
      const list = Array.isArray(source) ? source : [source];
      if (list.some((item) => typeof item !== 'object' || item === null))
        return raw;
      return plainToInstance(cls, list);
    },
  );
}
