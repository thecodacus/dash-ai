import type { MiddlewareContext, UIPluginContext } from './plugin-dev-types';
import type { ReactElement } from 'react';

export interface PluginManifest {
  id: string;
  version: string;
  type: 'ui' | 'middleware' | 'hybrid';
  slots?: string[];
  middlewarePoints?: string[];
  entryPoint: string;
  permissions: string[];
}

export interface BasePlugin {
  id: string;
  version: string;
}

export interface UIPlugin extends BasePlugin {
  type: 'ui';
  mount: (context: UIPluginContext) => Promise<ReactElement>;
  unmount: () => Promise<void>;
}

export interface MiddlewarePlugin extends BasePlugin {
  type: 'middleware';
  process: (context: MiddlewareContext) => Promise<any>;
}

export interface HybridPlugin extends BasePlugin {
  type: 'hybrid';
  mount: (context: UIPluginContext) => Promise<ReactElement>;
  unmount: (slotId: string) => Promise<void>;
  process: (context: MiddlewareContext) => Promise<any>;
}

export type Plugin = UIPlugin | MiddlewarePlugin | HybridPlugin;

export interface StoredPluginInfo {
  id: string;
  version: string;
  manifest: PluginManifest;
  installed: Date;
  enabled: boolean;
}
