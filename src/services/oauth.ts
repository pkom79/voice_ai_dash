import { supabase } from '../lib/supabase';

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authUrl: string;
  tokenUrl: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  locationId?: string;
  companyId?: string;
  userId?: string;
}

class OAuthService {
  private config: OAuthConfig;

  constructor() {
    const redirectUri = import.meta.env.VITE_HIGHLEVEL_REDIRECT_URI || '';
    const currentOrigin = window.location.origin;
    const effectiveRedirectUri = redirectUri.includes('voiceaidash.com') && currentOrigin.includes('localhost')
      ? `${currentOrigin}/oauth/callback`
      : redirectUri;

    this.config = {
      clientId: import.meta.env.VITE_HIGHLEVEL_CLIENT_ID || '',
      clientSecret: import.meta.env.VITE_HIGHLEVEL_CLIENT_SECRET || '',
      redirectUri: effectiveRedirectUri,
      authUrl: import.meta.env.VITE_HIGHLEVEL_AUTH_URL || '',
      tokenUrl: import.meta.env.VITE_HIGHLEVEL_TOKEN_URL || '',
    };

    console.log('[OAuth Debug] Service initialized:', {
      currentOrigin,
      configuredRedirectUri: redirectUri,
      effectiveRedirectUri: effectiveRedirectUri,
      clientId: this.config.clientId ? `${this.config.clientId.substring(0, 10)}...` : 'MISSING',
      authUrl: this.config.authUrl || 'MISSING',
      tokenUrl: this.config.tokenUrl || 'MISSING',
    });
  }

  async generateAuthorizationUrl(userId: string, adminId: string): Promise<string> {
    const state = this.generateState();

    await this.saveState(state, userId, adminId);

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      state,
      scope: 'voice-ai-agents.readonly voice-ai-agents.write voice-ai-dashboard.readonly voice-ai-agent-goals.readonly voice-ai-agent-goals.write contacts.readonly locations.readonly conversations.readonly conversations/message.readonly phonenumbers.read numberpools.read',
    });

    const authUrl = `${this.config.authUrl}?${params.toString()}`;

    console.log('[OAuth Debug] Generated authorization URL:', {
      userId,
      redirectUri: this.config.redirectUri,
      state: `${state.substring(0, 10)}...`,
      authUrl: authUrl.substring(0, 100) + '...',
    });

    return authUrl;
  }

  private generateState(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private async saveState(state: string, userId: string, adminId: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    const { error } = await supabase.from('oauth_states').insert({
      state,
      user_id: userId,
      admin_id: adminId,
      expires_at: expiresAt.toISOString(),
    });

    if (error) throw error;
  }

  async validateState(state: string): Promise<{ userId: string; adminId: string } | null> {
    const { data, error } = await supabase
      .from('oauth_states')
      .select('user_id, admin_id, expires_at')
      .eq('state', state)
      .maybeSingle();

    if (error || !data) return null;

    if (new Date(data.expires_at) < new Date()) {
      await this.deleteState(state);
      return null;
    }

    await this.deleteState(state);
    return { userId: data.user_id, adminId: data.admin_id };
  }

  private async deleteState(state: string): Promise<void> {
    await supabase.from('oauth_states').delete().eq('state', state);
  }

  async exchangeCodeForTokens(code: string, userId: string): Promise<boolean> {
    try {
      console.log('[OAuth Debug] Exchanging code for tokens:', {
        userId,
        redirectUri: this.config.redirectUri,
        code: `${code.substring(0, 10)}...`,
        tokenUrl: this.config.tokenUrl,
      });

      const params = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
      });

      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('[OAuth Error] Token exchange failed:', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          redirectUriUsed: this.config.redirectUri,
        });
        throw new Error(`Failed to exchange code for tokens: ${response.statusText} - ${errorData}`);
      }

      const tokens: TokenResponse = await response.json();
      console.log('Token response received:', { ...tokens, access_token: '[REDACTED]', refresh_token: '[REDACTED]' });

      await this.saveTokens(userId, tokens);

      // Fetch and store location name if locationId is available
      if (tokens.locationId) {
        await this.fetchAndStoreLocationName(userId, tokens.locationId, tokens.access_token);
      }

      return true;
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      throw error;
    }
  }

  private async saveTokens(userId: string, tokens: TokenResponse): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);

    const { error: deleteError } = await supabase
      .from('api_keys')
      .delete()
      .eq('user_id', userId)
      .eq('service', 'highlevel');

    if (deleteError) console.error('Error deleting old tokens:', deleteError);

    const { error } = await supabase.from('api_keys').insert({
      name: 'HighLevel OAuth Connection',
      service: 'highlevel',
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt.toISOString(),
      location_id: tokens.locationId || null,
      company_id: tokens.companyId || null,
      is_active: true,
    });

    if (error) throw error;
  }

  async refreshAccessToken(userId: string): Promise<boolean> {
    try {
      const { data: tokenData, error: fetchError } = await supabase
        .from('api_keys')
        .select('refresh_token, location_id')
        .eq('user_id', userId)
        .eq('service', 'highlevel')
        .eq('is_active', true)
        .maybeSingle();

      if (fetchError || !tokenData?.refresh_token) {
        console.error('No refresh token found for user');
        return false;
      }

      console.log('Refreshing access token for user:', userId);

      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: tokenData.refresh_token,
        }).toString(),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Token refresh failed:', errorData);

        // Mark connection as inactive on permanent refresh failure
        await this.markConnectionExpired(userId);
        return false;
      }

      const tokens: TokenResponse = await response.json();
      console.log('Token refreshed successfully');

      // If a new refresh token is provided, use it; otherwise keep the old one
      if (!tokens.refresh_token) {
        tokens.refresh_token = tokenData.refresh_token;
      }

      // Preserve location_id if not in response
      if (!tokens.locationId && tokenData.location_id) {
        tokens.locationId = tokenData.location_id;
      }

      await this.saveTokens(userId, tokens);

      return true;
    } catch (error) {
      console.error('Error refreshing access token:', error);
      return false;
    }
  }

  async getValidAccessToken(userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('api_keys')
      .select('access_token, token_expires_at, refresh_token')
      .eq('user_id', userId)
      .eq('service', 'highlevel')
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      console.error('No access token found for user:', userId);
      return null;
    }

    if (!data.access_token) {
      console.error('Access token is null for user:', userId);
      return null;
    }

    const expiresAt = new Date(data.token_expires_at);
    const now = new Date();

    // Check if token is expired or will expire in the next 5 minutes
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt < fiveMinutesFromNow) {
      console.log('Access token expired or expiring soon, refreshing...');

      if (!data.refresh_token) {
        console.error('No refresh token available for user:', userId);
        return null;
      }

      const refreshed = await this.refreshAccessToken(userId);
      if (!refreshed) {
        console.error('Failed to refresh access token for user:', userId);
        return null;
      }

      const { data: newData } = await supabase
        .from('api_keys')
        .select('access_token')
        .eq('user_id', userId)
        .eq('service', 'highlevel')
        .eq('is_active', true)
        .maybeSingle();

      return newData?.access_token || null;
    }

    return data.access_token;
  }

  async disconnectUser(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('user_id', userId)
        .eq('service', 'highlevel');

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error disconnecting user:', error);
      return false;
    }
  }

  async getUserConnection(userId: string): Promise<any> {
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, location_id, location_name, company_id, token_expires_at, is_active, created_at, last_used_at')
      .eq('user_id', userId)
      .eq('service', 'highlevel')
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('Error fetching user connection:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    // Check if token is expired
    const now = new Date();
    const expiresAt = new Date(data.token_expires_at);
    const isExpired = expiresAt < now;

    // If we have a location_id but no location_name, try to fetch it
    if (data.location_id && !data.location_name && !isExpired) {
      console.log('Location name missing, attempting to fetch...');
      const token = await this.getValidAccessToken(userId);
      if (token) {
        await this.fetchAndStoreLocationName(userId, data.location_id, token);
        // Re-fetch the connection data
        const { data: updatedData } = await supabase
          .from('api_keys')
          .select('id, location_id, location_name, company_id, token_expires_at, is_active, created_at, last_used_at')
          .eq('user_id', userId)
          .eq('service', 'highlevel')
          .eq('is_active', true)
          .maybeSingle();
        return updatedData ? { ...updatedData, isExpired: false } : null;
      }
    }

    return { ...data, isExpired };
  }

  async getConnectionWithExpiredCheck(userId: string): Promise<any> {
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, location_id, location_name, company_id, token_expires_at, is_active, created_at, last_used_at')
      .eq('user_id', userId)
      .eq('service', 'highlevel')
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const now = new Date();
    const expiresAt = new Date(data.token_expires_at);
    const isExpired = expiresAt < now;

    return { ...data, isExpired };
  }

  private async markConnectionExpired(userId: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('api_keys')
        .update({
          is_active: false,
          expired_at: now
        })
        .eq('user_id', userId)
        .eq('service', 'highlevel');

      if (error) {
        console.error('Failed to mark connection as expired:', error);
      } else {
        console.log('Connection marked as expired for user:', userId);
      }
    } catch (error) {
      console.error('Error marking connection as expired:', error);
    }
  }

  private async fetchAndStoreLocationName(userId: string, locationId: string, accessToken: string): Promise<void> {
    try {
      console.log('Fetching location details for:', locationId);

      const baseUrl = import.meta.env.VITE_HIGHLEVEL_API_URL || 'https://services.leadconnectorhq.com';
      const response = await fetch(`${baseUrl}/locations/${locationId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-07-28',
        },
      });

      if (!response.ok) {
        console.error('Failed to fetch location details:', response.status, response.statusText);
        return;
      }

      const locationData = await response.json();
      console.log('Location data received:', locationData);

      // Extract location name from response (adjust based on actual API response structure)
      const locationName = locationData.name || locationData.location?.name || locationData.businessName || null;

      if (locationName) {
        const { error } = await supabase
          .from('api_keys')
          .update({ location_name: locationName })
          .eq('user_id', userId)
          .eq('service', 'highlevel');

        if (error) {
          console.error('Failed to update location name:', error);
        } else {
          console.log('Location name updated successfully:', locationName);
        }
      }
    } catch (error) {
      console.error('Error fetching location name:', error);
    }
  }
}

export const oauthService = new OAuthService();
