import type { AstNode } from './types'

export const child = (node: AstNode, key: string): AstNode | undefined => {
  const value = node[key]
  return typeof value === 'object' && value !== null && 'type' in value
    ? (value as AstNode)
    : undefined
}

export const children = (node: AstNode, key: string): readonly AstNode[] => {
  const value = node[key]
  return Array.isArray(value)
    ? value.filter(
        (item): item is AstNode => typeof item === 'object' && item !== null && 'type' in item,
      )
    : []
}

export const nameOf = (node: AstNode | undefined): string | undefined => {
  if (node === undefined) return undefined
  const name = node.name
  if (typeof name === 'string') return name
  const value = node.value
  return typeof value === 'string' ? value : undefined
}

export const importSource = (node: AstNode): string | undefined => nameOf(child(node, 'source'))

export const importedName = (specifier: AstNode): string | undefined =>
  nameOf(child(specifier, 'imported'))

export const localName = (specifier: AstNode): string | undefined =>
  nameOf(child(specifier, 'local'))

export const memberName = (node: AstNode): string | undefined => {
  if (node.type !== 'MemberExpression') return undefined
  return nameOf(child(node, 'property'))
}
