
import { applyEnvironmentSettings } from './src/utils.js';
import { strict as assert } from 'assert';

console.log('Running reproduction test for environment variable precedence...');

// Save original env
const originalEnv = { ...process.env };

try {
    // Scenario 1: Env var is set, Managed Settings has different value
    // Expected behavior: Env var should NOT be overwritten
    // Current behavior (bug): Env var IS overwritten

    process.env.ANTHROPIC_AUTH_TOKEN = 'env_key';
    const settings = {
        env: {
            ANTHROPIC_AUTH_TOKEN: 'file_key'
        }
    };

    applyEnvironmentSettings(settings);

    console.log(`Env value: ${process.env.ANTHROPIC_AUTH_TOKEN}`);
    console.log(`File value: ${settings.env.ANTHROPIC_AUTH_TOKEN}`);

    if (process.env.ANTHROPIC_AUTH_TOKEN === 'env_key') {
        console.log('✅ PASS: Environment variable was preserved.');
    } else {
        console.log('❌ FAIL: Environment variable was overwritten.');
        process.exit(1);
    }

} finally {
    // Restore env
    process.env = originalEnv;
}
