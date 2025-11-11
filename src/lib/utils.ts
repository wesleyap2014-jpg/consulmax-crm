// src/lib/utils.ts
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge de classes Tailwind com segurança (padrão shadcn/ui) */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Alias útil quando quiser apenas concatenar sem merge do Tailwind */
export const cx = (...inputs: ClassValue[]) => clsx(inputs);
