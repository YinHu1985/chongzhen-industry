import { parseSave } from './storage.js';

export const SAVE_KEY = 'chongzhen-industry.save.v4';
export const MAX_SAVE_FILE_BYTES = 2 * 1024 * 1024;

// Reading the title-screen slot never creates or overwrites a campaign.
export function loadLocalSave(storage) {
  const raw = storage.getItem(SAVE_KEY);
  return raw === null ? null : parseSave(raw);
}

export function storeLocalSave(storage, state) {
  storage.setItem(SAVE_KEY, JSON.stringify({ state, savedAt: new Date().toISOString() }));
}

// Validate before the UI asks to replace the current campaign.
export async function readSaveFile(file) {
  if (!file || file.size === 0) throw new Error('卷宗为空，请选择导出的 JSON 存档。');
  if (!Number.isFinite(file.size) || file.size > MAX_SAVE_FILE_BYTES) throw new Error('卷宗超过 2 MB，无法读取。');
  return parseSave(await file.text());
}
