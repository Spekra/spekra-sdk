import { randomUUID } from 'crypto';
import { BaseEntity } from './base.entity';

/**
 * Types of artifacts that can be captured
 */
export type ArtifactType = 'trace' | 'screenshot' | 'video' | 'attachment';

/**
 * Artifact properties
 */
export interface ArtifactProps {
  /** Unique identifier for this artifact */
  id: string;
  /** Type of artifact */
  type: ArtifactType;
  /** Display name (e.g., "screenshot", "trace", "my-custom-file.json") */
  name: string;
  /** Local file path (never sent to API) */
  path: string;
  /** MIME content type */
  contentType: string;
  /** File size in bytes */
  size: number;
  /** Whether the file is already compressed (zip, webm, etc.) */
  isPreCompressed: boolean;
}

/**
 * Input for creating a new Artifact
 */
export interface CreateArtifactInput {
  type: ArtifactType;
  name: string;
  path: string;
  contentType: string;
  size: number;
}

/**
 * Artifact metadata to send to API (excludes local path)
 */
export interface ArtifactMetadata {
  id: string;
  type: ArtifactType;
  name: string;
  contentType: string;
  size: number;
  compressed: boolean;
}

/**
 * Content types that are already compressed
 */
const PRE_COMPRESSED_CONTENT_TYPES = new Set([
  'application/zip',
  'application/gzip',
  'application/x-gzip',
  'video/webm',
  'video/mp4',
  'image/webp',
]);

/**
 * File extensions that indicate pre-compressed content
 */
const PRE_COMPRESSED_EXTENSIONS = new Set(['.zip', '.gz', '.webm', '.mp4', '.webp']);

/**
 * Artifact Entity
 *
 * Represents metadata for a test artifact (trace, screenshot, video, or custom attachment).
 * The actual file content remains on disk; this entity holds the metadata.
 */
export class Artifact extends BaseEntity<ArtifactProps> {
  private constructor(props: ArtifactProps) {
    super(props);
  }

  /**
   * Create a new Artifact from Playwright attachment info
   */
  static create(input: CreateArtifactInput): Artifact {
    const isPreCompressed = Artifact.detectPreCompressed(input.contentType, input.path);

    return new Artifact({
      id: randomUUID(),
      type: input.type,
      name: input.name,
      path: input.path,
      contentType: input.contentType,
      size: input.size,
      isPreCompressed,
    });
  }

  /**
   * Detect if file is already compressed based on content type or extension
   */
  private static detectPreCompressed(contentType: string, path: string): boolean {
    if (PRE_COMPRESSED_CONTENT_TYPES.has(contentType)) {
      return true;
    }

    const lowerPath = path.toLowerCase();
    for (const ext of PRE_COMPRESSED_EXTENSIONS) {
      if (lowerPath.endsWith(ext)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Determine artifact type from Playwright attachment name and content type
   */
  static inferType(name: string, contentType: string): ArtifactType {
    if (name === 'trace' || contentType === 'application/zip') {
      return 'trace';
    }
    if (name === 'screenshot' || contentType.startsWith('image/')) {
      return 'screenshot';
    }
    if (name === 'video' || contentType.startsWith('video/')) {
      return 'video';
    }
    return 'attachment';
  }

  // Getters
  get id(): string {
    return this.props.id;
  }

  get type(): ArtifactType {
    return this.props.type;
  }

  get name(): string {
    return this.props.name;
  }

  get path(): string {
    return this.props.path;
  }

  get contentType(): string {
    return this.props.contentType;
  }

  get size(): number {
    return this.props.size;
  }

  get isPreCompressed(): boolean {
    return this.props.isPreCompressed;
  }

  /**
   * Convert to API-safe metadata (excludes local file path)
   */
  toMetadata(): ArtifactMetadata {
    return {
      id: this.props.id,
      type: this.props.type,
      name: this.props.name,
      contentType: this.props.contentType,
      size: this.props.size,
      compressed: this.props.isPreCompressed,
    };
  }
}
