const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");

function createWindow(throttled = true) {
  const win = new EventEmitter();
  win.webContents = new EventEmitter();
  win.webContents.getBackgroundThrottling = () => throttled;
  win.webContents.setBackgroundThrottling = (value) => {
    assert.equal(win.destroyed, false);
    throttled = value;
  };
  win.destroyed = false;
  win.isDestroyed = () => win.destroyed;
  win.isMaximized = win.isFocused = () => false;
  win.setSkipTaskbar = () => {};
  win.hide = () => { win.hidden = true; };
  return win;
}

async function loadPlugin(win, hideOnLaunch = false) {
  class Plugin {
    constructor() {
      this.cleanups = [];
      this.app = { workspace: { onLayoutReady: (callback) => callback() } };
    }
    async loadData() {
      return {
        createTrayIcon: false,
        toggleWindowFocusHotkey: "",
        quickNoteHotkey: "",
        runInBackground: true,
        hideOnLaunch,
      };
    }
    register(callback) { this.cleanups.push(callback); }
    registerEvent(event) { assert.ok(event, "registerEvent needs an EventRef"); }
    addSettingTab() {}
    addCommand() {}
    unload() {
      this.onunload();
      this.cleanups.forEach((callback) => callback());
    }
  }
  const remote = {
    app: { setLoginItemSettings() {} },
    getCurrentWindow: () => win,
    globalShortcut: { unregister() {} },
  };
  const context = {
    module: { exports: {} },
    process: { platform: "linux" },
    console: { log() {} },
    window: { addEventListener() {}, removeEventListener() {} },
    require(name) {
      if (name === "obsidian") return { Plugin, PluginSettingTab: class {} };
      assert.equal(name, "electron");
      return { remote };
    },
  };
  vm.runInNewContext(readFileSync(`${__dirname}/../main.js`, "utf8"), context);
  const plugin = new context.module.exports();
  await plugin.onload();
  return plugin;
}

test("keeps hidden windows unthrottled and restores each previous setting", async () => {
  const win = createWindow();
  const plugin = await loadPlugin(win, true);
  assert.equal(win.hidden, true);
  assert.equal(win.webContents.getBackgroundThrottling(), false);
  const child = createWindow(false);
  win.webContents.emit("did-create-window", child);
  assert.equal(child.webContents.getBackgroundThrottling(), false);
  plugin.unload();
  assert.equal(win.webContents.getBackgroundThrottling(), true);
  assert.equal(child.webContents.getBackgroundThrottling(), false);
});

test("cleanup skips windows destroyed before plugin unload", async () => {
  const win = createWindow();
  const plugin = await loadPlugin(win);
  assert.equal(win.webContents.getBackgroundThrottling(), false);
  win.destroyed = true;
  plugin.unload();
});
