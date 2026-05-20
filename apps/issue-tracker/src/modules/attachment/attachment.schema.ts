import { BadInput } from '../../errors/domain'

export type CreateAttachmentInput = {
  uploaderId: string
  filename: string
  url: string
  size: number
}

export const parseCreate = (raw: unknown): CreateAttachmentInput => {
  if (typeof raw !== 'object' || raw === null) throw new BadInput(['expected object'])
  const r = raw as Record<string, unknown>
  const issues: string[] = []
  if (typeof r['uploaderId'] !== 'string') issues.push('uploaderId: required string')
  if (typeof r['filename']   !== 'string') issues.push('filename: required string')
  if (typeof r['url']        !== 'string') issues.push('url: required string')
  if (typeof r['size']       !== 'number') issues.push('size: required number')
  if (issues.length) throw new BadInput(issues)
  return {
    uploaderId: r['uploaderId'] as string,
    filename:   r['filename'] as string,
    url:        r['url'] as string,
    size:       r['size'] as number,
  }
}
