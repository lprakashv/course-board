import { mkdir, rmdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function acquireProjectLock(root) {
  const lock = join(root, '.course-board-write-lock');
  try {
    await mkdir(lock);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const conflict = new Error('A build, import, or Studio save is active for this course. Try again after it finishes.');
    conflict.status = 409;
    throw conflict;
  }
  return () => rmdir(lock);
}
