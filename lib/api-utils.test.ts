import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  parseBody,
  handlePostgrestError,
  getPaginationParams,
  validateUuidParam,
} from './api-utils';

describe('api-utils unit tests', () => {

  describe('parseBody', () => {
    it('successfully parses valid JSON body', async () => {
      const mockData = { test: 'value' };
      const mockRequest = {
        json: vi.fn().mockResolvedValue(mockData),
      } as unknown as NextRequest;

      const result = await parseBody(mockRequest);
      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });

    it('returns apiBadRequest for invalid JSON', async () => {
      const mockRequest = {
        json: vi.fn().mockRejectedValue(new Error('SyntaxError')),
      } as unknown as NextRequest;

      const result = await parseBody(mockRequest);
      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error?.status).toBe(400);
    });
  });

  describe('handlePostgrestError', () => {
    it('returns apiConflict for code 23505', () => {
      const error = { code: '23505', message: 'Unique violation' };
      const response = handlePostgrestError(error);
      expect(response.status).toBe(409);
    });

    it('returns custom message for code 23505', async () => {
      const error = { code: '23505', message: 'Unique violation' };
      const response = handlePostgrestError(error, { '23505': 'Custom Conflict' });
      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toBe('Custom Conflict');
    });

    it('returns apiBadRequest for code 23503', () => {
      const error = { code: '23503', message: 'Foreign key violation' };
      const response = handlePostgrestError(error);
      expect(response.status).toBe(400);
    });

    it('returns apiInternalError for unknown code', () => {
      const error = { code: '99999', message: 'Unknown error' };
      // Suppress console.error for test
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const response = handlePostgrestError(error);
      expect(response.status).toBe(500);
      spy.mockRestore();
    });
  });

  describe('getPaginationParams', () => {
    it('uses default values when no params provided', () => {
      const searchParams = new URLSearchParams();
      const result = getPaginationParams(searchParams);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('correctly parses limit and offset', () => {
      const searchParams = new URLSearchParams({ limit: '50', offset: '25' });
      const result = getPaginationParams(searchParams);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(25);
    });

    it('clamps limit to maxLimit', () => {
      const searchParams = new URLSearchParams({ limit: '1000' });
      const result = getPaginationParams(searchParams, 20, 100);
      expect(result.limit).toBe(100);
    });

    it('handles negative or invalid offset', () => {
      const searchParams = new URLSearchParams({ offset: '-10' });
      const result = getPaginationParams(searchParams);
      expect(result.offset).toBe(0);

      const searchParams2 = new URLSearchParams({ offset: 'abc' });
      const result2 = getPaginationParams(searchParams2);
      expect(result2.offset).toBe(0);
    });
  });

  describe('validateUuidParam', () => {
    it('returns ok: true for valid UUID', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = validateUuidParam(validUuid);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.id).toBe(validUuid);
      }
    });

    it('returns ok: false for null or invalid UUID', () => {
      const resultNull = validateUuidParam(null);
      expect(resultNull.ok).toBe(false);
      if (!resultNull.ok) {
        expect(resultNull.error.status).toBe(404);
      }

      const resultInvalid = validateUuidParam('invalid-uuid');
      expect(resultInvalid.ok).toBe(false);
      if (!resultInvalid.ok) {
        expect(resultInvalid.error.status).toBe(404);
      }
    });
  });

});
