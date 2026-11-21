import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';

import type { PickedImage } from '../../hooks/useImagePicker';

import { api, ApiError } from '../http';

/** What the API accepts for a shop or product photo (`MEDIA_IMAGE_TYPES`) — no HEIC, Android cannot draw it. */
export type MediaImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/** The picker does not always report a type, so the extension decides. `null` is a format the API refuses. */
export function mediaImageType(image: Pick<PickedImage, 'fileName' | 'mimeType'>): MediaImageType | null {
  const reported = image.mimeType?.toLowerCase();
  if (reported === 'image/jpeg' || reported === 'image/png' || reported === 'image/webp') return reported;
  if (reported === 'image/jpg') return 'image/jpeg';
  const ext = image.fileName.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return null;
}

/**
 * Upload one photo through `endpoint` and return the Storage path to save on
 * the row (`imageUrl`, `coverUrl`).
 *
 * Same two hops as `uploadRegistrationDocument`: the API picks the path (under
 * this merchant's own shop) and signs a one-shot URL for it, then the bytes go
 * straight to Storage rather than through the API.
 */
export async function uploadMediaImage(
  endpoint: string,
  image: PickedImage,
  contentType: MediaImageType
): Promise<string> {
  const { path, uploadUrl } = await api<{ path: string; uploadUrl: string }>(endpoint, {
    method: 'POST',
    body: { contentType },
  });
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: new File(image.uri),
  });
  if (!response.ok) {
    throw new ApiError(response.status, 'Envoi de la photo impossible. Veuillez réessayer.');
  }
  return path;
}
