// luci.d.ts

declare namespace LuCI {
    interface View {
        extend(def: any): any;

        load(): Promise<void>;

        render(): HTMLElement;

        handleSave(): void;

        handleSaveApply(): void;

        prototype: View;
    }

    interface L {
        resolveDefault<T>(promise: Promise<T>, defaultValue?: T): Promise<T>;
    }

    interface Form {
        Map: new (config: string, title: string, description?: string) => any;
        TypedSection: new (type?: string, ...args: any[]) => any;
        Value: new (...args: any[]) => any;
        Flag: new (...args: any[]) => any;
        ListValue: new (...args: any[]) => any;
        Button: new (...args: any[]) => any;
        DynamicList: new (...args: any[]) => any;
        SectionValue: new (...args: any[]) => any;
        TextValue: new (...args: any[]) => any;
        GridSection: new (...args: any[]) => any;
        MultiValue: new (...args: any[]) => any;
    }

    interface UCI {
        load(config: string): Promise<void>;

        sections(config: string, type: string, callback: (section: any) => void): any[];

        sections(config: string, type: string): any[];

        get(config: string, sectionId: string, option?: string): any;

        get_first(config: string, type: string, option?: string): any;

        set(config: string, sectionId: string, option: string, value: any): void;

        remove(config: string, sectionId: string): void;

        clone(config: string, type: string, sectionId: string, anonymous?: boolean, name?: string): void;

        set_first(config: string, sectionId: string, option: string, value: any): void;
    }

    interface FS {
        exec(command: string, args?: string[]): Promise<{ code: number; stdout: string; stderr: string; }>;

        write(path: string, content: string): Promise<void>;

        trimmed(path: string): Promise<string>;
    }

    interface RPC {
        declare(spec: {
            object: string;
            method: string;
            params: string[];
            expect: any;
        }): (...args: any[]) => Promise<any>;
    }

    interface Poll {
        add(callback: () => Promise<void>): void;
    }

    interface BaseClass {
        extend(obj: any): any;
    }

    interface UI {
        changes(): void;

        showModal(modal: any, e: any): void;

        hideModal(): void;
    }
}

// 运行时存在的全局（由 luci 注入）
// declare const view: LuCI.View;
declare const L: LuCI.L;
// 全局函数
declare function _(text: string): string;

declare function E(tag: string, attrs?: Record<string, any>, ...children: any[]): HTMLElement;

// 声明String.format方法
declare interface String {
    format(template: string, ...args: any[]): string;
}

// 模块名 = require 名（view → 'require view'）

declare module 'view' {
    const v: LuCI.View;
    export default v;
}

declare module 'form' {
    const f: LuCI.Form;
    export default f;

    export class Map {
        constructor(config: string, title: string, description?: string);

        section(type: any, ...args: any[]): any;

        render(): HTMLElement;
    }

    export class TypedSection {
        constructor(type?: string, ...args: any[]);

        anonymous: boolean;
        addremove: boolean;
        sortable: boolean;
        nodescriptions: boolean;
        rowcolors: boolean;
        sectiontitle?: (sectionId: string) => string;
        render?: () => HTMLElement;

        taboption(tab: string, type: any, name: string, ...args: any[]): any;

        option(type: any, name: string, ...args: any[]): any;
    }

    export class Value {
        constructor(...args: any[]);

        default: any;
        datatype?: string;
        rmempty: boolean;
        modalonly?: boolean;

        value(key: string, display?: string): void;

        load?: (sectionId: string) => any;
        write?: (sectionId: string, value: any) => any;
        remove?: (sectionId: string) => any;
        monospace?: boolean;
        rows?: number;
        validate?: (sectionId: string, value: any) => boolean | string;
        depends?: Record<string, any>;
        inputtitle?: string;
    }

    export class Flag extends Value {
    }

    export class ListValue extends Value {
    }

    export class Button extends Value {
    }

    export class DynamicList extends Value {
    }

    export class SectionValue extends Value {
    }
}

declare module 'uci' {
    const u: LuCI.UCI;
    export default u;

    export function load(config: string): Promise<void>;

    export function sections(config: string, type: string, callback: (section: any) => void): any[];

    export function get(config: string, sectionId: string, option?: string): any;

    export function get_first(config: string, type: string, option?: string): any;

    export function set(config: string, sectionId: string, option: string, value: any): void;

    export function remove(config: string, sectionId: string): void;

    export function clone(config: string, type: string, sectionId: string, anonymous?: boolean, name?: string): void;
}

declare module 'fs' {
    const f: LuCI.FS;
    export default f;

    export function exec(command: string, args?: string[]): Promise<{ code: number; stdout: string; stderr: string; }>;

    export function write(path: string, content: string): Promise<void>;

    export function trimmed(path: string): Promise<string>;
}

declare module 'rpc' {
    const r: LuCI.RPC;
    export default r;

    export function declare(spec: {
        object: string;
        method: string;
        params: string[];
        expect: any;
    }): (...args: any[]) => Promise<any>;
}

declare module 'poll' {
    const p: LuCI.Poll;
    export default p;

    export function add(callback: () => Promise<void>): void;
}

declare module 'network' {
    const n: any;
    export default n;
}

declare module 'baseclass' {
    const b: LuCI.BaseClass;
    export default b;

    export function extend(obj: any): any;
}

declare module 'ui' {
    const u: LuCI.UI;
    export default u;
}
