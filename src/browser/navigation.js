export function lessonHref(id, step = 0) {
  return `#/${id}/${step + 1}`;
}

export function getRoute(hash, lessons) {
  const match = /^#\/([a-z0-9-]+)(?:\/(\d+))?\/?$/.exec(hash);
  const index = lessons.findIndex(lesson => lesson.id === match?.[1]);
  if (index < 0) return { lesson: lessons[0], index: 0, step: 0 };
  const lesson = lessons[index];
  const step = Math.min(lesson.steps.length, Math.max(1, Number(match[2] ?? 1))) - 1;
  return { lesson, index, step };
}
