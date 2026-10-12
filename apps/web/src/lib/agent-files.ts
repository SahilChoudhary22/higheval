/**
 * Agent files: Hermes' SOUL.md, AGENTS.md and memory files, and importing them
 * from a Hermes home (~/.hermes) or an OpenClaw workspace, read in the browser.
 */

/** Hermes separates memory entries with a line holding only this character. */
const ENTRY_SEPARATOR = '§';
const SEPARATOR_LINE = /^\s*§\s*$/m;

/** Shows entries one per line, or in Hermes' `§` format when any entry spans lines. */
export function formatEntries(entries: readonly string[]): string {
  return entries.some((entry) => entry.includes('\n'))
    ? entries.join(`\n${ENTRY_SEPARATOR}\n`)
    : entries.join('\n');
}

/** Reads entries typed one per line, or separated by `§` lines as in Hermes' memory files. */
export function parseEntries(text: string): string[] {
  const parts = SEPARATOR_LINE.test(text) ? text.split(/^\s*§\s*$/m) : text.split('\n');
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * Entries from a memory file: Hermes' `§` format as is; otherwise (OpenClaw's
 * markdown) one entry per bullet or paragraph, without headings or code blocks.
 */
export function parseMemoryFile(text: string): string[] {
  if (SEPARATOR_LINE.test(text)) return parseEntries(text);
  const prose = text.replaceAll(/```[\s\S]*?```/g, '');
  const entries: string[] = [];
  for (const block of prose.split(/\n\s*\n/)) {
    const lines = block.split('\n').filter((line) => !/^\s*#/.test(line));
    const bullets = lines.filter((line) => /^\s*([-*+]|\d+[.)])\s+/.test(line));
    if (bullets.length > 0 && bullets.length === lines.filter((line) => line.trim()).length) {
      entries.push(...bullets.map((line) => line.replace(/^\s*([-*+]|\d+[.)])\s+/, '').trim()));
    } else {
      const paragraph = lines.join(' ').replaceAll(/\s+/g, ' ').trim();
      if (paragraph) entries.push(paragraph);
    }
  }
  return [...new Set(entries.filter(Boolean))];
}

export interface ImportedFile {
  /** Path inside the picked folder, e.g. `memories/MEMORY.md`. */
  path: string;
  content: string;
}

export interface ImportedAgentFiles {
  soul: string | null;
  instructions: string | null;
  memory: string[];
  userProfile: string[];
  /** Files that were read, for the summary. */
  used: string[];
  /** Files found that Hermes has no use for (OpenClaw-only). */
  unused: string[];
}

/** OpenClaw workspace files with no Hermes equivalent; Hermes' own importer archives them too. */
const OPENCLAW_ONLY = ['IDENTITY.md', 'TOOLS.md', 'HEARTBEAT.md', 'BOOTSTRAP.md'];
const DAILY_NOTE = /(?:^|\/)memory\/(\d{4}-\d{2}-\d{2})[^/]*\.md$/;

/** Path relative to a Hermes home or an OpenClaw workspace, so both layouts match the same names. */
const normalise = (path: string): string =>
  path.replace(/^(?:\.?openclaw\/)?(?:workspace(?:\.default)?\/)/, '');

/** Which picked files to read: everything else in the folder is ignored unread. */
export function isAgentFile(path: string): boolean {
  const name = normalise(stripRoot(path));
  return (
    [
      'SOUL.md',
      'AGENTS.md',
      'MEMORY.md',
      'USER.md',
      'memories/MEMORY.md',
      'memories/USER.md',
    ].includes(name) ||
    OPENCLAW_ONLY.includes(name) ||
    DAILY_NOTE.test(name)
  );
}

/** Folder picks prefix every path with the folder's own name; single-file picks have no folder. */
export function stripRoot(path: string): string {
  const slash = path.indexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

/** Maps the files found in a Hermes home or OpenClaw workspace onto an agent's settings. */
export function importAgentFiles(files: readonly ImportedFile[]): ImportedAgentFiles {
  const result: ImportedAgentFiles = {
    soul: null,
    instructions: null,
    memory: [],
    userProfile: [],
    used: [],
    unused: [],
  };
  const daily: { date: string; entries: string[] }[] = [];
  for (const file of files) {
    const name = normalise(stripRoot(file.path));
    const text = file.content.trim();
    if (OPENCLAW_ONLY.includes(name)) {
      result.unused.push(name);
      continue;
    }
    const date = DAILY_NOTE.exec(name)?.[1];
    if (date) {
      daily.push({ date, entries: parseMemoryFile(text) });
    } else if (name === 'SOUL.md') {
      result.soul = text || null;
    } else if (name === 'AGENTS.md') {
      result.instructions = text || null;
    } else if (name === 'MEMORY.md' || name === 'memories/MEMORY.md') {
      result.memory.push(...parseMemoryFile(text));
    } else if (name === 'USER.md' || name === 'memories/USER.md') {
      result.userProfile.push(...parseMemoryFile(text));
    } else {
      continue;
    }
    result.used.push(name);
  }
  // Like Hermes' OpenClaw importer, daily notes are merged into memory, oldest first, keeping their date.
  for (const note of daily.toSorted((a, b) => a.date.localeCompare(b.date))) {
    result.memory.push(...note.entries.map((entry) => `${note.date}: ${entry}`));
  }
  if (daily.length > 0) result.used.push(`${String(daily.length)} daily notes`);
  result.memory = [...new Set(result.memory)];
  result.userProfile = [...new Set(result.userProfile)];
  return result;
}
