export interface DirEnt<T> {
  name: T;
  isFile(): boolean;
  isDirectory(): boolean;
}

export interface IFileSystemAPI {
  readdir(path: string, options: 'buffer' | { encoding: 'buffer'; withFileTypes?: false }): Promise<Uint8Array[]>;
  readdir(
    path: string,
    options?: { encoding?: BufferEncoding | null; withFileTypes?: false } | BufferEncoding | null,
  ): Promise<string[]>;
  readdir(path: string, options: { encoding: 'buffer'; withFileTypes: true }): Promise<DirEnt<Uint8Array>[]>;
  readdir(path: string, options: { encoding?: BufferEncoding | null; withFileTypes: true }): Promise<DirEnt<string>[]>;

  readFile(path: string, encoding?: null): Promise<Uint8Array>;
  readFile(path: string, encoding: BufferEncoding): Promise<string>;

  writeFile(
    path: string,
    data: string | Uint8Array,
    options?: string | { encoding?: string | null } | null,
  ): Promise<void>;

  mkdir(path: string, options?: { recursive?: false }): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<string>;

  rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void>;

  rename(oldPath: string, newPath: string): Promise<void>;
}

export interface IWebContainer {
  fs: IFileSystemAPI;
  readonly path: string;
  readonly workdir: string;

  spawn(command: string, args: string[], options?: any): Promise<any>;
  spawn(command: string, options?: any): Promise<any>;

  on(event: 'port', listener: (port: number, type: 'open' | 'close', url: string) => void): () => void;
  on(event: 'server-ready', listener: (port: number, url: string) => void): () => void;
  on(event: 'preview-message', listener: (message: any) => void): () => void;
  on(event: 'error', listener: (error: { message: string }) => void): () => void;

  teardown(): void;
}

export interface IWorkbenchStore {
  artifacts: any;
  modifiedFiles: Set<string>;
  artifactIdList: string[];

  // Getters
  readonly previews: unknown; // Type from PreviewsStore
  readonly files: unknown; // Type from FilesStore
  readonly filesCount: number;
  readonly showTerminal: unknown; // Type from TerminalStore
  readonly boltTerminal: unknown; // Type from TerminalStore

  // Methods
  addToExecutionQueue(callback: () => Promise<void>): void;
  clearAlert(): void;
  toggleTerminal(value?: boolean): void;
  onTerminalResize(cols: number, rows: number): void;
  setDocuments(files: any): void;
  setShowWorkbench(show: boolean): void;
  setCurrentDocumentContent(newContent: string): void;
  setCurrentDocumentScrollPosition(position: { top: number; left: number }): void;
  setSelectedFile(filePath: string | undefined): void;
  saveFile(filePath: string): Promise<void>;
  saveCurrentDocument(): Promise<void>;
  resetCurrentDocument(): void;
  saveAllFiles(): Promise<void>;
  getFileModifcations(): unknown; // Return type from FilesStore
  resetAllFileModifications(): void;
  abortAllActions(): void;
  setReloadedMessages(messages: string[]): void;
  downloadZip(): Promise<void>;
  syncFiles(targetHandle: FileSystemDirectoryHandle): Promise<string[]>;
  pushToGitHub(repoName: string, githubUsername?: string, ghToken?: string): Promise<void>;
}

export interface CoreAPI {
  webcontainer: Promise<IWebContainer>;
  workbenchStore: IWorkbenchStore;
}

export interface UIPluginContext {
  slot: string;
  api: CoreAPI;
}

export interface MiddlewareContext {
  point: string;
  data: any;
  api: CoreAPI;
  next: (data: any) => Promise<any>;
}
