/**
 * Lambda bundle stubs for `next/headers`.
 * Server Components use cookie-backed Supabase — cron/Lambda has no cookies; stubs satisfy imports.
 */

export async function cookies() {
  const empty = {
    getAll: () =>
      [] as {
        name: string;
        value: string;
      }[],
    set: () => {},
    delete: () => {},
    get: () => undefined,
    has: () => false,
  };
  return empty;
}

export async function headers() {
  return new Headers();
}

export async function draftMode() {
  return {
    isEnabled: false,
    enable: async () => {},
    disable: async () => {},
  };
}
