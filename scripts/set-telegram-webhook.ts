// Registers https://<your-domain>/api/webhook with Telegram, including the webhook secret.
// Usage:  npm run telegram:set-webhook -- https://your-project.vercel.app
//         npm run telegram:set-webhook -- --delete     (remove the webhook)
import { readEnv, requireEnv } from '../lib/config';
import { telegramCall } from './telegram-api';

async function main() {
  const arg = process.argv[2] ?? process.env.PUBLIC_BASE_URL;
  if (arg === '--delete') {
    // Stops webhook delivery (e.g. to use `npm run poll` locally). Pending updates are kept.
    await telegramCall('deleteWebhook', { drop_pending_updates: false });
    console.log('Webhook removed. Telegram will now hold updates for `npm run poll`.');
    return;
  }
  if (!arg) {
    console.error('Usage: npm run telegram:set-webhook -- https://your-project.vercel.app');
    process.exit(1);
  }
  const base = new URL(arg.startsWith('http') ? arg : `https://${arg}`);
  if (base.protocol !== 'https:') throw new Error('Telegram requires an https:// URL');
  const url = new URL('/api/webhook', base.origin).toString();
  const secret = requireEnv('TELEGRAM_WEBHOOK_SECRET', readEnv());

  await telegramCall('setWebhook', {
    url,
    secret_token: secret, // Telegram sends this back in X-Telegram-Bot-Api-Secret-Token
    allowed_updates: ['message', 'channel_post'],
    max_connections: 5,
  });
  const me = await telegramCall<{ username: string }>('getMe');
  console.log(`Webhook set for @${me.username} -> ${url}`);
  console.log('Secret token registered (not shown). Run `npm run telegram:webhook-info` to check delivery status.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
