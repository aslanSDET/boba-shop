/**
 * Snowdaes sells four structurally different things (PLAN §8): drinks, shaved
 * snow, egg puffs, and shaved ice. They do not share a modifier shape — snow
 * has no ice level or sugar %, Hawaiian ice is "pick up to 3 syrups", Asian ice
 * is "pick 6 toppings".
 *
 * So modifiers are modelled as data (`ModifierGroup[]`) rather than a fixed
 * struct or one union member per product. `productType` stays as a discriminant
 * for *presentation* (which illustration to draw), but adding a product no
 * longer means branching the cart, the pricing, or the drawer — it means adding
 * a row of menu data. This is how real ordering systems model modifiers, and it
 * maps cleanly onto the Amplify `a.json()` field in the §6 schema.
 */
export type ProductType = "DRINK" | "SHAVED_SNOW" | "EGG_PUFF" | "SHAVED_ICE";

export interface ModifierOption {
  id: string;
  /** Full name, used in the cart summary where there is no group heading. */
  name: string;
  /** Shorter form for the drawer pill, which already sits under the heading. */
  shortName?: string;
  /** Added to the item's base price when this option is selected. */
  priceDelta: number;
}

export interface ModifierGroup {
  id: string;
  label: string;
  /** "single" behaves like radio buttons, "multi" like checkboxes. */
  kind: "single" | "multi";
  /** Fewest selections allowed. Above 0 makes the group required. */
  min: number;
  /** Most selections allowed. Omitted means no ceiling. */
  max?: number;
  /** Option ids selected when the drawer opens. */
  defaults?: string[];
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  categoryId: string;
  productType: ProductType;
  name: string;
  description: string;
  basePrice: number;
  /** Real photography when we have it; the SVG illustration stands in when we don't. */
  imageUrl?: string;
  /** Cut-out products sit inside the tile; full-frame shots fill it. */
  imageFit?: "contain" | "cover";
  modifierGroups: ModifierGroup[];
  isPopular?: boolean;
  isAvailable: boolean;
}

export interface MenuCategory {
  id: string;
  name: string;
  productType: ProductType;
}

/** Maps a `ModifierGroup.id` to the `ModifierOption.id`s chosen for it. */
export type SelectedModifiers = Record<string, string[]>;

export interface CartItem {
  cartItemId: string;
  menuItem: MenuItem;
  modifiers: SelectedModifiers;
  unitPrice: number;
  quantity: number;
}

export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";

export interface Order {
  orderId: string;
  customerUserId: string;
  customerPhone: string;
  customerName: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  status: OrderStatus;
  stripePaymentIntentId?: string;
  createdAt: string;
  updatedAt: string;
}
