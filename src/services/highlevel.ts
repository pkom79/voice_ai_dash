import { supabase } from '../lib/supabase';
import { oauthService } from './oauth';

interface HighLevelCallData {
  id: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  status?: string;
  duration?: number;
  startTime?: string;
  endTime?: string;
  recording?: string;
  transcript?: string;
  contactName?: string;
  agentId?: string;
  metadata?: Record<string, any>;
}

interface HighLevelAgent {
  id: string;
  name: string;
  description?: string;
  isActive?: boolean;
}

class HighLevelService {
  private accessToken: string | null = null;
  private baseUrl = import.meta.env.VITE_HIGHLEVEL_API_URL || 'https://services.leadconnectorhq.com';

  async initialize(userId: string): Promise<boolean> {
    const token = await oauthService.getValidAccessToken(userId);

    if (!token) {
      console.error('No valid OAuth token found for user');
      return false;
    }

    this.accessToken = token;
    return true;
  }

  private getHeaders(): HeadersInit {
    if (!this.accessToken) {
      throw new Error('HighLevel OAuth token not configured');
    }

    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    };
  }

  async syncCalls(userId: string, startDate?: Date, endDate?: Date) {
    try {
      // Use edge function to fetch calls (avoids CORS issues)
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-highlevel-calls`;

      const requestBody: any = { userId };
      if (startDate) requestBody.startDate = startDate.toISOString();
      if (endDate) requestBody.endDate = endDate.toISOString();

      console.log('Calling sync function:', apiUrl, requestBody);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error('Sync error response:', errorData);
        throw new Error(errorData.error || `API error: ${response.statusText}`);
      }

      const responseData = await response.json();
      console.log('Sync response data:', responseData);

      // Edge function now handles saving to database, so just use its response
      const { savedCount, errorCount, totalFetched, calls } = responseData;

      // Update sync status based on edge function results
      if (savedCount > 0 || totalFetched === 0) {
        await this.updateSyncStatus('success', savedCount || 0,
          totalFetched === 0 ? 'No calls found in date range' : undefined);
      } else {
        await this.updateSyncStatus('failure', 0, `Failed to save ${errorCount} calls`);
      }

      return { success: true, count: savedCount || 0 };
    } catch (error) {
      console.error('Error syncing calls:', error);
      await this.updateSyncStatus('failure', 0, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  private async saveCall(callData: HighLevelCallData, userId: string) {
    const agent = await this.getOrCreateAgent(callData.agentId);
    const phoneNumber = await this.getOrCreatePhoneNumber(
      callData.direction === 'inbound' ? callData.to : callData.from
    );

    const durationSeconds = callData.duration || 0;
    const cost = this.calculateCost(durationSeconds);

    const { error } = await supabase
      .from('calls')
      .upsert(
        {
          highlevel_call_id: callData.id,
          user_id: userId,
          agent_id: agent?.id || null,
          phone_number_id: phoneNumber?.id || null,
          direction: callData.direction,
          contact_name: callData.contactName || null,
          from_number: callData.from,
          to_number: callData.to,
          status: callData.status || null,
          duration_seconds: durationSeconds,
          cost,
          recording_url: callData.recording || null,
          transcript: callData.transcript || null,
          is_test_call: this.isTestCall(callData),
          call_started_at: callData.startTime || new Date().toISOString(),
          call_ended_at: callData.endTime || null,
          metadata: callData.metadata || {},
        },
        { onConflict: 'highlevel_call_id' }
      );

    if (error) throw error;
  }

  private async getOrCreateAgent(agentId?: string, agentName?: string, description?: string) {
    if (!agentId) return null;

    const { data: existing } = await supabase
      .from('agents')
      .select('*')
      .eq('highlevel_agent_id', agentId)
      .maybeSingle();

    // If agent exists but name is generic (starts with "Agent "), update it with the real name
    if (existing) {
      if (agentName && existing.name.startsWith('Agent ')) {
        const { data: updated } = await supabase
          .from('agents')
          .update({
            name: agentName,
            description: description || existing.description,
          })
          .eq('id', existing.id)
          .select()
          .single();

        return updated || existing;
      }
      return existing;
    }

    const { data: newAgent, error } = await supabase
      .from('agents')
      .insert({
        highlevel_agent_id: agentId,
        name: agentName || `Agent ${agentId}`,
        description: description || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating agent:', error);
      return null;
    }

    return newAgent;
  }

  private async getOrCreatePhoneNumber(number: string) {
    const { data: existing } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('phone_number', number)
      .maybeSingle();

    if (existing) return existing;

    const { data: newNumber, error } = await supabase
      .from('phone_numbers')
      .insert({
        phone_number: number,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating phone number:', error);
      return null;
    }

    return newNumber;
  }

  private calculateCost(durationSeconds: number): number {
    const costPerMinute = 0.05;
    const minutes = durationSeconds / 60;
    return parseFloat((minutes * costPerMinute).toFixed(4));
  }

  private isTestCall(callData: HighLevelCallData): boolean {
    const testIndicators = ['test', 'demo', 'sample', '1234567890'];
    const phone = callData.from.toLowerCase();
    const contactName = (callData.contactName || '').toLowerCase();

    return testIndicators.some(
      (indicator) => phone.includes(indicator) || contactName.includes(indicator)
    );
  }

  private async updateSyncStatus(
    status: 'success' | 'failure',
    recordsSynced: number,
    message?: string
  ) {
    await supabase.from('sync_status').upsert(
      {
        service: 'highlevel',
        last_sync_at: new Date().toISOString(),
        last_sync_status: status,
        last_sync_message: message || null,
        records_synced: recordsSynced,
      },
      { onConflict: 'service' }
    );
  }

  async getSyncStatus() {
    const { data, error } = await supabase
      .from('sync_status')
      .select('*')
      .eq('service', 'highlevel')
      .maybeSingle();

    if (error) {
      console.error('Error getting sync status:', error);
      return null;
    }

    return data;
  }

  async fetchAgents(userId: string): Promise<HighLevelAgent[]> {
    try {
      const initialized = await this.initialize(userId);

      if (!initialized) {
        throw new Error('Failed to initialize HighLevel API connection');
      }

      const { data: connection } = await supabase
        .from('api_keys')
        .select('location_id')
        .eq('user_id', userId)
        .eq('service', 'highlevel')
        .eq('is_active', true)
        .maybeSingle();

      if (!connection?.location_id) {
        throw new Error('No active location ID found for user');
      }

      console.log('Fetching agents for location:', connection.location_id);

      // Try the voice-ai endpoint first (this seems to be working)
      const altResponse = await fetch(
        `${this.baseUrl}/voice-ai/agents?locationId=${connection.location_id}`,
        {
          headers: this.getHeaders(),
        }
      );

      if (altResponse.ok) {
        const altData = await altResponse.json();
        console.log('Voice AI endpoint response:', altData);
        return this.normalizeAgentsResponse(altData);
      }

      // Fallback to conversations endpoint
      console.log('Voice AI endpoint failed, trying conversations endpoint...');
      const response = await fetch(
        `${this.baseUrl}/conversations/ai-agents?locationId=${connection.location_id}`,
        {
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        const altErrorText = await altResponse.text();
        console.error('Both endpoints failed.');
        console.error('Voice AI endpoint:', altResponse.status, altResponse.statusText, altErrorText);
        console.error('Conversations endpoint:', response.status, response.statusText, errorText);
        throw new Error(`Failed to fetch agents. Voice AI: ${altResponse.statusText}, Conversations: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Conversations endpoint response:', data);
      return this.normalizeAgentsResponse(data);
    } catch (error) {
      console.error('Error fetching agents:', error);
      throw error;
    }
  }

  private normalizeAgentsResponse(data: any): HighLevelAgent[] {
    console.log('Normalizing agents response:', JSON.stringify(data, null, 2));

    // Handle different possible response structures
    let agentsList: any[] = [];

    if (Array.isArray(data)) {
      agentsList = data;
    } else if (data.agents && Array.isArray(data.agents)) {
      agentsList = data.agents;
    } else if (data.data && Array.isArray(data.data)) {
      agentsList = data.data;
    } else if (data.aiAgents && Array.isArray(data.aiAgents)) {
      agentsList = data.aiAgents;
    } else {
      console.warn('Unexpected agents response format:', data);
      return [];
    }

    // Normalize each agent object to ensure consistent structure
    return agentsList.map((agent: any) => ({
      id: agent.id || agent._id || agent.agentId,
      name: agent.name || agent.agentName || agent.title || `Agent ${agent.id || agent._id || 'Unknown'}`,
      description: agent.description || agent.desc || agent.purpose || undefined,
      isActive: agent.isActive !== undefined ? agent.isActive : agent.active !== undefined ? agent.active : true,
    }));
  }

  async assignAgentToUser(userId: string, agentId: string, agentName: string, description?: string): Promise<boolean> {
    try {
      const agent = await this.getOrCreateAgent(agentId, agentName, description);

      if (!agent) {
        return false;
      }

      const { error } = await supabase
        .from('user_agents')
        .upsert(
          {
            user_id: userId,
            agent_id: agent.id,
          },
          { onConflict: 'user_id,agent_id' }
        );

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error assigning agent to user:', error);
      return false;
    }
  }

  async getUserAgents(userId: string) {
    const { data, error } = await supabase
      .from('user_agents')
      .select(`
        agent_id,
        agents:agent_id (
          id,
          highlevel_agent_id,
          name,
          description,
          is_active
        )
      `)
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching user agents:', error);
      return [];
    }

    return data || [];
  }

  async unassignAgentFromUser(userId: string, agentId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_agents')
        .delete()
        .eq('user_id', userId)
        .eq('agent_id', agentId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error unassigning agent from user:', error);
      return false;
    }
  }

  async fetchAgentDetails(userId: string, agentId: string, locationId: string): Promise<any> {
    try {
      const initialized = await this.initialize(userId);

      if (!initialized) {
        throw new Error('Failed to initialize HighLevel API connection');
      }

      console.log('Fetching agent details for agent:', agentId);

      const response = await fetch(
        `${this.baseUrl}/voice-ai/agents/${agentId}?locationId=${locationId}`,
        {
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to fetch agent details:', response.status, errorText);
        throw new Error(`Failed to fetch agent details: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Agent details response:', data);
      return data;
    } catch (error) {
      console.error('Error fetching agent details:', error);
      throw error;
    }
  }

  async fetchPhoneNumbers(userId: string, locationId: string): Promise<any[]> {
    try {
      const initialized = await this.initialize(userId);

      if (!initialized) {
        throw new Error('Failed to initialize HighLevel API connection');
      }

      console.log('Fetching phone numbers for location:', locationId);

      const response = await fetch(
        `${this.baseUrl}/phone-system/numbers/location/${locationId}`,
        {
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to fetch phone numbers:', response.status, errorText);
        throw new Error(`Failed to fetch phone numbers: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Phone numbers response:', data);

      // Normalize response - API might return array or object with numbers property
      if (Array.isArray(data)) {
        return data;
      } else if (data.numbers && Array.isArray(data.numbers)) {
        return data.numbers;
      } else if (data.data && Array.isArray(data.data)) {
        return data.data;
      }

      return [];
    } catch (error) {
      console.error('Error fetching phone numbers:', error);
      throw error;
    }
  }

  async fetchNumberPools(userId: string, locationId: string): Promise<any[]> {
    try {
      const initialized = await this.initialize(userId);

      if (!initialized) {
        throw new Error('Failed to initialize HighLevel API connection');
      }

      console.log('Fetching number pools for location:', locationId);

      const response = await fetch(
        `${this.baseUrl}/phone-system/number-pools?locationId=${locationId}`,
        {
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to fetch number pools:', response.status, errorText);
        // Don't throw error - number pools might not be available for all locations
        return [];
      }

      const data = await response.json();
      console.log('Number pools response:', data);

      // Normalize response
      if (Array.isArray(data)) {
        return data;
      } else if (data.pools && Array.isArray(data.pools)) {
        return data.pools;
      } else if (data.data && Array.isArray(data.data)) {
        return data.data;
      }

      return [];
    } catch (error) {
      console.error('Error fetching number pools:', error);
      return []; // Return empty array instead of throwing
    }
  }

  async syncPhoneNumbersForUser(userId: string): Promise<{ success: boolean; count: number }> {
    try {
      console.log('Starting phone number sync for user:', userId);

      // Get location ID from api_keys
      const { data: connection } = await supabase
        .from('api_keys')
        .select('location_id')
        .eq('user_id', userId)
        .eq('service', 'highlevel')
        .eq('is_active', true)
        .maybeSingle();

      if (!connection?.location_id) {
        console.log('No active location ID found for user, skipping phone sync');
        return { success: true, count: 0 };
      }

      // Get all agents assigned to user
      const { data: userAgents } = await supabase
        .from('user_agents')
        .select('agent_id, agents:agent_id(id, highlevel_agent_id)')
        .eq('user_id', userId);

      if (!userAgents || userAgents.length === 0) {
        console.log('No agents assigned to user, skipping phone sync');
        return { success: true, count: 0 };
      }

      let syncedCount = 0;

      // Fetch all phone numbers for the location
      const allPhoneNumbers = await this.fetchPhoneNumbers(userId, connection.location_id);
      console.log(`Fetched ${allPhoneNumbers.length} total phone numbers for location`);

      // Process each agent
      for (const userAgent of userAgents) {
        if (!userAgent.agents) continue;

        const agent = userAgent.agents as any;
        const agentId = agent.highlevel_agent_id;

        try {
          // Fetch agent details to get assigned phone number and pool ID
          const agentDetails = await this.fetchAgentDetails(userId, agentId, connection.location_id);
          console.log(`Agent ${agentId} details:`, JSON.stringify(agentDetails, null, 2));

          // Update agent with phone info
          const agentUpdateData: any = {};
          // Check both 'inboundNumber' (actual API field) and 'phoneNumber' (legacy)
          const phoneNumber = agentDetails.inboundNumber || agentDetails.phoneNumber;
          if (phoneNumber) {
            agentUpdateData.inbound_phone_number = phoneNumber;
            console.log(`Found direct phone number for agent ${agentId}:`, phoneNumber);
          }
          if (agentDetails.numberPoolId) {
            agentUpdateData.highlevel_number_pool_id = agentDetails.numberPoolId;
            console.log(`Found number pool ID for agent ${agentId}:`, agentDetails.numberPoolId);
          }

          if (Object.keys(agentUpdateData).length > 0) {
            await supabase
              .from('agents')
              .update(agentUpdateData)
              .eq('id', agent.id);
            console.log(`Updated agent ${agent.id} with phone info`);
          } else {
            console.log(`No phone number or pool found for agent ${agentId}`);
          }

          // Handle direct phone number assignment
          if (phoneNumber) {
            const phoneData = await this.getOrCreatePhoneNumber(phoneNumber);
            if (phoneData) {
              console.log(`Linking direct phone ${phoneData.phone_number} to agent ${agent.id}`);
              await this.linkPhoneToAgent(agent.id, phoneData.id, 'direct');
              syncedCount++;
            }
          }

          // Handle number pool assignment
          if (agentDetails.numberPoolId) {
            const pools = await this.fetchNumberPools(userId, connection.location_id);
            console.log(`Found ${pools.length} pools for location`);
            const agentPool = pools.find((p: any) => p.id === agentDetails.numberPoolId);

            if (agentPool) {
              console.log(`Agent pool found:`, JSON.stringify(agentPool, null, 2));
              if (agentPool.phoneNumbers && Array.isArray(agentPool.phoneNumbers)) {
                console.log(`Pool has ${agentPool.phoneNumbers.length} phone numbers`);
                for (const poolPhone of agentPool.phoneNumbers) {
                  const phoneData = await this.getOrCreatePhoneNumber(poolPhone);
                  if (phoneData) {
                    console.log(`Linking pool phone ${phoneData.phone_number} to agent ${agent.id}`);
                    await this.linkPhoneToAgent(agent.id, phoneData.id, 'pool');
                    syncedCount++;
                  }
                }
              } else {
                console.log(`Pool found but no phoneNumbers array`);
              }
            } else {
              console.log(`Pool ${agentDetails.numberPoolId} not found in available pools`);
            }
          }
        } catch (error) {
          console.error(`Error syncing phone numbers for agent ${agentId}:`, error);
          // Continue with next agent
        }
      }

      console.log(`Phone number sync completed. Synced ${syncedCount} phone numbers`);
      return { success: true, count: syncedCount };
    } catch (error) {
      console.error('Error syncing phone numbers:', error);
      return { success: false, count: 0 };
    }
  }

  private async linkPhoneToAgent(agentId: string, phoneNumberId: string, source: string): Promise<void> {
    const { error } = await supabase
      .from('agent_phone_numbers')
      .upsert(
        {
          agent_id: agentId,
          phone_number_id: phoneNumberId,
          assignment_source: source,
        },
        { onConflict: 'agent_id,phone_number_id' }
      );

    if (error) {
      console.error('Error linking phone to agent:', error);
    }
  }
}

export const highLevelService = new HighLevelService();
