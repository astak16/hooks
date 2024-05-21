项目中经常使用 `sessionStorage` 或者 `localStorage`，在习惯了 `react hooks` 写法之后，就会思考如何用 `hooks` 封装 `sessionStorage` 和 `localStorage`

如何对 `sessionStorage` 和 `localStorage` 进行封装，使其更加易用，更加符合 `react hooks` 的使用方式呢？

在封装之前，先来介绍 `2` 个 `api`

- `StorageEvent`
- `useSyncExternalStore`

### StorageEvent

我们对 `sessionStorage` 已经非常熟悉了，但对 `Storage` 事件是比较陌生的，这个事件是你更新了某个 `storage` 所有同源页面都能知道 `storage` 被修改了

通过 `StorageEvent` 对象，创建一个 `Storage` 事件

```js
new StorageEvent("storage", {});
```

使用 `window.dispatchEvent` 将它注册到全局

```js
window.dispatchEvent(new StorageEvent("storage", {}));
```

全局监听 `storage` 事件

```js
window.addEventListener("storage", () => {});
```

修改或者 `sessionStorage` 时调用 `dispatchEvent` 注册事件，然后监听函数会获取到修改后的 `storage`，进行后续操作

### useSyncExternalStore

`useSyncExternalStore` 是 `react` 一个 `hook`，用于从外部数据源读取和订阅 `hook`

这个 `hooks` 有三个参数：

- `subscribe`：这是一个订阅函数，当数据发生改变时，会调用这个函数，然组件更新
- `getSnapshot`：获取当前 `store` 的函数
- `getServerSnapshot`：服务端渲染时会用到，这里用不到

看下面例子：

准备一个数据源 `store`

- `state` 保存页面需要的状态
- `subscribe` 提供订阅改变 `state` 的能力
- `getSnapshot` 返回最新的 `state`
- `dispatch` 页面更新时触发函数

```js
// 数据源
const store = {
  state: { data: 0 },
  listeners: [],
  reducer(action) {
    switch (action.type) {
      case "ADD":
        return { data: store.state.data + 1 };
      default:
        return store.state;
    }
  },
  subscribe(l) {
    store.listeners.push(l);
  },
  getSnapshot() {
    return store.state;
  },
  dispatch(action) {
    store.state = store.reducer(action);
    store.listeners.forEach((l) => l());
    return action;
  },
};

// 使用
function Demo() {
  // 第一个参数是状态订阅
  // 第二个参数是最新状态
  // 返回最新的状态
  const state = useSyncExternalStore(store.subscribe, () => store.getSnapshot().data);

  return (
    <div className="p-100">
      <div>count:{state}</div>
      <div>
        <button onClick={() => store.dispatch({ type: "ADD" })}>add+</button>
      </div>
    </div>
  );
}
```

## 封装 useSessionStorage

`useSessionStorage` 和 `useLocalStorage` 封装的方法是一样的，这里就用 `useSessionStorage` 作为例子

先来思考一下 `useSessionStorage` 的 `api` 如何设计

1. 入参
   - 需要一个 `sessionStorageKey`
   - `sessionStorage` 中数据的初始数据
2. 出参应该是两个值
   - `sessionStorage` 中保存的数据
   - 修改 `sessionStorage` 中数据的函数
3. 清理 `sessionStorage` 中的数据，通过 `set` 方法，传递与一个 `null` 或者 `undefined` 来实现

`api` 最终形式应该长这样：

```js
const [testStorage, setTestStorage] = useSessionStorage("test-storage", { name: "uccs", age: 18 });
```

接下来一步步实现 `useSessionStorage` 函数

### storage 事件派发与订阅

提供一个 `storage` 事件派发和订阅函数：

- 事件派发函数是在 `sessionStorage.setItem` 和 `sessionStorage.removeItem` 时发生
- 事件订阅是给 `useSyncExternalStore` 第一个参数 `subscribe` 使用

```js
// 事件派发函数
const dispatchStorageEvent = (key: SessionStorageKey, newValue?: string | null) => {
  window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
};
// 事件订阅函数
const useSessionStorageSubscribe = (callback: (e: StorageEvent) => void) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};
```

### sessionStorage 相关 api 封装

封装 `sessionStorage.getItem`、`sessionStorage.setItem`、`sessionStorage.removeItem` 函数

- 在 `seSessionStorage.setItem` 和 `sessionStorage.removeItem` 时，需要调用 `dispatchStorageEvent` 函数派发 `storage` 事件

```js
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
```

### useSyncExternalStore 使用

`useSyncExternalStore` 三个参数分别传入 `useSessionStorageSubscribe`、`getSnapshot`、`getSessionStorageServerSnapshot` 函数

- `useSessionStorageSubscribe` 是订阅函数上面已经封装好了
- `getSnapshot` 函数是获取 `sessionStorage` 中的数据
- `getSessionStorageServerSnapshot` 是用来报错的，避免 `useSyncExternalStore` 在服务端使用

```js
const getSessionStorageServerSnapshot = () => {
  throw Error("useSessionStorage 只是一个客户端 hook，不能在服务端使用");
};

const getSnapshot = () => getSessionStorageItem(key);
const store = useSyncExternalStore(useSessionStorageSubscribe, getSnapshot, getSessionStorageServerSnapshot);
```

### 封装修改 sessionStorage 数据的函数

`setState` 函数接收一个参数，可以是一个值，也可以是一个函数，如果是函数的话，就将 `store` 传递给这个回调函数

这个回调函数需要返回一个新的 `store`，这 `store` 可以是一个最新的状态，可以是一个 `null` 或者 `undefined`

- 如果是 `null` 或者 `undefined`，就代表需要将 `sessionStorage` 中的数据清除

```js
type Updater<T> = (value: T) => T;

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
```

### 完整代码

下面是 `useSessionStorage` 完整代码，`useLocalStorage` 代码和 `useSessionStorage` 代码是一样的，只是将 `sessionStorage` 换成了 `localStorage`

```js
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
```
