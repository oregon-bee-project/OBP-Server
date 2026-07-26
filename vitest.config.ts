import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: [
            'shared/lib/**/*.test.{js,ts}',
            'server/src/**/*.test.{js,ts}',
            'worker/src/**/*.test.{js,ts}',
        ],
        setupFiles: ['./test/setupEnv.ts'],
    },
})
