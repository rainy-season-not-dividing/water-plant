import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNetworkStatus } from '../useNetworkStatus';

describe('useNetworkStatus', () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');

  afterEach(() => {
    if (originalOnLine) {
      Object.defineProperty(Navigator.prototype, 'onLine', originalOnLine);
    }
  });

  it('returns true when online', () => {
    Object.defineProperty(Navigator.prototype, 'onLine', { get: () => true, configurable: true });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);
  });

  it('returns false when offline', () => {
    Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false, configurable: true });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(false);
  });

  it('updates when going offline', () => {
    Object.defineProperty(Navigator.prototype, 'onLine', { get: () => true, configurable: true });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);

    act(() => {
      Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.isOnline).toBe(false);
  });

  it('updates when going online', () => {
    Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false, configurable: true });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(false);

    act(() => {
      Object.defineProperty(Navigator.prototype, 'onLine', { get: () => true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.isOnline).toBe(true);
  });
});
