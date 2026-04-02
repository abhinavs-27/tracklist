import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { parseBody, getPaginationParams, validateUuidParam } from './api-utils';

describe('api-utils', () => {
  describe('parseBody', () => {
    it('should parse valid JSON', async () => {
      const request = {
        json: vi.fn().mockResolvedValue({ key: 'value' }),
      } as unknown as NextRequest;

      const result = await parseBody<{ key: string }>(request);
      expect(result.data).toEqual({ key: 'value' });
      expect(result.error).toBeNull();
    });

    it('should return error for invalid JSON', async () => {
      const request = {
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      } as unknown as NextRequest;

      const result = await parseBody(request);
      expect(result.data).toBeNull();
      expect(result.error?.status).toBe(400);
    });
  });

  describe('getPaginationParams', () => {
    it('should parse limit and offset correctly', () => {
      const params = new URLSearchParams('limit=50&offset=20');
      const result = getPaginationParams(params);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(20);
    });

    it('should use defaults for missing params', () => {
      const params = new URLSearchParams('');
      const result = getPaginationParams(params, 10, 100);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });

    it('should clamp limit to maxLimit', () => {
      const params = new URLSearchParams('limit=200');
      const result = getPaginationParams(params, 20, 100);
      expect(result.limit).toBe(100);
    });

    it('should handle negative offset by defaulting to 0', () => {
      const params = new URLSearchParams('offset=-10');
      const result = getPaginationParams(params);
      expect(result.offset).toBe(0);
    });
  });

  describe('validateUuidParam', () => {
    it('should return ok for valid UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = validateUuidParam(uuid);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.id).toBe(uuid);
      }
    });

    it('should return error for invalid UUID', () => {
      const result = validateUuidParam('invalid-uuid');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(404);
      }
    });

    it('should return error for null ID', () => {
      const result = validateUuidParam(null);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(404);
      }
    });
  });
});
