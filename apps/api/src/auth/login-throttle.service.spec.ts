import type { AppConfig } from '../config/configuration';
import { LoginThrottleService } from './login-throttle.service';

function makeThrottle(
  maxAttempts = 3,
  lockSeconds = 900,
): LoginThrottleService {
  const config = {
    loginMaxAttempts: maxAttempts,
    loginLockSeconds: lockSeconds,
  };
  return new LoginThrottleService(config as AppConfig);
}

describe('LoginThrottleService', () => {
  it('does not lock before the threshold', () => {
    const throttle = makeThrottle(3);
    throttle.recordFailure('admin');
    throttle.recordFailure('admin');
    expect(throttle.retryAfterSeconds('admin')).toBe(0);
  });

  it('locks after reaching the max attempts', () => {
    const throttle = makeThrottle(3, 900);
    throttle.recordFailure('admin');
    throttle.recordFailure('admin');
    throttle.recordFailure('admin');
    expect(throttle.retryAfterSeconds('admin')).toBeGreaterThan(0);
    expect(throttle.retryAfterSeconds('admin')).toBeLessThanOrEqual(900);
  });

  it('is case-insensitive on the username', () => {
    const throttle = makeThrottle(2);
    throttle.recordFailure('Admin');
    throttle.recordFailure('admin');
    expect(throttle.retryAfterSeconds('ADMIN')).toBeGreaterThan(0);
  });

  it('resets the counter on success', () => {
    const throttle = makeThrottle(2);
    throttle.recordFailure('admin');
    throttle.recordFailure('admin');
    throttle.reset('admin');
    expect(throttle.retryAfterSeconds('admin')).toBe(0);
  });

  it('unlocks after the lock window elapses', () => {
    jest.useFakeTimers();
    try {
      const throttle = makeThrottle(1, 60);
      throttle.recordFailure('admin');
      expect(throttle.retryAfterSeconds('admin')).toBeGreaterThan(0);
      jest.advanceTimersByTime(61_000);
      expect(throttle.retryAfterSeconds('admin')).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
