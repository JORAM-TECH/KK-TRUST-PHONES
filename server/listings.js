// Phone listings, stored as JSON under data/ (created on first use).
// The site is small and single-writer, so a file store keeps setup to one
// compose service; swaps for a database later without touching the routes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_FILE = process.env.LISTINGS_FILE || path.join(process.cwd(), 'data', 'listings.json');

const SEED = [
  { name: 'Infinix Hot Series', price: 'UGX 450,000+', image: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97' },
  { name: 'Tecno Spark Series', price: 'UGX 400,000+', image: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c' },
  { name: 'Itel Smartphones', price: 'UGX 250,000+', image: 'https://images.unsplash.com/photo-1580910051074-3eb694886505' },
  { name: 'Japan Used Phones', price: 'UGX 300,000+', image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9' },
];

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalize(input = {}, { partial = false } = {}) {
  const fields = {};

  if (!partial || input.name !== undefined) {
    const name = String(input.name ?? '').trim();
    if (!name) throw fail('A phone name is required.');
    if (name.length > 120) throw fail('The phone name must be 120 characters or fewer.');
    fields.name = name;
  }

  if (!partial || input.price !== undefined) {
    const price = String(input.price ?? '').trim();
    if (price.length > 60) throw fail('The price must be 60 characters or fewer.');
    fields.price = price;
  }

  if (!partial || input.image !== undefined) {
    const image = String(input.image ?? '').trim();
    if (image && !/^https?:\/\//i.test(image)) throw fail('The image link must start with http:// or https://');
    if (image.length > 500) throw fail('The image link is too long.');
    fields.image = image;
  }

  return fields;
}

function readAll() {
  if (!fs.existsSync(DATA_FILE)) return null;
  const raw = fs.readFileSync(DATA_FILE, 'utf8').trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${DATA_FILE} does not contain a list of phones.`);
  return parsed;
}

function writeAll(items) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(items, null, 2)}\n`);
  fs.renameSync(tmp, DATA_FILE);
}

export function list() {
  const items = readAll();
  if (items) return items;
  const seeded = SEED.map((item) => ({ id: crypto.randomUUID(), ...item }));
  writeAll(seeded);
  return seeded;
}

export function create(input) {
  const item = { id: crypto.randomUUID(), ...normalize(input) };
  const items = list();
  items.push(item);
  writeAll(items);
  return item;
}

export function update(id, input) {
  const items = list();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) throw fail('That phone is no longer in the list.', 404);
  const updated = { ...items[index], ...normalize(input, { partial: true }) };
  items[index] = updated;
  writeAll(items);
  return updated;
}

export function remove(id) {
  const items = list();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) throw fail('That phone is no longer in the list.', 404);
  const [removed] = items.splice(index, 1);
  writeAll(items);
  return removed;
}
