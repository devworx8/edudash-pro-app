import type { WorksheetOptions } from './educationalPdf.types';

export function getBaseStyles(options: WorksheetOptions): string {
  const colorScheme = options.colorMode === 'color' ? 'color' : 'black-and-white';
  return `
    @page {
      size: ${options.paperSize} ${options.orientation};
      margin: 20mm;
    }
    body {
      font-family: 'Arial', sans-serif;
      line-height: 1.6;
      color: ${colorScheme === 'color' ? '#333' : '#000'};
      margin: 0;
      padding: 0;
    }
    .worksheet-header {
      text-align: center;
      border-bottom: 3px solid ${colorScheme === 'color' ? '#007AFF' : '#000'};
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .worksheet-title {
      font-size: 28px;
      font-weight: bold;
      color: ${colorScheme === 'color' ? '#007AFF' : '#000'};
      margin: 0 0 10px 0;
    }
    .worksheet-info {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      color: #666;
    }
    .content-section {
      margin: 20px 0;
    }
    .instructions {
      background: ${colorScheme === 'color' ? '#f0f8ff' : '#f5f5f5'};
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 30px;
      border-left: 4px solid ${colorScheme === 'color' ? '#007AFF' : '#000'};
    }
    .line {
      border-bottom: 1px solid #ccc;
      height: 30px;
      margin: 10px 0;
    }
    .answer-lines .line {
      margin: 5px 0;
      height: 25px;
    }
    .worksheet-footer {
      margin-top: 50px;
      text-align: center;
      font-size: 12px;
      color: #999;
      border-top: 1px solid #ddd;
      padding-top: 15px;
    }
    .answer-key {
      background: #fff5f5;
      padding: 20px;
      border-radius: 8px;
      margin-top: 30px;
      border: 2px dashed #ff6b6b;
    }
    .answer-key h3 {
      color: #ff6b6b;
      margin-top: 0;
    }
    h3 {
      color: ${colorScheme === 'color' ? '#007AFF' : '#000'};
      margin: 20px 0 10px 0;
    }
  `;
}

export function getMathStyles(): string {
  return `
    .math-problems {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin: 30px 0;
    }
    .problem-item {
      border: 1px solid #ddd;
      padding: 15px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .problem-number {
      font-weight: bold;
      color: #007AFF;
      min-width: 30px;
    }
    .problem-text {
      font-size: 18px;
      font-weight: bold;
      flex-grow: 1;
    }
    .answer-space {
      font-size: 16px;
      min-width: 100px;
      text-align: right;
    }
    .hint {
      grid-column: 1 / -1;
      font-style: italic;
      color: #666;
      font-size: 12px;
      margin-top: 5px;
    }
    .answers-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
    }
    .answer-item {
      padding: 5px;
      font-size: 14px;
    }
  `;
}

export function getReadingStyles(): string {
  return `
    .reading-passage {
      background: #f9f9f9;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      border-left: 4px solid #28a745;
    }
    .passage-text {
      font-size: 16px;
      line-height: 1.8;
      text-align: justify;
    }
    .questions-section {
      margin-top: 30px;
    }
    .question-item {
      margin: 20px 0;
      padding: 15px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
    }
    .multiple-choice {
      margin: 10px 0;
    }
    .choice-item {
      margin: 8px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .true-false {
      margin: 10px 0;
      font-size: 16px;
    }
  `;
}

export function getActivityStyles(): string {
  return `
    .activity-intro {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 30px;
    }
    .materials-list {
      background: rgba(255,255,255,0.1);
      padding: 15px;
      border-radius: 8px;
      margin-top: 15px;
    }
    .materials-list ul {
      margin: 10px 0 0 20px;
    }
    .activity-space {
      min-height: 400px;
    }
    .coloring-frame, .creative-frame {
      border: 3px dashed #ff6b6b;
      border-radius: 12px;
      min-height: 300px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff9f9;
    }
    .tracing-area {
      margin: 30px 0;
    }
    .trace-line {
      display: flex;
      align-items: center;
      margin: 20px 0;
      font-size: 24px;
    }
    .trace-guide {
      width: 60px;
      text-align: center;
      font-weight: bold;
      color: #007AFF;
    }
    .trace-dots {
      flex-grow: 1;
      letter-spacing: 8px;
      color: #ccc;
      padding: 0 20px;
    }
    .matching-area {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin: 30px 0;
    }
    .match-column h4 {
      text-align: center;
      color: #007AFF;
      margin-bottom: 20px;
    }
    .match-item {
      padding: 10px;
      margin: 10px 0;
      border: 2px solid #ddd;
      border-radius: 8px;
      text-align: center;
      font-size: 18px;
    }
  `;
}

export function getWorksheetHeader(title: string, options: WorksheetOptions): string {
  const currentDate = options.dateCreated || new Date().toLocaleDateString();
  return `
    <div class="worksheet-header">
      <h1 class="worksheet-title">${title}</h1>
      <div class="worksheet-info">
        <div>
          <strong>Name:</strong> ${options.studentName || '________________________'}
        </div>
        <div>
          <strong>Date:</strong> ${currentDate}
        </div>
        <div>
          <strong>Age:</strong> ${options.ageGroup} years
        </div>
      </div>
    </div>
  `;
}

export function getWorksheetFooter(): string {
  return `
    <div class="worksheet-footer">
      <p>Generated by EduDash Pro • Educational Excellence for Every Child</p>
      <p>Remember: Learning is fun! 🌟 Keep practicing and you'll get better every day! 🚀</p>
    </div>
  `;
}
