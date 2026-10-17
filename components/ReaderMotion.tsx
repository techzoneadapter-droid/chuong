import { forwardRef } from 'react';
import { ScrollView, ScrollViewProps } from 'react-native';
import { ReactNode, MutableRefObject } from 'react';
import { ReaderSettings } from '../types';

export type ReaderMotionProps = ScrollViewProps & {
  contentKey: string; enabled: boolean; horizontal: boolean; vertical: boolean;
  previous: boolean; next: boolean; effect: NonNullable<ReaderSettings['pageEffect']>;
  sensitivity: NonNullable<ReaderSettings['gestureSensitivity']>; paper: string; ink?: string;
  previousPreview?: ReactNode; nextPreview?: ReactNode;
  onTurn: (direction: 'previous' | 'next') => void;
  motionRef?: MutableRefObject<((direction: 'previous' | 'next', commit: () => void) => void) | null>;
  geometryRef?: MutableRefObject<((textBottom: number) => void) | null>;
};

// Web retains the existing touch/selection handlers. Native uses UI-thread gestures.
export const ReaderMotion = forwardRef<ScrollView, ReaderMotionProps>(function ReaderMotion({
  contentKey, enabled, horizontal, vertical, previous, next, effect, sensitivity, paper,
  previousPreview, nextPreview, onTurn, motionRef, geometryRef, ink, ...props
}, ref) { return <ScrollView {...props} ref={ref} />; });
