// lib/facebook/client.ts
// Facebook Graph API client for Lead Ads integration

// ============================================
// Constants
// ============================================

export const FB_API_VERSION = 'v21.0';
export const FB_BASE_URL = `https://graph.facebook.com/${FB_API_VERSION}`;

// ============================================
// Type Definitions
// ============================================

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category: string;
  tasks?: string[];
  instagram_business_account?: { id: string };
}

export interface FacebookLeadField {
  name: string;
  values: string[];
}

export interface FacebookLead {
  id: string;
  created_time: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  field_data: FacebookLeadField[];
  platform?: string;
}

export interface TokenExchangeResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

// ============================================
// Facebook Client Class
// ============================================

export class FacebookClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  // Static methods - OAuth flow

  static async exchangeCodeForToken(
    code: string,
    redirectUri: string
  ): Promise<TokenExchangeResponse> {
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error('Facebook App credentials are not configured');
    }

    const params = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code: code,
    });

    const url = `${FB_BASE_URL}/oauth/access_token?${params.toString()}`;
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    return (await response.json()) as TokenExchangeResponse;
  }

  static async exchangeForLongLivedToken(
    shortLivedToken: string
  ): Promise<TokenExchangeResponse> {
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error('Facebook App credentials are not configured');
    }

    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    });

    const url = `${FB_BASE_URL}/oauth/access_token?${params.toString()}`;
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Long-lived token exchange failed: ${errorText}`);
    }

    return (await response.json()) as TokenExchangeResponse;
  }
  // Instance methods - require accessToken

  async getUserPages(): Promise<FacebookPage[]> {
    const params = new URLSearchParams({
      access_token: this.accessToken,
      fields: 'id,name,access_token,category,tasks,instagram_business_account{id}',
    });

    const url = `${FB_BASE_URL}/me/accounts?${params.toString()}`;
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch user pages: ${errorText}`);
    }

    const data = await response.json();
    return (data.data || []) as FacebookPage[];
  }

  async subscribePageToWebhook(
    pageId: string,
    pageAccessToken: string
  ): Promise<boolean> {
    const params = new URLSearchParams({
      access_token: pageAccessToken,
      subscribed_fields: 'leadgen',
    });

    const url = `${FB_BASE_URL}/${pageId}/subscribed_apps?${params.toString()}`;
    const response = await fetch(url, { method: 'POST' });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to subscribe page to webhook: ${errorText}`);
    }

    const data = await response.json();
    return data.success === true;
  }

  async unsubscribePageFromWebhook(
    pageId: string,
    pageAccessToken: string
  ): Promise<boolean> {
    const params = new URLSearchParams({
      access_token: pageAccessToken,
    });

    const url = `${FB_BASE_URL}/${pageId}/subscribed_apps?${params.toString()}`;
    const response = await fetch(url, { method: 'DELETE' });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to unsubscribe page: ${errorText}`);
    }

    const data = await response.json();
    return data.success === true;
  }

  async getLeadDetails(
    leadId: string,
    pageAccessToken: string
  ): Promise<FacebookLead> {
    const params = new URLSearchParams({
      access_token: pageAccessToken,
      fields:
        'id,created_time,ad_id,ad_name,adset_id,adset_name,' +
        'campaign_id,campaign_name,form_id,field_data,platform',
    });

    const url = `${FB_BASE_URL}/${leadId}?${params.toString()}`;
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch lead details: ${errorText}`);
    }

    return (await response.json()) as FacebookLead;
  }

  async verifyToken(): Promise<boolean> {
    try {
      const params = new URLSearchParams({
        access_token: this.accessToken,
      });

      const url = `${FB_BASE_URL}/me?${params.toString()}`;
      const response = await fetch(url, { method: 'GET' });

      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

// ============================================
// Helper Functions
// ============================================

export function parseLeadFields(
  fieldData: FacebookLeadField[]
): Record<string, string> {
  const result: Record<string, string> = {};

  if (!Array.isArray(fieldData)) {
    return result;
  }

  for (const field of fieldData) {
    if (field.name && Array.isArray(field.values) && field.values.length > 0) {
      result[field.name] = field.values[0];
    }
  }

  return result;
}

export function extractStandardFields(
  parsedFields: Record<string, string>
): { name: string | null; email: string | null; phone: string | null } {
  const nameKeys = ['full_name', 'name', 'first_name', 'full name'];
  const emailKeys = ['email', 'email_address', 'email address'];
  const phoneKeys = ['phone_number', 'phone', 'mobile', 'phone number'];

  let name: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;

  for (const key of nameKeys) {
    if (parsedFields[key]) {
      name = parsedFields[key];
      break;
    }
  }

  for (const key of emailKeys) {
    if (parsedFields[key]) {
      email = parsedFields[key];
      break;
    }
  }

  for (const key of phoneKeys) {
    if (parsedFields[key]) {
      phone = parsedFields[key];
      break;
    }
  }

  return { name, email, phone };
}