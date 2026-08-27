import type {
  MenuCategory,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  SelectedModifiers,
} from "@/types/boba";

/**
 * Categories and product copy are the shop's real ones, taken from
 * snowdaes.com. Prices are placeholders — the legacy site publishes no menu
 * pricing at all, so these get replaced in Phase 6 (PLAN §6).
 */
export const MENU_CATEGORIES: MenuCategory[] = [
  { id: "milk-tea", name: "Milk Teas", productType: "DRINK" },
  { id: "shaved-snow", name: "Shaved Snow", productType: "SHAVED_SNOW" },
  { id: "egg-puff", name: "Egg Puffs", productType: "EGG_PUFF" },
  { id: "specialty", name: "Specialty Drinks", productType: "DRINK" },
  { id: "asian-ice", name: "Asian Ice", productType: "SHAVED_ICE" },
  { id: "hawaiian-ice", name: "Hawaiian Ice", productType: "SHAVED_ICE" },
];

// ---------------------------------------------------------------- drinks

const opt = (id: string, name: string, priceDelta = 0): ModifierOption => ({
  id,
  name,
  priceDelta,
});

/** Sugar reads as "100%" under the Sugar heading, "100% sugar" in the cart. */
const sugarOpt = (id: string, pct: string): ModifierOption => ({
  id,
  name: `${pct} sugar`,
  shortName: pct,
  priceDelta: 0,
});

const drinkSize: ModifierGroup = {
  id: "size",
  label: "Size",
  kind: "single",
  min: 1,
  max: 1,
  defaults: ["medium"],
  options: [opt("medium", "Medium"), opt("large", "Large", 0.75)],
};

const sugar: ModifierGroup = {
  id: "sugar",
  label: "Sugar",
  kind: "single",
  min: 1,
  max: 1,
  defaults: ["100"],
  options: [
    sugarOpt("0", "0%"),
    sugarOpt("30", "30%"),
    sugarOpt("50", "50%"),
    sugarOpt("70", "70%"),
    sugarOpt("100", "100%"),
  ],
};

const ice: ModifierGroup = {
  id: "ice",
  label: "Ice",
  kind: "single",
  min: 1,
  max: 1,
  defaults: ["regular"],
  options: [
    opt("none", "No ice"),
    opt("less", "Less ice"),
    opt("regular", "Regular ice"),
    opt("extra", "Extra ice"),
    opt("hot", "Hot"),
  ],
};

const drinkToppings: ModifierGroup = {
  id: "toppings",
  label: "Toppings",
  kind: "multi",
  min: 0,
  options: [
    opt("tapioca", "Tapioca boba", 0.75),
    opt("crystal", "Crystal boba", 0.85),
    opt("egg-pudding", "Egg pudding", 0.75),
    opt("grass-jelly", "Grass jelly", 0.75),
    opt("aloe", "Aloe vera", 0.75),
    opt("rainbow-mochi", "Rainbow mochi", 0.85),
    opt("cheese-foam", "Cheese foam", 0.85),
  ],
};

const drinkGroups = (): ModifierGroup[] => [drinkSize, sugar, ice, drinkToppings];

// ----------------------------------------------------------- shaved snow

const snowSize: ModifierGroup = {
  id: "size",
  label: "Size",
  kind: "single",
  min: 1,
  max: 1,
  defaults: ["regular"],
  options: [opt("regular", "Regular"), opt("large", "Large", 2.0)],
};

/** Four toppings are included; the shop charges past that. */
const snowToppings: ModifierGroup = {
  id: "snow-toppings",
  label: "Toppings",
  kind: "multi",
  min: 0,
  max: 4,
  options: [
    opt("rainbow-mochi", "Rainbow mochi"),
    opt("fruity-pebbles", "Fruity Pebbles"),
    opt("strawberry", "Fresh strawberry"),
    opt("mango", "Diced mango"),
    opt("red-bean", "Red bean"),
    opt("lychee-jelly", "Lychee jelly"),
    opt("oreo", "Oreo crumble"),
    opt("boba", "Tapioca boba"),
  ],
};

const drizzle: ModifierGroup = {
  id: "drizzle",
  label: "Drizzle",
  kind: "single",
  min: 1,
  max: 1,
  defaults: ["condensed-milk"],
  options: [
    opt("condensed-milk", "Condensed milk"),
    opt("chocolate", "Chocolate"),
    opt("caramel", "Caramel"),
    opt("strawberry", "Strawberry"),
    opt("none", "No drizzle"),
  ],
};

// ------------------------------------------------------------- egg puffs

const puffAddOns: ModifierGroup = {
  id: "add-ons",
  label: "Add-ons",
  kind: "multi",
  min: 0,
  options: [
    opt("ice-cream", "Scoop of ice cream", 2.0),
    opt("nutella", "Nutella drizzle", 1.0),
    opt("strawberries", "Fresh strawberries", 1.5),
    opt("oreo", "Oreo crumble", 1.0),
    opt("condensed-milk", "Condensed milk", 0.75),
  ],
};

// ------------------------------------------------------------ shaved ice

/** Asian Ice is sold as "six toppings" — the count is the product. */
const asianIceToppings: ModifierGroup = {
  id: "ice-toppings",
  label: "Toppings",
  kind: "multi",
  min: 1,
  max: 6,
  options: [
    opt("red-bean", "Red bean"),
    opt("grass-jelly", "Grass jelly"),
    opt("lychee-jelly", "Lychee jelly"),
    opt("rainbow-mochi", "Rainbow mochi"),
    opt("mango", "Diced mango"),
    opt("strawberry", "Fresh strawberry"),
    opt("boba", "Tapioca boba"),
    opt("sweet-corn", "Sweet corn"),
    opt("aloe", "Aloe vera"),
    opt("condensed-milk", "Condensed milk"),
  ],
};

const hawaiianSyrups: ModifierGroup = {
  id: "syrups",
  label: "Syrups",
  kind: "multi",
  min: 1,
  max: 3,
  options: [
    opt("strawberry", "Strawberry"),
    opt("lemon-lime", "Lemon lime"),
    opt("blue-raspberry", "Blue raspberry"),
    opt("mango", "Mango"),
    opt("cherry", "Cherry"),
    opt("grape", "Grape"),
    opt("watermelon", "Watermelon"),
    opt("pineapple", "Pineapple"),
  ],
};

const iceSize: ModifierGroup = {
  id: "size",
  label: "Size",
  kind: "single",
  min: 1,
  max: 1,
  defaults: ["small"],
  options: [
    opt("small", "Small"),
    opt("regular", "Regular", 1.0),
    opt("large", "Large", 2.0),
  ],
};

// ----------------------------------------------------------------- items

export const MENU_ITEMS: MenuItem[] = [
  {
    id: "brown-sugar-milk-tea",
    categoryId: "milk-tea",
    productType: "DRINK",
    name: "Brown Sugar Milk Tea",
    description: "Brown sugar syrup and tapioca boba layered into fresh milk.",
    basePrice: 6.25,
    imageUrl: "/menu/brown-sugar-milk-tea.png",
    imageFit: "contain",
    modifierGroups: drinkGroups(),
    isPopular: true,
    isAvailable: true,
  },
  {
    id: "classic-milk-tea",
    categoryId: "milk-tea",
    productType: "DRINK",
    name: "Classic Milk Tea",
    description: "Black tea shaken with milk. The one everything else is built on.",
    basePrice: 5.25,
    modifierGroups: drinkGroups(),
    isAvailable: true,
  },
  {
    id: "thai-milk-tea",
    categoryId: "milk-tea",
    productType: "DRINK",
    name: "Thai Milk Tea",
    description: "Spiced Thai tea with condensed milk.",
    basePrice: 5.75,
    modifierGroups: drinkGroups(),
    isAvailable: true,
  },
  {
    id: "taro-milk-tea",
    categoryId: "milk-tea",
    productType: "DRINK",
    name: "Taro Milk Tea",
    description: "Stone-ground taro blended with fresh milk.",
    basePrice: 5.95,
    modifierGroups: drinkGroups(),
    isAvailable: true,
  },
  {
    id: "matcha-milk-tea",
    categoryId: "milk-tea",
    productType: "DRINK",
    name: "Matcha Milk Tea",
    description: "Ceremonial-grade matcha whisked with fresh milk.",
    basePrice: 6.25,
    modifierGroups: drinkGroups(),
    isAvailable: true,
  },

  {
    id: "honeydew-milk-tea",
    categoryId: "milk-tea",
    productType: "DRINK",
    name: "Honeydew Milk Tea",
    description: "Sweet honeydew melon blended into a creamy milk tea.",
    basePrice: 5.95,
    modifierGroups: drinkGroups(),
    isAvailable: true,
  },
  {
    id: "jasmine-green-milk-tea",
    categoryId: "milk-tea",
    productType: "DRINK",
    name: "Jasmine Green Milk Tea",
    description: "Fragrant jasmine green tea, lighter than the classic.",
    basePrice: 5.5,
    modifierGroups: drinkGroups(),
    isAvailable: true,
  },
  {
    id: "coffee-milk-tea",
    categoryId: "milk-tea",
    productType: "DRINK",
    name: "Coffee Milk Tea",
    description: "Black tea cut with espresso and finished with milk.",
    basePrice: 6.0,
    modifierGroups: drinkGroups(),
    isAvailable: true,
  },

  {
    id: "thai-dye-snow",
    categoryId: "shaved-snow",
    productType: "SHAVED_SNOW",
    name: "Thai Dye",
    description:
      "Thai tea snow with rainbow mochi, Fruity Pebbles, and a condensed milk drizzle.",
    basePrice: 9.5,
    imageUrl: "/menu/thai-dye-snow.jpg",
    imageFit: "cover",
    modifierGroups: [snowSize, snowToppings, drizzle],
    isPopular: true,
    isAvailable: true,
  },
  {
    id: "mango-snow",
    categoryId: "shaved-snow",
    productType: "SHAVED_SNOW",
    name: "Mango Snow",
    description: "Ribbons of mango snow, built however you like it.",
    basePrice: 9.5,
    modifierGroups: [snowSize, snowToppings, drizzle],
    isAvailable: true,
  },
  {
    id: "matcha-snow",
    categoryId: "shaved-snow",
    productType: "SHAVED_SNOW",
    name: "Matcha Snow",
    description: "Matcha snow, red bean, and condensed milk.",
    basePrice: 9.5,
    modifierGroups: [snowSize, snowToppings, drizzle],
    isAvailable: true,
  },
  {
    id: "original-milk-snow",
    categoryId: "shaved-snow",
    productType: "SHAVED_SNOW",
    name: "Original Milk Snow",
    description: "Plain sweet milk snow. The blank canvas.",
    basePrice: 8.5,
    modifierGroups: [snowSize, snowToppings, drizzle],
    isAvailable: true,
  },

  {
    id: "original-egg-puff",
    categoryId: "egg-puff",
    productType: "EGG_PUFF",
    name: "Original Egg Puff",
    description: "Hong Kong egg waffle, crisp outside and custardy in the bubbles.",
    basePrice: 7.0,
    imageUrl: "/menu/egg-puffs.png",
    imageFit: "cover",
    modifierGroups: [puffAddOns],
    isPopular: true,
    isAvailable: true,
  },
  {
    id: "pandan-egg-puff",
    categoryId: "egg-puff",
    productType: "EGG_PUFF",
    name: "Pandan Egg Puff",
    description: "The original, made green and grassy-sweet with pandan.",
    basePrice: 7.5,
    modifierGroups: [puffAddOns],
    isAvailable: true,
  },

  {
    id: "chocolate-egg-puff",
    categoryId: "egg-puff",
    productType: "EGG_PUFF",
    name: "Chocolate Egg Puff",
    description: "Cocoa batter with melted chocolate in every bubble.",
    basePrice: 7.5,
    modifierGroups: [puffAddOns],
    isAvailable: true,
  },
  {
    id: "ube-egg-puff",
    categoryId: "egg-puff",
    productType: "EGG_PUFF",
    name: "Ube Egg Puff",
    description: "Purple yam batter, sweet and just a little nutty.",
    basePrice: 7.75,
    modifierGroups: [puffAddOns],
    isAvailable: true,
  },

  {
    id: "mangonada",
    categoryId: "specialty",
    productType: "DRINK",
    name: "Mangonada",
    description:
      "House-made mango sorbet with chamoy, Tajín, diced mango, and a tamarind stick.",
    basePrice: 8.5,
    imageUrl: "/menu/mangonada.png",
    imageFit: "contain",
    modifierGroups: [drinkSize, drinkToppings],
    isPopular: true,
    isAvailable: true,
  },
  {
    id: "strawberry-lemonade",
    categoryId: "specialty",
    productType: "DRINK",
    name: "Strawberry Lemonade",
    description: "Fresh strawberries pressed into lemonade.",
    basePrice: 6.5,
    modifierGroups: [drinkSize, sugar, ice, drinkToppings],
    isAvailable: true,
  },
  {
    id: "passionfruit-green-tea",
    categoryId: "specialty",
    productType: "DRINK",
    name: "Passionfruit Green Tea",
    description: "Green tea shaken with real passionfruit.",
    basePrice: 5.95,
    modifierGroups: [drinkSize, sugar, ice, drinkToppings],
    isAvailable: true,
  },

  {
    id: "lychee-lemonade",
    categoryId: "specialty",
    productType: "DRINK",
    name: "Lychee Lemonade",
    description: "Lychee and lemon over ice, light and very cold.",
    basePrice: 6.25,
    modifierGroups: [drinkSize, sugar, ice, drinkToppings],
    isAvailable: true,
  },

  {
    id: "asian-ice",
    categoryId: "asian-ice",
    productType: "SHAVED_ICE",
    name: "Asian Ice",
    description:
      "Six toppings under shaved ice, finished with red grenadine and a condensed milk drizzle.",
    basePrice: 9.0,
    imageUrl: "/menu/asian-ice.png",
    imageFit: "contain",
    modifierGroups: [snowSize, asianIceToppings, drizzle],
    isPopular: true,
    isAvailable: true,
  },

  {
    id: "grass-jelly-ice",
    categoryId: "asian-ice",
    productType: "SHAVED_ICE",
    name: "Grass Jelly Ice",
    description: "Grass jelly and sweet corn under shaved ice with condensed milk.",
    basePrice: 8.5,
    modifierGroups: [snowSize, asianIceToppings, drizzle],
    isAvailable: true,
  },

  {
    id: "hawaiian-ice",
    categoryId: "hawaiian-ice",
    productType: "SHAVED_ICE",
    name: "Hawaiian Shaved Ice",
    description: "Shaved ice with up to three flavored syrups.",
    basePrice: 5.5,
    modifierGroups: [iceSize, hawaiianSyrups],
    isAvailable: true,
  },
  {
    id: "hawaiian-ice-cream",
    categoryId: "hawaiian-ice",
    productType: "SHAVED_ICE",
    name: "Snow Cap",
    description: "Hawaiian shaved ice over vanilla ice cream, condensed milk on top.",
    basePrice: 7.5,
    modifierGroups: [iceSize, hawaiianSyrups],
    isAvailable: true,
  },
];

// ------------------------------------------------------------- selection

/** Turns a group's `defaults` into the drawer's starting selection. */
export function defaultSelection(item: MenuItem): SelectedModifiers {
  const selection: SelectedModifiers = {};
  for (const group of item.modifierGroups) {
    selection[group.id] = group.defaults ? [...group.defaults] : [];
  }
  return selection;
}

export function calculateCartItemPrice(
  item: MenuItem,
  modifiers: SelectedModifiers,
): number {
  let price = item.basePrice;
  for (const group of item.modifierGroups) {
    for (const optionId of modifiers[group.id] ?? []) {
      price += group.options.find((o) => o.id === optionId)?.priceDelta ?? 0;
    }
  }
  return price;
}

/** Groups that still need a choice before the item can be added. */
export function unmetGroups(
  item: MenuItem,
  modifiers: SelectedModifiers,
): ModifierGroup[] {
  return item.modifierGroups.filter(
    (g) => (modifiers[g.id] ?? []).length < g.min,
  );
}

/** "Large · 100% · Regular ice · Tapioca boba, Cheese foam" */
export function describeModifiers(
  item: MenuItem,
  modifiers: SelectedModifiers,
): string {
  const parts: string[] = [];
  for (const group of item.modifierGroups) {
    const names = (modifiers[group.id] ?? [])
      .map((id) => group.options.find((o) => o.id === id)?.name)
      .filter((n): n is string => Boolean(n));
    if (names.length > 0) parts.push(names.join(", "));
  }
  return parts.join(" · ");
}
