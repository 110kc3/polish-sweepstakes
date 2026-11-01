import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Filter for newly discovered contests by ID comparison.
 */
export function findNewContests(oldList, newList) {
  const oldIds = new Set((oldList || []).map(item => item.id));
  return (newList || []).filter(item => item && item.id && !oldIds.has(item.id));
}

/**
 * Escape MarkdownV2 characters for Telegram bot messages.
 */
export function escapeTelegramMarkdown(text) {
  return String(text || '').replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

/**
 * Build Discord Webhook JSON payload.
 */
export function buildDiscordPayload(item) {
  const prizeVal = item.prize?.value ? ` (~${item.prize.value} zł)` : '';
  const prizeText = (item.prize?.summary || 'Brak opisu') + prizeVal;
  const link = item.links?.organizer || item.links?.rules || item.sourceUrl || '';
  return {
    embeds: [{
      title: `🎁 Nowy konkurs bez zakupu: ${item.title || 'Bez tytułu'}`,
      url: link,
      color: 2450411,
      fields: [
        { name: 'Nagroda', value: prizeText, inline: true },
        { name: 'Termin', value: item.deadline || 'Brak danych', inline: true },
        { name: 'Jak wziąć udział', value: item.entry?.summary || 'Szczegóły w regulaminie' }
      ],
      footer: { text: `Źródło: ${item.source || 'polish-sweepstakes'} • polish-sweepstakes` }
    }]
  };
}

/**
 * Format Telegram notification text using MarkdownV2.
 */
export function formatTelegramMessage(item) {
  const prizeVal = item.prize?.value ? ` (~${item.prize.value} zł)` : '';
  const prizeText = (item.prize?.summary || 'Brak opisu') + prizeVal;
  const link = item.links?.organizer || item.links?.rules || item.sourceUrl || '';
  return `🎁 *Nowy konkurs bez zakupu*\n\n` +
         `*Tytuł:* ${escapeTelegramMarkdown(item.title || '')}\n` +
         `*Nagroda:* ${escapeTelegramMarkdown(prizeText)}\n` +
         `*Termin:* ${escapeTelegramMarkdown(item.deadline || 'Brak danych')}\n` +
         `[Przejdź do konkursu](${link})`;
}

/**
 * Dispatch notifications to configured Discord and Telegram webhooks.
 * Silently skips if credentials are not configured.
 */
export async function dispatchNotifications({
  newContests = [],
  discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL,
  telegramToken = process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId = process.env.TELEGRAM_CHAT_ID,
  fetchFn = globalThis.fetch,
} = {}) {
  const results = { discordSent: 0, telegramSent: 0, totalNew: newContests.length };

  if (!newContests || newContests.length === 0) {
    return results;
  }

  // Discord Dispatch
  if (discordWebhookUrl) {
    for (const item of newContests) {
      try {
        const payload = buildDiscordPayload(item);
        const res = await fetchFn(discordWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res && res.ok) results.discordSent++;
      } catch (err) {
        console.error(`Failed to send Discord alert for ${item.id}:`, err.message);
      }
    }
  }

  // Telegram Dispatch
  if (telegramToken && telegramChatId) {
    const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
    for (const item of newContests) {
      try {
        const text = formatTelegramMessage(item);
        const res = await fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text,
            parse_mode: 'MarkdownV2',
            disable_web_page_preview: false,
          }),
        });
        if (res && res.ok) results.telegramSent++;
      } catch (err) {
        console.error(`Failed to send Telegram alert for ${item.id}:`, err.message);
      }
    }
  }

  return results;
}

// CLI Execution
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const dataPath = path.resolve(process.cwd(), 'data/lotteries.json');
  const cachePath = path.resolve(process.cwd(), 'data/.notified_cache.json');

  let currentItems = [];
  try {
    currentItems = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  } catch {
    console.log('No data/lotteries.json found; skipping notifications.');
    process.exit(0);
  }

  let previousItems = [];
  try {
    previousItems = JSON.parse(await fs.readFile(cachePath, 'utf8'));
  } catch {
    // First run without cache: initialize cache without blasting alerts
    console.log('Initializing notification cache baseline...');
    await fs.writeFile(cachePath, JSON.stringify(currentItems.map(i => ({ id: i.id })), null, 2));
    process.exit(0);
  }

  const newItems = findNewContests(previousItems, currentItems);
  console.log(`Found ${newItems.length} new contests.`);

  const stats = await dispatchNotifications({ newContests: newItems });
  console.log(`Dispatched: ${stats.discordSent} Discord, ${stats.telegramSent} Telegram.`);

  // Update cache with all currently known IDs
  await fs.writeFile(cachePath, JSON.stringify(currentItems.map(i => ({ id: i.id })), null, 2));
}
