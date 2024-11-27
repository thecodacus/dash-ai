import type { WebContainer } from "@webcontainer/api";
import { map, type MapStore } from "nanostores";

type Actions  = MapStore<Record<string, (container: Promise<WebContainer>, data: string) =>Promise<void>>>;


export class ActionStore {
    #webcontainer: Promise<WebContainer>;
    actions: Actions = import.meta.hot?.data.actions ?? map({});
    constructor(webcontainer: Promise<WebContainer>) {
        this.#webcontainer = webcontainer;
        if (import.meta.hot) {
            import.meta.hot.data.actions = this.actions;
        }
    }
    registerAction(key: string, action: (container: Promise<WebContainer>, data: string) => Promise<void>) {
        this.actions.setKey(key, action);
    }
    async runAction(key: string, data: string) {
        const action = this.actions.get()[key];
        if (!action) {
            return;
        }
        return await action(this.#webcontainer, data);
    }
}