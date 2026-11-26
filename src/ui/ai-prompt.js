// @ts-check

/**
 * The prompt for asking an AI chat to write a deck. It must stay identical to the
 * prompt at the end of docs/deck-format.md.
 */
export const AI_PROMPT = `Make a flashcard deck about <TOPIC> in this exact Markdown format.

Rules:
- Start with front matter:
  ---
  deck: <Group> / <Deck name>
  tags: [tag1, tag2]
  ---
- Each card starts with "## " followed by the question (the front).
- The answer (the back) goes on the lines below, until the next "## ".
- For a term you should know both ways, write a single line
  "## Term <-> Definition" with nothing under it.
- To put a diagram or extra lines on the front, add a line "---" inside
  the card: above it is the front, below it the back.
- Diagrams go in \`\`\`mermaid fenced blocks.
- Keep each back short: one idea, a sentence or a short list.
- Write each paragraph on one line; line breaks are kept on the card.
- Use **bold** for the key word of the answer.
- Write <NUMBER> cards. Reply with only the deck, in one code block.`;
