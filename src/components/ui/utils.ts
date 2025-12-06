// src/components/ui/utils.ts
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * TailwindCSS 클래스들을 안전하게 병합하는 유틸리티 함수입니다.
 * 예: cn("text-sm", condition && "text-red-500")
 */
export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}