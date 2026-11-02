/** A single motivational video stored in the videos S3 bucket. */
export interface MotivationVideo {
  id: string
  title: string
  /** Optional free-form tag, e.g. "Speech", "Gym". */
  tag?: string
  durationSeconds: number
  /** S3 object key of the MP4, e.g. "videos/abc123.mp4". */
  videoKey: string
  /** S3 object key of the thumbnail JPG, e.g. "thumbnails/abc123.jpg". */
  thumbnailKey: string
  /** Original source URL the video was downloaded from. */
  sourceUrl?: string
  /** ISO timestamp the video was added to the library. */
  addedAt?: string
  /** Whether this video is marked as a favourite. */
  favourite?: boolean
}

/** Shape of manifest.json at the root of the videos bucket. */
export interface VideoManifest {
  videos: MotivationVideo[]
}
