export default {
    testEnvironment: 'node',
    transform: {},
    testMatch: [
        '**/__tests__/**/*.test.js',
        '**/?(*.)+(spec|test).js'
    ],
    collectCoverageFrom: [
        'server/**/*.js',
        'public/js/**/*.js',
        '!server/__tests__/**',
        '!server/node_modules/**',
        '!public/js/__tests__/**',
        '!public/js/**/*.min.js',
        '!public/js/**/vendor/**'
    ],
    coverageDirectory: 'coverage',
    verbose: true
};
