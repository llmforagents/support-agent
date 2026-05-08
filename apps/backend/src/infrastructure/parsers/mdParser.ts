import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { toString } from 'mdast-util-to-string'
import type { Heading, Root, RootContent } from 'mdast'
import { Ok, type Result, type IngestError } from '@support/shared'
import { chunkText } from '../../application/kb/chunker'
import type { RawChunk } from '../../domain/source'

type Section = { readonly headings: readonly string[]; readonly body: string }

export function parseMd(text: string): Result<readonly RawChunk[], IngestError> {
  const tree = unified().use(remarkParse).parse(text) as Root
  const sections: Section[] = []
  let currentHeadings: string[] = []
  let currentBody: string[] = []

  function flush(): void {
    const body = currentBody.join('\n\n').trim()
    if (body.length > 0) {
      sections.push({ headings: [...currentHeadings], body })
    }
    currentBody = []
  }

  for (const node of tree.children as RootContent[]) {
    if (node.type === 'heading') {
      flush()
      const h = node as Heading
      const headingText = toString(h)
      // Reset chain to depth-1 length, then add this heading
      currentHeadings = currentHeadings.slice(0, h.depth - 1)
      currentHeadings.push(headingText)
    } else {
      currentBody.push(toString(node))
    }
  }
  flush()

  const out: RawChunk[] = []
  for (const s of sections) {
    const prefix = s.headings.length > 0 ? s.headings.join(' > ') : undefined
    const chunks = chunkText(
      s.body,
      { maxTokens: 500, overlapTokens: 50, ...(prefix !== undefined ? { prefix } : {}) },
      { headings: s.headings },
    )
    out.push(...chunks)
  }
  return Ok(out)
}
