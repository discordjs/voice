module.exports = {
	testMatch: ['**/+(*.)+(spec|test).+(ts|js)?(x)'],
	testEnvironment: 'node',
	collectCoverage: true,
	collectCoverageFrom: [
		'src/**/*.ts',
		'!src/**/__tests__'
	],
	coverageProvider: 'v8',
	coverageDirectory: 'coverage',
	coverageReporters: ['text', 'lcov', 'clover']
};
