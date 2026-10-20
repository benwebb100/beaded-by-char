// The cart lives in this browser's localStorage. Amounts here are for display only:
// checkout re-prices every line from the database before charging.
export type CartLine = {
  priceId: string;
  productId: string;
  name: string;
  variant: string;
  amount: number;
  image: string | null;
  url: string;
  qty: number;
};

const KEY = 'bbc-cart-v1';
let memory: CartLine[] = [];

export function getCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return memory;
  }
}

function save(lines: CartLine[]) {
  memory = lines;
  try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* private mode: keep in memory */ }
  window.dispatchEvent(new CustomEvent('cart:change'));
}

export function addToCart(line: CartLine) {
  const lines = getCart();
  const existing = lines.find(l => l.priceId === line.priceId);
  if (existing) existing.qty += line.qty;
  else lines.push(line);
  save(lines);
}

export function setQty(priceId: string, qty: number) {
  save(getCart().map(l => (l.priceId === priceId ? { ...l, qty } : l)).filter(l => l.qty > 0));
}

export const removeLine = (priceId: string) => setQty(priceId, 0);
export const clearCart = () => save([]);
export const cartCount = () => getCart().reduce((n, l) => n + l.qty, 0);
export const cartSubtotal = () => getCart().reduce((n, l) => n + l.amount * l.qty, 0);
