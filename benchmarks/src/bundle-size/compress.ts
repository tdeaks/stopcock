import { createHash } from 'node:crypto'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { minify } from 'terser'
import {
  FP_CONSUMER_COMPRESSION,
  FP_CONSUMER_MINIFIER,
} from '../reference/fp-consumer-size-contract'

export interface CompressedConsumerArtifact {
  readonly rawCode: string
  readonly minifiedCode: string
  readonly rawSha256: string
  readonly minifiedSha256: string
  readonly rawBytes: number
  readonly minifiedBytes: number
  readonly gzipBytes: number
  readonly brotliBytes: number
}

export const sha256 = (value: string | Uint8Array): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

export const compressConsumerArtifact = async (
  rawCode: string,
): Promise<CompressedConsumerArtifact> => {
  const minified = await minify(rawCode, {
    ecma: FP_CONSUMER_MINIFIER.options.ecma,
    module: FP_CONSUMER_MINIFIER.options.module,
    toplevel: FP_CONSUMER_MINIFIER.options.toplevel,
    mangle: {
      toplevel: FP_CONSUMER_MINIFIER.options.mangle.toplevel,
    },
    compress: {
      passes: FP_CONSUMER_MINIFIER.options.compress.passes,
    },
    format: {
      comments: FP_CONSUMER_MINIFIER.options.format.comments,
    },
  })
  if (typeof minified.code !== 'string' || minified.code.length === 0) {
    throw new Error('Terser produced no executable JavaScript')
  }
  const minifiedCode = minified.code
  return {
    rawCode,
    minifiedCode,
    rawSha256: sha256(rawCode),
    minifiedSha256: sha256(minifiedCode),
    rawBytes: Buffer.byteLength(rawCode),
    minifiedBytes: Buffer.byteLength(minifiedCode),
    gzipBytes: gzipSync(minifiedCode, {
      level: FP_CONSUMER_COMPRESSION.gzip.level,
    }).byteLength,
    brotliBytes: brotliCompressSync(minifiedCode, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: FP_CONSUMER_COMPRESSION.brotli.quality,
      },
    }).byteLength,
  }
}
