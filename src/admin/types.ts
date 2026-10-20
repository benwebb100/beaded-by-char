export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'refunded' | 'partially_refunded';
export type Fulfillment = 'unfulfilled' | 'fulfilled';
export type OrderFilter = 'unfulfilled' | 'fulfilled' | 'all' | 'unpaid';

export type Address = { name?: string; line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string };

export type OrderRow = {
  id: string;
  number: number;
  created_at: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  customer_name: string | null;
  customer_email: string | null;
  total: number;
  item_count: number;
  oversold: boolean;
  source: 'website' | 'ghl';
};

export type OrderItem = { id: string; name: string; variant: string; image: string | null; unit_amount: number; qty: number; product_id: string | null };

export type Order = OrderRow & {
  customer_phone: string | null;
  shipping_address: Address | null;
  subtotal: number;
  shipping: number;
  discount: number;
  note: string;
  paid_at: string | null;
  fulfilled_at: string | null;
  stripe_payment_intent: string | null;
  items: OrderItem[];
};

export type OptionValue = { id: string; name: string };
export type Option = { id: string; name: string; values: OptionValue[] };

export type Price = {
  id?: string;                 // missing = not saved yet
  option_value_ids: string[];
  amount: number;
  track_inventory: boolean;
  quantity: number | null;
  allow_out_of_stock: boolean;
  active: boolean;
};

export type Product = {
  id?: string;
  name: string;
  description: string;
  visible: boolean;
  images: string[];
  options: Option[];
  prices: Price[];
  collection_ids: string[];
};

export type Collection = { id?: string; name: string; slug: string; image: string | null; sort: number };

export type Contact = { id: string; email: string; first_name: string; last_name: string; phone: string; newsletter: boolean; source: string; created_at: string };

export type Settings = {
  shop_open: boolean;
  shipping_amount: number;
  shipping_label: string;
  notify_email: string;
  catalog_changed_at: string;
  published_at: string | null;
};

export interface AdminApi {
  readonly demo: boolean;
  currentUser(): Promise<{ email: string } | null>;
  onAuthChange(cb: (event: 'signed_in' | 'signed_out' | 'password_recovery') => void): void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  setPassword(password: string): Promise<void>;
  isAdmin(): Promise<boolean>;

  listOrders(filter: OrderFilter): Promise<OrderRow[]>;
  countToFulfil(): Promise<number>;
  getOrder(id: string): Promise<Order>;
  setFulfillment(id: string, value: Fulfillment): Promise<void>;
  setNote(id: string, note: string): Promise<void>;

  listProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product>;
  saveProduct(p: Product): Promise<string>;
  deleteProduct(id: string): Promise<void>;
  uploadImage(file: Blob, folder: string): Promise<string>;

  listCollections(): Promise<Collection[]>;
  saveCollection(c: Collection): Promise<void>;
  deleteCollection(id: string): Promise<void>;

  listContacts(): Promise<Contact[]>;

  getSettings(): Promise<Settings>;
  saveSettings(s: Partial<Settings>): Promise<void>;
  publish(): Promise<void>;
}
