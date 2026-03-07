'use client';

import { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeBlockProps {
  children: string;
  className?: string;
  inline?: boolean;
}

export function CodeBlock({ children, className, inline }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  
  // Extract language from className (format: language-xxx)
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : 'text';
  
  // Inline code (backticks)
  if (inline || !match) {
    return (
      <code
        style={{
          background: 'rgba(124, 58, 237, 0.1)',
          color: '#7c3aed',
          padding: '2px 6px',
          borderRadius: 4,
          fontSize: '0.9em',
          fontFamily: '"Fira Code", "Courier New", monospace',
          fontWeight: 500,
        }}
      >
        {children}
      </code>
    );
  }

  // Code block
  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get language display name
  const getLanguageName = (lang: string) => {
    const names: Record<string, string> = {
      js: 'JavaScript',
      javascript: 'JavaScript',
      ts: 'TypeScript',
      typescript: 'TypeScript',
      tsx: 'TypeScript React',
      jsx: 'JavaScript React',
      py: 'Python',
      python: 'Python',
      java: 'Java',
      cpp: 'C++',
      c: 'C',
      cs: 'C#',
      php: 'PHP',
      rb: 'Ruby',
      ruby: 'Ruby',
      go: 'Go',
      rust: 'Rust',
      swift: 'Swift',
      kotlin: 'Kotlin',
      sql: 'SQL',
      html: 'HTML',
      css: 'CSS',
      scss: 'SCSS',
      json: 'JSON',
      xml: 'XML',
      yaml: 'YAML',
      yml: 'YAML',
      bash: 'Bash',
      sh: 'Shell',
      powershell: 'PowerShell',
      r: 'R',
      matlab: 'MATLAB',
      markdown: 'Markdown',
      md: 'Markdown',
      text: 'Plain Text',
    };
    return names[lang.toLowerCase()] || lang.toUpperCase();
  };

  // Custom style overrides for better UI
  const customStyle = {
    ...vscDarkPlus,
    'pre[class*="language-"]': {
      ...vscDarkPlus['pre[class*="language-"]'],
      margin: 0,
      padding: 16,
      background: '#1e1e1e',
      fontSize: 13,
      lineHeight: 1.6,
      fontFamily: '"Fira Code", "Courier New", monospace',
    },
    'code[class*="language-"]': {
      ...vscDarkPlus['code[class*="language-"]'],
      fontFamily: '"Fira Code", "Courier New", monospace',
      fontSize: 13,
    },
  };

  return (
    <div
      style={{
        position: 'relative',
        margin: '12px 0',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#1e1e1e',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: 'rgba(0, 0, 0, 0.3)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Terminal size={14} color="#7c3aed" />
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#a0a0a0',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {getLanguageName(language)}
          </span>
        </div>
        
        <button
          onClick={handleCopy}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(124, 58, 237, 0.2)',
            border: 'none',
            borderRadius: 6,
            color: copied ? '#10b981' : '#a78bfa',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!copied) {
              e.currentTarget.style.background = 'rgba(124, 58, 237, 0.3)';
              e.currentTarget.style.color = '#c4b5fd';
            }
          }}
          onMouseLeave={(e) => {
            if (!copied) {
              e.currentTarget.style.background = 'rgba(124, 58, 237, 0.2)';
              e.currentTarget.style.color = '#a78bfa';
            }
          }}
        >
          {copied ? (
            <>
              <Check size={14} />
              Copied!
            </>
          ) : (
            <>
              <Copy size={14} />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code Content with Syntax Highlighting */}
      <div
        style={{
          maxHeight: '500px',
          overflowY: 'auto',
          overflowX: 'auto',
        }}
        className="code-block-content"
      >
        <SyntaxHighlighter
          language={language}
          style={customStyle}
          customStyle={{
            margin: 0,
            padding: 16,
            background: 'transparent',
          }}
          showLineNumbers={children.split('\n').length > 10}
          lineNumberStyle={{
            minWidth: '3em',
            paddingRight: '1em',
            color: '#6e7681',
            textAlign: 'right',
            userSelect: 'none',
          }}
          wrapLongLines={false}
        >
          {children}
        </SyntaxHighlighter>
      </div>

      {/* Custom Scrollbar Styles */}
      <style jsx>{`
        .code-block-content::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .code-block-content::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.2);
        }
        .code-block-content::-webkit-scrollbar-thumb {
          background: rgba(124, 58, 237, 0.5);
          border-radius: 4px;
        }
        .code-block-content::-webkit-scrollbar-thumb:hover {
          background: rgba(124, 58, 237, 0.7);
        }
      `}</style>
    </div>
  );
}
