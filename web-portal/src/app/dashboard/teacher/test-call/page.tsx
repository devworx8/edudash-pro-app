'use client';

import { useState } from 'react';
import { SimpleCallInterface, useSimpleCallInterface } from '@/components/calls/SimpleCallInterface';
import { Video, Phone, Loader2 } from 'lucide-react';

export default function TestCallPage() {
  const { isCallOpen, callConfig, startCall, endCall } = useSimpleCallInterface();
  const [roomName, setRoomName] = useState('');
  const [userName, setUserName] = useState('');
  const [isOwner, setIsOwner] = useState(true);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateAndJoinRoom = async () => {
    try {
      setError(null);
      setIsCreatingRoom(true);

      // Generate room name if not provided
      const finalRoomName = roomName || `test-${Date.now()}`;
      const finalUserName = userName || 'Test User';

      // Create room via API
      const createResponse = await fetch('/api/daily/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: finalRoomName,
          privacy: 'private',
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.error || 'Failed to create room');
      }

      const { name } = await createResponse.json();

      // Start the call
      startCall({
        roomName: name,
        userName: finalUserName,
        isOwner,
      });

    } catch (err) {
      console.error('[TestCall] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start call');
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleQuickTest = () => {
    setRoomName(`test-${Date.now()}`);
    setUserName('Quick Test User');
    setIsOwner(true);
    setTimeout(() => {
      handleCreateAndJoinRoom();
    }, 100);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Test Video Call
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Simple interface to test Daily.co video calls
          </p>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-6">
            {/* Room Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Room Name (optional)
              </label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Leave empty to auto-generate"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* User Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Your Name (optional)
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Leave empty for default"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Owner Checkbox */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isOwner"
                checked={isOwner}
                onChange={(e) => setIsOwner(e.target.checked)}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="isOwner" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Join as owner (enables screen sharing and recording)
              </label>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleQuickTest}
                disabled={isCreatingRoom}
                className="flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingRoom ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Video className="w-5 h-5" />
                    Quick Test
                  </>
                )}
              </button>

              <button
                onClick={handleCreateAndJoinRoom}
                disabled={isCreatingRoom}
                className="flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingRoom ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Phone className="w-5 h-5" />
                    Create & Join
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
              How to use:
            </h3>
            <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-disc list-inside">
              <li><strong>Quick Test:</strong> Instantly create a room with default settings</li>
              <li><strong>Custom Room:</strong> Enter a room name to create a specific room</li>
              <li><strong>Owner Mode:</strong> Check to enable screen sharing and recording</li>
              <li>Share the room name with others to join the same call</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Call Interface */}
      <SimpleCallInterface
        isOpen={isCallOpen}
        onClose={endCall}
        roomName={callConfig.roomName}
        userName={callConfig.userName}
        isOwner={callConfig.isOwner}
      />
    </div>
  );
}
