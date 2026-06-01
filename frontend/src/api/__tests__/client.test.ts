import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request } from '../client';

describe('API client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns JSON on successful response', async () => {
    const mockData = { id: 1, name: 'test' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    }));

    const result = await request('/test');
    expect(result).toEqual(mockData);
  });

  it('throws on 4xx errors without retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }));

    await expect(request('/not-found')).rejects.toThrow('API 404: /not-found');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx errors with exponential backoff', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    const promise = request('/flaky');

    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws after max retries exhausted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }));

    const promise = request('/down').catch((e: Error) => e);

    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(100);

    const error = await promise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('API 503: /down');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('retries on network errors', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ recovered: true }) });
    vi.stubGlobal('fetch', fetchMock);

    const promise = request('/network-issue');
    await vi.advanceTimersByTimeAsync(500);

    const result = await promise;
    expect(result).toEqual({ recovered: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
