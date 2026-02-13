type Methods<T> = {
  [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

type Properties<T> = Omit<T, Methods<T>>;

type PrimitiveTypes = string | number | boolean | undefined | null;

type ValueObjectValue<T> = T extends PrimitiveTypes
  ? T
  : T extends Date
  ? Date
  : T extends { value: infer U }
  ? ValueObjectValue<U>
  : T extends Array<infer U>
  ? ValueObjectValue<U>[]
  : T extends object
  ? { [K in keyof Properties<T>]: ValueObjectValue<Properties<T>[K]> }
  : T;

export type Primitives<T> = {
  [K in keyof Properties<T>]: ValueObjectValue<T[K]>;
};
