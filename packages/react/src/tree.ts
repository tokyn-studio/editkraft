import type { Block, PageContent } from "@editkraft/schema";

/**
 * Reine Blocktree-Utilities für die Preview-Bridge (rekursiv, immutable).
 * Getrennt von der Client-Komponente, damit sie server- und testbar sind.
 */

/** Ersetzt (merged) die props des Blocks mit `blockId`; unverändert, wenn nicht gefunden. */
export function updateBlockProps(
  content: PageContent,
  blockId: string,
  props: Record<string, unknown>,
): PageContent {
  const walk = (blocks: Block[]): Block[] =>
    blocks.map((b) => {
      if (b.id === blockId) return { ...b, props: { ...b.props, ...props } };
      if (b.children && b.children.length > 0) return { ...b, children: walk(b.children) };
      return b;
    });
  return { ...content, blocks: walk(content.blocks) };
}

/** Findet einen Block per id (rekursiv). */
export function findBlock(content: PageContent, blockId: string): Block | null {
  const walk = (blocks: Block[]): Block | null => {
    for (const b of blocks) {
      if (b.id === blockId) return b;
      if (b.children) {
        const found = walk(b.children);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(content.blocks);
}
