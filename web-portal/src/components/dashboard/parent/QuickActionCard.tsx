'use client';

import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface QuickActionCardProps {
  title: string;
  icon: LucideIcon;
  color: string;
  onPress: () => void;
  subtitle?: string;
  disabled?: boolean;
}

export function QuickActionCard({
  title,
  icon: Icon,
  color,
  onPress,
  subtitle,
  disabled = false,
}: QuickActionCardProps) {
  return (
    <motion.button
      onClick={disabled ? undefined : onPress}
      disabled={disabled}
      className={`
        bg-gradient-to-br from-slate-800/80 to-slate-800/60 backdrop-blur-sm rounded-2xl p-4 sm:p-5 lg:p-6
        flex flex-col items-center justify-center
        min-h-[100px] sm:min-h-[120px] lg:min-h-[140px] shadow-lg border border-slate-700/50
        transition-all duration-300
        ${
          disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:shadow-xl hover:border-slate-600/60 hover:scale-[1.03] cursor-pointer'
        }
      `}
      whileHover={!disabled ? { scale: 1.03 } : undefined}
      whileTap={!disabled ? { scale: 0.97 } : undefined}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className="p-3 sm:p-3.5 rounded-xl mb-3 shadow-md"
        style={{ backgroundColor: disabled ? '#374151' : `${color}20` }}
      >
        <Icon
          className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8"
          style={{ color: disabled ? '#6B7280' : color }}
        />
      </div>
      <div
        className={`text-xs sm:text-sm lg:text-base font-semibold text-center mb-1 ${
          disabled ? 'text-gray-500' : 'text-white'
        }`}
      >
        {title}
      </div>
      {subtitle && (
        <div className="text-xs text-slate-400 text-center font-medium">{subtitle}</div>
      )}
    </motion.button>
  );
}
