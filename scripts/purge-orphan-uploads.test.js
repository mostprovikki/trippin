// Unit tests for the safety guards in purge-orphan-uploads.js, extracted as pure
// functions so they're testable without touching the filesystem or a real DB.
// Run: node --test scripts/purge-orphan-uploads.test.js
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { isUnsafeUploadsDir, shouldRefuseEmptyDb, countSegments } = require('./purge-orphan-uploads.js')

test('countSegments counts non-empty path segments', () => {
  assert.equal(countSegments('/'), 0)
  assert.equal(countSegments('/Users/me'), 2)
  assert.equal(countSegments('/Users/me/repo/server/data/uploads'), 6)
})

test('isUnsafeUploadsDir refuses the filesystem root', () => {
  assert.equal(isUnsafeUploadsDir(path.sep, '/Users/someone'), true)
})

test('isUnsafeUploadsDir refuses the home directory itself', () => {
  assert.equal(isUnsafeUploadsDir('/Users/someone', '/Users/someone'), true)
})

test('isUnsafeUploadsDir refuses paths with fewer than 3 segments', () => {
  assert.equal(isUnsafeUploadsDir('/Users/someone', '/somewhere/else'), true) // 2 segments
  assert.equal(isUnsafeUploadsDir('/a/b', '/somewhere/else'), true) // 2 segments
})

test('isUnsafeUploadsDir allows a real-looking uploads dir with 3+ segments', () => {
  assert.equal(isUnsafeUploadsDir('/Users/me/repo/server/data/uploads', '/Users/someone'), false)
})

test('shouldRefuseEmptyDb refuses when 0 persons and --allow-empty-db not passed', () => {
  assert.equal(shouldRefuseEmptyDb(0, false), true)
})

test('shouldRefuseEmptyDb proceeds when 0 persons but --allow-empty-db passed', () => {
  assert.equal(shouldRefuseEmptyDb(0, true), false)
})

test('shouldRefuseEmptyDb proceeds when persons exist', () => {
  assert.equal(shouldRefuseEmptyDb(7, false), false)
})
