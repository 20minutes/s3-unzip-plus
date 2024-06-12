/*
Copyright (c) 2017 Steve Yardumian

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

import { Upload } from '@aws-sdk/lib-storage'
import { S3 } from '@aws-sdk/client-s3'
import AdmZip from 'adm-zip'
import fs from 'fs'
import md5 from 'md5'
import mime from 'mime-types'

const s3 = new S3()

export const decompress = async (command) => {
  const targetBucket = command.targetBucket ?? command.bucket
  let targetFolder = command.targetFolder ?? ''
  if (targetFolder.length > 0) {
    targetFolder += '/'
  }

  if (!command.bucket || !command.file) {
    // bucket and file are required
    console.error('Error: missing either bucket name, full filename, targetBucket or targetKey!')

    return
  }

  try {
    const data = await s3.getObject({
      Bucket: command.bucket,
      Key: command.file,
    })

    if (command.verbose) {
      console.log(`Zip file '${command.file}' found in S3 bucket!`)
    }

    let metadata = {}
    if (command.copyMetadata) {
      metadata = data.Metadata
      console.log('zip metadata', metadata)
    }

    // write the zip file locally in a tmp dir
    const tmpZipFilename = md5(new Date().getTime())
    fs.writeFileSync(`/tmp/${tmpZipFilename}.zip`, Buffer.concat(await data.Body.toArray()))

    // check that file in that location is a zip content type, otherwise throw error and exit
    if (mime.lookup(`/tmp/${tmpZipFilename}.zip`) !== 'application/zip') {
      console.error('Error: file is not of type zip. Please select a valid file (filename.zip).')
      fs.unlinkSync(`/tmp/${tmpZipFilename}.zip`)

      return
    }

    let zipEntries = []
    let zipEntryCount = 0
    // find all files in the zip and the count of them
    try {
      const zip = new AdmZip(`/tmp/${tmpZipFilename}.zip`)
      zipEntries = zip.getEntries()
      zipEntryCount = Object.keys(zipEntries).length

      // if no files found in the zip
      if (zipEntryCount === 0) {
        console.error('Error: the zip file was empty!')
        fs.unlinkSync(`/tmp/${tmpZipFilename}.zip`)

        return
      }
    } catch (errZip) {
      console.error(errZip)
    }

    // for each file in the zip, decompress and upload it to S3; once all are uploaded, delete the tmp zip and zip on S3
    let counter = 0
    zipEntries.forEach(async (zipEntry) => {
      try {
        const dataUpload = await new Upload({
          client: s3,
          params: {
            Bucket: targetBucket,
            Key: targetFolder + zipEntry.entryName,
            Body: zipEntry.getData(),
            Metadata: metadata,
          },
        }).done()

        counter += 1

        if (command.verbose) {
          console.log(`File decompressed to S3: ${dataUpload.Location}`)
        }

        // if all files are unzipped...
        if (zipEntryCount === counter) {
          // delete the tmp (local) zip file
          fs.unlinkSync(`/tmp/${tmpZipFilename}.zip`)

          if (command.verbose) {
            console.log('Local temp zip file deleted.')
          }

          // delete the zip file up on S3
          if (command.deleteOnSuccess) {
            try {
              await s3.deleteObject({ Bucket: command.bucket, Key: command.file })

              if (command.verbose) {
                console.log(`S3 file '${command.file}' deleted.`)
              }

              console.log('Success!')
            } catch (errDelete) {
              console.error(`Delete Error: ${errDelete.message}`)
            }
          } else {
            console.log('Success!')
          }
        }
      } catch (errUpload) {
        console.error(`Upload Error: ${errUpload.message}`)
        fs.unlinkSync(`/tmp/${tmpZipFilename}.zip`)
      }
    })
  } catch (err) {
    console.error(`File Error: ${err.message}`)
  }
}
