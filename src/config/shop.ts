/**
 * Shop facts. Addresses and phone numbers are the real ones from snowdaes.com;
 * hours are deliberately absent because the shop publishes none — do not invent
 * them (PLAN §9).
 */
export const SHOP = {
  name: "Snowdaes",
  tagline: "Make every day a Snowdae.",
  blurb: "Shaved snow, egg puffs, and milk tea, made to order since 2013.",
  about:
    "Snowdaes is dedicated to serving vibrant and tasty desserts that capture the essence of joy and indulgence. With a variety of flavors and toppings, there is something here for everyone.",
  established: 2013,
  /** The location this ordering flow currently points at. */
  pickupLocation: "Billerica, MA",
  wait: "15–20 min",
} as const;

export interface ShopLocation {
  id: string;
  city: string;
  street: string;
  cityLine: string;
  phone: string;
  isNew?: boolean;
}

export const LOCATIONS: ShopLocation[] = [
  {
    id: "lowell",
    city: "Lowell",
    street: "1075 Westford Street",
    cityLine: "Lowell, MA 01851",
    phone: "978-455-0805",
  },
  {
    id: "billerica",
    city: "Billerica",
    street: "99 Chelmsford Rd",
    cityLine: "Billerica, MA 01862",
    phone: "978-294-2041",
    isNew: true,
  },
];

export const SOCIALS = [
  { id: "instagram", label: "Instagram", handle: "@snowdaes", href: "https://www.instagram.com/snowdaes/" },
  { id: "facebook", label: "Facebook", handle: "Snowdaes", href: "https://www.facebook.com/Snowdaes/" },
  { id: "tiktok", label: "TikTok", handle: "@snowdaeslowell", href: "https://www.tiktok.com/@snowdaeslowell" },
] as const;

/**
 * PLACEHOLDER CONTENT — every quote below is invented for layout purposes.
 * These are not real customers and must be replaced with genuine, permissioned
 * reviews (or removed) before this is shown publicly. See PLAN §9.
 */
export const TESTIMONIALS = [
  {
    id: "t1",
    quote:
      "The Thai Dye is the reason I drive out here. My kids get the egg puffs every single time and we leave with zero leftovers.",
    name: "Maya R.",
    city: "Chelmsford, MA",
  },
  {
    id: "t2",
    quote:
      "Six toppings on the Asian Ice and they let me pick every one of them. Nowhere else near here does that.",
    name: "Priya S.",
    city: "Billerica, MA",
  },
  {
    id: "t3",
    quote:
      "Brown sugar milk tea, half sugar, extra boba. They get it right every time and it is never a long wait.",
    name: "Danny T.",
    city: "Lowell, MA",
  },
] as const;
