export interface Process {
  id: number;
  process_number: string;
  object: string;
  created_at: string;
}

export interface Item {
  id: number;
  process_id: number;
  item_number: number;
  specification: string;
  unit: string;
  quantity: number;
  pricing_strategy: 'sanitized' | 'mean' | 'median';
}

export interface Quote {
  id: number;
  item_id: number;
  source: string;
  quote_date: string;
  unit_price: number;
  quote_type: 'public' | 'private';
  is_outlier?: boolean;
}

export interface Stats {
  min: number;
  mean: number;
  median: number;
  stdDev: number;
  cv: number;
  lowerLimit: number;
  upperLimit: number;
  sanitizedMean: number;
  totalEstimated: number;
  validQuotes: number;
  outliersCount: number;
}
