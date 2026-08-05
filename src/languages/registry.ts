import { csharpAdapter } from './adapters/csharp';
import { dartAdapter } from './adapters/dart';
import { elixirAdapter } from './adapters/elixir';
import { javaAdapter } from './adapters/java';
import { javascriptAdapter } from './adapters/javascript';
import { kotlinAdapter } from './adapters/kotlin';
import { luaAdapter } from './adapters/lua';
import { phpAdapter } from './adapters/php';
import { pythonAdapter } from './adapters/python';
import { rubyAdapter } from './adapters/ruby';
import { rustAdapter } from './adapters/rust';
import { swiftAdapter } from './adapters/swift';
import type { LanguageAdapter } from './languageAdapter';

const ADAPTERS: readonly LanguageAdapter[] = [
  javascriptAdapter,
  pythonAdapter,
  javaAdapter,
  kotlinAdapter,
  csharpAdapter,
  luaAdapter,
  rubyAdapter,
  phpAdapter,
  swiftAdapter,
  dartAdapter,
  rustAdapter,
  elixirAdapter
];

/** 模块加载时构建一次; 一个 languageId 只能映射到一个适配器. */
const REGISTRY: ReadonlyMap<string, LanguageAdapter> = (() => {
  const map = new Map<string, LanguageAdapter>();
  for (const adapter of ADAPTERS) {
    for (const languageId of adapter.languageIds) {
      const existing = map.get(languageId);
      if (existing) {
        throw new Error(`languageId "${languageId}" is claimed by both "${existing.id}" and "${adapter.id}"`);
      }
      map.set(languageId, adapter);
    }
  }
  return map;
})();

export function getAdapter(languageId: string): LanguageAdapter | undefined {
  return REGISTRY.get(languageId);
}
