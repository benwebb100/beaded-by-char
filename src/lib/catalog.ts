import data from '../data/catalog.json';

export type Price = {
  id: string;
  optionValueIds: string[];
  amount: number;
  compareAt: number | null;
  trackInventory: boolean;
  quantity: number | null;
  allowOutOfStock: boolean;
};
export type Option = { id: string; name: string; values: { id: string; name: string }[] };
export type Product = {
  id: string;
  name: string;
  description: string;
  collectionIds: string[];
  available: boolean;
  images: string[];
  options: Option[];
  prices: Price[];
};
export type Collection = { id: string; name: string; slug: string; image: string | null; sort: number };

export const collections: Collection[] = [...(data.collections as Collection[])].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
export const products: Product[] = (data.products as Product[]).filter(p => p.available);
export const site = data.site as { logo: string; tiles: Record<string, string> };

export const inStock = (p: Price) => !p.trackInventory || p.allowOutOfStock || (p.quantity ?? 0) > 0;

/** What a product card shows: the cheapest price still for sale, or null when nothing is. */
export function fromPrice(product: Product): number | null {
  const amounts = product.prices.filter(inStock).map(p => p.amount);
  return amounts.length ? Math.min(...amounts) : null;
}

export function productsIn(slug: string): Product[] {
  const c = collections.find(c => c.slug === slug);
  return c ? products.filter(p => p.collectionIds.includes(c.id)) : [];
}

export const aud = (n: number) => `AU$${n.toFixed(2)}`;
export const productUrl = (p: Product) => `/product-details/product/${p.id}`;

/** The subset of a product a listing card needs on the client. */
export const card = (p: Product) => ({ id: p.id, name: p.name, image: p.images[0] ?? null, price: fromPrice(p), url: productUrl(p) });

/** Category circles for the Home and Shop pages, in the order set in the admin. */
export const tiles = collections.filter(c => c.image).map(c => ({ slug: c.slug, name: c.name, src: c.image! }));
