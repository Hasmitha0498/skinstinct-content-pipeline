// Local development without a public URL: fetches updates with getUpdates (long polling) and runs them
// through exactly the same code path as the webhook. Telegram refuses getUpdates while a webhook is set,
// so this script only runs when no webhook is registered.
// Usage:  npm run poll        (Ctrl+C to stop)
import { receiveUpdate } from '../lib/pipeline/handle-update';
import { productionDeps } from '../lib/pipeline/production';
import { telegramCall } from './telegram-api';

async function main() {
  const info = await telegramCall<{ url: string }>('getWebhookInfo');
  if (info.url) {
    console.error(`A webhook is set (${info.url}). Telegram won't deliver updates to polling while it is.`);
    console.error('Test against the deployed webhook instead, or remove it with: npm run telegram:set-webhook -- --delete (see README).');
    process.exit(1);
  }
  const deps = productionDeps();
  const me = await telegramCall<{ username: string }>('getMe');
  console.log(`Polling as @${me.username}. Send the bot a message. Ctrl+C to stop.`);
  let offset = 0;
  for (;;) {
    const updates = await telegramCall<{ update_id: number }[]>('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'channel_post'] });
    for (const update of updates) {
      offset = update.update_id + 1;
      const receipt = await receiveUpdate(deps, update);
      if (receipt.work) await receipt.work();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
