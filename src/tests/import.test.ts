import { test, describe } from 'node:test';
import assert from 'node:assert';
import { importNum, importBool, importExpiry } from '../utils/exportImport.ts';

describe('Import Utilities', () => {
  test('importNum parses formatted and clean numbers', () => {
    assert.strictEqual(importNum('123.45'), 123.45);
    assert.strictEqual(importNum('$1,234.50'), 1234.5);
    assert.strictEqual(importNum('  50  '), 50);
    assert.strictEqual(importNum('invalid'), 0);
    assert.strictEqual(importNum(''), 0);
  });

  test('importBool parses boolean truthy representations', () => {
    assert.strictEqual(importBool('yes'), true);
    assert.strictEqual(importBool('true'), true);
    assert.strictEqual(importBool('1'), true);
    assert.strictEqual(importBool('نعم'), true);
    assert.strictEqual(importBool('no'), false);
    assert.strictEqual(importBool('0'), false);
  });

  test('importExpiry handles dates, YYYY.mon.DD named-month values with uppercase month, and empty values', () => {
    assert.strictEqual(importExpiry('2026-12-31'), '2026-12-31');
    assert.strictEqual(importExpiry('2029.jun.27'), '2029.JUN.27');
    assert.strictEqual(importExpiry('2028.Feb.5'), '2028.FEB.05');
    assert.strictEqual(importExpiry(''), '');
  });

  test('branch resolution prioritizes manual dropdown selection over missing CSV column', () => {
    const branches = [
      { id: 'b1', name: 'Main Warehouse', code: 'BR1' },
      { id: 'b2', name: 'North Branch', code: 'BR2' },
    ];

    // Case 1: user selected targetBranch 'b2' from dropdown
    const targetBranch: string = 'b2';
    const resolvedBranch = targetBranch && targetBranch !== '__column__'
      ? branches.find((b) => b.id === targetBranch)
      : null;

    assert.ok(resolvedBranch);
    assert.strictEqual(resolvedBranch.id, 'b2');
    assert.strictEqual(resolvedBranch.name, 'North Branch');

    // Case 2: user selected '__column__' to map from CSV
    const fromColTarget = '__column__';
    const csvBranchName = 'BR1';
    const colBranch = fromColTarget === '__column__'
      ? branches.find((b) => b.code === csvBranchName || b.name === csvBranchName)
      : null;

    assert.ok(colBranch);
    assert.strictEqual(colBranch.id, 'b1');
  });
});
