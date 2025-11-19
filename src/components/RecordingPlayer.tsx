import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface RecordingPlayerProps {
  messageId: string;
  locationId: string;
  userId: string;
  recordingUrl?: string | null;
  contactName: string;
  duration: number;
  callDate: string;
}

export default function RecordingPlayer({
  messageId,
  locationId,
  userId,
  recordingUrl,
  contactName,
  duration,
  callDate,
}: RecordingPlayerProps) {
  const [recordingObjectUrl, setRecordingObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRecording();
  }, [messageId, locationId, userId, recordingUrl]);

  useEffect(() => {
    return () => {
      if (recordingObjectUrl) {
        URL.revokeObjectURL(recordingObjectUrl);
      }
    };
  }, [recordingObjectUrl]);

  const loadRecording = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get the current session to include auth token
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setError('Authentication required. Please sign in again.');
        setLoading(false);
        return;
      }

      const attemptEdgeRecording = async () => {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-call-recording?messageId=${messageId}&locationId=${locationId}&userId=${userId}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          const contentType = response.headers.get('content-type');
          const errorData = contentType?.includes('application/json')
            ? await response.json().catch(() => ({}))
            : {};
          throw new Error(errorData.message || errorData.error || response.statusText);
        }

        return response.blob();
      };

      const attemptDirectUrl = async () => {
        if (!recordingUrl) return null;
        const response = await fetch(recordingUrl, {
          headers: {
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
        });

        if (!response.ok) {
          const message = await response.text().catch(() => '');
          throw new Error(message || 'Recording not available');
        }
        return response.blob();
      };

      let blob: Blob | null = null;

      // Prefer edge proxy when identifiers are present to avoid CORS issues
      if (messageId && locationId) {
        try {
          blob = await attemptEdgeRecording();
        } catch (edgeError) {
          console.warn('Edge recording fetch failed, trying direct URL if available:', edgeError);
          if (!recordingUrl) {
            throw edgeError;
          }
        }
      }

      if (!blob) {
        blob = await attemptDirectUrl();
      }

      if (!blob) {
        setError('Recording not available. It may still be processing or was not recorded.');
        setLoading(false);
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      setRecordingObjectUrl(objectUrl);
    } catch (err) {
      console.error('Error loading recording:', err);
      setError('Failed to load recording. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-gray-600 mb-2">
          Contact: <span className="font-medium text-gray-900">{contactName}</span>
        </p>
        <p className="text-sm text-gray-600 mb-2">
          Duration: <span className="font-medium text-gray-900">{formatDuration(duration)}</span>
        </p>
        <p className="text-sm text-gray-600">
          Date: <span className="font-medium text-gray-900">{format(new Date(callDate), 'MMM d, yyyy h:mm a')}</span>
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
          <span className="ml-3 text-gray-600">Checking recording availability...</span>
        </div>
      )}

      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-900">Recording Not Available</p>
              <p className="text-sm text-amber-800 mt-1">{error}</p>
              <p className="text-xs text-amber-700 mt-2">
                Recordings may take a few minutes to process after the call ends. Please try again later.
              </p>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && recordingObjectUrl && (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              Recording is ready to play. Use the controls below to listen.
            </p>
          </div>
          <audio
            controls
            className="w-full"
            src={recordingObjectUrl}
            preload="metadata"
            onError={() => {
              setError('Failed to load audio. The recording may have been removed or is temporarily unavailable.');
            }}
          >
            Your browser does not support the audio element.
          </audio>
        </>
      )}

      {!loading && !error && !recordingObjectUrl && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-600 text-center">
            Unable to load recording information.
          </p>
        </div>
      )}
    </div>
  );
}
