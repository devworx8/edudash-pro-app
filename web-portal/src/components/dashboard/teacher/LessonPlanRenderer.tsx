'use client';

/**
 * LessonPlanRenderer — State-of-the-art visual rendering for AI-generated lesson plans.
 * Parses ## sections into cards with icons, optional timing badges, copy-section, and print.
 */

import React, { useCallback, useMemo } from 'react';
import {
  BookOpen,
  Target,
  Package,
  Clock,
  Activity,
  Move,
  MessageCircle,
  Sparkles,
  Home,
  FileText,
  Copy,
  Printer,
  Check,
} from 'lucide-react';

export interface LessonPlanRendererProps {
  title: string;
  content: string;
  meta?: { gradeLevel?: string; duration?: number; subject?: string };
  onPrint?: () => void;
  className?: string;
}

const SECTION_ICONS: Record<string, React.ReactNode> = {
  'lesson title': <BookOpen className="w-5 h-5" />,
  'learning objectives': <Target className="w-5 h-5" />,
  'materials needed': <Package className="w-5 h-5" />,
  'opening / circle time': <Clock className="w-5 h-5" />,
  'main activities': <Activity className="w-5 h-5" />,
  'movement & transition': <Move className="w-5 h-5" />,
  'closing & reflection': <MessageCircle className="w-5 h-5" />,
  'differentiation & inclusion': <Sparkles className="w-5 h-5" />,
  'teacher notes': <FileText className="w-5 h-5" />,
  'take-home activity': <Home className="w-5 h-5" />,
  'introduction/warm-up': <Clock className="w-5 h-5" />,
  'main activity': <Activity className="w-5 h-5" />,
  'practice activity': <Activity className="w-5 h-5" />,
  'cool-down/conclusion': <MessageCircle className="w-5 h-5" />,
  'assessment ideas': <Target className="w-5 h-5" />,
  'extension activities': <Sparkles className="w-5 h-5" />,
  'notes for teachers': <FileText className="w-5 h-5" />,
};

const TIME_PATTERNS = [
  /\((\d+)\s*min(?:ute)?s?\)/i,
  /(\d+)\s*min(?:ute)?s?/i,
  /(\d+)\s*minutes?/i,
];

function extractTime(label: string): number | null {
  for (const re of TIME_PATTERNS) {
    const m = label.match(re);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function getIcon(key: string): React.ReactNode {
  const k = key.toLowerCase().trim();
  return SECTION_ICONS[k] ?? <FileText className="w-5 h-5" />;
}

function parseSections(content: string): { label: string; body: string; time?: number }[] {
  const sections: { label: string; body: string; time?: number }[] = [];
  const re = /^##\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  const titles: { index: number; label: string }[] = [];

  while ((match = re.exec(content)) !== null) {
    titles.push({ index: match.index, label: match[1].trim() });
  }

  for (let i = 0; i < titles.length; i++) {
    const start = titles[i].index;
    const end = i < titles.length - 1 ? titles[i + 1].index : content.length;
    let body = content.slice(start, end);
    body = body.replace(/^##\s+.+[\r\n]*/m, '').trim();
    const label = titles[i].label;
    const time = extractTime(label);
    sections.push({
      label: label.replace(/\s*\(\d+\s*min(?:ute)?s?\)/i, '').trim(),
      body,
      time: time ?? undefined,
    });
  }

  if (sections.length === 0 && content.trim()) {
    sections.push({ label: 'Lesson Plan', body: content.trim() });
  }
  return sections;
}

function renderMarkdownLine(line: string, index: number): React.ReactNode {
  const key = `line-${index}`;
  const trimmed = line.trim();
  if (!trimmed) return <div key={key} className="h-2" />;
  if (trimmed.startsWith('### ')) {
    return (
      <h3 key={key} className="text-sm font-semibold text-cyan-300 mt-3 mb-1">
        {trimmed.slice(4)}
      </h3>
    );
  }
  if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
    return (
      <p key={key} className="font-semibold text-gray-200 my-1">
        {trimmed.replace(/\*\*/g, '')}
      </p>
    );
  }
  if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
    return (
      <li key={key} className="text-gray-300 ml-4 my-0.5 list-disc">
        {trimmed.slice(2)}
      </li>
    );
  }
  if (/^\d+\./.test(trimmed)) {
    return (
      <li key={key} className="text-gray-300 ml-4 my-0.5 list-decimal">
        {trimmed.replace(/^\d+\.\s*/, '')}
      </li>
    );
  }
  return (
    <p key={key} className="text-gray-300 my-1 leading-relaxed">
      {trimmed}
    </p>
  );
}

function SectionCard({
  label,
  body,
  time,
  onCopy,
}: {
  label: string;
  body: string;
  time?: number;
  onCopy: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = useCallback(() => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [onCopy]);

  const lines = body.split('\n');
  const content = useMemo(
    () => lines.map((line, i) => renderMarkdownLine(line, i)),
    [body]
  );

  return (
    <section
      className="lesson-section rounded-xl border border-gray-700/60 bg-gray-800/50 overflow-hidden print:border print:bg-white print:border-gray-300"
      data-section={label}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-700/60 print:border-gray-300 bg-gray-800/80 print:bg-gray-50">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex-shrink-0 text-emerald-400 print:text-emerald-700">
            {getIcon(label)}
          </span>
          <h2 className="text-base font-semibold text-white truncate print:text-gray-900">
            {label}
          </h2>
          {time != null && (
            <span className="flex-shrink-0 px-2 py-0.5 rounded-md bg-cyan-900/40 text-cyan-300 text-xs font-medium print:bg-cyan-100 print:text-cyan-800">
              {time} min
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors print:hidden"
          title="Copy section"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <div className="px-4 py-3 text-sm prose-invert prose-sm max-w-none print:prose-invert print:text-gray-800">
        {content}
      </div>
    </section>
  );
}

export function LessonPlanRenderer({
  title,
  content,
  meta,
  onPrint,
  className = '',
}: LessonPlanRendererProps) {
  const sections = useMemo(() => parseSections(content), [content]);
  const printRef = React.useRef<HTMLDivElement>(null);

  const handlePrint = useCallback(() => {
    if (onPrint) {
      onPrint();
      return;
    }
    const el = printRef.current;
    if (el) {
      const prevTitle = document.title;
      document.title = `${title} - Lesson Plan`;
      window.print();
      document.title = prevTitle;
    } else {
      window.print();
    }
  }, [onPrint, title]);

  const copySection = useCallback((label: string, body: string) => {
    const text = `## ${label}\n\n${body}`;
    void navigator.clipboard.writeText(text);
  }, []);

  if (sections.length === 0) {
    return (
      <div className={`text-gray-400 ${className}`}>
        No sections could be parsed. Showing raw content:
        <pre className="mt-2 p-4 rounded-lg bg-gray-800 text-sm overflow-auto max-h-96">
          {content}
        </pre>
      </div>
    );
  }

  return (
    <div ref={printRef} className={`lesson-plan-renderer space-y-4 ${className}`}>
      <div className="print-only hidden print:block mb-4">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {meta && (
          <div className="flex flex-wrap gap-2 mt-2 text-sm text-gray-600">
            {meta.gradeLevel && <span>{meta.gradeLevel}</span>}
            {meta.duration != null && <span>{meta.duration} min</span>}
            {meta.subject && <span>{meta.subject}</span>}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 print:hidden">
        {meta?.gradeLevel && (
          <span className="px-2 py-1 bg-emerald-800/30 rounded-md text-emerald-400 text-xs">
            {meta.gradeLevel}
          </span>
        )}
        {meta?.duration != null && (
          <span className="px-2 py-1 bg-cyan-800/30 rounded-md text-cyan-400 text-xs">
            {meta.duration} min
          </span>
        )}
        {meta?.subject && (
          <span className="px-2 py-1 bg-purple-800/30 rounded-md text-purple-400 text-xs">
            {meta.subject}
          </span>
        )}
        <button
          type="button"
          onClick={handlePrint}
          className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium transition-colors"
        >
          <Printer className="w-4 h-4" />
          Print lesson
        </button>
      </div>

      {sections.map((sec, i) => (
        <SectionCard
          key={`${sec.label}-${i}`}
          label={sec.label}
          body={sec.body}
          time={sec.time}
          onCopy={() => copySection(sec.label, sec.body)}
        />
      ))}

      <style jsx global>{`
        @media print {
          .print-only { display: block !important; }
          .print\:hidden { display: none !important; }
          .lesson-plan-renderer { background: white; color: #111; }
          .lesson-section { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
