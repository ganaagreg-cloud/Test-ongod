import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../src/csp';

describe('contentSecurityPolicy', () => {
  it('lets the admin load Bunny covers and previews, nothing else', () => {
    const { directives } = contentSecurityPolicy({
      BUNNY_PULL_ZONE_HOST: 'cdn.example.b-cdn.net',
      BUNNY_STREAM_CDN_HOSTNAME: 'vz-abc.b-cdn.net',
    });
    expect(directives.imgSrc).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://cdn.example.b-cdn.net',
      'https://vz-abc.b-cdn.net',
    ]);
    expect(directives.mediaSrc).toContain('https://vz-abc.b-cdn.net');
    expect(directives.imgSrc.join(' ')).not.toContain('*');
  });

  it('adds no host when Bunny is not configured', () => {
    const { directives } = contentSecurityPolicy({
      BUNNY_PULL_ZONE_HOST: undefined,
      BUNNY_STREAM_CDN_HOSTNAME: undefined,
    });
    expect(directives.imgSrc).toEqual(["'self'", 'data:', 'blob:']);
  });
});
