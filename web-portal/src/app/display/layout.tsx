/**
 * Minimal layout for TV / Room Display.
 * Uses Next-Gen design system (globals.css) – fullscreen-friendly for casting to a TV.
 */
export default function DisplayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen antialiased display-root">
      {children}
    </div>
  );
}
