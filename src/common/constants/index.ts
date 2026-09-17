export * from './expense.constants';
export * from './rating.constants';

/** Default page size used by every cursor-paginated list endpoint. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/** ISO-4217 codes the API accepts today. */
export const SUPPORTED_CURRENCIES = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'AED',
  'SGD',
  'THB',
  'AUD',
  'JPY',
  'LKR',
  'NPR',
  'IDR',
  'MYR',
  'VND',
] as const;
