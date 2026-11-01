import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findNewContests,
  escapeTelegramMarkdown,
  buildDiscordPayload,
  formatTelegramMessage,
  dispatchNotifications,
} from './notify.mjs';

test('findNewContests isolates contests not present in old snapshot', () => {
  const oldList = [{ id: 'c1' }, { id: 'c2' }];
  const newList = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }];

  const diff = findNewContests(oldList, newList);
  assert.equal(diff.length, 2);
  assert.deepEqual(diff.map(i => i.id), ['c3', 'c4']);
});

test('escapeTelegramMarkdown escapes reserved characters', () => {
  const input = 'Wygraj 10.000 zł (voucher)! Szczegóły: *regulamin*';
  const escaped = escapeTelegramMarkdown(input);
  assert.equal(escaped, 'Wygraj 10\\.000 zł \\(voucher\\)\\! Szczegóły: \\*regulamin\\*');
});

test('buildDiscordPayload constructs valid embed with prize and deadline', () => {
  const item = {
    id: 'test-1',
    title: 'Wielki konkurs kawowy',
    source: 'konkursyblisko',
    sourceUrl: 'https://example.com/contest',
    deadline: '2026-12-31',
    prize: {
      summary: 'Ekspres do kawy',
      value: 2500,
    },
    entry: {
      summary: 'Napisz komentarz z przepisem na kawę',
    },
    links: {
      organizer: 'https://organizer.example.com/konkurs',
    },
  };

  const payload = buildDiscordPayload(item);
  assert(payload.embeds && payload.embeds.length === 1);
  const embed = payload.embeds[0];
  assert.equal(embed.title, '🎁 Nowy konkurs bez zakupu: Wielki konkurs kawowy');
  assert.equal(embed.url, 'https://organizer.example.com/konkurs');
  assert.equal(embed.fields[0].name, 'Nagroda');
  assert.equal(embed.fields[0].value, 'Ekspres do kawy (~2500 zł)');
  assert.equal(embed.fields[1].value, '2026-12-31');
  assert.equal(embed.fields[2].value, 'Napisz komentarz z przepisem na kawę');
  assert.equal(embed.footer.text, 'Źródło: konkursyblisko • polish-sweepstakes');
});

test('formatTelegramMessage formats valid MarkdownV2 message', () => {
  const item = {
    id: 'test-2',
    title: 'Konkurs foto 2026',
    sourceUrl: 'https://example.com/photo',
    deadline: '2026-11-30',
    prize: {
      summary: 'Aparat fotograficzny',
      value: 4000,
    },
    links: {
      organizer: 'https://example.com/photo',
    },
  };

  const msg = formatTelegramMessage(item);
  assert(msg.includes('*Tytuł:* Konkurs foto 2026'));
  assert(msg.includes('Aparat fotograficzny \\(\\~4000 zł\\)'));
  assert(msg.includes('[Przejdź do konkursu](https://example.com/photo)'));
});

test('dispatchNotifications skips gracefully when credentials missing', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true };
  };

  const results = await dispatchNotifications({
    newContests: [{ id: 'test' }],
    discordWebhookUrl: null,
    telegramToken: null,
    telegramChatId: null,
    fetchFn: fakeFetch,
  });

  assert.equal(results.discordSent, 0);
  assert.equal(results.telegramSent, 0);
  assert.equal(calls.length, 0);
});

test('dispatchNotifications sends to Discord and Telegram when configured', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true };
  };

  const results = await dispatchNotifications({
    newContests: [{ id: 'test-1', title: 'Test 1' }, { id: 'test-2', title: 'Test 2' }],
    discordWebhookUrl: 'https://discord.com/api/webhooks/123/abc',
    telegramToken: '123456:ABC-DEF',
    telegramChatId: '-100987654321',
    fetchFn: fakeFetch,
  });

  assert.equal(results.discordSent, 2);
  assert.equal(results.telegramSent, 2);
  assert.equal(calls.length, 4);
});
