// luci-ide-hints.js
/**
 * @namespace
 */
var L = {
    /**
     * @param {...string} parts
     * @returns {string}
     */
    url: function () {
    },

    /**
     * @template T
     * @param {Promise<T>} promise
     * @param {T} def
     * @returns {Promise<T>}
     */
    resolveDefault: function (promise, def) {
    },

    /**
     * @namespace
     */
    Poll: {
        /**
         * @param {function(): Promise<any>} fn
         * @param {number} [interval]
         * @returns {void}
         */
        add: function (fn, interval) {
        }
    },

    /**
     * @namespace
     */
    Class: {
        /**
         * @param {Object} prototype
         * @returns {Function}
         */
        extend: function (prototype) {
        }
    }
};

/**
 * @namespace
 */
const rpc = {
    /**
     * @param {{object: string, method: string, params?: string[], expect?: Object}} obj
     * @returns {function(...any): Promise<any>}
     */
    declare: function (obj) {
    }
}

/**
 * @namespace
 */
const uci = {
    /**
     * @param {string} config
     * @returns {Promise<void>}
     */
    load: function (config) {
    },

    /**
     * @param {string} config
     * @param {string} section
     * @param {string} option
     * @returns {string|undefined}
     */
    get: function (config, section, option) {
    },

    /**
     * @param {string} config
     * @param {string} sectionType
     * @param {string} option
     * @returns {string|undefined}
     */
    get_first: function (config, sectionType, option) {
    },

    /**
     * @param {string} config
     * @param {string} [sectionType]
     * @param {function(Object): void} callback
     * @returns {Object[]}
     */
    sections: function (config, sectionType, callback) {
    },

    /**
     * @param {string} config
     * @param {string} section
     * @param {string} option
     * @param {string|number|boolean} value
     * @returns {void}
     */
    set: function (config, section, option, value) {
    },

    /**
     * @param {string} config
     * @returns {Promise<void>}
     */
    save: function (config) {
    },

    /**
     * @param {string} config
     * @returns {Promise<void>}
     */
    commit: function (config) {
    }
}

/**
 * @namespace
 */
const fs = {
    /**
     * @param {string} command
     * @param {string[]} [args]
     * @returns {Promise<{code: number, stdout: string, stderr: string}>}
     */
    exec: function (command, args) {
    },

    /**
     * @param {string} path
     * @param {string} data
     * @returns {Promise<void>}
     */
    write: function (path, data) {
    },

    /**
     * @param {string} path
     * @returns {Promise<string>}
     */
    read: function (path) {
    },

    /**
     * @param {string} path
     * @returns {Promise<boolean>}
     */
    exists: function (path) {
    },

    /**
     * @param {string} path
     * @returns {Promise<string[]>}
     */
    list: function (path) {
    }
}

/**
 * @namespace
 */
const form = {
    /**
     * @constructor
     * @param {string} configName
     * @param {string} [title]
     * @param {string} [description]
     */
    Map: function (configName, title, description) {
    },

    /**
     * @constructor
     * @param {Function} sectionType
     * @param {string} [title]
     * @param {string} [description]
     */
    TypedSection: function (sectionType, title, description) {
    },

    /**
     * @constructor
     * @param {string} title
     * @param {string} [description]
     */
    Section: function (title, description) {
    },

    /**
     * @constructor
     * @param {Function} optionClass
     * @param {string} [optionName]
     * @param {string} [title]
     * @param {string} [description]
     */
    Value: function (optionClass, optionName, title, description) {
    },

    /**
     * @constructor
     * @param {string} optionName
     * @param {string} [title]
     * @param {string} [description]
     */
    Flag: function (optionName, title, description) {
    },

    /**
     * @constructor
     * @param {string} optionName
     * @param {string} [title]
     * @param {string} [description]
     */
    ListValue: function (optionName, title, description) {
    },

    /**
     * @constructor
     * @param {string} optionName
     * @param {string} [title]
     * @param {string} [description]
     */
    DynamicList: function (optionName, title, description) {
    },

    /**
     * @constructor
     * @param {string} optionName
     * @param {string} [title]
     * @param {string} [description]
     */
    Button: function (optionName, title, description) {
    },

    /**
     * @constructor
     * @param {string} optionName
     * @param {string} [title]
     * @param {string} [description]
     */
    TextValue: function (optionName, title, description) {
    }
}

/**
 * @namespace
 */
const ui = {
    /**
     * @constructor
     * @param {string} title
     * @param {string} description
     * @param {string} [className]
     */
    section: function (title, description, className) {
    },

    /**
     * @constructor
     * @param {string} title
     * @param {string} description
     */
    header: function (title, description) {
    },

    /**
     * @constructor
     * @param {string} title
     * @param {string} description
     * @param {string} [className]
     */
    row: function (title, description, className) {
    },

    /**
     * @constructor
     * @param {string} text
     * @param {string} [className]
     */
    h1: function (text, className) {
    },

    /**
     * @constructor
     * @param {string} text
     * @param {string} [className]
     */
    h2: function (text, className) {
    },

    /**
     * @constructor
     * @param {string} text
     * @param {string} [className]
     */
    h3: function (text, className) {
    },

    /**
     * @constructor
     * @param {string} text
     * @param {string} [className]
     */
    h4: function (text, className) {
    },

    /**
     * @constructor
     * @param {string} text
     * @param {string} [className]
     */
    h5: function (text, className) {
    },

    /**
     * @constructor
     * @param {string} text
     * @param {string} [className]
     */
    h6: function (text, className) {
    },

    /**
     * @constructor
     * @param {string} text
     * @param {string} [className]
     */
    p: function (text, className) {
    },

    /**
     * @constructor
     * @param {string} text
     * @param {string} [className]
     */
    pre: function (text, className) {
    },

    /**
     * @constructor
     * @param {string} text
     * @param {string} [className]
     */
    code: function (text, className) {
    },

    /**
     * @constructor
     * @param {string} text
     * @param {string} [className]
     */
    em: function (text, className) {
    },

    /**
     * @constructor
     * @param {string} text
     * @param {string} [className]
     */
    strong: function (text, className) {
    },

    /**
     * @constructor
     * @param {string} text
     * @param {string} [className]
     */
    br: function (text, className) {
    },

    /**
     * @constructor
     * @param {string} text
     * @param {string} [className]
     */
    hr: function (text, className) {
    }
}

/**
 * @namespace
 */
const network = {
    /**
     * @returns {Promise<Object[]>}
     */
    getDevices: function () {
    },

    /**
     * @returns {Promise<Object[]>}
     */
    getInterfaces: function () {
    },

    /**
     * @returns {Promise<Object[]>}
     */
    getWifiNetworks: function () {
    }
}

/**
 * @namespace
 */
const E = function(tag, attrs, children) {
    /**
     * @type {HTMLElement}
     */
    this.dom = null;
    return this.dom;
};

/**
 * 国际化函数
 * @param {string} text
 * @param {...any} args
 * @returns {string}
 */
function _(text, ...args) {
    return text;
}

/**
 * 视图基类
 * @constructor
 */
function view() {
    /**
     * @returns {Promise<void>}
     */
    this.load = function() {
    };

    /**
     * @returns {Promise<void>}
     */
    this.handleSaveApply = function() {
    };

    /**
     * @returns {Promise<void>}
     */
    this.handleReset = function() {
    };

    /**
     * @returns {HTMLElement}
     */
    this.render = function() {
    };
}

/**
 * 基础类
 * @namespace
 */
const baseclass = {
    /**
     * @constructor
     * @param {Object} prototype
     */
    extend: function (prototype) {
    }
};

/**
 * @type {HTMLDocument}
 */
const document = window.document;

/**
 * @type {Window}
 */
const window = globalThis;