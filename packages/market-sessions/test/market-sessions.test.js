import assert from 'node:assert/strict';
import test from 'node:test';

import { classifySession, isRegularSession, nextClose, nextOpen } from '../dist/index.js';

const calendar = {
  holidays: ['2026-01-01'],
  earlyCloses: {
    '2026-07-02': '13:00'
  }
};

test('classifies regular hours in America/New_York', () => {
  assert.equal(classifySession('2026-06-15T14:00:00.000Z', calendar), 'REGULAR');
  assert.equal(isRegularSession('2026-06-15T14:00:00.000Z', calendar), true);
});

test('classifies pre-market before regular open', () => {
  assert.equal(classifySession('2026-06-15T12:00:00.000Z', calendar), 'PRE_MARKET');
});

test('classifies after-hours after regular close', () => {
  assert.equal(classifySession('2026-06-15T21:00:00.000Z', calendar), 'AFTER_HOURS');
});

test('classifies overnight closed and weekend closed', () => {
  assert.equal(classifySession('2026-06-15T07:59:00.000Z', calendar), 'CLOSED');
  assert.equal(classifySession('2026-06-14T16:00:00.000Z', calendar), 'CLOSED');
});

test('classifies injected holidays without hardcoded holiday knowledge', () => {
  assert.equal(classifySession('2026-01-01T15:00:00.000Z', calendar), 'HOLIDAY');
});

test('classifies injected early-close days and returns the early close as next close', () => {
  assert.equal(classifySession('2026-07-02T16:00:00.000Z', calendar), 'REGULAR');
  assert.equal(classifySession('2026-07-02T17:30:00.000Z', calendar), 'EARLY_CLOSE');
  assert.equal(nextClose('2026-07-02T14:00:00.000Z', calendar)?.toISOString(), '2026-07-02T17:00:00.000Z');
});

test('uses daylight-saving-aware New York decisions in winter and summer', () => {
  assert.equal(classifySession('2026-01-02T14:29:00.000Z', calendar), 'PRE_MARKET');
  assert.equal(classifySession('2026-01-02T14:30:00.000Z', calendar), 'REGULAR');
  assert.equal(classifySession('2026-06-15T13:29:00.000Z', calendar), 'PRE_MARKET');
  assert.equal(classifySession('2026-06-15T13:30:00.000Z', calendar), 'REGULAR');
});

test('returns UNKNOWN or null when inputs are insufficient or invalid', () => {
  assert.equal(classifySession('not a date', calendar), 'UNKNOWN');
  assert.equal(classifySession('2026-06-15T14:00:00.000Z', undefined), 'UNKNOWN');
  assert.equal(classifySession('2026-07-02T14:00:00.000Z', { earlyCloses: { '2026-07-02': 'bad' } }), 'UNKNOWN');
  assert.equal(nextOpen('not a date', calendar), null);
  assert.equal(nextClose('2026-07-02T14:00:00.000Z', { earlyCloses: { '2026-07-02': 'bad' } }), null);
});

test('finds next open and close using the injected calendar', () => {
  assert.equal(nextOpen('2026-06-14T16:00:00.000Z', calendar)?.toISOString(), '2026-06-15T13:30:00.000Z');
  assert.equal(nextOpen('2026-06-15T14:00:00.000Z', calendar)?.toISOString(), '2026-06-16T13:30:00.000Z');
  assert.equal(nextClose('2026-06-15T14:00:00.000Z', calendar)?.toISOString(), '2026-06-15T20:00:00.000Z');
});
