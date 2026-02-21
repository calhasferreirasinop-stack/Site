import { supabase } from './supabase';
import path from 'path';

const BUCKET = 'uploads';

/**
 * Uploads a file buffer to Supabase Storage and returns the public URL.
 */
export async function uploadToStorage(
    buffer: Buffer,
    originalName: string,
    mimeType: string
): Promise<string> {
    const ext = path.extname(originalName) || '.bin';
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(filename, buffer, {
            contentType: mimeType,
            upsert: false,
        });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
    return data.publicUrl;
}

/**
 * Deletes a file from Supabase Storage given its public URL.
 * Safe to call even if the URL is not from our storage bucket.
 */
export async function deleteFromStorage(publicUrl: string): Promise<void> {
    try {
        const marker = `/object/public/${BUCKET}/`;
        const idx = publicUrl.indexOf(marker);
        if (idx === -1) return; // Not a storage URL — skip

        const filePath = publicUrl.slice(idx + marker.length);
        await supabase.storage.from(BUCKET).remove([filePath]);
    } catch (_) {
        // Non-critical — log but don't throw
        console.warn('deleteFromStorage: failed to delete', publicUrl);
    }
}
