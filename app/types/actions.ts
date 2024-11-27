export type ActionType = 'file' | 'shell' |'start' |'custom';

export interface BaseAction {
  content: string;
}

export interface FileAction extends BaseAction {
  type: 'file';
  filePath: string;
}

export interface ShellAction extends BaseAction {
  type: 'shell';
}

export interface StartAction extends BaseAction {
  type: 'start';
}

export interface CustomAction extends BaseAction {
  type: 'custom';
  name: string;
  actionKey: string;
  execute?: (content: string) => Promise<void>;
}

export type BoltAction = FileAction | ShellAction | StartAction | CustomAction;

export type BoltActionData = BoltAction | BaseAction;
