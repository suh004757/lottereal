/**
 * Listing descriptions may use a small markdown subset:
 * `## ` heading, `- ` bullet, `**bold**`, blank line between paragraphs.
 * Everything is built with createElement/textContent, never innerHTML,
 * so text from the database can not inject markup.
 */

const HEADING = /^##\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;

function parseBlocks(text) {
  const blocks = [];
  let paragraph = null;
  let list = null;
  const flush = () => { paragraph = null; list = null; };

  String(text || '').replace(/\r\n?/g, '\n').split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) return flush();
    const heading = line.match(HEADING);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', text: heading[1] });
      return;
    }
    const bullet = line.match(BULLET);
    if (bullet) {
      paragraph = null;
      if (!list) {
        list = { type: 'list', items: [] };
        blocks.push(list);
      }
      list.items.push(bullet[1]);
      return;
    }
    list = null;
    if (paragraph) {
      paragraph.lines.push(line);
    } else {
      paragraph = { type: 'paragraph', lines: [line] };
      blocks.push(paragraph);
    }
  });
  return blocks;
}

function appendInline(doc, parent, text) {
  // Split on **bold** pairs; an unmatched ** stays as literal text.
  String(text).split(/(\*\*[^*]+\*\*)/).forEach((part) => {
    if (!part) return;
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      const strong = doc.createElement('strong');
      strong.textContent = part.slice(2, -2);
      parent.appendChild(strong);
    } else {
      parent.appendChild(doc.createTextNode(part));
    }
  });
}

export function renderListingDescription(container, text, doc = globalThis.document) {
  container.replaceChildren();
  parseBlocks(text).forEach((block) => {
    if (block.type === 'heading') {
      const heading = doc.createElement('h3');
      appendInline(doc, heading, block.text);
      container.appendChild(heading);
    } else if (block.type === 'list') {
      const list = doc.createElement('ul');
      block.items.forEach((item) => {
        const li = doc.createElement('li');
        appendInline(doc, li, item);
        list.appendChild(li);
      });
      container.appendChild(list);
    } else {
      const p = doc.createElement('p');
      block.lines.forEach((line, index) => {
        if (index) p.appendChild(doc.createElement('br'));
        appendInline(doc, p, line);
      });
      container.appendChild(p);
    }
  });
}

/** Plain text for meta descriptions and JSON-LD: markers removed, lines joined. */
export function listingDescriptionPlainText(text) {
  return parseBlocks(text)
    .map((block) => {
      if (block.type === 'heading') return block.text;
      if (block.type === 'list') return block.items.join(', ');
      return block.lines.join(' ');
    })
    .map((part) => part.replace(/\*\*([^*]+)\*\*/g, '$1').trim())
    .filter(Boolean)
    .join(' ');
}
