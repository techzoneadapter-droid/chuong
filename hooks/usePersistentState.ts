import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { readLocal, writeLocal } from '../services/storage';

export function usePersistentState<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readLocal(key, initialValue));

  useEffect(() => {
    writeLocal(key, value);
  }, [key, value]);

  return [value, setValue];
}
