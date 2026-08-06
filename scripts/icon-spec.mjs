/**
 * Editor Console Toolkit 的图标: 一个终端窗口, 里面两行输出, 底下三盏状态灯。
 *
 * 两块功能各有对应: 窗口与输出行是 console 语句的插入与开关, 三盏灯是本地端口上进程的
 * 运行状态。刻意不用 `>` 提示符 —— 同目录的 Editor Lang Toolkit 已经用了那个符号,
 * 两个插件并排出现在扩展列表里时必须一眼能分开。
 *
 * 前景不用单一前景色: 灯本来就是靠颜色区分状态的, 图标里也照此表达。
 *
 * 只描述图形, 不做渲染; SVG 与 PNG 都由 `scripts/gen-icon.mjs` 从这份数据生成。
 */
import { SIZE, baseShapes } from './lib/icon-brand.mjs';

/** 窗口边框用标点色, 与里面的内容拉开层次。 */
const FRAME = '#C792EA';
/** 被注释掉的那一行: 压暗而不是隐藏, 保留"这里有东西"的线索。 */
const MUTED = '#5A6274';
const ACTIVE = '#6FD6FF';

/** 三盏灯沿用运行 / 警告 / 已停止的惯用色。 */
const RUNNING = '#4EDD6E';
const WARNING = '#FFC145';
const STOPPED = '#FF6B60';

const line = (x1, y, x2, stroke) => ({
  kind: 'polyline',
  points: [
    [x1, y],
    [x2, y],
  ],
  stroke,
  strokeWidth: 10,
});

const lamp = (cx, fill) => ({ kind: 'circle', cx, cy: 162, r: 9, fill });

export const spec = {
  size: SIZE,
  label: 'Editor Console Toolkit',
  shapes: [
    ...baseShapes(),

    // 终端窗口
    {
      kind: 'roundedRectStroke',
      x: 52,
      y: 62,
      w: 152,
      h: 132,
      r: 20,
      stroke: FRAME,
      strokeWidth: 11,
    },

    // 两行输出: 一行被注释掉, 一行生效
    line(76, 96, 180, MUTED),
    line(76, 128, 150, ACTIVE),

    // 端口状态灯
    lamp(76, RUNNING),
    lamp(106, WARNING),
    lamp(136, STOPPED),
  ],
};
