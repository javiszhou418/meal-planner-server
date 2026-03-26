import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    _client = createClient(url, key);
  }
  return _client;
}

export async function uploadImageBuffer(
  buffer: Buffer,
  filename: string,
  bucket: string
): Promise<string> {
  const { error } = await getClient()
    .storage.from(bucket)
    .upload(filename, buffer, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data } = getClient().storage.from(bucket).getPublicUrl(filename);
  return data.publicUrl;
}

export async function uploadImageFromPath(
  localPath: string,
  filename: string,
  bucket: string
): Promise<string> {
  const { readFile } = await import('fs/promises');
  const buffer = await readFile(localPath);
  return uploadImageBuffer(buffer, filename, bucket);
}
