// Stores data/voice-skill.txt in Supabase as the active Voice Skill (new version only if the text changed).
// Usage:  npm run voice-skill:seed
import { readFile } from 'node:fs/promises';
import { supabaseAdmin } from '../lib/supabase/client';
import { VOICE_SKILL_FILE, VOICE_SKILL_NAME } from '../lib/voice-skill';
import type { VoiceSkillRow } from '../lib/types';

async function main() {
  const content = (await readFile(VOICE_SKILL_FILE, 'utf8')).trim();
  const { data, error } = await supabaseAdmin()
    .rpc('activate_voice_skill', {
      p_name: VOICE_SKILL_NAME,
      p_content: content,
      p_source_description:
        "Derived from Meera Pillai's 15 published pieces (LinkedIn posts 001-004, newsletters 001-011). Source file: data/voice-skill.txt",
    })
    .single<VoiceSkillRow>();
  if (error || !data) throw new Error(`Seeding failed: ${error?.message ?? 'no row returned'}`);
  console.log(`Active Voice Skill: ${data.name} v${data.version} (${data.content.length} chars, id ${data.id})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
