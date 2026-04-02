import { describe, it, expect } from 'vitest';
import { buildLogRequestBody } from './build-log-request-body';
import type { LogInput } from './types';

describe('buildLogRequestBody', () => {
  it('should build a basic log request body with trackId and source', () => {
    const input: LogInput = {
      trackId: 'track-123',
      source: 'spotify',
    };
    const result = buildLogRequestBody(input);
    expect(result).toEqual({
      track_id: 'track-123',
      source: 'spotify',
    });
  });

  it('should include optional fields if provided', () => {
    const input: LogInput = {
      trackId: 'track-123',
      source: 'manual',
      albumId: 'album-456',
      artistId: 'artist-789',
      note: '  Loving this track!  ',
      listenedAt: '2023-10-27T10:00:00Z',
    };
    const result = buildLogRequestBody(input);
    expect(result).toEqual({
      track_id: 'track-123',
      source: 'manual',
      album_id: 'album-456',
      artist_id: 'artist-789',
      note: 'Loving this track!',
      listened_at: '2023-10-27T10:00:00Z',
    });
  });

  it('should exclude note if it is empty or whitespace only', () => {
    const input: LogInput = {
      trackId: 'track-123',
      source: 'spotify',
      note: '   ',
    };
    const result = buildLogRequestBody(input);
    expect(result).not.toHaveProperty('note');
  });

  it('should exclude optional IDs if not provided', () => {
    const input: LogInput = {
      trackId: 'track-123',
      source: 'spotify',
    };
    const result = buildLogRequestBody(input);
    expect(result).not.toHaveProperty('album_id');
    expect(result).not.toHaveProperty('artist_id');
  });
});
