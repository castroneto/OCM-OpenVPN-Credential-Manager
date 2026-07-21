import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/configuration';

interface AttemptState {
  count: number;
  lockedUntil: number;
}

/**
 * In-memory brute-force guard: after `loginMaxAttempts` consecutive failures
 * for a username, logins are locked for `loginLockSeconds`. State is per
 * process (resets on restart) and keyed by username — deliberately simple.
 */
@Injectable()
export class LoginThrottleService {
  private readonly attempts = new Map<string, AttemptState>();

  constructor(private readonly config: AppConfig) {}

  private key(username: string): string {
    return username.trim().toLowerCase();
  }

  /** Seconds until the account may try again, or 0 if not locked. */
  retryAfterSeconds(username: string): number {
    const state = this.attempts.get(this.key(username));
    if (!state) return 0;
    const remainingMs = state.lockedUntil - Date.now();
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  }

  recordFailure(username: string): void {
    const key = this.key(username);
    const state = this.attempts.get(key) ?? { count: 0, lockedUntil: 0 };
    state.count += 1;
    if (state.count >= this.config.loginMaxAttempts) {
      state.lockedUntil = Date.now() + this.config.loginLockSeconds * 1000;
      state.count = 0;
    }
    this.attempts.set(key, state);
  }

  reset(username: string): void {
    this.attempts.delete(this.key(username));
  }
}
