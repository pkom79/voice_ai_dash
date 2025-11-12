import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { oauthService } from '../services/oauth';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing your connection...');

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      console.log('[OAuth Callback] Received callback:', {
        hasCode: !!code,
        hasState: !!state,
        error,
        errorDescription,
        fullUrl: window.location.href,
      });

      if (error) {
        const fullError = errorDescription ? `${error}: ${errorDescription}` : error;
        console.error('[OAuth Callback] Authorization error:', fullError);
        setStatus('error');
        setMessage(`Authorization failed: ${fullError}`);
        setTimeout(() => navigate('/admin/users'), 3000);
        return;
      }

      if (!code || !state) {
        console.error('[OAuth Callback] Missing required parameters');
        setStatus('error');
        setMessage('Missing authorization code or state parameter');
        setTimeout(() => navigate('/admin/users'), 3000);
        return;
      }

      const stateData = await oauthService.validateState(state);

      if (!stateData) {
        console.error('[OAuth Callback] State validation failed');
        setStatus('error');
        setMessage('Invalid or expired state parameter. Please try again.');
        setTimeout(() => navigate('/admin/users'), 3000);
        return;
      }

      console.log('[OAuth Callback] State validated, exchanging code for tokens');
      const success = await oauthService.exchangeCodeForTokens(code, stateData.userId);

      if (success) {
        console.log('[OAuth Callback] Token exchange successful');
        setStatus('success');
        setMessage('Successfully connected!');
        setTimeout(() => navigate('/admin/users'), 2000);
      } else {
        console.error('[OAuth Callback] Token exchange returned false');
        setStatus('error');
        setMessage('Failed to exchange authorization code for tokens');
        setTimeout(() => navigate('/admin/users'), 3000);
      }
    } catch (error) {
      console.error('[OAuth Callback] Unexpected error:', error);
      setStatus('error');
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred during authorization';
      setMessage(errorMessage);
      setTimeout(() => navigate('/admin/users'), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="h-16 w-16 text-blue-600 mx-auto mb-4 animate-spin" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Connecting...</h2>
            <p className="text-gray-600">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Success!</h2>
            <p className="text-gray-600">{message}</p>
            <p className="text-sm text-gray-500 mt-4">Redirecting to admin panel...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-16 w-16 text-red-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Connection Failed</h2>
            <p className="text-gray-600">{message}</p>
            <p className="text-sm text-gray-500 mt-4">Redirecting back...</p>
          </>
        )}
      </div>
    </div>
  );
}
