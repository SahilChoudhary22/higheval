import { describe, expect, it } from 'vitest';
import {
  formatEntries,
  importAgentFiles,
  isAgentFile,
  parseEntries,
  parseMemoryFile,
  stripRoot,
} from './agent-files';

describe('memory entries', () => {
  it('round-trips one-per-line and multi-line entries', () => {
    expect(parseEntries(formatEntries(['A', 'B']))).toEqual(['A', 'B']);
    const multiLine = ['First line\nsecond line', 'Other'];
    expect(formatEntries(multiLine)).toBe('First line\nsecond line\n§\nOther');
    expect(parseEntries(formatEntries(multiLine))).toEqual(multiLine);
  });

  it('reads Hermes files and OpenClaw markdown', () => {
    expect(parseMemoryFile('Fact A\n§\nFact B\nstill B')).toEqual(['Fact A', 'Fact B\nstill B']);
    const markdown =
      '# Notes\n\n- Prefers SMS\n- Fiscal year starts April 1\n\nWorks in\nfinance.\n\n```\ncode\n```';
    expect(parseMemoryFile(markdown)).toEqual([
      'Prefers SMS',
      'Fiscal year starts April 1',
      'Works in finance.',
    ]);
  });
});

describe('importAgentFiles', () => {
  it('maps a Hermes home', () => {
    const files = [
      { path: '.hermes/SOUL.md', content: 'You are careful.\n' },
      { path: '.hermes/memories/MEMORY.md', content: 'Fact A\n§\nFact B' },
      { path: '.hermes/memories/USER.md', content: 'Prefers SMS' },
    ];
    expect(importAgentFiles(files)).toEqual({
      soul: 'You are careful.',
      instructions: null,
      memory: ['Fact A', 'Fact B'],
      userProfile: ['Prefers SMS'],
      used: ['SOUL.md', 'memories/MEMORY.md', 'memories/USER.md'],
      unused: [],
    });
  });

  it('maps an OpenClaw workspace, merging daily notes by date and listing files Hermes ignores', () => {
    const imported = importAgentFiles([
      { path: 'openclaw/workspace/AGENTS.md', content: 'Cite the policy.' },
      { path: 'openclaw/workspace/MEMORY.md', content: '- Fact A' },
      { path: 'openclaw/workspace/memory/2026-10-02.md', content: '- Later' },
      { path: 'openclaw/workspace/memory/2026-10-01.md', content: '- Earlier' },
      { path: 'openclaw/workspace/TOOLS.md', content: 'tools' },
    ]);
    expect(imported).toMatchObject({
      instructions: 'Cite the policy.',
      memory: ['Fact A', '2026-10-01: Earlier', '2026-10-02: Later'],
      unused: ['TOOLS.md'],
    });
    expect(imported.used).toContain('2 daily notes');
  });

  it('reads only agent files from a folder', () => {
    expect(isAgentFile('.hermes/memories/MEMORY.md')).toBe(true);
    expect(isAgentFile('workspace/memory/2026-10-01.md')).toBe(true);
    expect(isAgentFile('.hermes/state.db')).toBe(false);
    expect(isAgentFile('.hermes/skills/x/SKILL.md')).toBe(false);
    expect(stripRoot('SOUL.md')).toBe('SOUL.md');
  });
});
