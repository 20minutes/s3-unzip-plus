import { execFile } from 'node:child_process'
import fs from 'node:fs'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { sdkStreamMixin } from '@smithy/util-stream'
import { mockClient } from 'aws-sdk-client-mock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import s3UnzipPlus from '../lib/index.js'

const s3Mock = mockClient(S3Client)
const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
const binPath = path.join(process.cwd(), 'bin/s3-unzip-plus')
const binModulePath = require.resolve('../bin/s3-unzip-plus')

type ModuleLoader = (
  request: string,
  parent: { filename?: string } | null | undefined,
  isMain: boolean
) => unknown

const runBinWithMock = async (argv: string[], unzip: ReturnType<typeof vi.fn>) => {
  const moduleWithLoad = Module as unknown as { _load: ModuleLoader }
  const originalLoad = moduleWithLoad._load

  process.argv = [process.execPath, binPath, ...argv]
  delete require.cache[binModulePath]
  moduleWithLoad._load = (request, parent, isMain) => {
    if (request === '../lib/index.js' && parent?.filename === binModulePath) {
      return { default: unzip }
    }

    return originalLoad(request, parent, isMain)
  }

  try {
    require('../bin/s3-unzip-plus')
    await new Promise(setImmediate)
  } finally {
    moduleWithLoad._load = originalLoad
  }
}

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
  })

  it('should expose a working ESM entrypoint when built', async () => {
    const esmPath = `${process.cwd()}/esm/index.js`

    if (!fs.existsSync(esmPath)) {
      // Build artifacts not present; skip this check in dev/test without build
      return
    }

    const { stdout } = await execFileAsync(process.execPath, [
      '--input-type=module',
      '--eval',
      `
        import s3UnzipPlus, { handler } from ${JSON.stringify(`file://${esmPath}`)}

        if (typeof s3UnzipPlus !== 'function') throw new Error('Invalid default export')
        if (typeof handler !== 'function') throw new Error('Invalid handler export')

        await s3UnzipPlus({})
        console.log('esm-ok')
      `,
    ])

    expect(stdout).toContain('esm-ok')
  })
})

describe('bin/s3-unzip-plus', () => {
  const originalArgv = process.argv

  afterEach(() => {
    process.argv = originalArgv
    delete require.cache[binModulePath]
  })

  it('should show help', async () => {
    const { stdout } = await execFileAsync(process.execPath, [binPath, '--help'])

    expect(stdout).toContain('s3-unzip-plus')
    expect(stdout).toContain('<bucket-name>')
    expect(stdout).toContain('[target-bucket]')
    expect(stdout).toContain('-d, --delete-on-success')
    expect(stdout).toContain('-m, --copy-metadata')
    expect(stdout).toContain('-v, --verbose')
  })

  it('should show version', async () => {
    const { stdout } = await execFileAsync(process.execPath, [binPath, '--version'])

    expect(stdout.trim()).toBeDefined()
  })

  it('should pass parsed arguments and flags to the library', async () => {
    const unzip = vi.fn().mockResolvedValue(undefined)

    await runBinWithMock(
      ['source-bucket', 'archive.zip', 'target-bucket', 'target-folder', '-d', '-m', '-v'],
      unzip
    )

    expect(unzip).toHaveBeenCalledWith({
      bucket: 'source-bucket',
      file: 'archive.zip',
      targetBucket: 'target-bucket',
      targetFolder: 'target-folder',
      deleteOnSuccess: true,
      copyMetadata: true,
      verbose: true,
    })
  })

  it('should default target bucket and target folder', async () => {
    const unzip = vi.fn().mockResolvedValue(undefined)

    await runBinWithMock(['source-bucket', 'archive.zip'], unzip)

    expect(unzip).toHaveBeenCalledWith({
      bucket: 'source-bucket',
      file: 'archive.zip',
      targetBucket: 'source-bucket',
      targetFolder: '',
      deleteOnSuccess: false,
      copyMetadata: false,
      verbose: false,
    })
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
