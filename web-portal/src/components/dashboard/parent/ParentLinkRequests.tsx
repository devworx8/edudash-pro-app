'use client';

import { Users, UserPlus, Check, X } from 'lucide-react';
import { CollapsibleSection } from '@/components/dashboard/parent/CollapsibleSection';

interface ParentLinkRequestItem {
  id: string;
  parentName: string;
  childName: string;
  relationship?: string;
  requestedDate: string; // e.g., '2 days ago'
}

interface ParentLinkRequestsProps {
  requests: ParentLinkRequestItem[];
}

export function ParentLinkRequests({ requests }: ParentLinkRequestsProps) {
  return (
    <CollapsibleSection title="Parent Link Requests" icon={Users}>
      {requests.length === 0 ? (
        <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-6 text-center">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <UserPlus className="w-6 h-6 text-white" />
          </div>
          <h4 className="text-white font-semibold mb-1">No Link Requests</h4>
          <p className="text-gray-400 text-sm mb-4">Invite another parent or guardian to access your child's updates.</p>
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-semibold transition-colors inline-flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Invite Parent/Guardian
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="bg-gray-800/60 border border-gray-700 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">{req.parentName}</div>
                  <div className="text-xs text-gray-400">Wants access to {req.childName}{req.relationship ? ` (${req.relationship})` : ''} • {req.requestedDate}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-md text-xs font-semibold inline-flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Approve
                </button>
                <button className="px-3 py-1.5 bg-red-600/80 hover:bg-red-700 rounded-md text-xs font-semibold inline-flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
