import type { StoredPluginInfo } from './types';

export class PluginStore {
  private _db: IDBDatabase | null = null;
  private readonly _dbName = 'plugin-system';
  private readonly _storeNames = {
    plugins: 'plugins',
    files: 'files',
    metadata: 'metadata',
  };

  async initialize(): Promise<void> {
    this._db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(this._dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Store for plugin metadata
        if (!db.objectStoreNames.contains(this._storeNames.plugins)) {
          db.createObjectStore(this._storeNames.plugins, { keyPath: 'id' });
        }

        // Store for plugin files
        if (!db.objectStoreNames.contains(this._storeNames.files)) {
          db.createObjectStore(this._storeNames.files);
        }

        // Store for system metadata
        if (!db.objectStoreNames.contains(this._storeNames.metadata)) {
          db.createObjectStore(this._storeNames.metadata);
        }
      };
    });
  }

  // Plugin Metadata Operations
  async savePlugin(pluginInfo: StoredPluginInfo): Promise<void> {
    await this._performTransaction(this._storeNames.plugins, 'readwrite', (store) => store.put(pluginInfo));
  }

  async getPlugin(id: string): Promise<StoredPluginInfo | null> {
    return this._performTransaction(this._storeNames.plugins, 'readonly', (store) => store.get(id));
  }

  async updatePluginStatus(id: string, enabled: boolean): Promise<void> {
    const plugin = await this.getPlugin(id);

    if (!plugin) {
      throw new Error(`Plugin ${id} not found`);
    }

    await this.savePlugin({ ...plugin, enabled });
  }

  async deletePlugin(id: string): Promise<void> {
    await this._performTransaction(this._storeNames.plugins, 'readwrite', (store) => store.delete(id));
  }

  async getInstalledPlugins(): Promise<StoredPluginInfo[]> {
    return this._performTransaction(this._storeNames.plugins, 'readonly', (store) => store.getAll());
  }

  // Plugin Files Operations
  async savePluginFile(path: string, content: Uint8Array): Promise<void> {
    await this._performTransaction(this._storeNames.files, 'readwrite', (store) => store.put(content, path));
  }

  async getPluginFile(path: string): Promise<Uint8Array | null> {
    return this._performTransaction(this._storeNames.files, 'readonly', (store) => store.get(path));
  }

  async deletePluginFiles(pluginId: string): Promise<void> {
    const files = await this._performTransaction(this._storeNames.files, 'readonly', (store) => store.getAllKeys());

    const pluginFiles = files.filter(
      (path: IDBValidKey) => typeof path === 'string' && path.startsWith(`/plugins/${pluginId}/`),
    );

    await this._performTransaction(this._storeNames.files, 'readwrite', (store) =>
      Promise.all(pluginFiles.map((path) => store.delete(path))),
    );
  }

  // Helper method for transactions
  private async _performTransaction<T>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
  ): Promise<T> {
    if (!this._db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this._db!.transaction([storeName], mode);
      const store = transaction.objectStore(storeName);

      try {
        const request = operation(store);

        if (request instanceof IDBRequest) {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        } else {
          resolve(request);
        }
      } catch (error) {
        reject(error);
      }
    });
  }
}
