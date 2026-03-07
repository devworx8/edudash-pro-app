'use client';

import { CallProvider } from './CallProvider';
import { type ReactNode } from 'react';

interface CallProviderWrapperProps {
  children: ReactNode;
}

export function CallProviderWrapper({ children }: CallProviderWrapperProps) {
  return <CallProvider>{children}</CallProvider>;
}
