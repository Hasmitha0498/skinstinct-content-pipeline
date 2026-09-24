// Shows where Telegram is delivering updates and the last delivery error, if any.
// Usage:  npm run telegram:webhook-info
import { telegramCall } from './telegram-api';

interface WebhookInfo {
  url: string;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  allowed_updates?: string[];
}

async function main() {
  const info = await telegramCall<WebhookInfo>('getWebhookInfo');
  console.log(`URL:              ${info.url || '(none: webhook not set)'}`);
  console.log(`Pending updates:  ${info.pending_update_count}`);
  console.log(`Allowed updates:  ${info.allowed_updates?.join(', ') ?? '(default)'}`);
  if (info.last_error_date) {
    console.log(`Last error:       ${new Date(info.last_error_date * 1000).toISOString()}  ${info.last_error_message ?? ''}`);
  } else {
    console.log('Last error:       none');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
