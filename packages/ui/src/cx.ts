export type ClassValue = string | false | null | undefined | 0;

export const cx = (...values: ClassValue[]): string => values.filter(Boolean).join(' ');
