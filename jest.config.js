/** @type {import('jest').Config} */
const config = {
  verbose: true,
  testEnvironment: 'node',
  watchman: false,
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.jest.json',
      },
    ],
  },
}

module.exports = config
