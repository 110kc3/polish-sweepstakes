import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSocialPlatforms } from './extract.mjs';

test('detectSocialPlatforms finds Instagram from organizer URL', () => {
  const item = {
    links: { organizer: 'https://www.instagram.com/p/Det7rAIuqIu/' },
    tags: {}
  };
  const platforms = detectSocialPlatforms(item);
  assert.equal(platforms.length, 1);
  assert.equal(platforms[0].key, 'instagram');
  assert.equal(platforms[0].label, '📷 Instagram');
  assert.equal(platforms[0].className, 'badge--instagram');
});

test('detectSocialPlatforms finds Facebook from organizer URL', () => {
  const item = {
    links: { organizer: 'https://www.facebook.com/photo/?fbid=1500127205479970' },
    tags: {}
  };
  const platforms = detectSocialPlatforms(item);
  assert.equal(platforms.length, 1);
  assert.equal(platforms[0].key, 'facebook');
  assert.equal(platforms[0].label, '📘 Facebook');
});

test('detectSocialPlatforms finds TikTok from organizer URL', () => {
  const item = {
    links: { organizer: 'https://www.tiktok.com/@creator/video/123456789' },
    tags: {}
  };
  const platforms = detectSocialPlatforms(item);
  assert.equal(platforms.length, 1);
  assert.equal(platforms[0].key, 'tiktok');
  assert.equal(platforms[0].label, '🎵 TikTok');
});

test('detectSocialPlatforms finds YouTube from organizer URL', () => {
  const item = {
    links: { organizer: 'https://youtu.be/dQw4w9WgXcQ' },
    tags: {}
  };
  const platforms = detectSocialPlatforms(item);
  assert.equal(platforms.length, 1);
  assert.equal(platforms[0].key, 'youtube');
  assert.equal(platforms[0].label, '▶ YouTube');
});

test('detectSocialPlatforms finds platforms from taxonomy tags', () => {
  const item = {
    links: { organizer: 'https://organizer.example/enter' },
    tags: { mechanika: ['instagram'], temat: ['fotograficzne'] }
  };
  const platforms = detectSocialPlatforms(item);
  assert.equal(platforms.length, 1);
  assert.equal(platforms[0].key, 'instagram');
});

test('detectSocialPlatforms returns multiple when present', () => {
  const item = {
    links: { organizer: 'https://www.facebook.com/contest/entry' },
    tags: { mechanika: ['instagram'] }
  };
  const platforms = detectSocialPlatforms(item);
  assert.equal(platforms.length, 2);
  const keys = platforms.map(p => p.key).sort();
  assert.deepEqual(keys, ['facebook', 'instagram']);
});

test('detectSocialPlatforms returns empty array for non-social contests', () => {
  const item = {
    links: { organizer: 'https://organizer.example/enter' },
    tags: { mechanika: ['pytanie-otwarte'] }
  };
  assert.deepEqual(detectSocialPlatforms(item), []);
  assert.deepEqual(detectSocialPlatforms(null), []);
});
