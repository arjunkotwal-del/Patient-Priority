import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findHealthNumber, luhnValid, nameMatches } from './healthCard.js';

describe('findHealthNumber (lenient)', () => {
  it('reads the usual 4-3-3 layout with a version code', () => {
    assert.deepEqual(findHealthNumber('ONTARIO 1234 - 567 - 890 - AB'), {
      number: '1234567890',
      versionCode: 'AB',
      checked: luhnValid('1234567890'),
    });
  });

  it('reads digits grouped oddly by OCR', () => {
    assert.equal(findHealthNumber('HEALTH 12 3456 7890 XY')?.number, '1234567890');
  });

  it('prefers a number that passes the check digit', () => {
    // 9876543217 passes Luhn; 1234567891 does not.
    assert.ok(luhnValid('9876543217'));
    const hit = findHealthNumber('1234 567 891\n9876 543 217');
    assert.deepEqual([hit?.number, hit?.checked], ['9876543217', true]);
  });

  it('ignores dates and short numbers', () => {
    assert.equal(findHealthNumber('DATE OF BIRTH 1990-01-01'), null);
  });
});

describe('nameMatches (lenient)', () => {
  it('accepts OCR typos and glued words', () => {
    assert.ok(nameMatches('JOHM SMlTH', 'John', 'Smith'));
    assert.ok(nameMatches('SMITHJOHN Q', 'John', 'Smith'));
  });

  it('accepts when only one of first or last name is read', () => {
    assert.ok(nameMatches('XXXX SMITH', 'John', 'Smith'));
    assert.ok(nameMatches('JOHN ????', 'John', 'Smith'));
  });

  it('rejects a different name', () => {
    assert.equal(nameMatches('JANE DOE', 'John', 'Smith'), false);
  });
});
