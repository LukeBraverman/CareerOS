import type { MotivationVideo, VideoManifest } from '@/types/video'

const DEFAULT_VIDEOS_BASE_URL =
  'https://meinc-motivation-videos-027939434555.s3.eu-west-2.amazonaws.com'

/** Base URL of the public videos bucket. Override with VITE_VIDEOS_BASE_URL. */
export function getVideosBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_VIDEOS_BASE_URL as string | undefined
  return (fromEnv || DEFAULT_VIDEOS_BASE_URL).replace(/\/+$/, '')
}

/** Full URL for an object key in the videos bucket. */
export function videoAssetUrl(key: string): string {
  return `${getVideosBaseUrl()}/${key.split('/').map(encodeURIComponent).join('/')}`
}

/** Fetches the video library manifest via local backend proxy (bypassing S3 CORS on 127.0.0.1:8420) with S3 fallback. */
export async function fetchVideos(): Promise<MotivationVideo[]> {
  try {
    const localRes = await fetch('/api/videos', { cache: 'no-cache' })
    if (localRes.ok) {
      const data = (await localRes.json()) as Partial<VideoManifest>
      return Array.isArray(data.videos) ? data.videos : []
    }
  } catch {
    // Fallback to direct S3 URL below
  }

  const response = await fetch(`${getVideosBaseUrl()}/manifest.json`, {
    cache: 'no-cache',
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch videos: HTTP ${response.status}`)
  }
  const data = (await response.json()) as Partial<VideoManifest>
  return Array.isArray(data.videos) ? data.videos : []
}

/** Deletes a video from the S3 backend (manifest.json + video + thumbnail objects). */
export async function deleteVideo(videoId: string): Promise<void> {
  const response = await fetch(`/api/videos/${encodeURIComponent(videoId)}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const errBody = (await response.json()) as { detail?: string }
      if (errBody.detail) detail = errBody.detail
    } catch {
      // ignore json parse error
    }
    throw new Error(`Failed to delete video: ${detail}`)
  }
}

