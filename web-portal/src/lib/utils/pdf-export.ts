/**
 * PDF Export Utility for EduDash Pro
 * 
 * Generates PDF documents from exam data, flashcards, and study materials.
 * Uses jsPDF for client-side PDF generation with professional formatting.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Generate PDF from exam data
 */
export function exportExamToPDF(examData: any): void {
  const doc = new jsPDF();
  let yPos = 15;
  
  // Add EduDash Pro branding header with gradient effect
  doc.setFillColor(124, 58, 237); // Purple
  doc.rect(0, 0, 210, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('📚 EduDash Pro', 105, 12, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Empowering Education Through AI', 105, 19, { align: 'center' });
  
  yPos = 35;
  doc.setTextColor(0, 0, 0);
  
  // Main Title with underline
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(examData.title || 'CAPS Practice Examination', 105, yPos, { align: 'center' });
  doc.setDrawColor(124, 58, 237);
  doc.setLineWidth(0.5);
  doc.line(40, yPos + 2, 170, yPos + 2);
  yPos += 12;
  
  // Metadata
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Grade: ${examData.grade || 'N/A'}`, 20, yPos);
  yPos += 6;
  doc.text(`Subject: ${examData.subject || 'N/A'}`, 20, yPos);
  yPos += 6;
  doc.text(`Duration: ${examData.duration || 'N/A'}`, 20, yPos);
  yPos += 6;
  doc.text(`Total Marks: ${examData.totalMarks || examData.marks || 'N/A'}`, 20, yPos);
  yPos += 12;
  
  // Instructions (if present)
  if (examData.instructions) {
    doc.setFont('helvetica', 'bold');
    doc.text('INSTRUCTIONS:', 20, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    
    const instructions = Array.isArray(examData.instructions) 
      ? examData.instructions 
      : examData.instructions.split('\n');
    
    instructions.forEach((instruction: string, index: number) => {
      const text = instruction.trim();
      if (text) {
        doc.text(`${index + 1}. ${text}`, 25, yPos);
        yPos += 5;
      }
    });
    yPos += 8;
  }
  
  // Sections and Questions
  if (examData.sections && Array.isArray(examData.sections)) {
    examData.sections.forEach((section: any, sectionIndex: number) => {
      // Check if we need a new page
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      
      // Section header with background
      doc.setFillColor(245, 243, 255); // Light purple background
      doc.roundedRect(15, yPos - 5, 180, 10, 2, 2, 'F');
      doc.setTextColor(124, 58, 237); // Purple text
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(`SECTION ${String.fromCharCode(65 + sectionIndex)}: ${section.title || section.name || 'Questions'}`, 20, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += 10;
      
      // Section description (if present)
      if (section.description) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        const descLines = doc.splitTextToSize(section.description, 170);
        doc.text(descLines, 20, yPos);
        yPos += (descLines.length * 5) + 5;
      }
      
      // Questions
      if (section.questions && Array.isArray(section.questions)) {
        section.questions.forEach((question: any, qIndex: number) => {
          // Check if we need a new page
          if (yPos > 265) {
            doc.addPage();
            yPos = 20;
          }
          
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.text(`Question ${qIndex + 1}.`, 20, yPos);
          yPos += 6;
          
          // Question text
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          const questionText = question.text || question.question || question.prompt || '';
          const lines = doc.splitTextToSize(questionText, 165);
          doc.text(lines, 25, yPos);
          yPos += (lines.length * 5);
          
          // Sub-questions or options
          if (question.parts && Array.isArray(question.parts)) {
            question.parts.forEach((part: any, partIndex: number) => {
              if (yPos > 270) {
                doc.addPage();
                yPos = 20;
              }
              
              const partText = part.text || part.question || '';
              const partLines = doc.splitTextToSize(`${String.fromCharCode(97 + partIndex)}) ${partText}`, 160);
              doc.text(partLines, 30, yPos);
              yPos += (partLines.length * 5) + 2;
            });
          }
          
          // Options (for multiple choice)
          if (question.options && Array.isArray(question.options)) {
            question.options.forEach((option: any, optIndex: number) => {
              if (yPos > 270) {
                doc.addPage();
                yPos = 20;
              }
              
              const optionText = typeof option === 'string' ? option : option.text;
              doc.text(`${String.fromCharCode(65 + optIndex)}) ${optionText}`, 30, yPos);
              yPos += 5;
            });
          }
          
          // Marks
          if (question.marks || question.points) {
            doc.setFont('helvetica', 'italic');
            doc.text(`[${question.marks || question.points} marks]`, 185, yPos - 5, { align: 'right' });
          }
          
          yPos += 8;
        });
      }
      
      yPos += 5;
    });
  }
  
  // Memorandum (if present)
  if (examData.memo || examData.memorandum || examData.answers) {
    doc.addPage();
    yPos = 20;
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('MARKING MEMORANDUM', 105, yPos, { align: 'center' });
    yPos += 12;
    
    const memoData = examData.memo || examData.memorandum || examData.answers;
    
    if (typeof memoData === 'string') {
      // Simple text memo
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const memoLines = doc.splitTextToSize(memoData, 170);
      doc.text(memoLines, 20, yPos);
    } else if (Array.isArray(memoData)) {
      // Structured memo
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      memoData.forEach((answer: any, index: number) => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        
        doc.setFont('helvetica', 'bold');
        doc.text(`Question ${index + 1}:`, 20, yPos);
        yPos += 6;
        
        doc.setFont('helvetica', 'normal');
        const answerText = answer.answer || answer.solution || answer.text || answer;
        const answerLines = doc.splitTextToSize(String(answerText), 165);
        doc.text(answerLines, 25, yPos);
        yPos += (answerLines.length * 5) + 5;
      });
    }
  }
  
  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${i} of ${pageCount}`, 105, 287, { align: 'center' });
    doc.text('© EduDash Pro • CAPS-Aligned Resources', 105, 292, { align: 'center' });
  }
  
  // Save PDF
  const filename = `${examData.title || 'exam'}.pdf`.replace(/[^a-z0-9_-]/gi, '_');
  doc.save(filename);
}

/**
 * Generate PDF from flashcards
 */
export function exportFlashcardsToPDF(flashcardsData: any): void {
  const doc = new jsPDF();
  let yPos = 20;
  
  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Flashcards', 105, yPos, { align: 'center' });
  yPos += 8;
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`${flashcardsData.subject || 'Subject'} - ${flashcardsData.grade || 'Grade'}`, 105, yPos, { align: 'center' });
  yPos += 15;
  
  // Flashcards
  const cards = flashcardsData.cards || flashcardsData.flashcards || [];
  
  cards.forEach((card: any, index: number) => {
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }
    
    // Card number
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Card ${index + 1}`, 20, yPos);
    yPos += 7;
    
    // Front (Question)
    doc.setFont('helvetica', 'bold');
    doc.text('FRONT:', 20, yPos);
    yPos += 5;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const frontText = card.front || card.question || card.term || '';
    const frontLines = doc.splitTextToSize(frontText, 165);
    doc.text(frontLines, 25, yPos);
    yPos += (frontLines.length * 5) + 5;
    
    // Back (Answer)
    doc.setFont('helvetica', 'bold');
    doc.text('BACK:', 20, yPos);
    yPos += 5;
    
    doc.setFont('helvetica', 'normal');
    const backText = card.back || card.answer || card.definition || '';
    const backLines = doc.splitTextToSize(backText, 165);
    doc.text(backLines, 25, yPos);
    yPos += (backLines.length * 5) + 10;
    
    // Separator line
    doc.setDrawColor(200);
    doc.line(20, yPos, 190, yPos);
    yPos += 8;
  });
  
  // Save PDF
  const filename = `flashcards_${flashcardsData.subject || 'subject'}.pdf`.replace(/[^a-z0-9_-]/gi, '_');
  doc.save(filename);
}

/**
 * Generate PDF from study guide
 */
export function exportStudyGuideToPDF(studyGuideData: any): void {
  const doc = new jsPDF();
  let yPos = 20;
  
  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(studyGuideData.title || 'Study Guide', 105, yPos, { align: 'center' });
  yPos += 8;
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`${studyGuideData.subject || ''} - ${studyGuideData.grade || ''}`, 105, yPos, { align: 'center' });
  yPos += 15;
  
  // Content
  const content = studyGuideData.content || studyGuideData.text || '';
  
  if (typeof content === 'string') {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    // Split by paragraphs and format
    const paragraphs = content.split('\n\n');
    
    paragraphs.forEach((paragraph: string) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      
      // Check if it's a heading
      if (paragraph.startsWith('#')) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        const heading = paragraph.replace(/^#+\s*/, '');
        doc.text(heading, 20, yPos);
        yPos += 10;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
      } else {
        const lines = doc.splitTextToSize(paragraph, 170);
        doc.text(lines, 20, yPos);
        yPos += (lines.length * 5) + 8;
      }
    });
  }
  
  // Save PDF
  const filename = `${studyGuideData.title || 'study_guide'}.pdf`.replace(/[^a-z0-9_-]/gi, '_');
  doc.save(filename);
}

/**
 * Generic text-to-PDF export with enhanced markdown formatting
 */
export function exportTextToPDF(text: string, title: string = 'Document'): void {
  const doc = new jsPDF();
  let yPos = 15;
  
  // Add branded header
  doc.setFillColor(124, 58, 237);
  doc.rect(0, 0, 210, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('📚 EduDash Pro', 105, 12, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('AI-Generated Educational Content', 105, 19, { align: 'center' });
  
  yPos = 35;
  doc.setTextColor(0, 0, 0);
  
  // Main title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 105, yPos, { align: 'center' });
  doc.setDrawColor(124, 58, 237);
  doc.setLineWidth(0.5);
  doc.line(50, yPos + 2, 160, yPos + 2);
  yPos += 15;
  
  // Parse and format content with markdown support
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  const textLines = text.split('\n');
  let inCodeBlock = false;
  
  textLines.forEach((line: string) => {
    if (yPos > 275) {
      doc.addPage();
      yPos = 20;
    }
    
    // Code blocks
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) {
        doc.setFillColor(245, 245, 245);
      }
      yPos += 5;
      return;
    }
    
    if (inCodeBlock) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      const wrappedCode = doc.splitTextToSize(line, 170);
      doc.text(wrappedCode, 20, yPos);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      yPos += wrappedCode.length * 4 + 1;
      return;
    }
    
    // Main headings (# Heading)
    if (line.match(/^#\\s+/)) {
      doc.setFillColor(124, 58, 237);
      doc.rect(15, yPos - 5, 180, 10, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(line.replace(/^#\\s+/, ''), 20, yPos);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      yPos += 12;
      return;
    }
    
    // Sub-headings (## Heading)
    if (line.match(/^##\\s+/)) {
      doc.setTextColor(124, 58, 237);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(line.replace(/^##\\s+/, ''), 20, yPos);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      yPos += 9;
      return;
    }
    
    // Bullet points (- item or * item)
    if (line.match(/^[-*]\\s+/)) {
      const bullet = '\u2022';
      const content = line.replace(/^[-*]\\s+/, '');
      doc.text(bullet, 20, yPos);
      const contentLines = doc.splitTextToSize(content, 165);
      doc.text(contentLines, 25, yPos);
      yPos += contentLines.length * 5 + 2;
      return;
    }
    
    // Bold text (**text**)
    const textContent = line.replace(/\\*\\*(.+?)\\*\\*/g, '$1');
    const isBold = line.includes('**');
    if (isBold) {
      doc.setFont('helvetica', 'bold');
    }
    
    // Regular text
    if (textContent.trim()) {
      const wrappedLines = doc.splitTextToSize(textContent, 170);
      doc.text(wrappedLines, 20, yPos);
      yPos += wrappedLines.length * 5 + 2;
      doc.setFont('helvetica', 'normal');
    } else {
      yPos += 4;
    }
  });
  
  // Save PDF
  const filename = `${title}.pdf`.replace(/[^a-z0-9_-]/gi, '_');
  doc.save(filename);
}
