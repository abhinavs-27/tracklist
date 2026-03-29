import { describe, it, expect } from 'vitest';
import {
  validateRating,
  validateSearchQuery,
  validateEntityType,
  isValidUsername
} from './validation';

describe('Validation Helpers', () => {
  describe('validateRating', () => {
    it('accepts valid ratings 1-5', () => {
      expect(validateRating(1)).toEqual({ ok: true, value: 1 });
      expect(validateRating(3)).toEqual({ ok: true, value: 3 });
      expect(validateRating(5)).toEqual({ ok: true, value: 5 });
    });

    it('rejects out of range ratings', () => {
      expect(validateRating(0)).toEqual({ ok: false, error: 'rating must be an integer 1–5' });
      expect(validateRating(6)).toEqual({ ok: false, error: 'rating must be an integer 1–5' });
    });

    it('rejects non-integer ratings', () => {
      expect(validateRating(3.5)).toEqual({ ok: false, error: 'rating must be an integer 1–5' });
      expect(validateRating('5')).toEqual({ ok: true, value: 5 }); // Number('5') is 5
      expect(validateRating('abc')).toEqual({ ok: false, error: 'rating must be an integer 1–5' });
    });
  });

  describe('validateSearchQuery', () => {
    it('accepts valid search queries', () => {
      expect(validateSearchQuery('radiohead')).toEqual({ ok: true, value: 'radiohead' });
    });

    it('rejects empty queries', () => {
      expect(validateSearchQuery('')).toEqual({ ok: false, error: 'Query q is required' });
      expect(validateSearchQuery(null)).toEqual({ ok: false, error: 'Query q is required' });
    });

    it('truncates overly long queries', () => {
      const longQuery = 'a'.repeat(300);
      const result = validateSearchQuery(longQuery);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(200);
      }
    });
  });

  describe('validateEntityType', () => {
    it('accepts album and song', () => {
      expect(validateEntityType('album')).toEqual({ ok: true, value: 'album' });
      expect(validateEntityType('song')).toEqual({ ok: true, value: 'song' });
    });

    it('rejects other types', () => {
      expect(validateEntityType('artist')).toEqual({ ok: false, error: "entity_type must be 'album' or 'song'" });
    });
  });

  describe('isValidUsername', () => {
    it('validates correct usernames', () => {
      expect(isValidUsername('jules_tester')).toBe(true);
      expect(isValidUsername('user123')).toBe(true);
    });

    it('rejects invalid usernames', () => {
      expect(isValidUsername('Abc')).toBe(false); // Only lowercase
      expect(isValidUsername('a')).toBe(false); // Too short
      expect(isValidUsername('!@#')).toBe(false);
    });
  });
});
