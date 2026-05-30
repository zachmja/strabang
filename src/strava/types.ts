/**
 * Token bundle returned by Strava's OAuth token endpoint. The initial
 * authorization_code exchange includes `athlete` and `scope`; refresh
 * responses do not.
 */
export interface StravaTokenResponse {
  token_type: string;
  expires_at: number; // unix seconds
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete?: StravaAthlete;
  /** Space-delimited list of scopes the athlete actually granted. */
  scope?: string;
}

export interface StravaAthlete {
  id: number;
  username?: string | null;
  firstname?: string | null;
  lastname?: string | null;
}

export interface StravaActivity {
  id: number;
  name: string;
  type?: string;
  sport_type?: string;
  athlete?: { id: number };
}

/** Payload Strava POSTs to the webhook callback for each event. */
export interface StravaWebhookEvent {
  object_type: "activity" | "athlete";
  object_id: number;
  aspect_type: "create" | "update" | "delete";
  updates?: Record<string, string>;
  owner_id: number;
  subscription_id: number;
  event_time: number;
}
