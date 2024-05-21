import { useCallback, useEffect, useSyncExternalStore } from "react";

type LocalStorageKey = string;
type LocalStorageValue = any;

const dispatchStorageEvent = (key: LocalStorageKey, newValue?: string | null) => {
  window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
};

const getLocalStorageItem = (key: LocalStorageKey) => {
  return window.localStorage.getItem(key);
};

const setLocalStorageItem = (key: LocalStorageKey, value: LocalStorageValue) => {
  const localStorageValue = JSON.stringify(value);
  window.localStorage.setItem(key, localStorageValue);
  dispatchStorageEvent(key, localStorageValue);
};

const removeLocalStorageItem = (key: LocalStorageKey) => {
  window.localStorage.removeItem(key);
  dispatchStorageEvent(key, null);
};

const useLocalStorageSubscribe = (callback: (e: StorageEvent) => void) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

const getLocalStorageServerSnapshot = () => {
  throw Error("useLocalStorage 只是一个客户端 hook，不能在服务端使用");
};

const useLocalStorage = <T extends LocalStorageValue>(key: LocalStorageKey, initialValue: T) => {
  const getSnapshot = () => getLocalStorageItem(key);

  const store = useSyncExternalStore(useLocalStorageSubscribe, getSnapshot, getLocalStorageServerSnapshot);

  type Updater<T> = (value: T) => T | undefined | null;

  const setState: (v: T | Updater<T>) => void = useCallback(
    (v) => {
      try {
        const nextState = typeof v === "function" ? (v as Updater<T>)(JSON.parse(store ?? "")) : v;

        if (nextState === undefined || nextState === null) {
          removeLocalStorageItem(key);
        } else {
          setLocalStorageItem(key, nextState);
        }
      } catch (e) {
        console.warn(e);
      }
    },
    [key, store]
  );

  useEffect(() => {
    if (getLocalStorageItem(key) === null && typeof initialValue !== "undefined") {
      setLocalStorageItem(key, initialValue);
    }
  }, [key, initialValue]);

  return [store ? JSON.parse(store) : initialValue, setState] as [T, typeof setState];
};

export default useLocalStorage;
