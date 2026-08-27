import type { IceLevel } from "@/types/boba";

const ICE_LABELS: Record<IceLevel, string> = {
  NO_ICE: "No Ice",
  LESS_ICE: "Less Ice",
  REGULAR_ICE: "Regular Ice",
  EXTRA_ICE: "Extra Ice",
  HOT: "Hot",
};

export function formatIceLevel(level: IceLevel): string {
  return ICE_LABELS[level];
}

export function formatPrice(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
