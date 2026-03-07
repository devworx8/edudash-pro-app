'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

// Daily Prebuilt state management context
interface DailyPrebuiltContextType {
  // State
  isInCall: boolean;
  isLoading: boolean;
  participantCount: number;
  error: string | null;
  networkQuality: 'good' | 'fair' | 'poor' | null;

  // Actions
  setIsInCall: (value: boolean) => void;
  setIsLoading: (value: boolean) => void;
  setParticipantCount: (count: number) => void;
  setError: (error: string | null) => void;
  setNetworkQuality: (quality: 'good' | 'fair' | 'poor' | null) => void;
  handleCallEnd: () => void;
}

const DailyPrebuiltContext = createContext<DailyPrebuiltContextType | null>(null);

export function useDailyPrebuilt() {
  const context = useContext(DailyPrebuiltContext);
  if (!context) {
    throw new Error('useDailyPrebuilt must be used within a DailyPrebuiltProvider');
  }
  return context;
}

interface DailyPrebuiltProviderProps {
  children: ReactNode;
  onCallEnd?: () => void;
}

export function DailyPrebuiltProvider({ children, onCallEnd }: DailyPrebuiltProviderProps) {
  const [isInCall, setIsInCall] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [networkQuality, setNetworkQuality] = useState<'good' | 'fair' | 'poor' | null>(null);

  const handleCallEnd = useCallback(() => {
    setIsInCall(false);
    setIsLoading(false);
    setParticipantCount(0);
    setError(null);
    setNetworkQuality(null);
    onCallEnd?.();
  }, [onCallEnd]);

  const value: DailyPrebuiltContextType = {
    isInCall,
    isLoading,
    participantCount,
    error,
    networkQuality,
    setIsInCall,
    setIsLoading,
    setParticipantCount,
    setError,
    setNetworkQuality,
    handleCallEnd,
  };

  return (
    <DailyPrebuiltContext.Provider value={value}>
      {children}
    </DailyPrebuiltContext.Provider>
  );
}
