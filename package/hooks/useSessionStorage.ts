import { useCallback, useEffect, useSyncExternalStore } from "react";

type SessionStorageKey = string;
type SessionStorageValue = any;

const dispatchStorageEvent = (key: SessionStorageKey, newValue?: string | null) => {
  window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
};

const getSessionStorageItem = (key: SessionStorageKey) => {
  return window.sessionStorage.getItem(key);
};

const setSessionStorageItem = (key: SessionStorageKey, value: SessionStorageValue) => {
  const sessionStorageValue = JSON.stringify(value);
  window.sessionStorage.setItem(key, sessionStorageValue);
  dispatchStorageEvent(key, sessionStorageValue);
};

const removeSessionStorageItem = (key: SessionStorageKey) => {
  window.sessionStorage.removeItem(key);
  dispatchStorageEvent(key, null);
};

const useSessionStorageSubscribe = (callback: (e: StorageEvent) => void) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

const getSessionStorageServerSnapshot = () => {
  throw Error("useSessionStorage 只是一个客户端 hook，不能在服务端使用");
};

const useSessionStorage = <T extends SessionStorageValue>(key: SessionStorageKey, initialValue: T) => {
  const getSnapshot = () => getSessionStorageItem(key);

  const store = useSyncExternalStore(useSessionStorageSubscribe, getSnapshot, getSessionStorageServerSnapshot);

  type Updater<T> = (value: T) => T | undefined | null;

  const setState: (v: T | Updater<T>) => void = useCallback(
    (v) => {
      try {
        const nextState = typeof v === "function" ? (v as Updater<T>)(JSON.parse(store ?? "")) : v;

        if (nextState === undefined || nextState === null) {
          removeSessionStorageItem(key);
        } else {
          setSessionStorageItem(key, nextState);
        }
      } catch (e) {
        console.warn(e);
      }
    },
    [key, store]
  );

  useEffect(() => {
    if (getSessionStorageItem(key) === null && typeof initialValue !== "undefined") {
      setSessionStorageItem(key, initialValue);
    }
  }, [key, initialValue]);

  return [store ? JSON.parse(store) : initialValue, setState] as [T, typeof setState];
};

export default useSessionStorage;
