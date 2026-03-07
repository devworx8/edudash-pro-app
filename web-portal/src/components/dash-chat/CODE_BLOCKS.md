# Code Block Component - Dash AI Chat

## Overview
Enhanced code snippet rendering for Dash AI chat responses with professional syntax highlighting, language detection, and copy-to-clipboard functionality.

## Features

### ✨ Syntax Highlighting
- **Library**: `react-syntax-highlighter` with Prism
- **Theme**: VS Code Dark Plus
- **Languages Supported**: 30+ languages including:
  - JavaScript/TypeScript (+ JSX/TSX)
  - Python, Java, C++, C#, Go, Rust
  - HTML, CSS, SCSS
  - SQL, JSON, YAML, XML
  - Shell scripts (Bash, PowerShell)
  - And more...

### 🎨 Visual Design
- **Dark Theme**: Professional VS Code-inspired dark background (#1e1e1e)
- **Language Badge**: Terminal icon + uppercase language name
- **Copy Button**: Interactive button with success feedback
- **Line Numbers**: Auto-enabled for code blocks >10 lines
- **Scrollbars**: Custom purple-themed scrollbars matching app design
- **Shadows**: Subtle box shadow for depth

### 📋 Copy to Clipboard
- One-click copy with visual feedback
- Success state shows green checkmark for 2 seconds
- Hover effects for better UX

### 🔤 Inline Code
- Purple-tinted background for inline `code` snippets
- Monospace font (Fira Code preferred)
- Distinct from code blocks

## Usage

### In MessageBubble Component
```tsx
<ReactMarkdown 
  remarkPlugins={[remarkGfm]}
  components={{
    code({ node, inline, className, children, ...props }) {
      return (
        <CodeBlock 
          inline={inline}
          className={className}
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </CodeBlock>
      );
    }
  }}
>
  {message.content}
</ReactMarkdown>
```

### Markdown Format (AI Response)
````markdown
Here's a Java example:

```java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
```
````

### Result
- Language detected: Java
- Header shows: 🖥️ JAVA
- Syntax highlighted with proper colors
- Copy button in top-right corner
- Line numbers (if >10 lines)

## Styling Details

### Code Block Header
- Background: `rgba(0, 0, 0, 0.3)`
- Border: `1px solid rgba(255, 255, 255, 0.1)`
- Icons: Terminal icon in purple (#7c3aed)
- Font: 12px, uppercase, letter-spacing 0.5px

### Copy Button States
- **Default**: Purple background `rgba(124, 58, 237, 0.2)`, purple text
- **Hover**: Brighter purple `rgba(124, 58, 237, 0.3)`
- **Copied**: Green background `rgba(16, 185, 129, 0.2)`, green text with checkmark

### Scrollbars
- Width: 8px
- Track: `rgba(0, 0, 0, 0.2)`
- Thumb: Purple `rgba(124, 58, 237, 0.5)`
- Thumb hover: Brighter purple `rgba(124, 58, 237, 0.7)`

## Language Support

### Mapped Languages (Display Names)
- `js`, `javascript` → JavaScript
- `ts`, `typescript` → TypeScript
- `tsx` → TypeScript React
- `jsx` → JavaScript React
- `py`, `python` → Python
- `java` → Java
- `cpp` → C++
- `cs` → C#
- `sql` → SQL
- `html` → HTML
- `css` → CSS
- `json` → JSON
- `bash`, `sh` → Shell
- And 15+ more...

### Fallback
- Unknown languages display as uppercase of the language identifier
- Example: `language-kotlin` → KOTLIN

## Performance Considerations

- **Line Numbers**: Only shown for code >10 lines to reduce clutter
- **Max Height**: 500px with scroll to prevent massive blocks
- **Lazy Loading**: SyntaxHighlighter only renders when code block is present
- **Inline Detection**: Fast path for inline code (no syntax highlighting needed)

## Accessibility

- **Keyboard**: Copy button is keyboard-accessible
- **Color Contrast**: High contrast between syntax colors and background
- **Monospace Font**: Fira Code preferred, falls back to Courier New

## Dependencies

```json
{
  "react-syntax-highlighter": "^15.x",
  "@types/react-syntax-highlighter": "^15.x",
  "lucide-react": "^0.548.0"
}
```

## File Structure

```
web/src/components/dash-chat/
├── CodeBlock.tsx          # Main code block component
├── MessageBubble.tsx      # Updated to use CodeBlock
└── CODE_BLOCKS.md         # This documentation
```

## Testing

Test with various languages in Dash chat:

1. **Java Example**:
   ```
   Ask Dash: "Show me a Java Hello World example"
   ```

2. **Python Example**:
   ```
   Ask Dash: "Write a Python function to calculate factorial"
   ```

3. **SQL Example**:
   ```
   Ask Dash: "Give me a SQL query to find top 10 users"
   ```

4. **Inline Code**:
   ```
   Ask Dash: "Explain the `useState` hook in React"
   ```

## Future Enhancements

- [ ] Theme switcher (light/dark mode)
- [ ] Line highlighting for specific lines
- [ ] Diff support for before/after comparisons
- [ ] Download as file option
- [ ] Custom language definitions for domain-specific languages
- [ ] Execution button for safe code snippets (sandboxed)

## Maintenance

- **Syntax Highlighter Updates**: Check `react-syntax-highlighter` for new language support
- **Theme Customization**: Modify `customStyle` in CodeBlock.tsx
- **Language Mappings**: Add new languages to `getLanguageName()` function
