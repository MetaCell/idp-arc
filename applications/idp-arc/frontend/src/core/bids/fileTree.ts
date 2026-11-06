/** One line of a folder tree: its depth, name, and whether it is a folder. */
export interface TreeLine {
  depth: number
  name: string
  folder: boolean
}

/** `/`-separated paths as a sorted folder tree, folders before files at each level. */
export function fileTree(paths: string[]): TreeLine[] {
  interface Node { children: Map<string, Node>; file: boolean }
  const root: Node = { children: new Map(), file: false }
  for (const path of paths) {
    let node = root
    path.split('/').forEach((part, i, parts) => {
      let child = node.children.get(part)
      if (!child) node.children.set(part, child = { children: new Map(), file: false })
      if (i === parts.length - 1) child.file = true
      node = child
    })
  }
  const lines: TreeLine[] = []
  const walk = (node: Node, depth: number) => {
    const entries = [...node.children].sort(([a, x], [b, y]) =>
      Number(x.file && !x.children.size) - Number(y.file && !y.children.size) || a.localeCompare(b))
    for (const [name, child] of entries) {
      const folder = child.children.size > 0
      lines.push({ depth, name: folder ? `${name}/` : name, folder })
      if (folder) walk(child, depth + 1)
    }
  }
  walk(root, 0)
  return lines
}
