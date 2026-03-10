import { unifiedToolRegistry } from '@/services/tools/UnifiedToolRegistry';

describe('UnifiedToolRegistry generate_chart access', () => {
  it('exposes PDF generation tools for supported roles', () => {
    const teacherTools = unifiedToolRegistry.list('teacher', 'free').map((tool) => tool.name);
    const parentTools = unifiedToolRegistry.list('parent', 'free').map((tool) => tool.name);

    expect(teacherTools).toContain('export_pdf');
    expect(teacherTools).toContain('generate_pdf_from_prompt');
    expect(parentTools).toContain('export_pdf');
    expect(parentTools).toContain('generate_pdf_from_prompt');
  });

  it('keeps generate_chart disabled across roles', () => {
    const parentTools = unifiedToolRegistry.list('parent', 'starter').map((tool) => tool.name);
    const studentTools = unifiedToolRegistry.list('student', 'starter').map((tool) => tool.name);

    expect(parentTools).not.toContain('generate_chart');
    expect(studentTools).not.toContain('generate_chart');
  });

  it('keeps free tier blocked for generate_chart', () => {
    const freeParentTools = unifiedToolRegistry.list('parent', 'free').map((tool) => tool.name);
    expect(freeParentTools).not.toContain('generate_chart');
  });
});
