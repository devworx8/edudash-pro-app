'use client';

import { useEffect, useRef } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import mermaid from 'mermaid';

interface ExamDiagramProps {
  diagram: {
    type: 'chart' | 'mermaid' | 'svg' | 'image';
    data: any;
    title?: string;
    caption?: string;
  };
}

const COLORS = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export function ExamDiagram({ diagram }: ExamDiagramProps) {
  const mermaidRef = useRef<HTMLDivElement>(null);
  const mermaidId = useRef(`mermaid-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    if (diagram.type === 'mermaid' && mermaidRef.current) {
      const renderMermaid = async () => {
        try {
          mermaid.initialize({ 
            startOnLoad: false, 
            theme: 'default',
            securityLevel: 'loose',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          });

          const { svg } = await mermaid.render(mermaidId.current, diagram.data);
          if (mermaidRef.current) {
            mermaidRef.current.innerHTML = svg;
          }
        } catch (error) {
          console.error('[ExamDiagram] Mermaid rendering error:', error);
          if (mermaidRef.current) {
            mermaidRef.current.innerHTML = `<div style="color: #ef4444; padding: 1rem;">Error rendering diagram: ${error instanceof Error ? error.message : 'Unknown error'}</div>`;
          }
        }
      };

      renderMermaid();
    }
  }, [diagram]);

  return (
    <div className="examDiagram" style={{
      margin: '1.5rem 0',
      padding: '1.5rem',
      border: '2px solid #e5e7eb',
      borderRadius: '12px',
      background: 'linear-gradient(to bottom, #ffffff, #f9fafb)',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
    }}>
      {diagram.title && (
        <div style={{ 
          fontWeight: 700, 
          marginBottom: '1rem',
          fontSize: '15px',
          color: '#111827',
          textAlign: 'center',
          borderBottom: '2px solid #e5e7eb',
          paddingBottom: '0.5rem'
        }}>
          {diagram.title}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', minHeight: '200px' }}>
        {diagram.type === 'chart' && renderChart(diagram.data)}
        {diagram.type === 'mermaid' && (
          <div 
            ref={mermaidRef} 
            className="mermaid"
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%'
            }}
          />
        )}
        {diagram.type === 'svg' && (
          <div 
            dangerouslySetInnerHTML={{ __html: diagram.data }}
            style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
          />
        )}
        {diagram.type === 'image' && (
          <img 
            src={diagram.data} 
            alt={diagram.title || 'Exam diagram'}
            style={{ 
              maxWidth: '100%', 
              height: 'auto',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}
          />
        )}
      </div>

      {diagram.caption && (
        <div style={{
          fontSize: '13px',
          color: '#6b7280',
          marginTop: '1rem',
          textAlign: 'center',
          fontStyle: 'italic',
          borderTop: '1px solid #e5e7eb',
          paddingTop: '0.75rem'
        }}>
          {diagram.caption}
        </div>
      )}
    </div>
  );
}

function renderChart(data: any) {
  const { chartType, data: chartData, xKey = 'name', yKey = 'value', title } = data;

  if (!chartData || chartData.length === 0) {
    return (
      <div style={{ color: '#ef4444', padding: '2rem', textAlign: 'center' }}>
        No chart data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      {chartType === 'bar' && (
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey={xKey} 
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}
          />
          <Legend 
            wrapperStyle={{ paddingTop: '10px' }}
          />
          <Bar dataKey={yKey} fill="#7c3aed" radius={[8, 8, 0, 0]}>
            {chartData.map((entry: any, index: number) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      )}
      {chartType === 'line' && (
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey={xKey}
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}
          />
          <Legend 
            wrapperStyle={{ paddingTop: '10px' }}
          />
          <Line 
            type="monotone" 
            dataKey={yKey} 
            stroke="#7c3aed" 
            strokeWidth={3}
            dot={{ fill: '#7c3aed', r: 5 }}
            activeDot={{ r: 8 }}
          />
        </LineChart>
      )}
      {chartType === 'pie' && (
        <PieChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <Pie 
            data={chartData} 
            dataKey={yKey} 
            nameKey={xKey} 
            cx="50%" 
            cy="50%" 
            outerRadius={100}
            label={(entry) => `${entry[xKey]}: ${entry[yKey]}`}
          >
            {chartData.map((entry: any, index: number) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}
          />
          <Legend 
            wrapperStyle={{ paddingTop: '10px' }}
          />
        </PieChart>
      )}
    </ResponsiveContainer>
  );
}
