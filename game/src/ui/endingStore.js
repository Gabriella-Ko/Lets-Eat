// The ending plays once (Gabriella, 2026-11-23): this flag stops it repeating; Reset progress clears it.
export const ENDING_KEY = 'lets-eat-ending-seen-v1';
let memory = false; // fallback when storage is blocked

export function endingSeen() {
  try {
    return memory || localStorage.getItem(ENDING_KEY) === '1';
  } catch {
    return memory;
  }
}

export function markEndingSeen() {
  memory = true;
  try {
    localStorage.setItem(ENDING_KEY, '1');
  } catch {
    /* storage blocked: the in-memory flag covers this visit */
  }
}

export function clearEndingSeen() {
  memory = false;
  try {
    localStorage.removeItem(ENDING_KEY);
  } catch {
    /* storage blocked: nothing saved to clear */
  }
}
