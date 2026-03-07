import { redirect } from 'next/navigation';

/** AI Assistant → redirects to Dash Chat (same feature, different label) */
export default function AIAssistantPage() {
  redirect('/dashboard/teacher/dash-chat');
}
