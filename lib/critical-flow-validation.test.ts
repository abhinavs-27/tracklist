import { describe, it, expect } from 'vitest';
import { validateRating, validateEntityType } from './validation';
import { validateUuidParam } from './api-utils';

describe('Critical Flow Validation Tests', () => {

  describe('Review Rating Validation', () => {
    it('should reject ratings < 1', () => {
      expect(validateRating(0)).toMatchObject({ ok: false });
      expect(validateRating(-1)).toMatchObject({ ok: false });
    });

    it('should reject ratings > 5', () => {
      expect(validateRating(6)).toMatchObject({ ok: false });
      expect(validateRating(10)).toMatchObject({ ok: false });
    });

    it('should accept valid half-star ratings 1–5', () => {
      [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].forEach((r) => {
        expect(validateRating(r)).toEqual({ ok: true, value: r });
      });
    });
  });

  describe('Entity Type Validation', () => {
    it('should only accept album or song', () => {
      expect(validateEntityType('album')).toEqual({ ok: true, value: 'album' });
      expect(validateEntityType('song')).toEqual({ ok: true, value: 'song' });
    });

    it('should reject other entity types', () => {
      expect(validateEntityType('artist')).toMatchObject({ ok: false });
      expect(validateEntityType('playlist')).toMatchObject({ ok: false });
      expect(validateEntityType('')).toMatchObject({ ok: false });
    });
  });

  describe('UUID Validation (API Utils)', () => {
    it('should return 404 error for invalid UUID', () => {
      const result = validateUuidParam('not-a-uuid');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(404);
      }
    });

    it('should return 404 error for null UUID', () => {
      const result = validateUuidParam(null);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.status).toBe(404);
      }
    });

    it('should accept valid UUID', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = validateUuidParam(validUuid);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.id).toBe(validUuid);
      }
    });
  });

});
