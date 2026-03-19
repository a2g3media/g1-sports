import { useState, useEffect, useCallback } from "react";

/**
 * A hook for persisting state to localStorage with type safety.
 * - Reads initial value from localStorage on mount
 * - Updates localStorage when value changes
 * - Handles SSR/hydration safely
 * - Falls back to defaultValue if localStorage is unavailable or parsing fails
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  // Initialize state with a function to only read localStorage once
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return defaultValue;
    }
    
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) {
        return defaultValue;
      }
      return JSON.parse(item) as T;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return defaultValue;
    }
  });

  // Update localStorage whenever storedValue changes
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  // Memoized setter that supports functional updates
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue((prev) => {
      const nextValue = value instanceof Function ? value(prev) : value;
      return nextValue;
    });
  }, []);

  return [storedValue, setValue];
}

/**
 * Specific hook for Scout panel collapse state.
 * Default is expanded (false = not collapsed).
 */
export function useScoutPanelState() {
  return useLocalStorage<boolean>("gz-scout-panel-collapsed", false);
}
