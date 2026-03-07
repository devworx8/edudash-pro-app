'use client';

import { motion } from 'framer-motion';

export function DashboardSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header Skeleton */}
      <div className="mb-8">
        <div className="h-10 w-64 bg-gray-800 rounded-lg mb-2 animate-pulse" />
        <div className="h-4 w-48 bg-gray-800 rounded-lg animate-pulse" />
      </div>

      {/* Metrics Grid Skeleton */}
      <div className="mb-8">
        <div className="h-6 w-32 bg-gray-800 rounded-lg mb-4 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
      </div>

      {/* Quick Actions Skeleton */}
      <div className="mb-8">
        <div className="h-6 w-40 bg-gray-800 rounded-lg mb-4 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <ActionCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function MetricCardSkeleton() {
  return (
    <motion.div
      className="bg-gray-800 rounded-2xl p-6 shadow-lg"
      initial={{ opacity: 0.6 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 bg-gray-700 rounded-xl animate-pulse" />
        <div className="w-16 h-5 bg-gray-700 rounded animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="h-8 w-20 bg-gray-700 rounded animate-pulse" />
        <div className="h-4 w-32 bg-gray-700 rounded animate-pulse" />
      </div>
    </motion.div>
  );
}

export function ActionCardSkeleton() {
  return (
    <motion.div
      className="bg-gray-800 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[120px] shadow-lg"
      initial={{ opacity: 0.6 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
    >
      <div className="w-14 h-14 bg-gray-700 rounded-full mb-3 animate-pulse" />
      <div className="h-4 w-24 bg-gray-700 rounded mb-1 animate-pulse" />
      <div className="h-3 w-16 bg-gray-700 rounded animate-pulse" />
    </motion.div>
  );
}

export function ChildSelectorSkeleton() {
  return (
    <div className="bg-gray-800 rounded-xl p-4 shadow-lg mb-6">
      <div className="h-4 w-24 bg-gray-700 rounded mb-3 animate-pulse" />
      <div className="flex gap-3">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 bg-gray-700 rounded-lg min-w-fit">
            <div className="w-10 h-10 bg-gray-600 rounded-full animate-pulse" />
            <div className="space-y-2">
              <div className="h-4 w-24 bg-gray-600 rounded animate-pulse" />
              <div className="h-3 w-16 bg-gray-600 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
