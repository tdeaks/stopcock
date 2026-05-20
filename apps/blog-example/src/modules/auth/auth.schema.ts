import { BadInput } from '../../errors/domain'

export type LoginInput = { email: string; password: string }
export type LoginOutput = { token: string }

export const parseLogin = (raw: unknown): LoginInput => {
  if (typeof raw !== 'object' || raw === null) throw new BadInput(['expected object'])
  const r = raw as Record<string, unknown>
  const issues: string[] = []
  if (typeof r['email']    !== 'string') issues.push('email: required string')
  if (typeof r['password'] !== 'string') issues.push('password: required string')
  if (issues.length) throw new BadInput(issues)
  return { email: r['email'] as string, password: r['password'] as string }
}
