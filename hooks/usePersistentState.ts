import AsyncStorage from '@react-native-async-storage/async-storage';
import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { readLocal, writeLocal } from '../services/storage';

export function usePersistentState<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readLocal(key, initialValue));
  const ready = useRef(Platform.OS === 'web');
  const changed = useRef(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    AsyncStorage.getItem(key).then((stored) => {
      if (active && stored && !changed.current) { try { setValue(JSON.parse(stored)); } catch { /* Keep defaults. */ } }
    }).catch(() => undefined).finally(() => { ready.current = true; });
    return () => { active = false; };
  }, [key]);
  useEffect(() => {
    if (Platform.OS === 'web') writeLocal(key, value);
    else if (ready.current || changed.current) void AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);
  }, [key, value]);
  const update: Dispatch<SetStateAction<T>> = (next) => { changed.current = true; setValue(next); };
  return [value, update];
}
