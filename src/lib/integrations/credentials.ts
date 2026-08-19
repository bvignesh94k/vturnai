import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "@/lib/security/encryption";
import { logger } from "@/lib/logger";
import type { IntegrationProvider, IntegrationStatusDb, Json } from "@/lib/db/types";

const log = logger.child("integration-credentials");

/**
 * Encrypted credential storage.
 *
 * `integration_credentials` is denied to every client role by RLS, and the
 * values inside it are encrypted at rest with ENCRYPTION_KEY. Nothing in this
 * module is importable from a Client Component, and no function here ever
 * returns a token to a caller that is rendering UI.
 */

export interface StoredCredentials {
  accessToken: string | null;
  refreshToken: string | null;
  apiKey: string | null;
  expiresAt: Date | null;
  scopes: string[];
  accountIdentifier: string | null;
}

export interface SaveCredentialsInput {
  organizationId: string;
  projectId?: string | null;
  provider: IntegrationProvider;
  accessToken?: string | null;
  refreshToken?: string | null;
  apiKey?: string | null;
  expiresAt?: Date | null;
  scopes?: string[];
  accountIdentifier?: string | null;
}

export async function saveCredentials(input: SaveCredentialsInput): Promise<void> {
  if (!isEncryptionConfigured()) {
    throw new Error(
      "ENCRYPTION_KEY is not configured. Provider tokens cannot be stored securely without it.",
    );
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("integration_credentials").upsert(
    {
      organization_id: input.organizationId,
      project_id: input.projectId ?? null,
      provider: input.provider,
      access_token_encrypted: input.accessToken ? encryptSecret(input.accessToken) : null,
      refresh_token_encrypted: input.refreshToken ? encryptSecret(input.refreshToken) : null,
      api_key_encrypted: input.apiKey ? encryptSecret(input.apiKey) : null,
      token_expires_at: input.expiresAt?.toISOString() ?? null,
      scopes: input.scopes ?? [],
      account_identifier: input.accountIdentifier ?? null,
    },
    { onConflict: "organization_id,project_id,provider" },
  );

  if (error) throw new Error(`Could not store credentials: ${error.message}`);
}

export async function loadCredentials(input: {
  organizationId: string;
  projectId?: string | null;
  provider: IntegrationProvider;
}): Promise<StoredCredentials | null> {
  const supabase = createServiceRoleClient();
  let query = supabase
    .from("integration_credentials")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("provider", input.provider);

  query = input.projectId ? query.eq("project_id", input.projectId) : query.is("project_id", null);

  const { data } = await query.maybeSingle();
  if (!data) return null;

  try {
    return {
      accessToken: data.access_token_encrypted ? decryptSecret(data.access_token_encrypted) : null,
      refreshToken: data.refresh_token_encrypted ? decryptSecret(data.refresh_token_encrypted) : null,
      apiKey: data.api_key_encrypted ? decryptSecret(data.api_key_encrypted) : null,
      expiresAt: data.token_expires_at ? new Date(data.token_expires_at) : null,
      scopes: data.scopes,
      accountIdentifier: data.account_identifier,
    };
  } catch (error) {
    // A decryption failure usually means ENCRYPTION_KEY was rotated without
    // re-encrypting. Surface it rather than silently behaving as disconnected.
    log.error("Stored credentials could not be decrypted", { provider: input.provider, error });
    throw new Error(
      `Stored ${input.provider} credentials could not be decrypted. Reconnect the integration.`,
    );
  }
}

export async function deleteCredentials(input: {
  organizationId: string;
  projectId?: string | null;
  provider: IntegrationProvider;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  let query = supabase
    .from("integration_credentials")
    .delete()
    .eq("organization_id", input.organizationId)
    .eq("provider", input.provider);
  query = input.projectId ? query.eq("project_id", input.projectId) : query.is("project_id", null);
  await query;
}

/** Non-secret connection state, safe to read from the app under RLS. */
export async function setConnectionStatus(input: {
  projectId: string;
  provider: IntegrationProvider;
  status: IntegrationStatusDb;
  displayName?: string | null;
  accountIdentifier?: string | null;
  lastError?: string | null;
  lastSyncedAt?: Date | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("integration_connections").upsert(
    {
      project_id: input.projectId,
      provider: input.provider,
      status: input.status,
      display_name: input.displayName ?? null,
      account_identifier: input.accountIdentifier ?? null,
      last_error: input.lastError ?? null,
      last_synced_at: input.lastSyncedAt?.toISOString() ?? null,
      metadata: (input.metadata ?? {}) as Json,
    },
    { onConflict: "project_id,provider" },
  );
}
