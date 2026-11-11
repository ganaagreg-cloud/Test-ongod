import type { Env } from './env';

/**
 * helmet's default policy plus what the admin needs from Bunny: cover images and the preview
 * player load from the pull zone and the Stream CDN (hosts come from env, so swapping the Bunny
 * account needs no code change), and the cover picker shows `blob:` previews of chosen files.
 */
export function contentSecurityPolicy(
  env: Pick<Env, 'BUNNY_PULL_ZONE_HOST' | 'BUNNY_STREAM_CDN_HOSTNAME'>,
) {
  const hosts = [env.BUNNY_PULL_ZONE_HOST, env.BUNNY_STREAM_CDN_HOSTNAME]
    .filter((h): h is string => !!h)
    .map((h) => `https://${h}`);
  return {
    useDefaults: true,
    directives: {
      imgSrc: ["'self'", 'data:', 'blob:', ...hosts],
      mediaSrc: ["'self'", 'blob:', ...hosts],
    },
  };
}
