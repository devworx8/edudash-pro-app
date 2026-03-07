'use client';

import { Users, BookOpen, ClipboardCheck, Video } from 'lucide-react';
import { motion } from 'framer-motion';

interface ClassCardProps {
  className: string;
  grade: string;
  studentCount: number;
  pendingAssignments: number;
  upcomingLessons: number;
  onPress: () => void;
  onCallClass?: () => void;
}

export function ClassCard({
  className,
  grade,
  studentCount,
  pendingAssignments,
  upcomingLessons,
  onPress,
  onCallClass,
}: ClassCardProps) {
  const handleCallClass = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    onCallClass?.();
  };

  return (
    <motion.div
      className="bg-gradient-to-br from-slate-800/80 to-slate-800/60 backdrop-blur-sm rounded-2xl p-5 shadow-lg border border-slate-700/50 transition-all duration-300 hover:shadow-xl hover:border-slate-600/60 w-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <button
        onClick={onPress}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-white mb-1">{className}</h3>
            <p className="text-sm text-slate-400">Grade {grade}</p>
          </div>
          <div className="p-2 rounded-lg bg-blue-500/20">
            <Users className="w-5 h-5 text-blue-400" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{studentCount}</div>
            <div className="text-xs text-slate-400 mt-1">Students</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-400">{pendingAssignments}</div>
            <div className="text-xs text-slate-400 mt-1">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-400">{upcomingLessons}</div>
            <div className="text-xs text-slate-400 mt-1">Lessons</div>
          </div>
        </div>
      </button>
      
      {/* Call Class Button */}
      {onCallClass && (
        <motion.button
          onClick={handleCallClass}
          className="mt-4 w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-200 shadow-lg hover:shadow-purple-500/25"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Video className="w-5 h-5" />
          <span>Call Class</span>
        </motion.button>
      )}
    </motion.div>
  );
}
