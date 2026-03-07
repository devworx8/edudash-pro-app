'use client';

/**
 * SpotlightTour (Web)
 *
 * Framer-motion based spotlight tour for the Next.js web dashboard.
 * Renders a dark overlay with an animated cutout + tooltip.
 *
 * Usage:
 *   <SpotlightTour tour={parentMenuTour} userRole={role}>
 *     <Dashboard />
 *   </SpotlightTour>
 *
 * Register targets with data-tour-target="<targetKey>" attributes.
 *
 * @module web/src/components/ui/SpotlightTour
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

// ---- Types ----
interface TourStep {
  targetKey: string;
  title: string;
  description: string;
  icon?: string;
  tooltipPosition?: 'above' | 'below' | 'auto';
  spotlightShape?: 'rectangle' | 'circle';
  spotlightPadding?: number;
}

interface TourConfig {
  id: string;
  version: number;
  steps: TourStep[];
  roles?: string[];
}

interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SpotlightTourContextValue {
  startTour: (tourId: string) => void;
  endTour: () => void;
  isActive: boolean;
}

const STORAGE_PREFIX = 'tour:state:';
const SpotlightCtx = createContext<SpotlightTourContextValue>({
  startTour: () => {},
  endTour: () => {},
  isActive: false,
});

export const useSpotlightTour = () => useContext(SpotlightCtx);

// ---- Main Component ----
interface SpotlightTourProps {
  tours: TourConfig[];
  userRole?: string;
  children: React.ReactNode;
}

export function SpotlightTour({ tours, userRole, children }: SpotlightTourProps) {
  const [activeTour, setActiveTour] = useState<TourConfig | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  // Measure a DOM element by data attribute
  const measureTarget = useCallback((key: string) => {
    const el = document.querySelector(`[data-tour-target="${key}"]`);
    if (!el) {
      setTargetRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setTargetRect({
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  // Persistence helpers
  const getCompleted = (tourId: string): number => {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${tourId}`);
      if (raw) return JSON.parse(raw).completedVersion ?? 0;
    } catch { /* */ }
    return 0;
  };

  const saveCompleted = (tourId: string, version: number) => {
    try {
      localStorage.setItem(
        `${STORAGE_PREFIX}${tourId}`,
        JSON.stringify({ completedVersion: version, completedAt: new Date().toISOString() }),
      );
    } catch { /* */ }
  };

  // Start / end
  const startTour = useCallback(
    (tourId: string) => {
      const tour = tours.find((t) => t.id === tourId);
      if (!tour || tour.steps.length === 0) return;
      setActiveTour(tour);
      setCurrentStep(0);
      setTimeout(() => measureTarget(tour.steps[0].targetKey), 300);
    },
    [tours, measureTarget],
  );

  const endTour = useCallback(() => {
    if (activeTour) saveCompleted(activeTour.id, activeTour.version);
    setActiveTour(null);
    setCurrentStep(0);
    setTargetRect(null);
  }, [activeTour]);

  const nextStep = useCallback(() => {
    if (!activeTour) return;
    const next = currentStep + 1;
    if (next >= activeTour.steps.length) {
      endTour();
      return;
    }
    setCurrentStep(next);
    setTimeout(() => measureTarget(activeTour.steps[next].targetKey), 200);
  }, [activeTour, currentStep, endTour, measureTarget]);

  // Auto-trigger
  useEffect(() => {
    if (activeTour) return;
    const timer = setTimeout(() => {
      for (const tour of tours) {
        if (tour.roles?.length && userRole && !tour.roles.includes(userRole)) continue;
        if (getCompleted(tour.id) >= tour.version) continue;
        const el = document.querySelector(`[data-tour-target="${tour.steps[0]?.targetKey}"]`);
        if (el) {
          startTour(tour.id);
          break;
        }
      }
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tours, userRole]);

  const value = useMemo(
    () => ({ startTour, endTour, isActive: !!activeTour }),
    [startTour, endTour, activeTour],
  );

  const step = activeTour?.steps[currentStep];
  const pad = step?.spotlightPadding ?? 8;

  return (
    <SpotlightCtx.Provider value={value}>
      {children}

      {typeof window !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {activeTour && step && (
              <>
                {/* Dark overlay with cutout */}
                <motion.div
                  key="overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  onClick={nextStep}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9998,
                    background: targetRect
                      ? 'transparent'
                      : 'rgba(0,0,0,0.7)',
                  }}
                >
                  {targetRect && (
                    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
                      <defs>
                        <mask id="spotlight-mask-web">
                          <rect width="100%" height="100%" fill="white" />
                          <rect
                            x={targetRect.x - pad}
                            y={targetRect.y - pad}
                            width={targetRect.width + pad * 2}
                            height={targetRect.height + pad * 2}
                            rx={12}
                            fill="black"
                          />
                        </mask>
                      </defs>
                      <rect
                        width="100%"
                        height="100%"
                        fill="rgba(0,0,0,0.7)"
                        mask="url(#spotlight-mask-web)"
                      />
                    </svg>
                  )}
                </motion.div>

                {/* Tooltip */}
                {targetRect && (
                  <motion.div
                    key={`tooltip-${currentStep}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    transition={{ duration: 0.25, delay: 0.1 }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'fixed',
                      zIndex: 9999,
                      top: targetRect.y + targetRect.height + pad + 12,
                      left: Math.max(16, Math.min(
                        targetRect.x + targetRect.width / 2 - 160,
                        window.innerWidth - 336,
                      )),
                      width: 320,
                    }}
                  >
                    <div className="rounded-xl bg-slate-800 border border-blue-500/20 p-4 shadow-xl">
                      <h3 className="text-sm font-semibold text-slate-100 mb-1">
                        {step.title}
                      </h3>
                      <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                        {step.description}
                      </p>
                      <div className="flex items-center justify-between">
                        {/* Dots */}
                        <div className="flex gap-1">
                          {activeTour.steps.map((_, i) => (
                            <div
                              key={i}
                              className={`h-1.5 rounded-full ${
                                i === currentStep
                                  ? 'w-4 bg-blue-500'
                                  : 'w-1.5 bg-slate-600'
                              }`}
                            />
                          ))}
                        </div>
                        {/* Buttons */}
                        <div className="flex items-center gap-3">
                          <button
                            onClick={endTour}
                            className="text-xs text-slate-500 hover:text-slate-300"
                          >
                            Skip
                          </button>
                          <button
                            onClick={currentStep === activeTour.steps.length - 1 ? endTour : nextStep}
                            className="text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-lg"
                          >
                            {currentStep === activeTour.steps.length - 1 ? 'Got it!' : 'Next'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </SpotlightCtx.Provider>
  );
}

export default SpotlightTour;
