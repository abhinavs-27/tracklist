import { describe, it, expect, vi } from 'vitest';
import { handlePostgrestError, parseBody } from './api-utils';
import { NextRequest } from 'next/server';

describe('api-utils helpers', () => {
  describe('parseBody', () => {
    it('returns data on valid JSON', async () => {
      const mockReq = {
        json: async () => ({ foo: 'bar' }),
      } as unknown as NextRequest;
      const result = await parseBody(mockReq);
      expect(result.data).toEqual({ foo: 'bar' });
      expect(result.error).toBeNull();
    });

    it('returns error on invalid JSON', async () => {
      const mockReq = {
        json: async () => { throw new Error('Bad JSON'); },
      } as unknown as NextRequest;
      const result = await parseBody(mockReq);
      expect(result.data).toBeNull();
      expect(result.error?.status).toBe(400);
    });
  });

  describe('handlePostgrestError', () => {
    it('maps 23505 to 409 Conflict', async () => {
      const res = handlePostgrestError({ code: '23505', message: 'duplicate' });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe('Resource already exists');
    });

    it('maps 23503 to 400 Bad Request', async () => {
      const res = handlePostgrestError({ code: '23503', message: 'fkey' });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Related resource not found');
    });

    it('maps other codes to 500 Internal Error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = handlePostgrestError({ code: 'PGRST999', message: 'oops' });
      expect(res.status).toBe(500);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
