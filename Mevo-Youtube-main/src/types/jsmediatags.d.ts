declare module "jsmediatags/dist/jsmediatags.min.js" {
  export interface Picture {
    format: string;
    data: number[];
  }

  export interface Tags {
    title?: string;
    artist?: string;
    album?: string;
    genre?: string;
    year?: string | number;
    track?: string | number;
    picture?: Picture;
    [key: string]: unknown;
  }

  export interface Result {
    tags: Tags;
  }

  const jsmediatags: {
    read(
      file: File,
      callbacks: {
        onSuccess(result: Result): void;
        onError(error: unknown): void;
      },
    ): void;
  };

  export default jsmediatags;
}
