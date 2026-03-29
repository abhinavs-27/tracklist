import { describe, it, expect, vi } from 'vitest';
import {
  apiOk,
  apiBadRequest,
  apiNotFound,
  apiUnauthorized,
  apiInternalError
} from './api-response';

// Mock NextResponse
vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: HeadersInit }) => ({
      data,
      status: init?.status ?? 200,
      headers: init?.headers,
    }),
  },
}));

interface MockResponse {
  data: unknown;
  status: number;
  headers?: HeadersInit;
}

describe('API Response Helpers', () => {
  it('apiOk returns 200 by default', () => {
    const data = { success: true };
    const res = apiOk(data) as unknown as MockResponse;
    expect(res.status).toBe(200);
    expect(res.data).toEqual(data);
  });

  it('apiBadRequest returns 400', () => {
    const res = apiBadRequest('Bad Request') as unknown as MockResponse;
    expect(res.status).toBe(400);
    expect(res.data).toEqual({ error: 'Bad Request' });
  });

  it('apiNotFound returns 404', () => {
    const res = apiNotFound('Not Found') as unknown as MockResponse;
    expect(res.status).toBe(404);
    expect(res.data).toEqual({ error: 'Not Found' });
  });

  it('apiUnauthorized returns 401', () => {
    const res = apiUnauthorized('Unauthorized') as unknown as MockResponse;
    expect(res.status).toBe(401);
    expect(res.data).toEqual({ error: 'Unauthorized' });
  });

  it('apiInternalError returns 500 and logs error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = apiInternalError(new Error('Internal server error')) as unknown as MockResponse;
    expect(res.status).toBe(500);
    expect(res.data).toEqual({ error: 'An unexpected error occurred. Please try again.' });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
