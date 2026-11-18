// The kind Postiz records for an uploaded file. Providers pick video or
// image from the stored path's extension (hasExtension(path, 'mp4')), so the
// Media row and the MediaContent handed to providers follow the same rule.
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm']);

export const mediaTypeForPath = (
  path: string | undefined | null
): 'video' | 'image' => {
  const pathname = (path || '').split(/[?#]/)[0];
  const match = pathname.match(/\.([a-z0-9]+)$/i);
  return match && VIDEO_EXTENSIONS.has(match[1].toLowerCase())
    ? 'video'
    : 'image';
};
