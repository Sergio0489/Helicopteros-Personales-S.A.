'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const {findings, scan} = require('../scripts/public-privacy.cjs');
const root = path.resolve(__dirname, '..');

test('all tracked text resources are free of embedded personal identifiers and phones', () => {
  const result = scan(root);
  assert(result.files > 0);
  assert.deepEqual(result.failures, [], 'Report paths and rule names only; never include personal data in CI logs.');
});

test('privacy detector rejects synthetic IDs, phone formats, fields and escaped copies', () => {
  // Construct fictitious candidates at runtime so test sources do not contain contact data.
  const id = [0, 0, 0].join('-');
  const mobile = '6' + '0'.repeat(7);
  const formatted = mobile.slice(0, 4) + '-' + mobile.slice(4);
  for (const text of [id, mobile, formatted, '+507 ' + formatted,
    JSON.stringify({identity: id}), JSON.stringify({phone: mobile}),
    JSON.stringify({licenseNumber: 'SYNTHETIC-' + 123}),
    [...id].map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join(''),
    [...mobile].map(c => '\\x' + c.charCodeAt(0).toString(16)).join(''),
    [...id].map(c => '&#' + c.charCodeAt(0) + ';').join('')]) {
    assert(findings(text).length > 0, 'Synthetic leak must be detected.');
  }
  for (const text of ['2026-10-19', 'AAC/DSA/EEAP/007', 'HP1186', "phone: ''", 'phone: profile.phone']) {
    assert.deepEqual(findings(text), []);
  }
});

test('public organization metadata is limited to names and roles', () => {
  const people = require('../functions/school-information').defaults.people;
  assert.equal(people.length, 5);
  for (const person of people) assert.deepEqual(Object.keys(person).sort(), ['id', 'name', 'parent', 'role']);
});

test('director and role loaders invalidate the previously published school bundle', () => {
  const version = '20261020-dossiers-1';
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const file of ['cloud.js', 'role-main-view.js']) {const match=index.match(new RegExp(file.replace('.', '\\.')+'\\?v=(\\d{8})'));assert(match&&match[1]>=version.slice(0,8),file+' must invalidate older bundles');}
  assert(fs.readFileSync(path.join(root, 'cloud.js'), 'utf8').includes('school-info.js?v=' + version));
  const native=fs.readFileSync(path.join(root,'role-main-view.js'),'utf8').match(/\?native=(\d{8})/);assert(native&&native[1]>=version.slice(0,8));
});

