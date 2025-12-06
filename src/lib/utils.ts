// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * cn()
 * - Tailwind 클래스 중복 제거 + 조건부 병합
 * - shadcn/ui, Radix UI, Tailwind 기반 프로젝트에서 표준처럼 사용됨
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}