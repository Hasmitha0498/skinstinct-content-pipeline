// Lists the Gemini models your API key can use for generateContent, to confirm the configured defaults.
// Usage:  npm run gemini:models
import { GoogleGenAI } from '@google/genai';
import { pipelineSettings, readEnv, requireEnv } from '../lib/config';

async function main() {
  const env = readEnv();
  const ai = new GoogleGenAI({ apiKey: requireEnv('GEMINI_API_KEY', env) });
  const names: string[] = [];
  const pager = await ai.models.list({ config: { pageSize: 100 } });
  for await (const model of pager) {
    if (model.supportedActions?.includes('generateContent') && model.name) names.push(model.name.replace(/^models\//, ''));
  }
  names.sort();
  console.log(names.join('\n'));
  const configured = pipelineSettings(env).models;
  console.log('\nConfigured:');
  for (const [role, value] of Object.entries(configured)) {
    for (const id of Array.isArray(value) ? value : value ? [value] : []) {
      console.log(`  ${role.padEnd(17)} ${id}  ${names.includes(id) ? 'OK' : 'NOT AVAILABLE to this key'}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
