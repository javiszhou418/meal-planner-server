import { getSupabase } from '../db/supabaseClient';

function getClient() { return getSupabase(); }

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
