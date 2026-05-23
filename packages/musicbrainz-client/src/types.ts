// packages/musicbrainz-client/src/types.ts

export interface MbUrlLookup {
  id: string;
  resource: string;
  relations?: MbRelation[];
}

export interface MbArtist {
  id: string;
  name: string;
  type?: string;
  relations?: MbRelation[];
}

export interface MbLabel {
  id: string;
  name: string;
  country?: string;
  'life-span'?: { begin?: string; ended?: boolean };
  relations?: MbRelation[];
}

export interface MbRelease {
  id: string;
  title: string;
  date?: string;
  'release-group'?: { id: string; 'primary-type'?: string };
  'label-info'?: Array<{ label?: MbLabel }>;
  relations?: MbRelation[];
  media?: Array<{ tracks?: MbTrack[] }>;
}

export interface MbRecording {
  id: string;
  title: string;
  relations?: MbRelation[];
}

export interface MbTrack {
  recording: MbRecording;
}

export interface MbRelation {
  type: string;
  direction: 'forward' | 'backward';
  artist?: MbArtist;
  label?: MbLabel;
  recording?: MbRecording;
  release?: MbRelease;
  url?: { id: string; resource: string };
  begin?: string | null;
  end?: string | null;
  ended?: boolean;
  attributes?: string[];
}
