/**
 * Editor Console Toolkit 的图标: 底座 + 控制台提示符 chevron + 光标条。
 *
 * 只描述图形, 不做渲染; SVG 与 PNG 都由 `scripts/gen-icon.mjs` 从这份数据生成。
 */
import { ACCENT_FROM, ACCENT_TO, FOREGROUND, SIZE, baseShapes } from './lib/icon-brand.mjs';

/** chevron 顶点: 左上 → 中右 → 左下。 */
const CHEVRON = [
  [80, 84],
  [132, 128],
  [80, 172],
];

export const spec = {
  size: SIZE,
  label: 'Editor Console Toolkit',
  shapes: [
    ...baseShapes(),
    {
      kind: 'polyline',
      points: CHEVRON,
      stroke: { kind: 'linear', from: ACCENT_FROM, to: ACCENT_TO, direction: 'vertical' },
      strokeWidth: 22,
    },
    { kind: 'roundedRect', x: 148, y: 156, w: 68, h: 18, r: 9, fill: FOREGROUND },
  ],
};
