// Shared client/server DTOs. Keep free of server-only imports.

export type TrackDTO = {
  id: string;
  title: string;
  artist: string;
  handle: string;
  audioUrl: string;
  artworkUrl: string | null;
  color: string | null;
  durationSec: number;
  playCount: number;
  likeCount: number;
  liked?: boolean;
  albumId: string | null;
  trackNo: number | null;
};

export type AlbumDTO = {
  id: string;
  title: string;
  artworkUrl: string | null;
  color: string | null;
  trackCount: number;
};

export type SessionUser = {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  artistName: string | null;
  isAdmin: boolean;
};
