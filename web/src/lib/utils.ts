import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmtRank = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-IN").format(n);
