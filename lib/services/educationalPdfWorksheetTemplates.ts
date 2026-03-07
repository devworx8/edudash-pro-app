import type { Assignment } from '@/lib/models/Assignment';
import type {
  ActivitySheetData,
  MathWorksheetData,
  ReadingWorksheetData,
  WorksheetOptions,
} from './educationalPdf.types';
import {
  getActivityStyles,
  getBaseStyles,
  getMathStyles,
  getReadingStyles,
  getWorksheetFooter,
  getWorksheetHeader,
} from './educationalPdfWorksheetStyles';

type MathProblem = { question: string; answer: number; hint?: string };
type ReadingQuestion = ReadingWorksheetData['questions'][number];

export function createAssignmentWorksheetHTML(
  assignment: Assignment,
  options: WorksheetOptions
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${assignment.title} - Worksheet</title>
      <style>${getBaseStyles(options)}</style>
    </head>
    <body>
      ${getWorksheetHeader(assignment.title, options)}

      <div class="content-section">
        <div class="instructions">
          <h3>📋 Instructions</h3>
          <p>${assignment.instructions || assignment.description || 'Complete the following tasks.'}</p>
        </div>

        <div class="assignment-content">
          <h3>📝 ${assignment.assignment_type.toUpperCase()}</h3>
          ${generateAssignmentQuestions(assignment)}
        </div>

        ${options.includeAnswerKey ? generateAnswerSection() : ''}
      </div>

      ${getWorksheetFooter()}
    </body>
    </html>
  `;
}

export function createMathWorksheetHTML(
  data: MathWorksheetData,
  options: WorksheetOptions
): string {
  const problems = generateMathProblems(data);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Math Worksheet - ${data.type}</title>
      <style>${getBaseStyles(options)}${getMathStyles()}</style>
    </head>
    <body>
      ${getWorksheetHeader(`Math Practice: ${data.type.charAt(0).toUpperCase() + data.type.slice(1)}`, options)}

      <div class="content-section">
        <div class="instructions">
          <h3>🔢 Instructions</h3>
          <p>Solve each problem. Show your work in the space provided.</p>
          ${data.showHints ? '<p><em>💡 Hint: Take your time and check your answers!</em></p>' : ''}
        </div>

        <div class="math-problems">
          ${problems
            .map(
              (problem, index) => `
            <div class="problem-item">
              <span class="problem-number">${index + 1}.</span>
              <span class="problem-text">${problem.question}</span>
              <span class="answer-space">= _______</span>
              ${data.showHints && problem.hint ? `<div class="hint">💡 ${problem.hint}</div>` : ''}
            </div>
          `
            )
            .join('')}
        </div>

        ${options.includeAnswerKey ? generateMathAnswerKey(problems) : ''}
      </div>

      ${getWorksheetFooter()}
    </body>
    </html>
  `;
}

export function createReadingWorksheetHTML(
  data: ReadingWorksheetData,
  options: WorksheetOptions
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Reading Worksheet - ${data.type}</title>
      <style>${getBaseStyles(options)}${getReadingStyles()}</style>
    </head>
    <body>
      ${getWorksheetHeader(`Reading Practice: ${data.type.charAt(0).toUpperCase() + data.type.slice(1)}`, options)}

      <div class="content-section">
        ${
          data.type === 'comprehension'
            ? `
          <div class="reading-passage">
            <h3>📖 Reading Passage</h3>
            <div class="passage-text">${data.content}</div>
          </div>
        `
            : ''
        }

        <div class="questions-section">
          <h3>❓ Questions</h3>
          ${data.questions
            .map(
              (question, index) => `
            <div class="question-item">
              <p><strong>${index + 1}. ${question.question}</strong></p>
              ${generateQuestionAnswerSpace(question)}
            </div>
          `
            )
            .join('')}
        </div>

        ${options.includeAnswerKey ? generateReadingAnswerKey(data.questions) : ''}
      </div>

      ${getWorksheetFooter()}
    </body>
    </html>
  `;
}

export function createActivitySheetHTML(
  data: ActivitySheetData,
  options: WorksheetOptions
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Activity Sheet - ${data.type}</title>
      <style>${getBaseStyles(options)}${getActivityStyles()}</style>
    </head>
    <body>
      ${getWorksheetHeader(`Fun Activity: ${data.theme}`, options)}

      <div class="content-section">
        <div class="activity-intro">
          <h3>🎨 Let's Have Fun!</h3>
          <p>${data.instructions}</p>
          ${
            data.materials
              ? `
            <div class="materials-list">
              <h4>📦 You'll Need:</h4>
              <ul>
                ${data.materials.map(item => `<li>${item}</li>`).join('')}
              </ul>
            </div>
          `
              : ''
          }
        </div>

        <div class="activity-space">
          ${generateActivityContent(data)}
        </div>
      </div>

      ${getWorksheetFooter()}
    </body>
    </html>
  `;
}

export function createAnswerKeyHTML(
  _worksheetData: MathWorksheetData | ReadingWorksheetData,
  options: WorksheetOptions
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Answer Key</title>
      <style>${getBaseStyles(options)}</style>
    </head>
    <body>
      ${getWorksheetHeader('Answer Key', options)}
      <div class="content-section">
        <h3>🔑 Complete Answer Key</h3>
        <p>Detailed answers and explanations for teachers and parents.</p>
      </div>
    </body>
    </html>
  `;
}

function generateMathProblems(data: MathWorksheetData): MathProblem[] {
  const problems: MathProblem[] = [];

  for (let i = 0; i < data.problemCount; i++) {
    const num1 = Math.floor(Math.random() * (data.numberRange.max - data.numberRange.min + 1)) + data.numberRange.min;
    const num2 = Math.floor(Math.random() * (data.numberRange.max - data.numberRange.min + 1)) + data.numberRange.min;

    let question: string;
    let answer: number;
    let hint: string | undefined;

    switch (data.type) {
      case 'addition':
        question = `${num1} + ${num2}`;
        answer = num1 + num2;
        hint = data.showHints ? `Try counting up from ${num1}` : undefined;
        break;
      case 'subtraction': {
        const larger = Math.max(num1, num2);
        const smaller = Math.min(num1, num2);
        question = `${larger} - ${smaller}`;
        answer = larger - smaller;
        hint = data.showHints ? `Count backwards from ${larger}` : undefined;
        break;
      }
      case 'multiplication':
        question = `${num1} × ${num2}`;
        answer = num1 * num2;
        hint = data.showHints ? `Think of ${num1} groups of ${num2}` : undefined;
        break;
      case 'division': {
        const dividend = num1 * num2;
        question = `${dividend} ÷ ${num1}`;
        answer = num2;
        hint = data.showHints ? `How many ${num1}s make ${dividend}?` : undefined;
        break;
      }
      default: {
        const operations = ['+', '-', '×'];
        const op = operations[Math.floor(Math.random() * operations.length)];
        if (op === '+') {
          question = `${num1} + ${num2}`;
          answer = num1 + num2;
        } else if (op === '-') {
          const larger = Math.max(num1, num2);
          const smaller = Math.min(num1, num2);
          question = `${larger} - ${smaller}`;
          answer = larger - smaller;
        } else {
          question = `${num1} × ${num2}`;
          answer = num1 * num2;
        }
      }
    }

    problems.push({ question, answer, hint });
  }

  return problems;
}

function generateAssignmentQuestions(assignment: Assignment): string {
  const questionCount = Math.min(10, Math.max(5, Math.floor(assignment.max_points / 2)));
  let questionsHTML = '';

  for (let i = 1; i <= questionCount; i++) {
    questionsHTML += `
      <div class="question-space">
        <p><strong>Question ${i}:</strong></p>
        <div class="answer-lines">
          <div class="line"></div>
          <div class="line"></div>
          <div class="line"></div>
        </div>
      </div>
    `;
  }

  return questionsHTML;
}

function generateQuestionAnswerSpace(question: ReadingQuestion): string {
  switch (question.type) {
    case 'multiple-choice':
      return `
        <div class="multiple-choice">
          ${
            question.options
              ?.map(
                (option, index) => `
            <div class="choice-item">
              <input type="checkbox" disabled> ${String.fromCharCode(65 + index)}. ${option}
            </div>
          `
              )
              .join('') || ''
          }
        </div>
      `;
    case 'true-false':
      return `
        <div class="true-false">
          <input type="checkbox" disabled> True &nbsp;&nbsp;&nbsp;
          <input type="checkbox" disabled> False
        </div>
      `;
    default:
      return `
        <div class="answer-lines">
          <div class="line"></div>
          <div class="line"></div>
        </div>
      `;
  }
}

function generateActivityContent(data: ActivitySheetData): string {
  switch (data.type) {
    case 'coloring':
      return `
        <div class="coloring-area">
          <div class="coloring-frame">
            <p style="text-align: center; font-size: 48px; margin: 100px 0;">
              🎨 Coloring Space 🖍️
            </p>
            <p style="text-align: center; color: #666;">
              Draw and color your ${data.theme} here!
            </p>
          </div>
        </div>
      `;
    case 'tracing':
      return `
        <div class="tracing-area">
          ${Array.from({ length: 8 }, () => `
            <div class="trace-line">
              <span class="trace-guide">${data.theme.charAt(0).toUpperCase()}</span>
              <span class="trace-dots">• • • • • • • • • •</span>
            </div>
          `).join('')}
        </div>
      `;
    case 'matching':
      return `
        <div class="matching-area">
          <div class="match-column">
            <h4>Column A</h4>
            <div class="match-item">🐱 Cat</div>
            <div class="match-item">🐶 Dog</div>
            <div class="match-item">🐦 Bird</div>
            <div class="match-item">🐠 Fish</div>
          </div>
          <div class="match-column">
            <h4>Column B</h4>
            <div class="match-item">Meow</div>
            <div class="match-item">Woof</div>
            <div class="match-item">Tweet</div>
            <div class="match-item">Splash</div>
          </div>
        </div>
      `;
    default:
      return `
        <div class="creative-space">
          <div class="creative-frame">
            <p style="text-align: center; margin: 150px 0;">
              ✨ Creative Space ✨<br>
              <small>Use this space for your ${data.theme} activity!</small>
            </p>
          </div>
        </div>
      `;
  }
}

function generateAnswerSection(): string {
  return `
    <div class="answer-key-section">
      <h3>📝 For Teachers/Parents - Answer Space</h3>
      <div class="answer-notes">
        <div class="line"></div>
        <div class="line"></div>
        <div class="line"></div>
        <div class="line"></div>
        <div class="line"></div>
      </div>
    </div>
  `;
}

function generateMathAnswerKey(problems: MathProblem[]): string {
  return `
    <div class="answer-key">
      <h3>🔑 Answer Key (For Teachers/Parents)</h3>
      <div class="answers-grid">
        ${problems
          .map(
            (problem, index) => `
          <div class="answer-item">
            ${index + 1}. ${problem.question} = <strong>${problem.answer}</strong>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

function generateReadingAnswerKey(questions: ReadingQuestion[]): string {
  return `
    <div class="answer-key">
      <h3>🔑 Answer Key (For Teachers/Parents)</h3>
      ${questions
        .map(
          (question, index) => `
        <div class="answer-item">
          <strong>${index + 1}.</strong> ${question.correctAnswer || 'Sample answer provided by teacher'}
        </div>
      `
        )
        .join('')}
    </div>
  `;
}
