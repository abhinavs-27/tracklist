declare namespace SpotifyApi {
  interface ImageObject {
    url: string;
    height?: number;
    width?: number;
  }

  interface ArtistObjectSimplified {
    id: string;
    name: string;
  }

  interface ArtistObjectFull {
    id: string;
    name: string;
    images?: ImageObject[];
    genres?: string[];
    followers?: { total: number };
  }

  interface AlbumObjectSimplified {
    id: string;
    name: string;
    artists: ArtistObjectSimplified[];
    images?: ImageObject[];
    release_date?: string;
  }

  interface AlbumObjectFull extends AlbumObjectSimplified {
    total_tracks?: number;
    tracks?: PagingObject<TrackObjectSimplified>;
  }

  interface TrackObjectSimplified {
    id: string;
    name: string;
    artists: ArtistObjectSimplified[];
    duration_ms?: number;
  }

  interface TrackObjectFull extends TrackObjectSimplified {
    album?: AlbumObjectSimplified & { images?: ImageObject[] };
  }

  interface PagingObject<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
    next: string | null;
    previous: string | null;
  }
}
