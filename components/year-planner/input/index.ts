export { StatusBadge } from './StatusBadge';
export { CategoryIcon } from './CategoryIcon';
export { InputWindowCard } from './InputWindowCard';
export { SubmissionCard } from './SubmissionCard';
export { SubmissionForm } from './SubmissionForm';
export { InputWindowFormModal } from './InputWindowFormModal';
export { SubmissionFilters } from './SubmissionFilters';
export { SubmissionReviewModal } from './SubmissionReviewModal';

export type {
  InputWindow,
  TeacherSubmission,
  SubmissionCategory,
  SubmissionStatus,
  SubmissionPriority,
  InputWindowType,
  SubmissionCounts,
  SubmissionFormData,
  InputWindowFormData,
} from './types';

export {
  CATEGORY_CONFIG,
  STATUS_CONFIG,
  WINDOW_TYPE_CONFIG,
  PRIORITY_CONFIG,
  getDefaultSubmissionFormData,
  getDefaultWindowFormData,
} from './types';
