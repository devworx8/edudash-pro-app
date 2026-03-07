/**
 * Utility functions for filtering internal AI system instructions from user-visible prompts.
 * 
 * These functions ensure users only see and edit content-generation instructions,
 * while system directives like "You are Dash..." remain hidden.
 */

/**
 * Extract user-editable portion of a prompt by removing internal system instructions.
 * 
 * @param fullPrompt - The complete prompt including system instructions
 * @returns The filtered prompt with only user-editable content
 * 
 * @example
 * const fullPrompt = "You are Dash...\n\nGenerate 30 flashcards for Grade 9 Mathematics...";
 * const filtered = getUserEditablePrompt(fullPrompt);
 * // Returns: "Generate 30 flashcards for Grade 9 Mathematics..."
 */
export function getUserEditablePrompt(fullPrompt: string): string {
  if (!fullPrompt) return '';
  
  // Split into lines and filter out system instructions
  const lines = fullPrompt.split('\n');
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    
    // Remove system-level instructions
    if (trimmed.startsWith('You are Dash,')) return false;
    if (trimmed.includes('**IMPORTANT:')) return false;
    if (trimmed.includes('Generate ALL content')) return false;
    if (trimmed.startsWith('**Your Task:**')) return false;
    if (trimmed.startsWith('**Conversation Flow:**')) return false;
    if (trimmed.startsWith('**Important Guidelines:**')) return false;
    if (trimmed.startsWith('**CAPS Curriculum Focus:**')) return false;
    if (trimmed.startsWith('**AGE-APPROPRIATE INSTRUCTION VERBS')) return false;
    if (trimmed.startsWith('**WRONG - Too vague')) return false;
    if (trimmed.startsWith('**CORRECT - Clear teacher')) return false;
    if (trimmed.startsWith('**PEDAGOGICAL FRAMEWORK')) return false;
    if (trimmed.startsWith('**Student Context:**')) return false;
    if (trimmed.startsWith('**Age-Appropriate Instructions:**')) return false;
    if (trimmed.startsWith("Let's start:")) return false;
    
    return true;
  });
  
  // Rejoin and extract main content section
  let result = filteredLines.join('\n').trim();
  
  // Remove leading system context up to the actual content instructions
  const contentMarkers = [
    'Generate an interactive',
    'Generate comprehensive revision notes',
    'Generate a 7-day intensive study',
    'Generate 30 flashcards',
    'Generate'  // Generic fallback
  ];
  
  for (const marker of contentMarkers) {
    const markerIndex = result.indexOf(marker);
    if (markerIndex !== -1) {
      result = result.substring(markerIndex);
      break;
    }
  }
  
  return result;
}

/**
 * Reconstruct full prompt by prepending system instructions to user-edited content.
 * 
 * @param userContent - The user-editable content portion
 * @param language - The language code (e.g., 'en-ZA', 'af-ZA')
 * @returns The complete prompt with system instructions
 * 
 * @example
 * const userContent = "Generate 30 flashcards...";
 * const fullPrompt = reconstructFullPrompt(userContent, 'English (South Africa)');
 * // Returns: "You are Dash...\n\nGenerate 30 flashcards..."
 */
export function reconstructFullPrompt(userContent: string, language: string = 'English (South Africa)'): string {
  if (!userContent) return '';
  
  // Prepend system instructions
  const systemHeader = `You are Dash, a South African education assistant specializing in CAPS curriculum.\n\n**IMPORTANT: Generate ALL content in ${language}. Use ONLY this language throughout the entire document. Do NOT switch languages.**\n\n`;
  
  return systemHeader + userContent;
}

/**
 * Check if a prompt contains system instructions that should be hidden.
 * 
 * @param prompt - The prompt to check
 * @returns True if system instructions are present
 */
export function hasSystemInstructions(prompt: string): boolean {
  const systemIndicators = [
    'You are Dash',
    '**IMPORTANT:',
    '**Your Task:**',
    '**Conversation Flow:**'
  ];
  
  return systemIndicators.some(indicator => prompt.includes(indicator));
}

/**
 * Get a user-friendly summary of what the prompt will generate.
 * 
 * @param prompt - The full or filtered prompt
 * @returns A short description of the generation task
 * 
 * @example
 * const summary = getPromptSummary("Generate 30 flashcards for Grade 9...");
 * // Returns: "Flashcards for Grade 9"
 */
export function getPromptSummary(prompt: string): string {
  if (prompt.includes('flashcards')) {
    const gradeMatch = prompt.match(/Grade (\d+|R)/);
    const subjectMatch = prompt.match(/for ([\w\s]+?)(?:\s+covering|\.|\n|$)/);
    
    const grade = gradeMatch ? `Grade ${gradeMatch[1]}` : '';
    const subject = subjectMatch ? subjectMatch[1].trim() : '';
    
    return `Flashcards${grade ? ` for ${grade}` : ''}${subject ? ` - ${subject}` : ''}`;
  }
  
  if (prompt.includes('practice test') || prompt.includes('exam')) {
    return 'Practice Test';
  }
  
  if (prompt.includes('study guide') || prompt.includes('study schedule')) {
    return 'Study Guide';
  }
  
  if (prompt.includes('revision notes')) {
    return 'Revision Notes';
  }
  
  return 'AI Generation';
}
