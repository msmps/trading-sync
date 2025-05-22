import { Brand, Schema } from "effect";

export type Dollars = number & Brand.Brand<"Dollars">;
const Dollars = Brand.nominal<Dollars>();
export const DollarsSchema = Schema.fromBrand(Dollars)(Schema.Number);

type Milliunits = number & Brand.Brand<"Milliunits">;
const Milliunits = Brand.nominal<Milliunits>();
export const MilliunitsSchema = Schema.fromBrand(Milliunits)(Schema.Number);

export function dollarsToMilliunits(amount: Dollars): Milliunits {
  return Milliunits(round(amount * 1000, 0));
}

export function round(value: number, decimals = 2): number {
  // Gemini 2.0
  const factor = 10 ** Math.round(decimals);
  const eps = Number.EPSILON * value * factor;
  return Math.round((value + eps) * factor) / factor;
}
