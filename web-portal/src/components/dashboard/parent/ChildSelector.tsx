'use client';

import { motion } from 'framer-motion';
import { ChildCard } from '@/lib/hooks/parent/useChildrenData';
import { User } from 'lucide-react';

interface ChildSelectorProps {
  childrenCards: ChildCard[];
  activeChildId: string | null;
  onChildChange: (childId: string) => void;
}

export function ChildSelector({
  childrenCards,
  activeChildId,
  onChildChange,
}: ChildSelectorProps) {
  if (childrenCards.length <= 1) return null;

  return (
    <motion.div
      className="bg-gradient-to-br from-slate-800/70 to-slate-800/50 backdrop-blur-sm rounded-2xl p-5 lg:p-6 shadow-xl border border-slate-700/60"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
        <User className="w-4 h-4 text-blue-400" />
        Select Child
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800 pb-2">
        {childrenCards.map((child) => {
          const isActive = child.id === activeChildId;
          return (
            <motion.button
              key={child.id}
              onClick={() => onChildChange(child.id)}
              className={`
                flex items-center gap-3 px-5 py-4 rounded-xl
                transition-all duration-200 whitespace-nowrap min-w-fit shadow-md
                ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border border-blue-500/50'
                    : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/60 border border-slate-600/40'
                }
              `}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <div
                className={`
                  p-2 rounded-lg
                  ${isActive ? 'bg-blue-500/30' : 'bg-slate-600/60'}
                `}
              >
                <User className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="font-semibold text-sm lg:text-base">
                  {child.firstName} {child.lastName}
                </div>
                <div className="text-xs opacity-80">{child.grade}</div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
