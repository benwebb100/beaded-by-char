import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinations, syncVariants, variantLabel, htmlToText, textToHtml, slugify, toCsv } from '../src/admin/util.ts';
import type { Option, Price } from '../src/admin/types.ts';

const colour: Option = { id: 'c', name: 'Colour', values: [{ id: 'pink', name: 'Pink' }, { id: 'blue', name: 'Blue' }] };
const scent: Option = { id: 's', name: 'Scent', values: [{ id: 'van', name: 'Vanilla' }, { id: 'lyc', name: 'Lychee' }] };
const price = (ids: string[], amount = 21): Price => ({ id: ids.join('-'), option_value_ids: ids, amount, track_inventory: true, quantity: 3, allow_out_of_stock: false, active: true });

test('combinations cover every pairing', () => {
  assert.deepEqual(combinations([colour, scent]), [['pink', 'van'], ['pink', 'lyc'], ['blue', 'van'], ['blue', 'lyc']]);
  assert.deepEqual(combinations([]), [[]]);
});

test('adding a choice switches on only its own new combinations', () => {
  // The shop never sold Blue + Lychee.
  const prices = [price(['pink', 'van']), price(['pink', 'lyc']), price(['blue', 'van'], 23)];
  const added: Option = { ...colour, values: [...colour.values, { id: 'green', name: 'Green' }] };
  const out = syncVariants([added, scent], prices, [colour, scent]);
  const by = (a: string, b: string) => out.find(p => p.option_value_ids.includes(a) && p.option_value_ids.includes(b))!;
  assert.equal(out.length, 6);
  assert.equal(by('blue', 'van').amount, 23);                 // existing prices kept
  assert.equal(by('blue', 'lyc').active, false);              // old gap stays off
  assert.equal(by('green', 'van').active, true);              // new choice is on
  assert.equal(by('green', 'lyc').active, true);
  assert.equal(by('green', 'van').id, undefined);             // will be inserted
  assert.equal(by('green', 'van').quantity, 0);               // stock starts at zero
});

test('removing a choice drops its combinations; adding the first option keeps one price per choice', () => {
  const out = syncVariants([{ ...colour, values: [colour.values[0]] }, scent], [price(['pink', 'van']), price(['blue', 'van'])], [colour, scent]);
  assert.deepEqual(out.map(p => p.option_value_ids), [['pink', 'van'], ['pink', 'lyc']]);
  const first = syncVariants([colour], [price([], 9.95)], []);
  assert.deepEqual(first.map(p => [p.option_value_ids, p.amount, p.active]), [[['pink'], 9.95, true], [['blue'], 9.95, true]]);
});

test('labels, descriptions, slugs and CSV', () => {
  assert.equal(variantLabel([colour, scent], ['lyc', 'blue']), 'Blue / Lychee');
  assert.equal(htmlToText('<p>One &amp; two</p><p>Three<br>four</p>'), 'One & two\n\nThree\nfour');
  assert.equal(textToHtml('One & <two>\n\nThree\nfour'), '<p>One &amp; &lt;two&gt;</p><p>Three<br>four</p>');
  assert.equal(slugify('Car Diffusers & Sprays!'), 'car-diffusers-and-sprays');
  assert.equal(toCsv([{ a: 'x,y', b: 'say "hi"' }]), 'a,b\n"x,y","say ""hi"""');
});
