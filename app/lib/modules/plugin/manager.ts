import JSZip from 'jszip';
import { webcontainer } from '~/lib/webcontainer';
import type { PluginManifest, Plugin, HybridPlugin, MiddlewarePlugin, UIPlugin } from './types';
import type { CoreAPI, MiddlewareContext } from './plugin-dev-types';
import { workbenchStore } from '~/lib/stores/workbench';
import { PluginStore } from './store';
import type { ReactElement } from 'react';

const coreAPI: CoreAPI = {
  webcontainer,
  workbenchStore,
};

interface ExtractedFile {
  path: string;
  content: Uint8Array;
}

export class PluginManager {
  private static _instance: PluginManager;

  private _store: PluginStore;
  private _plugins: Map<string, { plugin: Plugin; manifest: PluginManifest }> = new Map();
  private _slots: Map<string, (manifest: PluginManifest, component: ReactElement) => void> = new Map();
  private _middlewares: Map<string, ((context: MiddlewareContext) => Promise<any>)[]> = new Map();
  private _coreAPI: CoreAPI;

  constructor(coreAPI: CoreAPI) {
    this._store = new PluginStore();
    this._coreAPI = coreAPI;
  }
  async initialize(): Promise<void> {
    // Initialize store
    await this._store.initialize();

    // Load installed plugins
    await this._loadInstalledPlugins();
  }

  registerSlot(slotId: string, elementFactory: (manifest: PluginManifest, component: ReactElement) => void) {
    this._slots.set(slotId, elementFactory);

    const plugins = this._plugins.values();

    for (const { plugin, manifest } of plugins) {
      if (!manifest.slots?.includes(slotId)) {
        continue;
      }

      if (plugin.type === 'middleware') {
        continue;
      }

      this._mountPluginOnSlot(slotId, plugin, manifest);
    }
  }

  static getInstance(): PluginManager {
    if (!PluginManager._instance) {
      PluginManager._instance = new PluginManager(coreAPI);
      PluginManager._instance.initialize();
    }

    return PluginManager._instance;
  }

  async disablePlugin(pluginId: string): Promise<void> {
    await this._store.updatePluginStatus(pluginId, false);
  }

  async enablePlugin(pluginId: string): Promise<void> {
    await this._store.updatePluginStatus(pluginId, true);
  }

  async installPlugin(file: File): Promise<void> {
    const manifest = await this._extractManifest(file);

    // Save plugin info
    await this._store.savePlugin({
      id: manifest.id,
      version: manifest.version,
      manifest,
      installed: new Date(),
      enabled: true,
    });

    // Save plugin files
    const files = await this._extractFiles(file);

    for (const { path, content } of files) {
      await this._store.savePluginFile(path, content);
    }

    // Load plugin if successful
    await this._loadPlugin(manifest);
  }

  private async _mountUIComponents(plugin: UIPlugin | HybridPlugin, manifest: PluginManifest) {
    for (const slotId of manifest.slots || []) {
      await this._mountPluginOnSlot(slotId, plugin, manifest);
    }
  }

  private async _mountPluginOnSlot(slotId: string, plugin: UIPlugin | HybridPlugin, manifest: PluginManifest) {
    const slot = this._slots.get(slotId);

    if (!slot) {
      return;
    }

    await plugin.unmount(slotId);

    const mountedElement = await plugin.mount({
      slot: slotId,
      api: this._coreAPI,
    });
    slot(manifest, mountedElement);
  }
  private _registerMiddleware(plugin: HybridPlugin | MiddlewarePlugin, manifest: PluginManifest) {
    for (const point of manifest.middlewarePoints || []) {
      if (!this._middlewares.has(point)) {
        this._middlewares.set(point, []);
      }

      this._middlewares.get(point)?.push(async (data: any) => {
        return plugin.process({
          point,
          data,
          api: this._coreAPI,
          next: async (modifiedData) => {
            // Find next middleware in chain
            const middlewares = this._middlewares.get(point) || [];
            const currentIndex = middlewares.indexOf(plugin.process!);
            const nextMiddleware = middlewares[currentIndex + 1];

            if (nextMiddleware) {
              return nextMiddleware(modifiedData);
            }

            return modifiedData;
          },
        });
      });
    }
  }

  private _createPluginContext(manifest: PluginManifest) {
    return {
      manifest,
      api: this._coreAPI,
    };
  }

  private async _extractManifest(file: File): Promise<PluginManifest> {
    const zip = new JSZip();
    const contents = await zip.loadAsync(file);

    // Get manifest file from zip
    const manifestFile = contents.file('plugin.json');

    if (!manifestFile) {
      throw new Error('Missing plugin.json in zip file');
    }

    // Parse manifest
    const manifestContent = await manifestFile.async('string');
    const manifest = JSON.parse(manifestContent);

    // Validate manifest
    if (!this._validateManifest(manifest)) {
      throw new Error('Invalid plugin manifest');
    }

    return manifest;
  }
  private async _extractFiles(file: File): Promise<ExtractedFile[]> {
    const zip = new JSZip();

    try {
      // Load the zip file
      const zipContent = await zip.loadAsync(file);
      const extractedFiles: ExtractedFile[] = [];
      const manifest = await this._extractManifest(file);

      // Process each file in the zip
      const processPromises = Object.keys(zipContent.files).map(async (filename) => {
        const zipEntry = zipContent.files[filename];

        // Skip directories
        if (zipEntry.dir) {
          return;
        }

        // Skip manifest as it's handled separately
        if (filename === 'plugin.json') {
          return;
        }

        try {
          // Get file content as Uint8Array
          const content = await zipEntry.async('uint8array');

          // Create the full path for the file
          const path = `/plugins/${manifest.id}/${filename}`;

          extractedFiles.push({ path, content });
        } catch (error: any) {
          console.error(`Failed to extract file ${filename}:`, error);
          throw new Error(`Failed to extract file ${filename}: ${error.message}`);
        }
      });

      // Wait for all files to be processed
      await Promise.all(processPromises);

      return extractedFiles;
    } catch (error: any) {
      console.error('Failed to extract plugin files:', error);
      throw new Error(`Failed to extract plugin files: ${error.message}`);
    }
  }

  private async _loadPlugin(manifest: PluginManifest): Promise<Plugin> {
    try {
      // Import the plugin module
      const modulePath = `/plugins/${manifest.id}/${manifest.entryPoint}`;
      const module = await this._loadPluginModule(modulePath);

      if (!module) {
        throw new Error('Plugin not installed correctly');
      }

      if (!module.default || typeof module.default !== 'function') {
        throw new Error('Plugin must export a default function');
      }

      // Create plugin context based on type
      const context = await this._createPluginContext(manifest);

      // Initialize plugin
      const plugin: Plugin = module.default(context);

      // Validate plugin interface
      if (!this._validatePluginInterface(plugin, manifest.type)) {
        throw new Error('Plugin does not implement required interface');
      }

      // Initialize plugin based on type
      if (plugin.type === 'ui' || plugin.type === 'hybrid') {
        await this._mountUIComponents(plugin, manifest);
      }

      if (plugin.type === 'middleware' || plugin.type === 'hybrid') {
        await this._registerMiddleware(plugin, manifest);
      }

      // Store the plugin instance
      this._plugins.set(manifest.id, { plugin, manifest });

      return plugin;
    } catch (error: any) {
      throw new Error(`Failed to load plugin: ${error.message}`);
    }
  }

  private async _loadPluginModule(path: string) {
    // Get the file content from IndexedDB
    const content = await this._store.getPluginFile(path);

    if (!content) {
      throw new Error(`Plugin module not found: ${path}`);
    }

    // Convert content to text
    const decoder = new TextDecoder();
    const sourceCode = decoder.decode(content);

    // Create a Blob URL for the module
    const blob = new Blob([sourceCode], { type: 'application/javascript' });
    const moduleUrl = URL.createObjectURL(blob);

    try {
      // Import the module
      const module = await import(moduleUrl);
      return module;
    } finally {
      // Clean up the Blob URL
      URL.revokeObjectURL(moduleUrl);
    }
  }

  private _validateManifest(manifest: any): manifest is PluginManifest {
    return (
      typeof manifest.id === 'string' &&
      typeof manifest.version === 'string' &&
      typeof manifest.entryPoint === 'string' &&
      ['ui', 'middleware', 'hybrid'].includes(manifest.type) &&
      Array.isArray(manifest.permissions) &&
      (!manifest.slots || (Array.isArray(manifest.slots) && manifest.slots.every((s: any) => typeof s === 'string'))) &&
      (!manifest.middlewarePoints ||
        (Array.isArray(manifest.middlewarePoints) &&
          manifest.middlewarePoints.every((m: any) => typeof m === 'string')))
    );
  }

  private _validatePluginInterface(plugin: any, type: PluginManifest['type']): boolean {
    if (type === 'ui' || type === 'hybrid') {
      if (typeof plugin.mount !== 'function' || typeof plugin.unmount !== 'function') {
        return false;
      }
    }

    if (type === 'middleware' || type === 'hybrid') {
      if (typeof plugin.process !== 'function') {
        return false;
      }
    }

    return true;
  }

  private async _loadInstalledPlugins(): Promise<void> {
    try {
      const installedPlugins = await this._store.getInstalledPlugins();

      for (const pluginInfo of installedPlugins) {
        if (!pluginInfo.enabled) {
          continue;
        }

        try {
          await this._loadPlugin(pluginInfo.manifest);
          console.log(`Plugin ${pluginInfo.id} loaded successfully`);
        } catch (error) {
          console.error(`Failed to load plugin ${pluginInfo.id}:`, error);

          // Optionally disable problematic plugins
          await this.disablePlugin(pluginInfo.id);
        }
      }
    } catch (error) {
      console.error('Failed to load installed plugins:', error);
    }
  }
}
