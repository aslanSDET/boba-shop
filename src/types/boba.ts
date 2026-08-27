export type DrinkSize = "MEDIUM" | "LARGE";

export type SugarLevel = "0%" | "30%" | "50%" | "70%" | "100%";

export type IceLevel = "NO_ICE" | "LESS_ICE" | "REGULAR_ICE" | "EXTRA_ICE" | "HOT";

export interface Topping {
  id: string;
  name: string;
  price: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  basePrice: number;
  imageUrl: string;
  availableSizes: Partial<Record<DrinkSize, number>>;
  availableIceLevels: IceLevel[];
  availableSugarLevels: SugarLevel[];
  availableToppings: Topping[];
  isPopular?: boolean;
  isAvailable: boolean;
}

export interface MenuCategory {
  id: string;
  name: string;
}

export interface SelectedModifiers {
  size: DrinkSize;
  iceLevel: IceLevel;
  sugarLevel: SugarLevel;
  toppings: Topping[];
  specialInstructions?: string;
}

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
