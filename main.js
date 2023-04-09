/* obsidian-tray v0.2.0
   by @dragonwocky */

"use strict";

const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";

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
    console.log("obsidian-tray: showing windows");
    const windows = BrowserWindow.getAllWindows(),
      currentWindow = windows.find((win) => win.isFocused()) || windows[0];
    windows.forEach((win) => win.show());
    currentWindow.focus();
  },
  hideWindows = (runInBackground) => {
    console.log("obsidian-tray: hiding windows");
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

// let _onbeforeunload;
const onWindowClose = (event) => {
    event.stopImmediatePropagation();
    // event.preventDefault();
    console.log("obsidian-tray: intercepting window close");
    const windows = BrowserWindow.getAllWindows(),
      currentWindow = windows.find((win) => win.isFocused());
    currentWindow.hide();
  },
  interceptWindowClose = () => {
    // _onbeforeunload = window.onbeforeunload;
    // window.onbeforeunload = onWindowClose;
    const closeBtn = document.querySelector(".mod-close");
    closeBtn.addEventListener("click", onWindowClose, true);
  },
  cleanupWindowClose = () => {
    // window.onbeforeunload = _onbeforeunload;
    const closeBtn = document.querySelector(".mod-close");
    closeBtn.removeEventListener("click", onWindowClose, true);
  };

const addQuickNote = (plugin) => {
    const { quickNoteLocation, quickNoteDateFormat } = plugin.settings,
      format = quickNoteDateFormat || DEFAULT_DATE_FORMAT,
      date = obsidian.moment().format(format),
      name = obsidian
        .normalizePath(`${quickNoteLocation ?? ""}/${date}`)
        .replace(/\*|"|\\|<|>|:|\||\?/g, "-");
    plugin.app.fileManager.createAndOpenMarkdownFile(name);
    showWindows();
  },
  setHideTaskbarIcon = (plugin) => {
    const win = getCurrentWindow();
    win.setSkipTaskbar(plugin.settings.hideTaskbarIcon);
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

const createTrayIcon = (plugin) => {
  console.log("obsidian-tray: creating tray icon");
  const obsidianIcon = nativeImage.createFromDataURL(
      // 16x16 base64 obsidian icon: generated from obsidian.asar/icon.png
      `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAHZSURBVDhPlZKxTxRBFMa/XZcF7nIG7mjxjoRCwomJxgsFdhaASqzQxFDzB1AQKgstLGxIiBQGJBpiCCGx8h+wgYaGgAWNd0dyHofeEYVwt/PmOTMZV9aDIL/s5pvZvPfN9yaL/+HR3eXcypta0m4juFbP5GHuXc9IbunDFc9db/G81/ZzhDMN7g8td47mll4R5BfHwZN4LOaA+fHa259PbUmIYzWkt3e2NZNo3/V9v1vvU6kkstk+tLW3ItUVr/m+c3N8MlkwxYqmBFcbwUQQCNOcyVzDwEAWjuPi5DhAMV/tKOYPX5hCyz8Gz1zX5SmWjBvZfmTSaRBJkGAIoxJHv+pVW2yIGNxOJ8bUVNcFEWLxuG1ia6JercTbttwQTeDwPS0kCMXiXtgk/jQrFUw7ptYSMWApF40yo/ytjHq98fdk3ayVE+cn2CxMb6ruz9qAJKFUKoWza1VJSi/n0+ffgYHdWW2gHuxXymg0gjCB0sjpmiaDnkL3RzDyzLqBUKns2ztQqUR0fk2TwSrGSf1eczqF5vsPZRCQSSAFLk6gqctgQRkc6TWRQLV2YMYQki9OoNkqzFQ9r+WOGuW5CrJbOzyAlPKr6MSGLbkcDwbf35oY/jRkt6cAfgNwowruAMz9AgAAAABJRU5ErkJggg==`
    ),
    contextMenu = Menu.buildFromTemplate([
      {
        type: "normal",
        label: "Add Quick Note",
        accelerator: plugin.settings.quickNoteHotkey,
        click: () => addQuickNote(plugin),
      },
      {
        type: "normal",
        label: "Open Obsidian",
        accelerator: plugin.settings.toggleWindowFocusHotkey,
        click: showWindows,
      },
      {
        type: "normal",
        label: "Hide Obsidian",
        accelerator: plugin.settings.toggleWindowFocusHotkey,
        click: hideWindows,
      },
      { type: "separator" },
      {
        label: "Relaunch Obsidian",
        click: relaunchObsidian,
      },
      {
        label: "Quit Obsidian",
        role: "quit",
      },
    ]);
  tray = new Tray(obsidianIcon);
  tray.setContextMenu(contextMenu);
  tray.setToolTip("Obsidian");
  tray.on("click", () => toggleWindows(plugin.settings.runInBackground, false));
};

const registerHotkeys = (plugin) => {
    console.log("obsidian-tray: registering hotkey");
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
    console.log("obsidian-tray: unregistering hotkey");
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

const acceleratorFormat = `
    This hotkey is registered globally and will be detected even if Obsidian does
    not have keyboard focus. Format:
    <a href="https://www.electronjs.org/docs/latest/api/accelerator" target="_blank" rel="noopener">
    Electron accelerator</a>
  `,
  momentFormat = `
    Format:
    <a href="https://momentjs.com/docs/#/displaying/format/" target="_blank" rel="noopener">
    Moment.js format string</a>
    <br>Preview:
  `;
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
          opt.desc += acceleratorFormat;
          opt.onBeforeChange = unregisterHotkeys;
          opt.onChange = registerHotkeys;
        }
        if (opt.type === "moment") {
          opt.desc = `${opt.desc ? `${opt.desc}<br>` : ""}${momentFormat}`;
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
    console.log("obsidian-tray: loading");
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
  }
  onunload() {
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
