/*
Copyright (c) 2018 Avi Kapuya

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { decompress } from './util.js'

export type DecompressOptions = {
  bucket?: string
  file?: string
  targetBucket?: string | null
  targetFolder?: string | null
  deleteOnSuccess?: boolean
  copyMetadata?: boolean
  verbose?: boolean
  region?: string | null
}

export type S3Event = {
  Records: Array<{
    s3: {
      bucket: { name: string }
      object: { key: string }
    }
  }>
}

export default async (options: DecompressOptions): Promise<void> => {
  const {
    bucket,
    file,
    targetBucket = null,
    targetFolder = null,
    deleteOnSuccess = false,
    copyMetadata = false,
    verbose = false,
    region = null,
  } = options

  await decompress({
    bucket,
    file,
    targetBucket: targetBucket ?? bucket,
    targetFolder: targetFolder ?? '',
    deleteOnSuccess: !!deleteOnSuccess,
    copyMetadata: !!copyMetadata,
    verbose: !!verbose,
    region,
  })
}

export const handler = async (event: S3Event): Promise<void> => {
  await decompress({
    bucket: event.Records[0].s3.bucket.name,
    file: event.Records[0].s3.object.key,
    deleteOnSuccess: true,
    verbose: true,
  })
}
