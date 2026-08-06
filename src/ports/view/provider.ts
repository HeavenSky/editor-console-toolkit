import { homedir, userInfo } from 'node:os';

import * as vscode from 'vscode';

import { annotateKillability, applyFilters } from '../filter';
import { collectAncestors } from '../protect';
import { runCommand } from '../scan/exec';
import { scanPorts } from '../scan/index';
import type { ProcessEntry } from '../types';
import {
  CONTEXT_DETAIL,
  createDetailItems,
  createErrorItem,
  createProcessItem,
  type PortItem,
} from './item';

/** 勾选目标; `command` 是勾选那一刻的完整命令行, 终止前用它校验 PID 没被复用。 */
export interface CheckedTarget {
  pid: number;
  expectedCommand: string;
  name: string;
}

export interface PortsView extends vscode.Disposable {
  refresh(): void;
  setSearch(search: string): void;
  getSearch(): string;
  getCheckedTargets(): CheckedTarget[];
  clearChecked(): void;
}

const CONFIG_SECTION = 'editorConsoleToolkit.ports';

function readConfig() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    refreshInterval: config.get<number>('refreshInterval', 5000),
    hideSystemProcesses: config.get<boolean>('hideSystemProcesses', true),
    systemPortMax: config.get<number>('systemPortMax', 1024),
    includeUdp: config.get<boolean>('includeUdp', false),
  };
}

/**
 * 监听进程视图。
 *
 * 三件需要小心的事:
 * - **勾选态必须自己存**。`checkboxState` 是 `TreeItem` 上的属性, 而每次刷新都会重建全部
 *   TreeItem; 不自己存一份并回填, 用户勾到一半就会被下一轮刷新清空。
 * - **计时器只在视图可见时跑**。这样侧边栏没打开时是真正的零开销, 尽可能保住插件原本
 *   "无后台负担"的承诺。
 * - **扫描失败渲染成列表里的一行**, 不弹通知; 轮询下每轮弹一次会把编辑器淹掉。
 */
export function createPortsView(context: vscode.ExtensionContext): PortsView {
  const changeEmitter = new vscode.EventEmitter<void>();

  let entries: ProcessEntry[] = [];
  let scanError: string | undefined;
  let search = '';
  /** pid → 勾选那一刻的命令行。 */
  const checked = new Map<number, CheckedTarget>();
  let protectedPids: ReadonlySet<number> = new Set<number>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let scanning = false;

  const home = homedir();
  const currentUser = (() => {
    try {
      return userInfo().username;
    } catch {
      return '';
    }
  })();

  const workspaceFolders = () =>
    (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);

  const provider: vscode.TreeDataProvider<PortItem> = {
    onDidChangeTreeData: changeEmitter.event,

    getTreeItem: (element) => element,

    getChildren: (element) => {
      if (element) {
        if (!element.entry || element.contextValue === CONTEXT_DETAIL) return [];
        return createDetailItems(element.entry, home);
      }

      if (scanError) return [createErrorItem(scanError)];

      const config = readConfig();
      const visible = applyFilters(entries, {
        workspaceFolders: workspaceFolders(),
        hideSystemProcesses: config.hideSystemProcesses,
        systemPortMax: config.systemPortMax,
        search,
      });

      return visible.map((entry) =>
        createProcessItem(entry, {
          home,
          checked: entry.pid !== null && checked.has(entry.pid),
        })
      );
    },
  };

  const view = vscode.window.createTreeView('editorConsoleToolkit.ports.view', {
    treeDataProvider: provider,
    showCollapseAll: true,
    manageCheckboxStateManually: true,
  });

  async function scan(): Promise<void> {
    // 上一轮还没跑完就跳过这一轮, 否则慢扫描会不断堆叠子进程调用。
    if (scanning) return;
    scanning = true;
    try {
      const result = await scanPorts({ includeUdp: readConfig().includeUdp });
      scanError = result.error;
      entries = annotateKillability(result.entries, protectedPids, currentUser);

      // 已经消失的进程不该继续留在勾选集合里。
      const alive = new Set(entries.map((entry) => entry.pid));
      for (const pid of [...checked.keys()]) {
        if (!alive.has(pid)) checked.delete(pid);
      }

      changeEmitter.fire();
    } finally {
      scanning = false;
    }
  }

  function restartTimer(): void {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
    const interval = readConfig().refreshInterval;
    if (!view.visible || interval <= 0) return;
    timer = setInterval(() => void scan(), interval);
  }

  view.onDidChangeCheckboxState(({ items }) => {
    for (const [item, state] of items) {
      const entry = item.entry;
      if (!entry || entry.pid === null) continue;
      if (state === vscode.TreeItemCheckboxState.Checked) {
        checked.set(entry.pid, {
          pid: entry.pid,
          expectedCommand: entry.command,
          name: entry.name,
        });
      } else {
        checked.delete(entry.pid);
      }
    }
  });

  view.onDidChangeVisibility(({ visible }) => {
    restartTimer();
    if (visible) void scan();
  });

  vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration(CONFIG_SECTION)) return;
    restartTimer();
    changeEmitter.fire();
  }, undefined, context.subscriptions);

  // 编辑器自身的祖先链只需在启动时算一次: 这条链在窗口生命周期内不会变。
  void collectAncestors(process.pid, runCommand)
    .then((pids) => {
      protectedPids = pids;
    })
    .finally(() => void scan());

  restartTimer();

  return {
    refresh: () => void scan(),
    setSearch: (value) => {
      search = value;
      changeEmitter.fire();
    },
    getSearch: () => search,
    getCheckedTargets: () => [...checked.values()],
    clearChecked: () => {
      checked.clear();
      changeEmitter.fire();
    },
    dispose: () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      checked.clear();
      changeEmitter.dispose();
      view.dispose();
    },
  };
}
