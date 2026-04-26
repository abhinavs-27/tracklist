import { describe, it, expect, vi } from 'vitest';
import {
  apiOk,
  apiError,
  apiUnauthorized,
  apiNotFound,
  apiBadRequest,
  apiInternalError,
  apiBadGateway,
  apiServiceUnavailable,
} from './api-response';

describe('api-response helpers', () => {
  it('apiOk returns a 200 response with the provided data', async () => {
    const data = { foo: 'bar' };
    const response = apiOk(data);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(data);
  });

  it('apiError returns a JSON response with error and status code', async () => {
    const response = apiError('Fail', 418);
    expect(response.status).toBe(418);
    const body = await response.json();
    expect(body).toEqual({ error: 'Fail' });
  });

  it('apiUnauthorized returns 401', async () => {
    const response = apiUnauthorized();
    expect(response.status).toBe(401);
  });

  it('apiNotFound returns 404', async () => {
    const response = apiNotFound();
    expect(response.status).toBe(404);
  });

  it('apiBadRequest returns 400', async () => {
    const response = apiBadRequest('Bad Input');
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Bad Input');
  });

  it('apiInternalError returns 500 and suppresses real error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = apiInternalError(new Error('Sensitive database detail'));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Something went wrong. Please try again.");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('apiBadGateway returns 502', async () => {
    const response = apiBadGateway();
    expect(response.status).toBe(502);
  });

  it('apiServiceUnavailable returns 503', async () => {
    const response = apiServiceUnavailable('Syncing', { code: 'catalog_pending' });
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe('Syncing');
    expect(body.code).toBe('catalog_pending');
  });
});
