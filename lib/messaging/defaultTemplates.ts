/**
 * Default message templates for schools.
 * These are merged with any custom templates from the DB.
 */

export type TemplateCategory =
  | 'attendance'
  | 'fees'
  | 'events'
  | 'general'
  | 'homework'
  | 'health'
  | 'transport';

export interface MessageTemplate {
  id: string;
  category: TemplateCategory;
  title: string;
  body: string;
  /** Placeholders inside {{...}} that can be filled at send time */
  variables: string[];
}

export const TEMPLATE_CATEGORIES: { key: TemplateCategory; label: string; icon: string }[] = [
  { key: 'general', label: 'General', icon: 'chatbubble-outline' },
  { key: 'attendance', label: 'Attendance', icon: 'checkmark-circle-outline' },
  { key: 'fees', label: 'Fees', icon: 'wallet-outline' },
  { key: 'events', label: 'Events', icon: 'calendar-outline' },
  { key: 'homework', label: 'Homework', icon: 'book-outline' },
  { key: 'health', label: 'Health', icon: 'medkit-outline' },
  { key: 'transport', label: 'Transport', icon: 'bus-outline' },
];

export const DEFAULT_TEMPLATES: MessageTemplate[] = [
  // General
  {
    id: 'default-gen-1',
    category: 'general',
    title: 'Friendly reminder',
    body: 'Hi {{parent_name}}, just a friendly reminder about {{topic}}. Please let us know if you have any questions.',
    variables: ['parent_name', 'topic'],
  },
  {
    id: 'default-gen-2',
    category: 'general',
    title: 'Thank you',
    body: 'Thank you for your support and cooperation. We really appreciate it!',
    variables: [],
  },

  // Attendance
  {
    id: 'default-att-1',
    category: 'attendance',
    title: 'Absent today',
    body: 'Hi, we noticed {{child_name}} is absent today. We hope everything is okay. Please let us know if they will be returning tomorrow.',
    variables: ['child_name'],
  },
  {
    id: 'default-att-2',
    category: 'attendance',
    title: 'Late arrival',
    body: 'Hi, {{child_name}} arrived late today at {{time}}. Please try to ensure they arrive on time going forward.',
    variables: ['child_name', 'time'],
  },

  // Fees
  {
    id: 'default-fee-1',
    category: 'fees',
    title: 'Payment reminder',
    body: 'This is a friendly reminder that school fees for {{month}} are due. The amount outstanding is {{amount}}. Please arrange payment at your earliest convenience.',
    variables: ['month', 'amount'],
  },
  {
    id: 'default-fee-2',
    category: 'fees',
    title: 'Payment received',
    body: 'Thank you! We have received your payment of {{amount}}. Your account is now up to date.',
    variables: ['amount'],
  },

  // Events
  {
    id: 'default-evt-1',
    category: 'events',
    title: 'Upcoming event',
    body: 'Reminder: {{event_name}} is happening on {{date}}. Please make sure {{child_name}} is prepared.',
    variables: ['event_name', 'date', 'child_name'],
  },
  {
    id: 'default-evt-2',
    category: 'events',
    title: 'School closure',
    body: 'Please note that the school will be closed on {{date}} for {{reason}}. Normal classes will resume the following day.',
    variables: ['date', 'reason'],
  },

  // Homework
  {
    id: 'default-hw-1',
    category: 'homework',
    title: 'Homework reminder',
    body: 'Just a reminder that {{child_name}} has homework due on {{date}}. Please ensure it is completed and brought to school.',
    variables: ['child_name', 'date'],
  },

  // Health
  {
    id: 'default-health-1',
    category: 'health',
    title: 'Child feeling unwell',
    body: '{{child_name}} is not feeling well today and was seen by our staff. Please collect them as soon as possible.',
    variables: ['child_name'],
  },
  {
    id: 'default-health-2',
    category: 'health',
    title: 'Medicine reminder',
    body: 'Please remember to send {{child_name}}\'s medicine to school tomorrow with clear dosage instructions.',
    variables: ['child_name'],
  },

  // Transport
  {
    id: 'default-transport-1',
    category: 'transport',
    title: 'Pickup change',
    body: 'Please note that {{child_name}} needs to be picked up at {{time}} today instead of the usual time.',
    variables: ['child_name', 'time'],
  },
  {
    id: 'default-transport-2',
    category: 'transport',
    title: 'Transport delay',
    body: 'The school transport will be running approximately {{minutes}} minutes late today. We apologise for the inconvenience.',
    variables: ['minutes'],
  },
];
