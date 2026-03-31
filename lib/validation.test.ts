import { describe, it, expect } from 'vitest';
import {
  isValidSpotifyId,
  validateRating,
  validateEntityType,
  validateSearchQuery,
  validateUsernameUpdate,
  isValidUuid,
  isValidReviewEntityId,
} from './validation';

describe('validation utilities', () => {
  describe('isValidSpotifyId', () => {
    it('should return true for valid Spotify IDs', () => {
      expect(isValidSpotifyId('2nLhD10Z7Sb4RFyCX2ZCyx')).toBe(true);
      expect(isValidSpotifyId('1234567890123456789012')).toBe(true);
    });

    it('should return false for invalid Spotify IDs', () => {
      expect(isValidSpotifyId('too-short')).toBe(false);
      expect(isValidSpotifyId('this-is-too-long-for-a-spotify-id')).toBe(false);
      expect(isValidSpotifyId('')).toBe(false);
      expect(isValidSpotifyId(null)).toBe(false);
    });
  });

  describe('validateRating', () => {
    it('should return ok: true for ratings 1-5', () => {
      [1, 2, 3, 4, 5].forEach((r) => {
        expect(validateRating(r)).toEqual({ ok: true, value: r });
      });
    });

    it('should return ok: false for invalid ratings', () => {
      expect(validateRating(0)).toMatchObject({ ok: false });
      expect(validateRating(6)).toMatchObject({ ok: false });
      expect(validateRating(2.5)).toMatchObject({ ok: false });
      expect(validateRating('5')).toEqual({ ok: true, value: 5 });
      expect(validateRating('invalid')).toMatchObject({ ok: false });
    });
  });

  describe('validateEntityType', () => {
    it('should return ok: true for album and song', () => {
      expect(validateEntityType('album')).toEqual({ ok: true, value: 'album' });
      expect(validateEntityType('song')).toEqual({ ok: true, value: 'song' });
    });

    it('should return ok: false for other types', () => {
      expect(validateEntityType('artist')).toMatchObject({ ok: false });
      expect(validateEntityType('')).toMatchObject({ ok: false });
      expect(validateEntityType(null)).toMatchObject({ ok: false });
    });
  });

  describe('validateSearchQuery', () => {
    it('should return ok: true for non-empty strings', () => {
      expect(validateSearchQuery('radiohead')).toEqual({ ok: true, value: 'radiohead' });
    });

    it('should return ok: false for empty or long strings', () => {
      expect(validateSearchQuery('')).toMatchObject({ ok: false });
      expect(validateSearchQuery('   ')).toMatchObject({ ok: false });
      expect(validateSearchQuery('a'.repeat(201))).toMatchObject({ ok: true }); // clamped
    });
  });

  describe('validateUsernameUpdate', () => {
    it('should validate valid usernames', () => {
      expect(validateUsernameUpdate('test_user')).toEqual({ ok: true, value: 'test_user' });
      expect(validateUsernameUpdate('user123')).toEqual({ ok: true, value: 'user123' });
    });

    it('should fail for invalid usernames', () => {
      expect(validateUsernameUpdate('ab')).toMatchObject({ ok: false });
      expect(validateUsernameUpdate('Invalid Characters!')).toMatchObject({ ok: false });
      expect(validateUsernameUpdate('')).toMatchObject({ ok: false });
    });
  });

  describe('isValidUuid', () => {
    it('should return true for valid UUIDs', () => {
      expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should return false for invalid UUIDs', () => {
      expect(isValidUuid('not-a-uuid')).toBe(false);
    });
  });

  describe('isValidReviewEntityId', () => {
    it('should return true for valid entity IDs (UUID, Spotify, LFM)', () => {
      expect(isValidReviewEntityId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidReviewEntityId('2nLhD10Z7Sb4RFyCX2ZCyx')).toBe(true);
      expect(isValidReviewEntityId('lfm:0123456789abcdef')).toBe(true);
    });

    it('should return false for invalid entity IDs', () => {
      expect(isValidReviewEntityId('too-short')).toBe(false);
      expect(isValidReviewEntityId('')).toBe(false);
      expect(isValidReviewEntityId('a'.repeat(65))).toBe(false);
    });
  });
});
