// Browser preview only: a stub with the same shape as engine.ts. Nothing plays; screens show
// <AudioWebNotice /> instead of a working player.
export const audioAvailable = false;

export interface AudioTrack {
  url: string;
  title: string;
  artist?: string;
  artwork?: string;
}

export async function playTrack(_track: AudioTrack): Promise<void> {}

export async function pause(): Promise<void> {}
