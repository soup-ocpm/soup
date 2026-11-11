/**
 * Models of the /api/v3 answers (soup-server/soup/api/serializers.py). The
 * types shared with the packages (objects, fields, blocks) come from the
 * SDK; the host depends on the SDK only, never on a package.
 */
import { Block, Field, FormValues, ObjectRef } from '@soup/sdk';

export type { Block, Field, FormValues, ObjectRef };

// Workspace
export interface WorkspaceNode {
  object: ObjectRef;
  package: string;
  package_status: PackageStatus | 'missing';
  package_missing: boolean;
  children: WorkspaceNode[];
}

export interface ObjectUpdate {
  name?: string;
  description?: string;
}

// Import
export interface ImporterInfo {
  id: string;
  label: string;
  description: string;
  extensions: string[];
  produces: string;
  package: string;
  config_element: string | null;
  module_url: string | null;
}

export interface Inspection {
  preview: Block[];
  fields: Field[];
}

export interface ImportRequest {
  importerId: string;
  file: File;
  name: string;
  description?: string;
  options?: FormValues;
}

// Operations
/** The objects given to an operation: ids matched to its inputs in order, or {input name: id}. */
export type OperationSelection = string[] | Record<string, string>;

export interface OperationSlot {
  name: string;
  kinds: string[];
}

export interface OperationInfo {
  id: string;
  label: string;
  description: string;
  group: string;
  inputs: OperationSlot[];
  produces: string[];
  package: string;
}

// Visualizers and exporters
export interface VisualizerInfo {
  id: string;
  label: string;
  package: string;
  element: string;
  module_url: string | null;
}

export interface ExporterInfo {
  id: string;
  label: string;
  package: string;
  extension: string;
  mime: string;
  fields: Field[];
}

export interface ExportedFile {
  filename: string;
  blob: Blob;
}

// Packages
export type PackageStatus = 'active' | 'disabled' | 'failed';

export interface PackageInfo {
  name: string;
  status: PackageStatus;
  version: string;
  label: string;
  description: string;
  author: string;
  origin: string;
  error: string | null;
  requires: string[];
  requires_tools: string[];
  provides_tools: string[];
  extension_points: string[];
  dependents: string[];
  app_entry: string | null;
  contributions: Record<string, string[]>;
}

export interface FrontendModule {
  databases?: ('memgraph' | 'neo4j')[];
  database?: 'memgraph' | 'neo4j';
  name: string;
  version: string;
  module_url: string;
  requires: string[];
}

// System
export interface ToolStatus {
  name: string;
  package: string;
  ok: boolean;
  health: Record<string, unknown>;
}

export interface Health {
  status: 'ok' | 'degraded';
  tools: ToolStatus[];
  problems: string[];
}

export interface Preference<T = unknown> {
  key: string;
  value: T | null;
}
