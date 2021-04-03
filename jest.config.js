module.exports = {
	testMatch: ['**/+(*.)+(spec|test).+(ts|js)?(x)'],
	testEnvironment: 'node',
	collectCoverage: true,
	collectCoverageFrom: ['src/**/*.ts', '!src/**/__tests__/**/*.ts'],
	coverageDirectory: 'coverage',
	coverageReporters: ['text', 'lcov', 'clover'],
};
