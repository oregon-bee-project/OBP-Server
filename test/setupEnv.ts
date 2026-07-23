// Runs before every test file (see vitest.config.ts `setupFiles`).
//
// shared/lib/config/environment.js reads (and requires) these variables the
// moment it is imported, and nearly every module imports it transitively.
// Providing dummy values here lets tests import application code without a
// populated .env file. No test talks to a real Mongo, RabbitMQ, or iNaturalist.
process.env.MONGO_USER ??= 'test'
process.env.MONGO_PASSWORD ??= 'test'
process.env.ADMIN_USERNAME ??= 'test-admin'
process.env.ADMIN_PASSWORD ??= 'test-password'
process.env.JWT_SECRET ??= 'test-jwt-secret'
process.env.TOKEN_ENCRYPTION_SECRET ??= 'test-token-secret'
process.env.TOKEN_ENCRYPTION_SALT ??= 'test-token-salt'
