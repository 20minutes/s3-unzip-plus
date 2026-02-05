# S3 Unzip Plus #

[![Build status](https://github.com/20minutes/s3-unzip-plus/actions/workflows/tests.yml/badge.svg)](https://github.com/20minutes/s3-unzip-plus/actions/workflows/tests.yml)
[![NPM](https://img.shields.io/npm/v/@20minutes/s3-unzip-plus)](https://www.npmjs.com/package/@20minutes/s3-unzip-plus)

Forked version to:
- remove old AWS SDK v2
- add AWS SDK v3
- convert to async/await

For the official readme, check the [official project](https://github.com/akapuya/s3-unzip-plus).

### Install

```
yarn add @20minutes/s3-unzip-plus
```

Requires Node.js 22 or newer.

### Library Usage ###

```js
import s3UnzipPlus from '@20minutes/s3-unzip-plus'

await s3UnzipPlus({
  bucket: 'test-bucket-in-s3',
  file: 'Companies.zip',
  targetBucket: 'test-output-bucket',
  targetFolder: 'test-folder',
  copyMetadata: true,
  deleteOnSuccess: true,
  verbose: false
});
```
