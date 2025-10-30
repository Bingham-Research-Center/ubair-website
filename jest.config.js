export default {
    testEnvironment: 'node',
    transform: {},
    testMatch: [
        '**/__tests__/**/*.test.js',
        '**/?(*.)+(spec|test).js'
    ],
    collectCoverageFrom: [
        'server/**/*.js',
        '!server/__tests__/**',
        '!server/node_modules/**'
    ],
    coverageDirectory: 'coverage',
    verbose: true
};
