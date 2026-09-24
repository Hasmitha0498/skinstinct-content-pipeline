// Loads Meera's Voice Skill for drafting. Order: the active row in Supabase, then the bundled
// data/voice-skill.txt. If neither is available drafting stops; there is no generic substitute.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describeError, log } from './log';
import type { ActiveVoiceSkill, Repository } from './types';

export const VOICE_SKILL_FILE = path.join(process.cwd(), 'data', 'voice-skill.txt');
export const VOICE_SKILL_NAME = 'meera-pillai-linkedin';

export class VoiceSkillUnavailableError extends Error {
  constructor() {
    super('No Voice Skill available (database and bundled file both failed)');
    this.name = 'VoiceSkillUnavailableError';
  }
}

export type VoiceSkillFileReader = () => Promise<string>;
const readBundledFile: VoiceSkillFileReader = () => readFile(VOICE_SKILL_FILE, 'utf8');

export async function loadActiveVoiceSkill(repo: Repository, readFallback: VoiceSkillFileReader = readBundledFile): Promise<ActiveVoiceSkill> {
  try {
    const row = await repo.getActiveVoiceSkill();
    if (row && row.content.trim().length > 200) {
      return { content: row.content, source: 'database', id: row.id, version: row.version };
    }
    log.warn('voice_skill.no_active_row', { stage: 'drafting' });
  } catch (error) {
    log.warn('voice_skill.database_failed', { stage: 'drafting', error: describeError(error) });
  }

  try {
    const content = await readFallback();
    if (content.trim().length > 200) {
      log.warn('voice_skill.using_bundled_file', { stage: 'drafting' });
      return { content, source: 'file', id: null, version: null };
    }
  } catch (error) {
    log.error('voice_skill.file_failed', { stage: 'drafting', error: describeError(error) });
  }
  throw new VoiceSkillUnavailableError();
}
