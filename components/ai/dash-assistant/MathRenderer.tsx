import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

interface MathRendererProps {
  expression: string;
  displayMode?: boolean;
}

function buildMathHtml(expression: string, displayMode: boolean): string {
  const escapedExpression = JSON.stringify(expression || '');
  const escapedDisplayMode = displayMode ? 'true' : 'false';
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex.min.css" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: transparent;
        color: #e2e8f0;
        overflow: hidden;
      }
      #math-root {
        box-sizing: border-box;
        padding: ${displayMode ? 8 : 2}px ${displayMode ? 8 : 3}px;
        font-size: 17px;
        line-height: 1.45;
        display: ${displayMode ? 'block' : 'inline-block'};
        width: ${displayMode ? '100%' : 'auto'};
      }
      .katex-display { margin: 0; }
      .katex {
        line-height: 1.45;
      }
      .katex .frac-line {
        border-bottom-width: 0.08em;
      }
    </style>
  </head>
  <body>
    <div id="math-root"></div>
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex.min.js"></script>
    <script>
      const expression = ${escapedExpression};
      const displayMode = ${escapedDisplayMode};
      const root = document.getElementById('math-root');

      function postSize() {
        if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage || !root) return;
        const rect = root.getBoundingClientRect();
        const payload = {
          type: 'size',
          width: Math.max(24, Math.ceil(rect.width)),
          height: Math.max(displayMode ? 64 : 30, Math.ceil(rect.height)),
        };
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }

      try {
        katex.render(expression, root, { throwOnError: false, displayMode });
      } catch (error) {
        root.textContent = expression;
      }

      requestAnimationFrame(() => {
        postSize();
        setTimeout(postSize, 40);
      });
      window.addEventListener('load', postSize);
      window.addEventListener('resize', postSize);
    </script>
  </body>
</html>`;
}

export const MathRenderer: React.FC<MathRendererProps> = ({ expression, displayMode = true }) => {
  const cleaned = String(expression || '').trim();

  const initialSize = useMemo(
    () => ({
      width: displayMode ? 0 : 96,
      height: displayMode ? 78 : 34,
    }),
    [displayMode],
  );
  const [nativeSize, setNativeSize] = useState(initialSize);

  useEffect(() => {
    setNativeSize(initialSize);
  }, [initialSize, cleaned]);

  const handleNativeMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data || '{}') as {
        type?: string;
        width?: number;
        height?: number;
      };
      if (payload.type !== 'size') return;

      const width = Math.max(24, Math.round(Number(payload.width || 0)));
      const height = Math.max(displayMode ? 64 : 30, Math.round(Number(payload.height || 0)));
      setNativeSize((prev) => {
        if (!displayMode) {
          if (width !== prev.width || height !== prev.height) {
            return { width, height };
          }
          return prev;
        }

        if (height !== prev.height) {
          return { ...prev, height };
        }
        return prev;
      });
    } catch {
      // Ignore malformed postMessage payloads
    }
  }, [displayMode]);

  if (!cleaned) return null;

  if (Platform.OS === 'web') {
    try {
      const katex = require('react-katex');
      const BlockMath = katex.BlockMath as React.ComponentType<{ math: string }>;
      const InlineMath = katex.InlineMath as React.ComponentType<{ math: string }>;
      return (
        <View style={{ marginVertical: displayMode ? 8 : 0 }}>
          {displayMode ? <BlockMath math={cleaned} /> : <InlineMath math={cleaned} />}
        </View>
      );
    } catch {
      return (
        <Text style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>
          {cleaned}
        </Text>
      );
    }
  }

  return (
    <View
      style={{
        marginVertical: displayMode ? 8 : 0,
        borderWidth: displayMode ? 1 : 0,
        borderColor: 'rgba(148,163,184,0.28)',
        borderRadius: displayMode ? 12 : 0,
        overflow: 'hidden',
        minHeight: displayMode ? nativeSize.height : nativeSize.height,
        width: displayMode ? '100%' : nativeSize.width,
        alignSelf: displayMode ? 'stretch' : 'flex-start',
      }}
    >
      <WebView
        originWhitelist={['*']}
        source={{ html: buildMathHtml(cleaned, displayMode) }}
        style={{
          backgroundColor: 'transparent',
          height: nativeSize.height,
          width: displayMode ? '100%' : nativeSize.width,
          flex: displayMode ? 1 : 0,
          opacity: 0.9999, // Ensures Android paints first frame correctly.
        }}
        onMessage={handleNativeMessage}
        scrollEnabled={false}
      />
    </View>
  );
};

export default MathRenderer;
