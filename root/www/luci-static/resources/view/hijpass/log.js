
'use strict';
'require fs';
'require view';
'require form';
'require uci';

var LuciView = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // views/log.ts
  var log_exports = {};
  __export(log_exports, {
    default: () => log_default
  });

  // luci-virtual:fs
  var fs_default = fs;

  // luci-virtual:view
  var view_default = view;

  // luci-virtual:form
  var form_default = form;

  // luci-virtual:uci
  var uci_default = uci;

  // views/log.ts
  var v = view_default.extend({
    load: function() {
      return Promise.all([
        uci_default.load("hijpass" /* CONF_NAME */)
      ]);
    },
    handleSaveApply: null,
    handleReset: null,
    handleSave: null,
    render: function() {
      let m = new form_default.Map(
        "hijpass" /* CONF_NAME */,
        _("\u65E5\u5FD7\u67E5\u770B"),
        _("\u67E5\u770B\u548C\u7BA1\u7406 HiJpass \u76F8\u5173\u65E5\u5FD7")
      );
      let s = m.section(form_default.TypedSection, "logs_display");
      s.anonymous = true;
      s.addremove = false;
      s.render = function() {
        return createLogControlPanel();
      };
      return m.render();
    }
  });
  function createLogFileOptions() {
    let options = [];
    options.push(E("option", { "value": "/tmp/log/hijpass.log" }, _("\u4E3B\u65E5\u5FD7")));
    let shuntLogPath = uci_default.get_first("hijpass" /* CONF_NAME */, "shunt" /* SHUNT_SECTION_TYPE */, "log_path");
    if (shuntLogPath) {
      options.push(E("option", { "value": shuntLogPath }, _("\u5206\u6D41\u65E5\u5FD7")));
    } else {
      options.push(E("option", { "value": "/tmp/log/hijpass-shunt.log" }, _("\u5206\u6D41\u65E5\u5FD7")));
    }
    uci_default.sections("hijpass" /* CONF_NAME */, "proxy_node" /* PROXY_NODE_TYPE */, (proxySection) => {
      let proxyName = proxySection[".name"];
      let displayName = proxySection.name || proxyName;
      let logPath = proxySection.log_path;
      if (logPath) {
        let optionText = _("\u4EE3\u7406\u65E5\u5FD7") + " - " + displayName;
        options.push(E("option", { "value": logPath }, optionText));
      }
    });
    return options;
  }
  function createLogControlPanel() {
    requestAnimationFrame(function() {
      setupLogEventListeners();
      loadLogs();
    });
    return E("div", { "class": "cbi-section", "style": "display: flex;flex-direction: column;gap: 20px;" }, [
      E("div", { "class": "cbi-section-node" }, [
        E("div", { "class": "cbi-value" }, [
          E("label", { "class": "cbi-value-title" }, _("\u65E5\u5FD7\u6587\u4EF6")),
          E("div", { "class": "cbi-value-field" }, [
            E("select", {
              "id": "log-file-select",
              "class": "cbi-input-select",
              "style": "margin-right: 10px;"
            }, createLogFileOptions())
          ])
        ]),
        E("div", { "class": "cbi-value" }, [
          E("label", { "class": "cbi-value-title" }, _("\u65E5\u5FD7\u7EA7\u522B\u8FC7\u6EE4")),
          E("div", { "class": "cbi-value-field" }, [
            E("select", {
              "id": "log-level-filter",
              "class": "cbi-input-select",
              "style": "margin-right: 10px;"
            }, [
              E("option", { "value": "" }, _("\u5168\u90E8")),
              E("option", { "value": "DEBUG" }, _("\u8C03\u8BD5")),
              E("option", { "value": "INFO" }, _("\u4FE1\u606F")),
              E("option", { "value": "WARN" }, _("\u8B66\u544A")),
              E("option", { "value": "ERROR" }, _("\u9519\u8BEF"))
            ])
          ])
        ]),
        E("div", { "class": "cbi-value" }, [
          E("label", { "class": "cbi-value-title" }, _("\u663E\u793A\u884C\u6570")),
          E("div", { "class": "cbi-value-field" }, [
            E("select", {
              "id": "log-lines-count",
              "class": "cbi-input-select",
              "style": "margin-right: 10px;"
            }, [
              E("option", { "value": "50" }, "50"),
              E("option", { "value": "100", "selected": "selected" }, "100"),
              E("option", { "value": "200" }, "200"),
              E("option", { "value": "500" }, "500"),
              E("option", { "value": "1000" }, "1000")
            ])
          ])
        ]),
        E("div", { "class": "cbi-value" }, [
          E("label", { "class": "cbi-value-title" }, _("\u64CD\u4F5C")),
          E("div", { "class": "cbi-value-field" }, [
            E("button", {
              "class": "cbi-button cbi-button-action",
              "id": "refresh-logs",
              "style": "margin-right: 5px;"
            }, _("\u5237\u65B0")),
            E("button", {
              "class": "cbi-button cbi-button-neutral",
              "id": "auto-refresh-toggle",
              "style": "margin-right: 5px;"
            }, _("\u81EA\u52A8\u5237\u65B0")),
            E("button", {
              "class": "cbi-button cbi-button-positive",
              "id": "download-logs",
              "style": "margin-right: 5px;"
            }, _("\u4E0B\u8F7D")),
            E("button", {
              "class": "cbi-button cbi-button-negative",
              "id": "clear-logs"
            }, _("\u6E05\u7A7A"))
          ])
        ]),
        E("div", { "class": "cbi-value" }, [
          E("div", {
            "id": "log-status",
            "style": "font-size: 12px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
          }),
          E("div", {
            "id": "log-content",
            "class": "log-display",
            "style": "width: 100%; height: 500px; font-family: monospace; font-size: 12px; background: #101010; color: #eee; border: 1px solid #ccc; padding: 10px; overflow: auto; white-space: pre; line-height: 1.4;"
          }, _("\u65E5\u5FD7\u5185\u5BB9\u5C06\u5728\u8FD9\u91CC\u663E\u793A..."))
        ])
      ])
    ]);
  }
  function setupLogEventListeners() {
    let autoRefreshInterval = null;
    let isAutoRefresh = false;
    document.getElementById("refresh-logs").addEventListener("click", function() {
      loadLogs();
    });
    document.getElementById("auto-refresh-toggle").addEventListener("click", function() {
      isAutoRefresh = !isAutoRefresh;
      let button = this;
      if (isAutoRefresh) {
        button.textContent = _("\u505C\u6B62\u81EA\u52A8\u5237\u65B0");
        button.className = "cbi-button cbi-button-negative";
        autoRefreshInterval = setInterval(loadLogs, 3e3);
        updateLogStatus(_("\u81EA\u52A8\u5237\u65B0\u5DF2\u542F\u7528"));
      } else {
        button.textContent = _("\u81EA\u52A8\u5237\u65B0");
        button.className = "cbi-button cbi-button-neutral";
        if (autoRefreshInterval) {
          clearInterval(autoRefreshInterval);
          autoRefreshInterval = null;
        }
        updateLogStatus(_("\u81EA\u52A8\u5237\u65B0\u5DF2\u505C\u7528"));
      }
    });
    document.getElementById("download-logs").addEventListener("click", function() {
      downloadLogs();
    });
    document.getElementById("clear-logs").addEventListener("click", function() {
      if (confirm(_("\u786E\u5B9A\u8981\u6E05\u7A7A\u65E5\u5FD7\u6587\u4EF6\u5417\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D\u3002"))) {
        clearLogs();
      }
    });
    document.getElementById("log-file-select").addEventListener("change", function() {
      loadLogs();
    });
    document.getElementById("log-level-filter").addEventListener("change", function() {
      loadLogs();
    });
    document.getElementById("log-lines-count").addEventListener("change", function() {
      loadLogs();
    });
  }
  function loadLogs() {
    let logFile = document.getElementById("log-file-select").value;
    let levelFilter = document.getElementById("log-level-filter").value;
    let linesCount = document.getElementById("log-lines-count").value;
    updateLogStatus(_("\u6B63\u5728\u52A0\u8F7D\u65E5\u5FD7..."));
    fs_default.exec("/usr/bin/tail", ["-n", linesCount, logFile]).then(function(result) {
      let logContent = result.stdout || "";
      if (levelFilter) {
        let lines = logContent.split("\n");
        let filteredLines = lines.filter(function(line) {
          let upperLine = line.toUpperCase();
          let upperFilter = levelFilter.toUpperCase();
          if (upperFilter === "WARN") {
            return upperLine.includes("WARN") || upperLine.includes("WARNING");
          }
          return upperLine.includes(upperFilter);
        });
        logContent = filteredLines.join("\n");
      }
      logContent = highlightLogContent(logContent);
      let textarea = document.getElementById("log-content");
      textarea.innerHTML = logContent;
      textarea.scrollTop = textarea.scrollHeight;
      updateLogStatus(_("\u65E5\u5FD7\u5DF2\u66F4\u65B0") + " - " + (/* @__PURE__ */ new Date()).toLocaleTimeString());
    }).catch(function(error) {
      updateLogStatus(_("\u52A0\u8F7D\u65E5\u5FD7\u5931\u8D25: ") + error.message);
      document.getElementById("log-content").textContent = _("\u65E0\u6CD5\u52A0\u8F7D\u65E5\u5FD7\u6587\u4EF6: ") + logFile;
    });
  }
  function highlightLogContent(content) {
    content = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    content = convertAnsiToHtml(content);
    content = content.replace(/\s+\[?(ERROR|WARN|WARNING|INFO|DEBUG)\]?\s+/gmi, function(match, level) {
      if (match.includes("<span")) return match;
      let color = getLogLevelColor(level);
      return '<span style="color: ' + color + '; font-weight: bold;">' + match + "</span>";
    });
    return content;
  }
  function getLogLevelColor(level) {
    switch (level.toUpperCase()) {
      case "ERROR":
        return "#ff6b6b";
      case "WARN":
      case "WARNING":
        return "#ffa500";
      case "INFO":
        return "#4ecdc4";
      case "DEBUG":
        return "#95a5a6";
      default:
        return "#ffffff";
    }
  }
  function convertAnsiToHtml(text) {
    const ansiColorMap = {
      // 标准前景色
      "30": "#2e3436",
      // 黑色
      "31": "#cc0000",
      // 红色
      "32": "#4e9a06",
      // 绿色
      "33": "#c4a000",
      // 黄色
      "34": "#3465a4",
      // 蓝色
      "35": "#75507b",
      // 洋红
      "36": "#06989a",
      // 青色
      "37": "#d3d7cf",
      // 白色
      // 亮色前景色
      "90": "#555753",
      // 亮黑色（灰色）
      "91": "#ef2929",
      // 亮红色
      "92": "#8ae234",
      // 亮绿色
      "93": "#fce94f",
      // 亮黄色
      "94": "#729fcf",
      // 亮蓝色
      "95": "#ad7fa8",
      // 亮洋红
      "96": "#34e2e2",
      // 亮青色
      "97": "#eeeeec"
      // 亮白色
    };
    const ansiBgColorMap = {
      "40": "#2e3436",
      // 黑色背景
      "41": "#cc0000",
      // 红色背景
      "42": "#4e9a06",
      // 绿色背景
      "43": "#c4a000",
      // 黄色背景
      "44": "#3465a4",
      // 蓝色背景
      "45": "#75507b",
      // 洋红背景
      "46": "#06989a",
      // 青色背景
      "47": "#d3d7cf",
      // 白色背景
      // 亮色背景
      "100": "#555753",
      // 亮黑色背景
      "101": "#ef2929",
      // 亮红色背景
      "102": "#8ae234",
      // 亮绿色背景
      "103": "#fce94f",
      // 亮黄色背景
      "104": "#729fcf",
      // 亮蓝色背景
      "105": "#ad7fa8",
      // 亮洋红背景
      "106": "#34e2e2",
      // 亮青色背景
      "107": "#eeeeec"
      // 亮白色背景
    };
    let result = text;
    let openTags = [];
    result = result.replace(/\x1b\[([0-9;]*)m/g, function(match, codes) {
      if (!codes) codes = "0";
      let codeArray = codes.split(";");
      let html = "";
      for (let code of codeArray) {
        code = code.trim();
        if (code === "0" || code === "") {
          while (openTags.length > 0) {
            html += "</span>";
            openTags.pop();
          }
        } else if (code === "1") {
          html += '<span style="font-weight: bold;">';
          openTags.push("bold");
        } else if (code === "4") {
          html += '<span style="text-decoration: underline;">';
          openTags.push("underline");
        } else if (ansiColorMap[code]) {
          html += '<span style="color: ' + ansiColorMap[code] + ';">';
          openTags.push("color");
        } else if (ansiBgColorMap[code]) {
          html += '<span style="background-color: ' + ansiBgColorMap[code] + ';">';
          openTags.push("bgcolor");
        }
      }
      return html;
    });
    while (openTags.length > 0) {
      result += "</span>";
      openTags.pop();
    }
    return result;
  }
  function downloadLogs() {
    let logFile = document.getElementById("log-file-select").value;
    updateLogStatus(_("\u6B63\u5728\u51C6\u5907\u4E0B\u8F7D..."));
    fs_default.read(logFile).then(function(content) {
      let blob = new Blob([content], { type: "text/plain" });
      let url = window.URL.createObjectURL(blob);
      let a = document.createElement("a");
      a.href = url;
      a.download = logFile.split("/").pop() + "_" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/:/g, "-") + ".log";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      updateLogStatus(_("\u65E5\u5FD7\u4E0B\u8F7D\u5B8C\u6210"));
    }).catch(function(error) {
      updateLogStatus(_("\u4E0B\u8F7D\u5931\u8D25: ") + error.message);
    });
  }
  function clearLogs() {
    let logFile = document.getElementById("log-file-select").value;
    updateLogStatus(_("\u6B63\u5728\u6E05\u7A7A\u65E5\u5FD7..."));
    fs_default.write(logFile, null).then(function() {
      updateLogStatus(_("\u65E5\u5FD7\u5DF2\u6E05\u7A7A"));
      loadLogs();
    }).catch(function(error) {
      updateLogStatus(_("\u6E05\u7A7A\u5931\u8D25: ") + error.message);
    });
  }
  function updateLogStatus(message) {
    let statusElement = document.getElementById("log-status");
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.style.color = "#666";
    }
  }
  var log_default = v;
  return __toCommonJS(log_exports);
})();


return LuciView.default;
