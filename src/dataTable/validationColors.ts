import type { ValidationStatus } from '../ocr/validateObservations';

export const validationColors: Record<ValidationStatus, string> = {
  matched: 'success.main',
  different: 'warning.main',
  'not-found': '#8a6800',
  review: '#7b1fa2',
  'no-photos': '#455a64',
  incomplete: 'warning.main',
};
