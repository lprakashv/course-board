import { escapeHtml as html } from '../../browser/diagrams.js';

const $ = id => document.getElementById(id);
const studio = $('studio');
const workspace = $('workspace');
const dialog = $('board-dialog');
const assets = new Map();
const invalidLessonIds = new Map();
const diagramTypes = { svg: 'svg', html: 'html', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', avif: 'image' };

let draft;
let savedIds = new Set();
let locationInCourse = { chapter: -1, lesson: null, step: 0 };
let dirty = false;
let board;
let boardStep;

function report(message = '') {
  $('error').textContent = message;
  $('error').hidden = !message;
}

function edit() {
  dirty = true;
  $('save-state').textContent = 'Unsaved changes';
  report();
}

function current() {
  const chapter = draft.manifest.chapters[locationInCourse.chapter];
  const lesson = draft.lessons.find(item => item.id === locationInCourse.lesson);
  return { chapter, lesson, step: lesson?.steps[locationInCourse.step] };
}

function control(action, label, attributes = '') {
  return `<button type="button" data-action="${action}" ${attributes}>${label}</button>`;
}

function field(label, name, value, { multiline = false, wide = false, readOnly = false, invalid = false } = {}) {
  const contents = html(value ?? '');
  const input = multiline ? `<textarea data-field="${name}" spellcheck="true">${contents}</textarea>`
    : `<input data-field="${name}" value="${contents}" ${readOnly ? 'readonly' : ''} ${invalid ? 'aria-invalid="true"' : ''}>`;
  return `<label class="field${wide ? ' wide' : ''}">${label}${input}</label>`;
}

function orderControls(entity, index, length) {
  return `<div class="actions">
    ${control(`earlier-${entity}`, '↑ Move earlier', index === 0 ? 'disabled' : '')}
    ${control(`later-${entity}`, '↓ Move later', index === length - 1 ? 'disabled' : '')}
    ${control(`remove-${entity}`, `Remove ${entity}`)}
  </div>`;
}

function outline() {
  const chapters = draft.manifest.chapters.map((chapter, index) => {
    const chapterCurrent = index === locationInCourse.chapter && !locationInCourse.lesson;
    return `<li>${control('select-chapter', html(chapter.title || 'Untitled chapter'), `data-index="${index}" ${chapterCurrent ? 'aria-current="page"' : ''}`)}
      ${chapter.lessons.length ? `<ul>${chapter.lessons.map(id => {
        const lesson = draft.lessons.find(item => item.id === id);
        const active = id === locationInCourse.lesson;
        return `<li>${control('select-lesson', html(lesson.title || 'Untitled lesson'), `data-index="${index}" data-id="${html(id)}" ${active ? 'aria-current="page"' : ''}`)}</li>`;
      }).join('')}</ul>` : ''}</li>`;
  });
  $('outline').innerHTML = chapters.length ? `<ul>${chapters.join('')}</ul>` : '<p class="hint">Add a chapter to start the outline.</p>';
  const settings = studio.querySelector('[data-action="settings"]');
  if (locationInCourse.chapter === -1) settings.setAttribute('aria-current', 'page');
  else settings.removeAttribute('aria-current');
}

function courseSettings() {
  const manifest = draft.manifest;
  const selected = manifest.preset ?? 'classic';
  return `<h1 tabindex="-1">Course settings</h1><section class="panel form-grid" aria-label="Course settings">
    ${field('Course title', 'manifest:title', manifest.title)}
    ${field('Course ID', 'manifest:id', manifest.id)}
    ${field('Description', 'manifest:description', manifest.description, { wide: true })}
    <label class="field">Built-in style<select data-field="manifest:preset">
      ${['Classic', 'Slate', 'Night'].map(name => `<option value="${name.toLowerCase()}" ${selected === name.toLowerCase() ? 'selected' : ''}>${name}</option>`).join('')}
    </select></label>
    ${field('Custom CSS path in public/', 'manifest:theme', manifest.theme)}
    <div class="actions wide"><label class="button file-button">Attach CSS<input data-upload="theme" type="file" accept=".css"></label></div>
  </section>`;
}

function chapterEditor(chapter) {
  const index = locationInCourse.chapter;
  return `<h1 tabindex="-1">Chapter</h1><section class="panel" aria-label="Chapter settings">
    ${field('Chapter title', 'chapter:title', chapter.title)}
    <div class="actions">${control('add-lesson', '+ Lesson', 'class="primary"')}</div>
    ${orderControls('chapter', index, draft.manifest.chapters.length)}
  </section>`;
}

function assetSource(path) {
  return assets.get(path)?.url ?? `/api/asset?path=${encodeURIComponent(path)}`;
}

function diagramEditor(spec) {
  const path = spec?.source ?? spec?.src;
  const filename = path?.split('/').at(-1);
  const kind = { excalidraw: 'Excalidraw scene', image: 'Image', svg: 'SVG image', html: 'HTML board', ascii: 'Text diagram', custom: 'Custom diagram' };
  const label = filename && !/^[a-f\d]{64}\./.test(filename) ? filename : kind[spec?.type];
  const preview = spec && ['image', 'svg', 'excalidraw'].includes(spec.type)
    ? `<div class="diagram-preview"><img src="${html(assetSource(spec.src))}" alt="${html(spec.alt)}"></div>` : '';
  return `<section class="panel" aria-labelledby="diagram-heading">
    <div class="panel-heading"><h2 id="diagram-heading">Whiteboard</h2></div>
    ${spec ? `
      <p class="board-path" title="${html(path ?? label)}">${html(label)}</p>${preview}
      ${field('Alternative text', 'diagram:alt', spec.alt)}
      ${field('Caption', 'diagram:caption', spec.caption)}
      ${spec.type === 'ascii' ? field('Diagram text', 'diagram:text', spec.text, { multiline: true }) : ''}
    ` : '<p class="hint">Draw a board or attach a diagram file.</p>'}
    <div class="actions">
      ${control('open-board', 'Open whiteboard')}
      <label class="button file-button">Attach diagram<input data-upload="diagram" type="file" accept=".svg,.png,.jpg,.jpeg,.gif,.webp,.avif,.html"></label>
      ${spec ? control('remove-diagram', 'Remove diagram') : ''}
    </div>
  </section>`;
}

function lessonEditor(chapter, lesson, step) {
  const index = locationInCourse.step;
  return `<p class="crumb">${html(chapter.title)}</p><h1 tabindex="-1">Lesson</h1>
    <section class="panel form-grid" aria-label="Lesson settings">
      ${field('Lesson title', 'lesson:title', lesson.title)}
      ${field('Lesson ID', 'lesson:id', invalidLessonIds.get(lesson) ?? lesson.id, {
        readOnly: savedIds.has(lesson.id), invalid: invalidLessonIds.has(lesson),
      })}
      ${field('Summary', 'lesson:summary', lesson.summary, { wide: true })}
      <div class="wide">${orderControls('lesson', chapter.lessons.indexOf(lesson.id), chapter.lessons.length)}</div>
    </section>
    <div class="step-bar">
      <nav class="step-tabs" aria-label="Steps">${lesson.steps.map((item, position) =>
        control('select-step', `${position + 1}. ${html(item.title || 'Untitled step')}`, `data-index="${position}" ${position === index ? 'aria-current="step"' : ''}`)).join('')}</nav>
      ${control('add-step', '+ Step')}
    </div>
    ${step ? `<div class="step-layout">
      <section class="panel" aria-labelledby="step-heading">
        <div class="panel-heading"><h2 id="step-heading">Step ${index + 1}</h2></div>
        ${field('Step title', 'step:title', step.title)}
        ${field('Step content (Markdown)', 'step:text', step.text, { multiline: true })}
        ${orderControls('step', index, lesson.steps.length)}
      </section>${diagramEditor(step.diagram)}
    </div>` : '<p class="panel hint">Add a step to write the lesson.</p>'}`;
}

function render(focus) {
  outline();
  const { chapter, lesson, step } = current();
  workspace.innerHTML = lesson ? lessonEditor(chapter, lesson, step) : chapter ? chapterEditor(chapter) : courseSettings();
  if (focus) (workspace.querySelector(focus) ?? workspace.querySelector('h1')).focus();
}

function select(chapter, lesson = null, step = 0, focus = 'h1') {
  locationInCourse = { chapter, lesson, step };
  render(focus);
}

function newLesson(chapter) {
  let number = draft.lessons.length + 1;
  while (savedIds.has(`lesson-${number}`) || draft.lessons.some(lesson => lesson.id === `lesson-${number}`)) number += 1;
  const lesson = { id: `lesson-${number}`, title: 'New lesson', steps: [{ title: 'First step', text: '' }] };
  chapter.lessons.push(lesson.id);
  draft.lessons.push(lesson);
  return lesson;
}

function move(list, index, offset) {
  const target = index + offset;
  [list[index], list[target]] = [list[target], list[index]];
  return target;
}

function changeOrder(action, chapter, lesson) {
  const [direction, entity] = action.split('-');
  const offset = direction === 'earlier' ? -1 : 1;
  const selected = locationInCourse;
  if (entity === 'chapter') selected.chapter = move(draft.manifest.chapters, selected.chapter, offset);
  if (entity === 'lesson') move(chapter.lessons, chapter.lessons.indexOf(lesson.id), offset);
  if (entity === 'step') selected.step = move(lesson.steps, selected.step, offset);
  edit();
  render(`[data-action="${action}"]:not(:disabled)`);
}

function remove(action, chapter, lesson) {
  const selected = locationInCourse;
  if (action === 'remove-step') {
    lesson.steps.splice(selected.step, 1);
    selected.step = Math.max(0, Math.min(selected.step, lesson.steps.length - 1));
  } else {
    const ids = lesson ? [lesson.id] : chapter.lessons;
    if (!window.confirm(lesson ? 'Remove this lesson from the course?' : 'Remove this chapter and its lessons from the course?')) return;
    draft.lessons = draft.lessons.filter(item => {
      if (!ids.includes(item.id)) return true;
      invalidLessonIds.delete(item);
      return false;
    });
    if (lesson) chapter.lessons = chapter.lessons.filter(id => id !== lesson.id);
    else draft.manifest.chapters.splice(selected.chapter, 1);
    selected.lesson = null;
    if (!lesson) selected.chapter = -1;
  }
  edit();
  render('h1');
}

studio.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, index, id } = button.dataset;
  const { chapter, lesson, step } = current();
  const selected = locationInCourse;
  switch (action) {
    case 'settings': return select(-1);
    case 'select-chapter': return select(Number(index));
    case 'select-lesson': return select(Number(index), id);
    case 'select-step': return select(selected.chapter, lesson.id, Number(index), '[data-field="step:title"]');
    case 'add-chapter':
      draft.manifest.chapters.push({ title: 'New chapter', lessons: [] });
      edit();
      return select(draft.manifest.chapters.length - 1, null, 0, '[data-field="chapter:title"]');
    case 'add-lesson': {
      const newItem = newLesson(chapter);
      edit();
      return select(selected.chapter, newItem.id, 0, '[data-field="lesson:title"]');
    }
    case 'add-step':
      lesson.steps.push({ title: 'New step', text: '' });
      edit();
      return select(selected.chapter, lesson.id, lesson.steps.length - 1, '[data-field="step:title"]');
    case 'open-board': return openBoard(step);
    case 'remove-diagram':
      delete step.diagram;
      edit();
      return render('[data-action="open-board"]');
    default:
      if (action.startsWith('remove-')) return remove(action, chapter, lesson);
      return changeOrder(action, chapter, lesson);
  }
});

studio.addEventListener('input', event => {
  const input = event.target;
  if (!input.dataset.field) return;
  const [group, key] = input.dataset.field.split(':');
  const { chapter, lesson, step } = current();
  if (group === 'lesson' && key === 'id') {
    const id = input.value.trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || draft.lessons.some(item => item !== lesson && item.id === id)) {
      invalidLessonIds.set(lesson, input.value);
      input.setAttribute('aria-invalid', 'true');
      edit();
      return;
    }
    invalidLessonIds.delete(lesson);
    input.removeAttribute('aria-invalid');
    chapter.lessons[chapter.lessons.indexOf(lesson.id)] = id;
    locationInCourse.lesson = id;
  }
  const fields = { manifest: draft.manifest, chapter, lesson, step, diagram: step?.diagram };
  fields[group][key] = key === 'id' ? input.value.trim() : input.value;
  if (group === 'lesson' || (group === 'chapter' && key === 'title')) outline();
  if (group === 'step' && key === 'title') {
    const selected = workspace.querySelector('[aria-current="step"]');
    selected.textContent = `${locationInCourse.step + 1}. ${input.value || 'Untitled step'}`;
  }
  if (group === 'diagram' && key === 'alt') {
    const image = workspace.querySelector('.diagram-preview img');
    if (image) image.alt = input.value;
  }
  edit();
});

async function addAsset(blob, type, extension) {
  if (!blob.size) throw new Error('The selected file is empty.');
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const path = `${type}/${hash}.${extension}`;
  if (!assets.has(path)) assets.set(path, { blob, url: URL.createObjectURL(blob) });
  return path;
}

function base64(blob) {
  return new Promise((done, reject) => {
    const reader = new FileReader();
    reader.onload = () => done(reader.result.split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function replaceDiagram(step, fields) {
  const { alt = '', caption } = step.diagram ?? {};
  step.diagram = { ...fields, alt, ...(caption ? { caption } : {}) };
  edit();
}

studio.addEventListener('change', async event => {
  const { target } = event;
  if (!target.dataset.upload || !target.files[0]) return;
  const file = target.files[0];
  const extension = file.name.split('.').pop().toLowerCase();
  const { step } = current();
  target.value = '';
  studio.inert = true;
  $('save').disabled = true;
  let focus;
  try {
    if (target.dataset.upload === 'theme') {
      if (extension !== 'css') throw new Error('Select a CSS file.');
      draft.manifest.theme = await addAsset(file, 'themes', extension);
      edit();
      focus = '[data-field="manifest:theme"]';
    } else {
      if (!Object.hasOwn(diagramTypes, extension)) throw new Error('Select a supported image, SVG, or HTML file.');
      const src = await addAsset(file, 'diagrams', extension);
      replaceDiagram(step, { type: diagramTypes[extension], src });
      focus = '[data-field="diagram:alt"]';
    }
  } catch (error) {
    report(error.message);
  } finally {
    studio.inert = false;
    $('save').disabled = false;
    if (focus) render(focus);
    else target.focus();
  }
});

async function result(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

function setDraft(value) {
  draft = value;
  invalidLessonIds.clear();
  savedIds = new Set(draft.lessons.map(item => item.id));
  dirty = false;
  $('save-state').textContent = draft.revision ? 'Saved to disk' : 'New course';
}

$('save').addEventListener('click', async () => {
  if (invalidLessonIds.size) {
    const [lesson] = invalidLessonIds.keys();
    const chapter = draft.manifest.chapters.findIndex(item => item.lessons.includes(lesson.id));
    select(chapter, lesson.id, 0, '[data-field="lesson:id"]');
    return report('Use a unique lesson ID with lowercase letters, digits, and single hyphens.');
  }
  $('save').disabled = true;
  studio.inert = true;
  $('save-state').textContent = 'Saving…';
  report();
  try {
    const { manifest, lessons, revision } = structuredClone(draft);
    const optional = (item, keys) => {
      for (const key of keys) if (typeof item[key] === 'string' && !item[key].trim()) delete item[key];
    };
    optional(manifest, ['description', 'theme']);
    const references = new Set([manifest.theme]);
    for (const lesson of lessons) {
      optional(lesson, ['summary']);
      for (const { diagram } of lesson.steps) {
        if (!diagram) continue;
        optional(diagram, ['caption']);
        references.add(diagram.src);
        references.add(diagram.source);
      }
    }
    const uploads = {};
    for (const path of references) {
      if (assets.has(path)) uploads[path] = await base64(assets.get(path).blob);
    }
    const response = await fetch('/api/course', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manifest, lessons, assets: uploads, revision }),
    });
    setDraft(await result(response));
    for (const { url } of assets.values()) URL.revokeObjectURL(url);
    assets.clear();
    render();
  } catch (error) {
    $('save-state').textContent = dirty ? 'Unsaved changes' : 'Save failed';
    report(error.message);
  } finally {
    studio.inert = false;
    $('save').disabled = false;
    $('save').focus();
  }
});

function boardStatus(message = '') {
  $('board-status').hidden = !message;
  $('board-status').textContent = message;
}

function boardReady(ready) {
  $('apply-board').disabled = !ready;
  $('scene-file').disabled = !ready;
}

async function openBoard(step) {
  boardStep = step;
  boardReady(false);
  boardStatus('Opening board…');
  dialog.showModal();
  const source = step.diagram?.source;
  try {
    window.EXCALIDRAW_ASSET_PATH = `${location.origin}/`;
    const { mountBoard } = await import('./board.js');
    let file = assets.get(source)?.blob;
    if (!dialog.open || boardStep !== step) return;
    board = mountBoard($('drawing'), () => boardReady(true));
    if (source && !file) {
      const response = await fetch(assetSource(source));
      if (!response.ok) throw new Error('Could not read the saved scene. Import its source to continue.');
      file = await response.blob();
    }
    if (!dialog.open || boardStep !== step) return;
    await board.load(file);
    boardStatus(step.diagram?.type === 'excalidraw' && !source ? 'Import the source file to edit the existing SVG board.' : '');
  } catch (error) {
    if (!dialog.open || boardStep !== step) return;
    boardStatus(error.message);
    $('scene-file').disabled = !board;
  }
}

$('scene-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || !board) return;
  const active = board;
  const canApply = !$('apply-board').disabled;
  boardReady(false);
  try {
    await active.load(file);
    if (board === active) boardStatus(`Imported ${file.name}.`);
  } catch (error) {
    if (board !== active) return;
    boardStatus(error.message);
    boardReady(canApply);
    $('scene-file').disabled = false;
  }
});

$('apply-board').addEventListener('click', async () => {
  const active = board;
  const step = boardStep;
  boardReady(false);
  try {
    const { scene, svg } = await active.exportBoard();
    const [source, src] = await Promise.all([addAsset(scene, 'diagrams', 'excalidraw'), addAsset(svg, 'diagrams', 'svg')]);
    if (board !== active || !dialog.open) return;
    dialog.close();
    replaceDiagram(step, { type: 'excalidraw', source, src });
    render('[data-field="diagram:alt"]');
  } catch (error) {
    if (board !== active) return;
    boardStatus(error.message);
    boardReady(true);
  }
});

$('close-board').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  board?.close();
  board = undefined;
  boardStep = undefined;
});

function confirmLeave(event) {
  if (dirty) event.preventDefault();
}
window.addEventListener('beforeunload', confirmLeave);

try {
  setDraft(await result(await fetch('/api/course')));
  const first = draft.manifest.chapters[0]?.lessons[0];
  if (first) locationInCourse = { chapter: 0, lesson: first, step: 0 };
  render();
  studio.inert = false;
  $('save').disabled = false;
} catch (error) {
  $('save-state').textContent = 'Could not open course';
  report(error.message);
}
