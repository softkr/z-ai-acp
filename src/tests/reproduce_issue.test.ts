
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyEnvironmentSettings } from '../utils.js';

describe('Environment Variable Precedence', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should respect existing environment variables over managed settings', () => {
        // Set env var
        process.env.ANTHROPIC_AUTH_TOKEN = 'env_key';

        // Define settings that would overwrite it
        const settings = {
            env: {
                ANTHROPIC_AUTH_TOKEN: 'file_key'
            }
        };

        applyEnvironmentSettings(settings);

        // Expect env var to remain 'env_key'
        // This will FAIL currently if the bug exists
        expect(process.env.ANTHROPIC_AUTH_TOKEN).toBe('env_key');
    });

    it('should apply managed settings if env var is missing', () => {
        // Ensure env var is missing
        delete process.env.ANTHROPIC_AUTH_TOKEN;

        const settings = {
            env: {
                ANTHROPIC_AUTH_TOKEN: 'file_key'
            }
        };

        applyEnvironmentSettings(settings);

        expect(process.env.ANTHROPIC_AUTH_TOKEN).toBe('file_key');
    });
});
