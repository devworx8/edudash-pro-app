'use client';

import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  trend?: string;
  onPress?: () => void;
  size?: 'small' | 'medium' | 'large';
  status?: string;
  statusColor?: string;
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  color,
  trend,
  onPress,
  size = 'medium',
  status,
  statusColor,
}: MetricCardProps) {
  const sizeClasses = {
    small: 'col-span-1',
    medium: 'col-span-1 md:col-span-1',
    large: 'col-span-2 md:col-span-2',
  };

  const Component = onPress ? motion.button : motion.div;

  return (
    <Component
      onClick={onPress}
      className={`
        ${sizeClasses[size]}
        bg-gradient-to-br from-slate-800/80 to-slate-800/60 backdrop-blur-sm rounded-2xl p-4 sm:p-5 lg:p-6
        shadow-lg hover:shadow-xl transition-all duration-300 border border-slate-700/50
        ${onPress ? 'cursor-pointer hover:border-slate-600/60 hover:scale-[1.03]' : ''}
      `}
      whileHover={onPress ? { scale: 1.03 } : undefined}
      whileTap={onPress ? { scale: 0.97 } : undefined}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="p-3 rounded-xl shadow-md"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="w-5 h-5 sm:w-6 sm:h-6" style={{ color }} />
        </div>
        {status && (
          <div 
            className="text-xs font-bold px-3 py-1.5 rounded-lg"
            style={{ 
              backgroundColor: `${statusColor}25`,
              color: statusColor 
            }}
          >
            {status}
          </div>
        )}
        {trend && (
          <div className="text-sm font-bold" style={{ color }}>
            {trend}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-white">{value}</div>
        <div className="text-xs sm:text-sm text-slate-400 leading-tight font-medium">{title}</div>
      </div>
    </Component>
  );
}
