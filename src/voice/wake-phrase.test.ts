import { describe, expect, test } from 'bun:test';
import { containsStopPhrase, containsWakePhrase, hasSpokenContent, wakeCommandFrom } from './wake-phrase.ts';

describe('containsWakePhrase', () => {
  test('matches the bare wake phrase', () => {
    expect(containsWakePhrase('mogoi')).toBe(true);
    expect(containsWakePhrase('Mogoi')).toBe(true);
    expect(containsWakePhrase('MOGOI')).toBe(true);
  });

  test('matches when the wake phrase appears mid-sentence', () => {
    expect(containsWakePhrase('Hey Mogoi, how are you')).toBe(true);
    expect(containsWakePhrase('Tell Mogoi to send the email')).toBe(true);
    expect(containsWakePhrase('I told mogoi already')).toBe(true);
  });

  test('respects word boundaries (does not match substrings)', () => {
    expect(containsWakePhrase('mogoison')).toBe(false);
    expect(containsWakePhrase('starmogoi')).toBe(false);
    expect(containsWakePhrase('antimogoit')).toBe(false);
  });

  test('treats punctuation as a word boundary', () => {
    expect(containsWakePhrase('Hello, Mogoi.')).toBe(true);
    expect(containsWakePhrase('"Mogoi!"')).toBe(true);
    expect(containsWakePhrase('(mogoi)')).toBe(true);
    expect(containsWakePhrase('Mogoi?')).toBe(true);
  });

  test('handles empty / null-ish input safely', () => {
    expect(containsWakePhrase('')).toBe(false);
    // The function takes string only, but we exercise the early-exit
    // branch by passing an empty string explicitly.
    expect(containsWakePhrase(' ')).toBe(false);
  });

  test('handles whitespace-only and unrelated text', () => {
    expect(containsWakePhrase('hello world')).toBe(false);
    expect(containsWakePhrase('the assistant said hello')).toBe(false);
    expect(containsWakePhrase('   ')).toBe(false);
  });

  test('is robust to multiline TTS input (the daemon flag-on-tts_text use case)', () => {
    expect(containsWakePhrase('First sentence.\nSecond sentence with Mogoi.')).toBe(true);
    expect(containsWakePhrase('Line one.\nLine two.\nLine three.')).toBe(false);
  });

  test('matches multiple occurrences (still returns true; not a count)', () => {
    expect(containsWakePhrase('Mogoi told Mogoi about Mogoi')).toBe(true);
  });
});

describe('containsStopPhrase', () => {
  test('matches spoken stop phrases with TTS punctuation', () => {
    expect(containsStopPhrase("Say 'Mogoi, stop' to interrupt me.")).toBe(true);
    expect(containsStopPhrase('Mogoi stop')).toBe(true);
    expect(containsStopPhrase('You can say "Mogoi... be quiet" anytime.')).toBe(true);
    expect(containsStopPhrase('mogoi quiet')).toBe(true);
  });

  test('does not match ordinary mentions of Mogoi or stop', () => {
    expect(containsStopPhrase('Mogoi stopped the timer for you')).toBe(false);
    expect(containsStopPhrase('Ask Mogoi about the bus stop')).toBe(false);
    expect(containsStopPhrase('Please stop by tomorrow')).toBe(false);
    expect(containsStopPhrase('')).toBe(false);
  });
});

describe('wakeCommandFrom', () => {
  test('returns the command that follows the wake word', () => {
    expect(wakeCommandFrom('Mogoi play music')).toBe('play music');
    expect(wakeCommandFrom('Hey Mogoi, what are you working on?')).toBe('what are you working on?');
    expect(wakeCommandFrom('mogoi: open the dashboard')).toBe('open the dashboard');
  });

  test('uses the LAST wake word so lead-in chatter is dropped', () => {
    expect(wakeCommandFrom("I'm at home, Mogoi play music")).toBe('play music');
    expect(wakeCommandFrom('I told Mogoi already. Mogoi, mute yourself')).toBe('mute yourself');
  });

  test('returns "" for a bare summon, whatever punctuation STT tacks on', () => {
    // The bug: "Hey Mogoi!" left a "!" behind, which was run as the whole
    // user turn and answered with three hundred lines of counting.
    expect(wakeCommandFrom('Hey Mogoi!')).toBe('');
    expect(wakeCommandFrom('Hey Mogoi?')).toBe('');
    expect(wakeCommandFrom('Hey Mogoi.')).toBe('');
    expect(wakeCommandFrom('Mogoi!!')).toBe('');
    expect(wakeCommandFrom('Mogoi...')).toBe('');
    expect(wakeCommandFrom('mogoi')).toBe('');
    expect(wakeCommandFrom('Mogoi —')).toBe('');
    expect(wakeCommandFrom('"Mogoi?!"')).toBe('');
  });

  test('keeps a command that merely opens with punctuation', () => {
    expect(wakeCommandFrom('Mogoi, "play music"')).toBe('play music"');
    expect(wakeCommandFrom('Mogoi \u2014 5 minute timer')).toBe('5 minute timer');
  });

  test('keeps punctuation that belongs to the command, not to the gap', () => {
    // The mirror of the bug: stripping every leading symbol would quietly
    // rewrite these. Only separators come off.
    expect(wakeCommandFrom('Mogoi, $100 budget for the trip')).toBe('$100 budget for the trip');
    expect(wakeCommandFrom('Mogoi, #general is muted')).toBe('#general is muted');
    expect(wakeCommandFrom('Mogoi +5 minutes on the timer')).toBe('+5 minutes on the timer');
    expect(wakeCommandFrom('Mogoi, @dad called')).toBe('@dad called');
  });

  test('accepts non-Latin commands', () => {
    expect(wakeCommandFrom('Mogoi, che ore sono?')).toBe('che ore sono?');
    expect(wakeCommandFrom('Mogoi, 天気は?')).toBe('天気は?');
  });

  test('returns "" when there is no wake word at all', () => {
    expect(wakeCommandFrom('play music')).toBe('');
    expect(wakeCommandFrom('mogoison play music')).toBe('');
    expect(wakeCommandFrom('')).toBe('');
  });
});

describe('hasSpokenContent', () => {
  test('accepts anything with a letter or a digit', () => {
    expect(hasSpokenContent('what are you working on?')).toBe(true);
    expect(hasSpokenContent('5')).toBe(true);
    expect(hasSpokenContent('...ok')).toBe(true);
    expect(hasSpokenContent('\u5929\u6c17\u306f?')).toBe(true);
  });

  test('rejects the punctuation STT invents out of silence', () => {
    expect(hasSpokenContent('.')).toBe(false);
    expect(hasSpokenContent('!')).toBe(false);
    expect(hasSpokenContent('?!')).toBe(false);
    expect(hasSpokenContent('...')).toBe(false);
    expect(hasSpokenContent('  ')).toBe(false);
    expect(hasSpokenContent('')).toBe(false);
  });
});
