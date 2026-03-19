import { useState, useCallback, createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export type OddsFormat = 'american' | 'decimal';

interface OddsFormatContextValue {
  format: OddsFormat;
  setFormat: (f: OddsFormat) => void;
  formatMoneylineValue: (ml: number | null | undefined) => string;
  formatSpreadValue: (spread: number | null | undefined) => string;
  formatTotalValue: (total: number | null | undefined) => string;
}

const STORAGE_KEY = 'gz-odds-format';
const DEFAULT_FORMAT: OddsFormat = 'american';

export function americanToDecimal(american: number): number {
  if (american >= 100) {
    return (american / 100) + 1;
  }
  return (100 / Math.abs(american)) + 1;
}

function fmtMoneyline(ml: number | null | undefined, fmt: OddsFormat): string {
  if (ml === null || ml === undefined) return '-';
  // Round to integer - American moneylines should never have decimals
  const rounded = Math.round(ml);
  if (fmt === 'decimal') {
    return americanToDecimal(rounded).toFixed(2);
  }
  return rounded > 0 ? '+' + rounded : String(rounded);
}

function fmtSpread(spread: number | null | undefined): string {
  if (spread === null || spread === undefined) return '-';
  // Snap noisy provider values to standard betting increments (0.5).
  const snapped = Math.round(spread * 2) / 2;
  if (Object.is(snapped, -0) || snapped === 0) return 'PK';
  const formatted = Number.isInteger(snapped) ? String(snapped) : snapped.toFixed(1);
  return snapped > 0 ? '+' + formatted : formatted;
}

function fmtTotal(total: number | null | undefined): string {
  if (total === null || total === undefined) return '-';
  // Totals typically come in 0.5 increments - format cleanly
  const isHalf = total % 1 !== 0;
  return isHalf ? total.toFixed(1) : String(Math.round(total));
}

const OddsFormatContext = createContext<OddsFormatContextValue | null>(null);

export function OddsFormatProvider(props: { children: ReactNode }) {
  const [format, setFormatState] = useState<OddsFormat>(function() {
    if (typeof window === 'undefined') return DEFAULT_FORMAT;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'american' || stored === 'decimal') return stored;
    return DEFAULT_FORMAT;
  });

  const setFormat = useCallback(function(newFormat: OddsFormat) {
    setFormatState(newFormat);
    localStorage.setItem(STORAGE_KEY, newFormat);
  }, []);

  const formatMoneylineValue = useCallback(function(ml: number | null | undefined): string {
    return fmtMoneyline(ml, format);
  }, [format]);

  const formatSpreadValue = useCallback(function(spread: number | null | undefined): string {
    return fmtSpread(spread);
  }, []);

  const formatTotalValue = useCallback(function(total: number | null | undefined): string {
    return fmtTotal(total);
  }, []);

  const value: OddsFormatContextValue = {
    format: format,
    setFormat: setFormat,
    formatMoneylineValue: formatMoneylineValue,
    formatSpreadValue: formatSpreadValue,
    formatTotalValue: formatTotalValue,
  };

  return (
    <OddsFormatContext.Provider value={value}>
      {props.children}
    </OddsFormatContext.Provider>
  );
}

function defaultFormatMoneyline(ml: number | null | undefined): string {
  return fmtMoneyline(ml, DEFAULT_FORMAT);
}

const FALLBACK: OddsFormatContextValue = {
  format: DEFAULT_FORMAT,
  setFormat: function() {},
  formatMoneylineValue: defaultFormatMoneyline,
  formatSpreadValue: fmtSpread,
  formatTotalValue: fmtTotal,
};

export function useOddsFormat(): OddsFormatContextValue {
  const ctx = useContext(OddsFormatContext);
  if (ctx === null) return FALLBACK;
  return ctx;
}
