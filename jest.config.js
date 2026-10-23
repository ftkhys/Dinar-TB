module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  testEnvironment: 'node',
  // scrypt (N=131072) is intentionally expensive; under parallel load a single
  // password hash can exceed Jest's 5s default and fail a passing test.
  testTimeout: 30000,
  transform: { '^.+\\.(t|j)sx?$': 'ts-jest' },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: './coverage',
};
