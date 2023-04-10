/**
 * obsidian-tray v0.2.1
 * (c) 2023 dragonwocky <thedragonring.bod@gmail.com> (https://dragonwocky.me/)
 * (https://github.com/dragonwocky/obsidian-tray/) under the MIT license
 */

"use strict";

const LOG_PREFIX = "obsidian-tray",
  LOG_LOADING = "loading",
  LOG_CLEANUP = "cleaning up",
  LOG_SHOWING_WINDOWS = "showing windows",
  LOG_HIDING_WINDOWS = "hiding windows",
  LOG_WINDOW_CLOSE = "intercepting window close",
  LOG_TRAY_ICON = "creating tray icon",
  LOG_REGISTER_HOTKEY = "registering hotkey",
  LOG_UNREGISTER_HOTKEY = "unregistering hotkey",
  ACTION_QUICK_NOTE = "Add Quick Note",
  ACTION_OPEN = "Open Obsidian",
  ACTION_HIDE = "Hide Obsidian",
  ACTION_RELAUNCH = "Relaunch Obsidian",
  ACTION_QUIT = "Quit Obsidian",
  DEFAULT_DATE_FORMAT = "YYYY-MM-DD",
  ACCELERATOR_FORMAT = `
    This hotkey is registered globally and will be detected even if Obsidian does
    not have keyboard focus. Format:
    <a href="https://www.electronjs.org/docs/latest/api/accelerator" target="_blank" rel="noopener">
    Electron accelerator</a>
  `,
  MOMENT_FORMAT = `
    Format:
    <a href="https://momentjs.com/docs/#/displaying/format/" target="_blank" rel="noopener">
    Moment.js format string</a>
    <br>Preview:
  `,
  // 16x16 base64 obsidian icon: generated from obsidian.asar/icon.png
  OBSIDIAN_BASE64_ICON = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAHZSURBVDhPlZKxTxRBFMa/XZcF7nIG7mjxjoRCwomJxgsFdhaASqzQxFDzB1AQKgstLGxIiBQGJBpiCCGx8h+wgYaGgAWNd0dyHofeEYVwt/PmOTMZV9aDIL/s5pvZvPfN9yaL/+HR3eXcypta0m4juFbP5GHuXc9IbunDFc9db/G81/ZzhDMN7g8td47mll4R5BfHwZN4LOaA+fHa259PbUmIYzWkt3e2NZNo3/V9v1vvU6kkstk+tLW3ItUVr/m+c3N8MlkwxYqmBFcbwUQQCNOcyVzDwEAWjuPi5DhAMV/tKOYPX5hCyz8Gz1zX5SmWjBvZfmTSaRBJkGAIoxJHv+pVW2yIGNxOJ8bUVNcFEWLxuG1ia6JercTbttwQTeDwPS0kCMXiXtgk/jQrFUw7ptYSMWApF40yo/ytjHq98fdk3ayVE+cn2CxMb6ruz9qAJKFUKoWza1VJSi/n0+ffgYHdWW2gHuxXymg0gjCB0sjpmiaDnkL3RzDyzLqBUKns2ztQqUR0fk2TwSrGSf1eczqF5vsPZRCQSSAFLk6gqctgQRkc6TWRQLV2YMYQki9OoNkqzFQ9r+WOGuW5CrJbOzyAlPKr6MSGLbkcDwbf35oY/jRkt6cAfgNwowruAMz9AgAAAABJRU5ErkJggg==`,
  log = (message) => console.log(`${LOG_PREFIX}: ${message}`);

let tray;
const obsidian = require("obsidian"),
  {
    app,
    BrowserWindow,
    getCurrentWindow,
    globalShortcut,
    Tray,
    Menu,
    nativeImage,
  } = require("electron").remote;

const showWindows = () => {
    log(LOG_SHOWING_WINDOWS);
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => win.show());
    getCurrentWindow().focus();
  },
  hideWindows = (runInBackground) => {
    log(LOG_HIDING_WINDOWS);
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => [
      win.isFocused() && win.blur(),
      runInBackground ? win.hide() : win.minimize(),
    ]);
  },
  toggleWindows = (runInBackground, checkForFocus = true) => {
    const windows = BrowserWindow.getAllWindows(),
      openWindows = windows.some((win) => {
        return (!checkForFocus || win.isFocused()) && win.isVisible();
      });
    if (openWindows) {
      hideWindows(runInBackground);
    } else showWindows();
  };

const onWindowClose = (event) => event.preventDefault(),
  onWindowUnload = (event) => {
    log(LOG_WINDOW_CLOSE);
    getCurrentWindow().hide();
    event.stopImmediatePropagation();
    // setting return value manually is more reliable than
    // via `return false` according to electron
    event.returnValue = false;
  },
  interceptWindowClose = () => {
    // intercept in renderer
    window.addEventListener("beforeunload", onWindowUnload, true);
    // intercept in main: is asynchronously executed when registered
    // from renderer, so won't prevent close by itself, but counteracts
    // the 3-second delayed window force close in obsidian.asar/main.js
    getCurrentWindow().on("close", onWindowClose);
  },
  cleanupWindowClose = () => {
    getCurrentWindow().removeListener("close", onWindowClose);
    window.removeEventListener("beforeunload", onWindowUnload, true);
  };

const setHideTaskbarIcon = (plugin) => {
    getCurrentWindow().setSkipTaskbar(plugin.settings.hideTaskbarIcon);
  },
  setLaunchOnStartup = (plugin) => {
    const { launchOnStartup, runInBackground, hideOnLaunch } = plugin.settings;
    app.setLoginItemSettings({
      openAtLogin: launchOnStartup,
      openAsHidden: runInBackground && hideOnLaunch,
    });
  },
  relaunchObsidian = () => {
    app.relaunch();
    app.exit(0);
  };

const addQuickNote = (plugin) => {
    const { quickNoteLocation, quickNoteDateFormat } = plugin.settings,
      pattern = quickNoteDateFormat || DEFAULT_DATE_FORMAT,
      date = obsidian.moment().format(pattern),
      name = obsidian
        .normalizePath(`${quickNoteLocation ?? ""}/${date}`)
        .replace(/\*|"|\\|<|>|:|\||\?/g, "-");
    plugin.app.fileManager.createAndOpenMarkdownFile(name);
    showWindows();
  },
  createTrayIcon = (plugin) => {
    log(LOG_TRAY_ICON);
    const obsidianIcon = nativeImage.createFromDataURL(OBSIDIAN_BASE64_ICON),
      contextMenu = Menu.buildFromTemplate([
        {
          type: "normal",
          label: ACTION_QUICK_NOTE,
          accelerator: plugin.settings.quickNoteHotkey,
          click: () => addQuickNote(plugin),
        },
        {
          type: "normal",
          label: ACTION_OPEN,
          accelerator: plugin.settings.toggleWindowFocusHotkey,
          click: showWindows,
        },
        {
          type: "normal",
          label: ACTION_HIDE,
          accelerator: plugin.settings.toggleWindowFocusHotkey,
          click: hideWindows,
        },
        { type: "separator" },
        { label: ACTION_RELAUNCH, click: relaunchObsidian },
        { label: ACTION_QUIT, role: "quit" },
      ]);
    tray = new Tray(obsidianIcon);
    tray.setContextMenu(contextMenu);
    tray.setToolTip("Obsidian");
    tray.on("click", () =>
      toggleWindows(plugin.settings.runInBackground, false)
    );
  };

const registerHotkeys = (plugin) => {
    log(LOG_REGISTER_HOTKEY);
    try {
      const toggleAccelerator = plugin.settings.toggleWindowFocusHotkey,
        quicknoteAccelerator = plugin.settings.quickNoteHotkey;
      if (toggleAccelerator) {
        globalShortcut.register(toggleAccelerator, () => {
          const runInBackground = plugin.settings.runInBackground;
          toggleWindows(runInBackground);
        });
      }
      if (quicknoteAccelerator) {
        globalShortcut.register(quicknoteAccelerator, () => {
          addQuickNote(plugin);
        });
      }
    } catch {}
  },
  unregisterHotkeys = (plugin) => {
    log(LOG_UNREGISTER_HOTKEY);
    try {
      const toggle = plugin.settings.toggleWindowFocusHotkey,
        quicknote = plugin.settings.quickNoteHotkey;
      globalShortcut.unregister(toggle);
      globalShortcut.unregister(quicknote);
    } catch {}
  };

const OPTIONS = [
  "Window management",
  {
    key: "launchOnStartup",
    desc: "Open Obsidian automatically whenever you log into your computer.",
    type: "toggle",
    default: false,
    onChange: setLaunchOnStartup,
  },
  {
    key: "hideOnLaunch",
    desc: `
      Minimises Obsidian automatically whenever the app is launched. If the
      "Run in background" option is enabled, windows will be hidden to the system
      tray/menubar instead of minimised to the taskbar/dock.
    `,
    type: "toggle",
    default: false,
  },
  {
    key: "runInBackground",
    desc: `
      Hides the app and continues to run it in the background instead of quitting
      it when pressing the window close button or toggle focus hotkey.
    `,
    type: "toggle",
    default: false,
    onChange: (plugin) => {
      setLaunchOnStartup(plugin);
      const runInBackground = plugin.settings.runInBackground;
      if (!runInBackground) showWindows();
    },
  },
  {
    key: "hideTaskbarIcon",
    desc: `
      Hides the window's icon from from the dock/taskbar. Enabling the tray icon first
      is recommended if using this option. This may not work on all Linux-based OSes.
    `,
    type: "toggle",
    default: false,
    onChange: setHideTaskbarIcon,
  },
  {
    key: "createTrayIcon",
    desc: `
      Adds an icon to your system tray/menubar to bring hidden Obsidian windows
      back into focus on click or force a full quit/relaunch of the app through
      the right-click menu.
      <br><span class="mod-warning">Changing this option requires a restart to take effect.</span>
    `,
    type: "toggle",
    default: true,
  },
  {
    key: "toggleWindowFocusHotkey",
    type: "hotkey",
    default: "CmdOrCtrl+Shift+Tab",
  },
  "Quick notes",
  {
    key: "quickNoteLocation",
    desc: "New quick notes will be placed in this folder.",
    type: "text",
    placeholder: "Example: notes/quick",
  },
  {
    key: "quickNoteDateFormat",
    desc: "New quick notes will use a filename of this pattern.",
    type: "moment",
    default: DEFAULT_DATE_FORMAT,
  },
  {
    key: "quickNoteHotkey",
    type: "hotkey",
    default: "CmdOrCtrl+Shift+Q",
  },
];

const keyToLabel = (key) =>
    key[0].toUpperCase() +
    key
      .slice(1)
      .split(/(?=[A-Z])/)
      .map((word) => word.toLowerCase())
      .join(" "),
  htmlToFragment = (html) =>
    document
      .createRange()
      .createContextualFragment((html ?? "").replace(/\s+/g, " "));

class SettingsTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    this.containerEl.empty();
    for (const opt of OPTIONS) {
      const setting = new obsidian.Setting(this.containerEl);
      if (typeof opt === "string") {
        setting.setName(opt);
        setting.setHeading();
      } else {
        if (opt.default) {
          opt.placeholder ??= `Example: ${opt.default}`;
        }
        if (opt.type === "hotkey") {
          opt.desc ??= "";
          opt.desc += ACCELERATOR_FORMAT;
          opt.onBeforeChange = unregisterHotkeys;
          opt.onChange = registerHotkeys;
        }
        if (opt.type === "moment") {
          opt.desc = `${opt.desc ? `${opt.desc}<br>` : ""}${MOMENT_FORMAT}`;
        }

        setting.setName(keyToLabel(opt.key));
        setting.setDesc(htmlToFragment(opt.desc));
        const onChange = async (value) => {
          await opt.onBeforeChange?.(this.plugin);
          this.plugin.settings[opt.key] = value;
          await this.plugin.saveSettings();
          await opt.onChange?.(this.plugin);
        };

        if (opt.type === "toggle") {
          setting.addToggle((toggle) => {
            toggle
              .setValue(this.plugin.settings[opt.key] ?? opt.default)
              .onChange(onChange);
          });
        } else if (opt.type === "moment") {
          setting.addMomentFormat((moment) => {
            const sampleEl = setting.descEl.createEl("b");
            sampleEl.className = "u-pop";
            moment
              .setPlaceholder(opt.placeholder)
              .setDefaultFormat(opt.default ?? "")
              .setValue(this.plugin.settings[opt.key] ?? opt.default ?? "")
              .setSampleEl(sampleEl)
              .onChange(onChange);
          });
        } else {
          setting.addText((text) => {
            text
              .setPlaceholder(opt.placeholder)
              .setValue(this.plugin.settings[opt.key] ?? opt.default ?? "")
              .onChange(onChange);
          });
        }
      }
    }
  }
}

class TrayPlugin extends obsidian.Plugin {
  async onload() {
    log(LOG_LOADING);
    await this.loadSettings();
    this.addSettingTab(new SettingsTab(this.app, this));
    const { settings } = this;

    registerHotkeys(this);
    setHideTaskbarIcon(this);
    setLaunchOnStartup(this);
    if (settings.createTrayIcon) createTrayIcon(this);
    if (settings.runInBackground) interceptWindowClose();
    if (settings.hideOnLaunch) {
      let _hidden;
      this.registerEvent(
        this.app.workspace.onLayoutReady(() => {
          if (_hidden) return;
          _hidden = true;
          hideWindows(settings.runInBackground);
        })
      );
    }

    // add as command: can be called from command palette
    // and can have non-global hotkey assigned via in-app menu
    this.addCommand({
      id: "relaunch-app",
      name: ACTION_RELAUNCH,
      callback: relaunchObsidian,
    });
  }
  onunload() {
    log(LOG_CLEANUP);
    unregisterHotkeys(this);
    cleanupWindowClose();
  }

  async loadSettings() {
    const DEFAULT_SETTINGS = OPTIONS.map((opt) => ({ [opt.key]: opt.default }));
    this.settings = Object.assign(...DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}
module.exports = TrayPlugin;
