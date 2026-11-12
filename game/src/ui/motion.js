import { reduceMotion } from './settings.js';

const CONFIG_KEYS = new Set(['targets', 'duration', 'delay', 'ease', 'yoyo', 'repeat', 'repeatDelay', 'hold', 'loop',
  'onStart', 'onUpdate', 'onYoyo', 'onRepeat', 'onComplete', 'paused', 'props', 'callbackScope']);

/**
 * scene.tweens.add, unless the Reduce motion option is on: then the targets jump straight to their end
 * values (a yoyo tween, which ends where it started, changes nothing) and onComplete still runs.
 * Returns the tween, or null when skipped.
 */
export function tween(scene, cfg) {
  if (!reduceMotion()) return scene.tweens.add(cfg);
  const targets = Array.isArray(cfg.targets) ? cfg.targets : [cfg.targets];
  if (!cfg.yoyo) {
    for (const [k, v] of Object.entries(cfg)) {
      if (CONFIG_KEYS.has(k)) continue;
      const end = v && typeof v === 'object' && 'to' in v ? v.to : v;
      if (typeof end === 'number') for (const t of targets) if (t && t.active !== false) t[k] = end;
    }
  }
  if (cfg.onComplete) cfg.onComplete();
  return null;
}
