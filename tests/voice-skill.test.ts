// Voice Skill loading order and the content of the shipped profile.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadActiveVoiceSkill, VoiceSkillUnavailableError } from '@/lib/voice-skill';
import { createMemoryRepo } from './helpers/memory-repo';

const FILE = readFileSync(path.join(__dirname, '..', 'data', 'voice-skill.txt'), 'utf8');
const row = { id: 'vs-1', name: 'meera', version: 3, content: 'DB VOICE '.repeat(40), is_active: true, source_description: 's', created_at: '' };

describe('loadActiveVoiceSkill', () => {
  it('prefers the active Supabase row', async () => {
    const repo = createMemoryRepo();
    repo.voiceSkill = row;
    expect(await loadActiveVoiceSkill(repo, async () => FILE)).toEqual({ content: row.content, source: 'database', id: 'vs-1', version: 3 });
  });

  it('falls back to the bundled file when the database fails or has no active row', async () => {
    const repo = createMemoryRepo();
    expect((await loadActiveVoiceSkill(repo, async () => FILE)).source).toBe('file');
    repo.failNext.getActiveVoiceSkill = new Error('db down');
    expect((await loadActiveVoiceSkill(repo, async () => FILE)).content).toBe(FILE);
  });

  it('never substitutes generic instructions when both sources fail', async () => {
    const repo = createMemoryRepo();
    await expect(loadActiveVoiceSkill(repo, async () => Promise.reject(new Error('ENOENT')))).rejects.toBeInstanceOf(VoiceSkillUnavailableError);
    await expect(loadActiveVoiceSkill(repo, async () => '')).rejects.toBeInstanceOf(VoiceSkillUnavailableError);
  });

  it('the shipped Voice Skill is 500-1,100 words and has a DO NOT section', () => {
    const words = FILE.split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(500);
    expect(words).toBeLessThanOrEqual(1100);
    expect(FILE).toContain('DO NOT');
    expect(FILE).toMatch(/not a source of facts/i);
  });
});
