import fs from 'fs'
import { Readable } from 'stream'
import { sdkStreamMixin } from '@smithy/util-stream'
import { mockClient } from 'aws-sdk-client-mock'
import 'aws-sdk-client-mock-jest'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import s3UnzipPlus from '../src'

const s3Mock = mockClient(S3Client)

const createBody = (path: string) => {
  const stream = Readable.from([fs.readFileSync(path)])
  return sdkStreamMixin(stream)
}

describe('build outputs', () => {
  it('should expose CJS and ESM entrypoints when built', async () => {
    const cjsPath = `${process.cwd()}/lib/index.js`
    const esmPath = `${process.cwd()}/esm/index.js`

    const hasCjs = fs.existsSync(cjsPath)
    const hasEsm = fs.existsSync(esmPath)
    if (!hasCjs || !hasEsm) {
      // Build artifacts not present; skip this check in dev/test without build
      return
    }

    const cjsSource = fs.readFileSync(cjsPath, 'utf8')
    const esmSource = fs.readFileSync(esmPath, 'utf8')

    expect(cjsSource).toMatch(/\bexports\./)
    expect(cjsSource).not.toMatch(/\bexport\s+/)
    expect(esmSource).toMatch(/\bexport\s+/)
    expect(esmSource).not.toMatch(/\bmodule\.exports\b|\bexports\./)

    // CJS require
    const cjsModule = require(cjsPath)
    expect(typeof cjsModule.default).toBe('function')
    expect(typeof cjsModule.handler).toBe('function')

    // ESM format is validated by source checks above; Jest runs in CJS.
  })
})

describe('s3-unzip-plus', () => {
  beforeEach(() => {
    s3Mock.reset()
  })

  it('should do the job', async () => {
    s3Mock
      .on(GetObjectCommand, {
        Bucket: 'test-bucket-in-s3',
        Key: 'Companies.zip',
      })
      .resolves({
        Body: createBody('tests/fixtures/t.zip'),
        Metadata: {
          Expires: 'Wed, 21 Oct 2015 07:28:00 GMT',
        },
      })
    s3Mock.on(PutObjectCommand).resolves({})
    s3Mock.on(DeleteObjectCommand).resolves({})

    await s3UnzipPlus({
      region: 'eu-west-1',
      bucket: 'test-bucket-in-s3',
      file: 'Companies.zip',
      targetBucket: 'test-output-bucket',
      targetFolder: 'test-folder',
      copyMetadata: true,
      deleteOnSuccess: true,
      verbose: true,
    })

    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 1)
    expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
      Bucket: 'test-bucket-in-s3',
      Key: 'Companies.zip',
    })
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 1)
    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: 'test-output-bucket',
      Key: 'test-folder/t.conf',
      Metadata: { Expires: 'Wed, 21 Oct 2015 07:28:00 GMT' },
    })
    expect(s3Mock).toHaveReceivedCommandTimes(DeleteObjectCommand, 1)
    expect(s3Mock).toHaveReceivedCommandWith(DeleteObjectCommand, {
      Bucket: 'test-bucket-in-s3',
      Key: 'Companies.zip',
    })
  })

  it('should do the job without metadata', async () => {
    s3Mock
      .on(GetObjectCommand, {
        Bucket: 'test-bucket-in-s3',
        Key: 'Companies.zip',
      })
      .resolves({
        Body: createBody('tests/fixtures/t.zip'),
        Metadata: {
          Expires: 'Wed, 21 Oct 2015 07:28:00 GMT',
        },
      })
    s3Mock.on(PutObjectCommand).resolves({})
    s3Mock.on(DeleteObjectCommand).resolves({})

    await s3UnzipPlus({
      region: 'eu-west-1',
      bucket: 'test-bucket-in-s3',
      file: 'Companies.zip',
      targetBucket: 'test-output-bucket',
      targetFolder: 'test-folder',
      copyMetadata: false,
      deleteOnSuccess: true,
      verbose: true,
    })

    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 1)
    expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
      Bucket: 'test-bucket-in-s3',
      Key: 'Companies.zip',
    })
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 1)
    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: 'test-output-bucket',
      Key: 'test-folder/t.conf',
      Metadata: {},
    })
    expect(s3Mock).toHaveReceivedCommandTimes(DeleteObjectCommand, 1)
    expect(s3Mock).toHaveReceivedCommandWith(DeleteObjectCommand, {
      Bucket: 'test-bucket-in-s3',
      Key: 'Companies.zip',
    })
  })

  it('should do the job and delete zip file', async () => {
    s3Mock
      .on(GetObjectCommand, {
        Bucket: 'test-bucket-in-s3',
        Key: 'Companies.zip',
      })
      .resolves({
        Body: createBody('tests/fixtures/t.zip'),
        Metadata: {
          Expires: 'Wed, 21 Oct 2015 07:28:00 GMT',
        },
      })
    s3Mock.on(PutObjectCommand).resolves({})

    await s3UnzipPlus({
      region: 'eu-west-1',
      bucket: 'test-bucket-in-s3',
      file: 'Companies.zip',
      targetBucket: 'test-output-bucket',
      targetFolder: 'test-folder',
      copyMetadata: false,
      deleteOnSuccess: false,
      verbose: true,
    })

    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 1)
    expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
      Bucket: 'test-bucket-in-s3',
      Key: 'Companies.zip',
    })
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 1)
    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: 'test-output-bucket',
      Key: 'test-folder/t.conf',
      Metadata: {},
    })
    expect(s3Mock).toHaveReceivedCommandTimes(DeleteObjectCommand, 0)
  })

  it('should do the job by targetting same bucket', async () => {
    s3Mock
      .on(GetObjectCommand, {
        Bucket: 'test-bucket-in-s3',
        Key: 'Companies.zip',
      })
      .resolves({
        Body: createBody('tests/fixtures/t.zip'),
        Metadata: {
          Expires: 'Wed, 21 Oct 2015 07:28:00 GMT',
        },
      })
    s3Mock.on(PutObjectCommand).resolves({})

    await s3UnzipPlus({
      region: 'eu-west-1',
      bucket: 'test-bucket-in-s3',
      file: 'Companies.zip',
      targetFolder: 'test-folder',
      copyMetadata: false,
      deleteOnSuccess: false,
      verbose: true,
    })

    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 1)
    expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
      Bucket: 'test-bucket-in-s3',
      Key: 'Companies.zip',
    })
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 1)
    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: 'test-bucket-in-s3',
      Key: 'test-folder/t.conf',
      Metadata: {},
    })
    expect(s3Mock).toHaveReceivedCommandTimes(DeleteObjectCommand, 0)
  })

  it('should do the job by targetting same bucket without target folder', async () => {
    s3Mock
      .on(GetObjectCommand, {
        Bucket: 'test-bucket-in-s3',
        Key: 'Companies.zip',
      })
      .resolves({
        Body: createBody('tests/fixtures/t.zip'),
        Metadata: {
          Expires: 'Wed, 21 Oct 2015 07:28:00 GMT',
        },
      })
    s3Mock.on(PutObjectCommand).resolves({})

    await s3UnzipPlus({
      region: 'eu-west-1',
      bucket: 'test-bucket-in-s3',
      file: 'Companies.zip',
      copyMetadata: false,
      deleteOnSuccess: false,
      verbose: true,
    })

    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 1)
    expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
      Bucket: 'test-bucket-in-s3',
      Key: 'Companies.zip',
    })
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 1)
    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: 'test-bucket-in-s3',
      Key: 't.conf',
      Metadata: {},
    })
    expect(s3Mock).toHaveReceivedCommandTimes(DeleteObjectCommand, 0)
  })

  it('should fail because no bucket nor zip file', async () => {
    await s3UnzipPlus({
      region: 'eu-west-1',
      copyMetadata: false,
      deleteOnSuccess: false,
      verbose: true,
    })
  })

  it('should fail because no bucket', async () => {
    await s3UnzipPlus({
      region: 'eu-west-1',
      file: 'Companies.zip',
      copyMetadata: false,
      deleteOnSuccess: false,
      verbose: true,
    })
  })

  it('should fail because no zip file', async () => {
    await s3UnzipPlus({
      region: 'eu-west-1',
      bucket: 'test-bucket-in-s3',
      copyMetadata: false,
      deleteOnSuccess: false,
      verbose: true,
    })
  })
})
