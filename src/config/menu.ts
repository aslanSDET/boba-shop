import type {
  IceLevel,
  MenuCategory,
  MenuItem,
  SelectedModifiers,
  SugarLevel,
  Topping,
} from "@/types/boba";

export const ICE_LEVELS: IceLevel[] = [
  "NO_ICE",
  "LESS_ICE",
  "REGULAR_ICE",
  "EXTRA_ICE",
  "HOT",
];

export const SUGAR_LEVELS: SugarLevel[] = ["0%", "30%", "50%", "70%", "100%"];

export const TOPPINGS: Topping[] = [
  { id: "tapioca-boba", name: "Tapioca Boba", price: 0.75 },
  { id: "egg-pudding", name: "Egg Pudding", price: 0.75 },
  { id: "aloe-vera", name: "Aloe Vera", price: 0.75 },
  { id: "crystal-boba", name: "Crystal Boba", price: 0.85 },
  { id: "cheese-foam", name: "Cheese Foam", price: 0.85 },
];

export const MENU_CATEGORIES: MenuCategory[] = [
  { id: "milk-tea", name: "Milk Teas" },
  { id: "fruit-tea", name: "Fruit Teas" },
  { id: "fresh-milk", name: "Fresh Milk Series" },
  { id: "slush", name: "Slushes" },
];

const standardSizes = { MEDIUM: 0, LARGE: 0.75 };
const standardIce: IceLevel[] = ["NO_ICE", "LESS_ICE", "REGULAR_ICE", "EXTRA_ICE", "HOT"];

export const MENU_ITEMS: MenuItem[] = [
  {
    id: "royal-brown-sugar-boba",
    categoryId: "milk-tea",
    name: "Royal Brown Sugar Boba",
    description: "Fresh milk with hand-crafted brown sugar syrup and chewy tapioca boba.",
    basePrice: 5.75,
    imageUrl: "/menu/brown-sugar-boba.jpg",
    availableSizes: standardSizes,
    availableIceLevels: standardIce,
    availableSugarLevels: SUGAR_LEVELS,
    availableToppings: TOPPINGS,
    isPopular: true,
    isAvailable: true,
  },
  {
    id: "jasmine-milk-tea",
    categoryId: "milk-tea",
    name: "Jasmine Milk Tea",
    description: "Fragrant jasmine green tea blended with creamy milk.",
    basePrice: 5.25,
    imageUrl: "/menu/jasmine-milk-tea.jpg",
    availableSizes: standardSizes,
    availableIceLevels: standardIce,
    availableSugarLevels: SUGAR_LEVELS,
    availableToppings: TOPPINGS,
    isAvailable: true,
  },
  {
    id: "passionfruit-green-tea",
    categoryId: "fruit-tea",
    name: "Passionfruit Green Tea",
    description: "Bright green tea infused with real passionfruit puree.",
    basePrice: 5.5,
    imageUrl: "/menu/passionfruit-green-tea.jpg",
    availableSizes: standardSizes,
    availableIceLevels: standardIce,
    availableSugarLevels: SUGAR_LEVELS,
    availableToppings: TOPPINGS,
    isPopular: true,
    isAvailable: true,
  },
  {
    id: "mango-green-tea",
    categoryId: "fruit-tea",
    name: "Mango Green Tea",
    description: "Sweet mango puree shaken with fresh-brewed green tea.",
    basePrice: 5.5,
    imageUrl: "/menu/mango-green-tea.jpg",
    availableSizes: standardSizes,
    availableIceLevels: standardIce,
    availableSugarLevels: SUGAR_LEVELS,
    availableToppings: TOPPINGS,
    isAvailable: true,
  },
  {
    id: "matcha-latte",
    categoryId: "fresh-milk",
    name: "Matcha Latte",
    description: "Ceremonial-grade matcha whisked with fresh milk.",
    basePrice: 6.0,
    imageUrl: "/menu/matcha-latte.jpg",
    availableSizes: standardSizes,
    availableIceLevels: standardIce,
    availableSugarLevels: SUGAR_LEVELS,
    availableToppings: TOPPINGS,
    isAvailable: true,
  },
  {
    id: "taro-fresh-milk",
    categoryId: "fresh-milk",
    name: "Taro Fresh Milk",
    description: "Creamy taro root blended with fresh milk, no tea base.",
    basePrice: 5.75,
    imageUrl: "/menu/taro-fresh-milk.jpg",
    availableSizes: standardSizes,
    availableIceLevels: standardIce,
    availableSugarLevels: SUGAR_LEVELS,
    availableToppings: TOPPINGS,
    isAvailable: true,
  },
  {
    id: "strawberry-slush",
    categoryId: "slush",
    name: "Strawberry Slush",
    description: "Blended real-strawberry slush topped with fresh cream.",
    basePrice: 6.25,
    imageUrl: "/menu/strawberry-slush.jpg",
    availableSizes: standardSizes,
    availableIceLevels: ["REGULAR_ICE"],
    availableSugarLevels: SUGAR_LEVELS,
    availableToppings: TOPPINGS,
    isAvailable: true,
  },
];

export function calculateCartItemPrice(
  item: MenuItem,
  modifiers: SelectedModifiers,
): number {
  const sizeDelta = item.availableSizes[modifiers.size] ?? 0;
  const toppingsTotal = modifiers.toppings.reduce((sum, t) => sum + t.price, 0);
  return item.basePrice + sizeDelta + toppingsTotal;
}
