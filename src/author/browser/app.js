import { escapeHtml } from '../../browser/diagrams.js';

const byId = id => document.getElementById(id);
const studio = byId('studio');
const workspace = byId('workspace');
const dialog = byId('board-dialog');
const assets = new Map();
const invalidLessonIds = new Map();
const diagramTypes = { svg: 'svg', html: 'html', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', avif: 'image' };

let draft;
let savedLessonIds = new Set();
let selection = { chapterIndex: -1, lessonId: null, stepIndex: 0 };
let dirty = false;
let boardSession;

function showError(message = '') {
  byId('error').textContent = message;
  byId('error').hidden = !message;
}

function markEdited() {
  dirty = true;
  byId('save-state').textContent = 'Unsaved changes';
  showError();
}

function getSelection() {
  const chapter = draft.manifest.chapters[selection.chapterIndex];
  const lesson = draft.lessons.find(item => item.id === selection.lessonId);
  return { chapter, lesson, step: lesson?.steps[selection.stepIndex] };
}

function control(action, label, attributes = '') {
  return `<button type="button" data-action="${action}" ${attributes}>${label}</button>`;
}

function field(label, name, value, { multiline = false, wide = false, readOnly = false, invalid = false } = {}) {
  const contents = escapeHtml(value ?? '');
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

function renderOutline() {
  const chapters = draft.manifest.chapters.map((chapter, index) => {
    const chapterCurrent = index === selection.chapterIndex && !selection.lessonId;
    return `<li>${control('select-chapter', escapeHtml(chapter.title || 'Untitled chapter'), `data-index="${index}" ${chapterCurrent ? 'aria-current="page"' : ''}`)}
      ${chapter.lessons.length ? `<ul>${chapter.lessons.map(id => {
        const lesson = draft.lessons.find(item => item.id === id);
        const active = id === selection.lessonId;
        return `<li>${control('select-lesson', escapeHtml(lesson.title || 'Untitled lesson'), `data-index="${index}" data-id="${escapeHtml(id)}" ${active ? 'aria-current="page"' : ''}`)}</li>`;
      }).join('')}</ul>` : ''}</li>`;
  });
  byId('outline').innerHTML = chapters.length ? `<ul>${chapters.join('')}</ul>` : '<p class="hint">Add a chapter to start the outline.</p>';
  const settings = studio.querySelector('[data-action="settings"]');
  if (selection.chapterIndex === -1) settings.setAttribute('aria-current', 'page');
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
  const index = selection.chapterIndex;
  return `<h1 tabindex="-1">Chapter</h1><section class="panel" aria-label="Chapter settings">
    ${field('Chapter title', 'chapter:title', chapter.title)}
    <div class="actions">${control('add-lesson', '+ Lesson', 'class="primary"')}</div>
    ${orderControls('chapter', index, draft.manifest.chapters.length)}
  </section>`;
}

function assetPreviewUrl(path) {
  return assets.get(path)?.url ?? `/api/asset?path=${encodeURIComponent(path)}`;
}

function diagramEditor(spec) {
  const path = spec?.source ?? spec?.src;
  const filename = path?.split('/').at(-1);
  const kind = { excalidraw: 'Excalidraw scene', image: 'Image', svg: 'SVG image', html: 'HTML board', ascii: 'Text diagram', custom: 'Custom diagram' };
  const label = filename && !/^[a-f\d]{64}\./.test(filename) ? filename : kind[spec?.type];
  const preview = spec && ['image', 'svg', 'excalidraw'].includes(spec.type)
    ? `<div class="diagram-preview"><img src="${escapeHtml(assetPreviewUrl(spec.src))}" alt="${escapeHtml(spec.alt)}"></div>` : '';
  return `<section class="panel" aria-labelledby="diagram-heading">
    <div class="panel-heading"><h2 id="diagram-heading">Whiteboard</h2></div>
    ${spec ? `
      <p class="board-path" title="${escapeHtml(path ?? label)}">${escapeHtml(label)}</p>${preview}
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
  const index = selection.stepIndex;
  return `<p class="crumb">${escapeHtml(chapter.title)}</p><h1 tabindex="-1">Lesson</h1>
    <section class="panel form-grid" aria-label="Lesson settings">
      ${field('Lesson title', 'lesson:title', lesson.title)}
      ${field('Lesson ID', 'lesson:id', invalidLessonIds.get(lesson) ?? lesson.id, {
        readOnly: savedLessonIds.has(lesson.id), invalid: invalidLessonIds.has(lesson),
      })}
      ${field('Summary', 'lesson:summary', lesson.summary, { wide: true })}
      <div class="wide">${orderControls('lesson', chapter.lessons.indexOf(lesson.id), chapter.lessons.length)}</div>
    </section>
    <div class="step-bar">
      <nav class="step-tabs" aria-label="Steps">${lesson.steps.map((item, position) =>
        control('select-step', `${position + 1}. ${escapeHtml(item.title || 'Untitled step')}`, `data-index="${position}" ${position === index ? 'aria-current="step"' : ''}`)).join('')}</nav>
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

function renderEditor(focus) {
  renderOutline();
  const { chapter, lesson, step } = getSelection();
  workspace.innerHTML = lesson ? lessonEditor(chapter, lesson, step) : chapter ? chapterEditor(chapter) : courseSettings();
  if (focus) (workspace.querySelector(focus) ?? workspace.querySelector('h1')).focus();
}

function selectEditor(chapterIndex, lessonId = null, stepIndex = 0, focus = 'h1') {
  selection = { chapterIndex, lessonId, stepIndex };
  renderEditor(focus);
}

function addLesson(chapter) {
  let number = draft.lessons.length + 1;
  while (savedLessonIds.has(`lesson-${number}`) || draft.lessons.some(lesson => lesson.id === `lesson-${number}`)) number += 1;
  const lesson = { id: `lesson-${number}`, title: 'New lesson', steps: [{ title: 'First step', text: '' }] };
  chapter.lessons.push(lesson.id);
  draft.lessons.push(lesson);
  return lesson;
}

function moveItem(list, index, offset) {
  const target = index + offset;
  [list[index], list[target]] = [list[target], list[index]];
  return target;
}

function changeOrder(action, chapter, lesson) {
  const [direction, entity] = action.split('-');
  const offset = direction === 'earlier' ? -1 : 1;
  const selected = selection;
  if (entity === 'chapter') selected.chapterIndex = moveItem(draft.manifest.chapters, selected.chapterIndex, offset);
  if (entity === 'lesson') moveItem(chapter.lessons, chapter.lessons.indexOf(lesson.id), offset);
  if (entity === 'step') selected.stepIndex = moveItem(lesson.steps, selected.stepIndex, offset);
  markEdited();
  renderEditor(`[data-action="${action}"]:not(:disabled)`);
}

function removeItem(action, chapter, lesson) {
  const selected = selection;
  if (action === 'remove-step') {
    lesson.steps.splice(selected.stepIndex, 1);
    selected.stepIndex = Math.max(0, Math.min(selected.stepIndex, lesson.steps.length - 1));
  } else {
    const ids = lesson ? [lesson.id] : chapter.lessons;
    if (!window.confirm(lesson ? 'Remove this lesson from the course?' : 'Remove this chapter and its lessons from the course?')) return;
    draft.lessons = draft.lessons.filter(item => {
      if (!ids.includes(item.id)) return true;
      invalidLessonIds.delete(item);
      return false;
    });
    if (lesson) chapter.lessons = chapter.lessons.filter(id => id !== lesson.id);
    else draft.manifest.chapters.splice(selected.chapterIndex, 1);
    selected.lessonId = null;
    if (!lesson) selected.chapterIndex = -1;
  }
  markEdited();
  renderEditor('h1');
}

function handleEditorClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, index, id } = button.dataset;
  const { chapter, lesson, step } = getSelection();
  const selected = selection;
  switch (action) {
    case 'settings': return selectEditor(-1);
    case 'select-chapter': return selectEditor(Number(index));
    case 'select-lesson': return selectEditor(Number(index), id);
    case 'select-step': return selectEditor(selected.chapterIndex, lesson.id, Number(index), '[data-field="step:title"]');
    case 'add-chapter':
      draft.manifest.chapters.push({ title: 'New chapter', lessons: [] });
      markEdited();
      return selectEditor(draft.manifest.chapters.length - 1, null, 0, '[data-field="chapter:title"]');
    case 'add-lesson': {
      const newLesson = addLesson(chapter);
      markEdited();
      return selectEditor(selected.chapterIndex, newLesson.id, 0, '[data-field="lesson:title"]');
    }
    case 'add-step':
      lesson.steps.push({ title: 'New step', text: '' });
      markEdited();
      return selectEditor(selected.chapterIndex, lesson.id, lesson.steps.length - 1, '[data-field="step:title"]');
    case 'open-board': return openBoard(step);
    case 'remove-diagram':
      delete step.diagram;
      markEdited();
      return renderEditor('[data-action="open-board"]');
    case 'remove-chapter':
    case 'remove-lesson':
    case 'remove-step':
      return removeItem(action, chapter, lesson);
    default:
      if (action.startsWith('earlier-') || action.startsWith('later-')) changeOrder(action, chapter, lesson);
  }
}

function handleFieldInput(event) {
  const input = event.target;
  if (!input.dataset.field) return;
  const [group, key] = input.dataset.field.split(':');
  const { chapter, lesson, step } = getSelection();
  if (group === 'lesson' && key === 'id') {
    const id = input.value.trim();
    const used = savedLessonIds.has(id) || draft.lessons.some(item => item !== lesson && item.id === id);
    if (input.readOnly) return;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || used) {
      invalidLessonIds.set(lesson, input.value);
      input.setAttribute('aria-invalid', 'true');
      markEdited();
      return;
    }
    invalidLessonIds.delete(lesson);
    input.removeAttribute('aria-invalid');
    chapter.lessons[chapter.lessons.indexOf(lesson.id)] = id;
    selection.lessonId = id;
  }
  const fields = { manifest: draft.manifest, chapter, lesson, step, diagram: step?.diagram };
  fields[group][key] = key === 'id' ? input.value.trim() : input.value;
  if (group === 'lesson' || (group === 'chapter' && key === 'title')) renderOutline();
  if (group === 'step' && key === 'title') {
    const selected = workspace.querySelector('[aria-current="step"]');
    selected.textContent = `${selection.stepIndex + 1}. ${input.value || 'Untitled step'}`;
  }
  if (group === 'diagram' && key === 'alt') {
    const image = workspace.querySelector('.diagram-preview img');
    if (image) image.alt = input.value;
  }
  markEdited();
}

async function addAsset(blob, type, extension) {
  if (!blob.size) throw new Error('The selected file is empty.');
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const path = `${type}/${hash}.${extension}`;
  if (!assets.has(path)) assets.set(path, { blob, url: URL.createObjectURL(blob) });
  return path;
}

function encodeUpload(blob) {
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
  markEdited();
}

function setEditorBusy(busy) {
  studio.inert = busy;
  byId('save').disabled = busy;
}

async function handleAttachment(event) {
  const { target } = event;
  if (!target.dataset.upload || !target.files[0]) return;
  const file = target.files[0];
  const extension = file.name.split('.').pop().toLowerCase();
  const { step } = getSelection();
  target.value = '';
  setEditorBusy(true);
  let focus;
  try {
    if (target.dataset.upload === 'theme') {
      if (extension !== 'css') throw new Error('Select a CSS file.');
      draft.manifest.theme = await addAsset(file, 'themes', extension);
      markEdited();
      focus = '[data-field="manifest:theme"]';
    } else {
      if (!Object.hasOwn(diagramTypes, extension)) throw new Error('Select a supported image, SVG, or HTML file.');
      const src = await addAsset(file, 'diagrams', extension);
      replaceDiagram(step, { type: diagramTypes[extension], src });
      focus = '[data-field="diagram:alt"]';
    }
  } catch (error) {
    showError(error.message);
  } finally {
    setEditorBusy(false);
    if (focus) renderEditor(focus);
    else target.focus();
  }
}

async function readApiResponse(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

function setDraft(value) {
  draft = value;
  invalidLessonIds.clear();
  savedLessonIds = new Set(draft.lessons.map(item => item.id));
  dirty = false;
  byId('save-state').textContent = draft.revision ? 'Saved to disk' : 'New course';
}

function removeBlankFields(item, keys) {
  for (const key of keys) {
    if (typeof item[key] === 'string' && !item[key].trim()) delete item[key];
  }
}

async function prepareSaveRequest() {
  const { manifest, lessons, revision } = structuredClone(draft);
  removeBlankFields(manifest, ['description', 'theme']);
  const references = new Set([manifest.theme]);
  for (const lesson of lessons) {
    removeBlankFields(lesson, ['summary']);
    for (const { diagram } of lesson.steps) {
      if (!diagram) continue;
      removeBlankFields(diagram, ['caption']);
      references.add(diagram.src);
      references.add(diagram.source);
    }
  }
  const uploads = {};
  for (const path of references) {
    const asset = assets.get(path);
    if (asset) uploads[path] = await encodeUpload(asset.blob);
  }
  return { manifest, lessons, assets: uploads, revision };
}

async function saveCourse() {
  if (invalidLessonIds.size) {
    const [lesson] = invalidLessonIds.keys();
    const chapter = draft.manifest.chapters.findIndex(item => item.lessons.includes(lesson.id));
    selectEditor(chapter, lesson.id, 0, '[data-field="lesson:id"]');
    return showError('Use an unused lesson ID with lowercase letters, digits, and single hyphens.');
  }
  setEditorBusy(true);
  byId('save-state').textContent = 'Saving…';
  showError();
  try {
    const payload = await prepareSaveRequest();
    const response = await fetch('/api/course', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setDraft(await readApiResponse(response));
    for (const { url } of assets.values()) URL.revokeObjectURL(url);
    assets.clear();
    renderEditor();
  } catch (error) {
    byId('save-state').textContent = dirty ? 'Unsaved changes' : 'Save failed';
    showError(error.message);
  } finally {
    setEditorBusy(false);
    byId('save').focus();
  }
}

function showBoardStatus(message = '') {
  byId('board-status').hidden = !message;
  byId('board-status').textContent = message;
}

function setBoardReady(ready) {
  byId('apply-board').disabled = !ready;
  byId('scene-file').disabled = !ready;
}

async function openBoard(step) {
  clearBoardSession();
  const session = { step, editor: undefined, controller: new AbortController() };
  boardSession = session;
  setBoardReady(false);
  showBoardStatus('Opening board…');
  dialog.showModal();
  const source = step.diagram?.source;
  try {
    window.EXCALIDRAW_ASSET_PATH = `${location.origin}/`;
    const { mountBoard } = await import('./board.js');
    if (!isOpenBoard(session)) return;
    session.editor = mountBoard(byId('drawing'), () => {
      if (isOpenBoard(session)) setBoardReady(true);
    });
    let file = assets.get(source)?.blob;
    if (source && !file) {
      const response = await fetch(assetPreviewUrl(source), { signal: session.controller.signal });
      if (!response.ok) throw new Error('Could not read the saved scene. Import its source to continue.');
      file = await response.blob();
    }
    if (!isOpenBoard(session)) return;
    await session.editor.load(file);
    if (!isOpenBoard(session)) return;
    showBoardStatus(step.diagram?.type === 'excalidraw' && !source ? 'Import the source file to edit the existing SVG board.' : '');
  } catch (error) {
    if (!isOpenBoard(session)) return;
    showBoardStatus(error.message);
    byId('scene-file').disabled = !session.editor;
  }
}

function isOpenBoard(session) {
  return dialog.open && boardSession === session;
}

function clearBoardSession() {
  if (!boardSession) return;
  boardSession.controller.abort();
  boardSession.editor?.close();
  boardSession = undefined;
}

async function importBoardScene(event) {
  const file = event.target.files[0];
  event.target.value = '';
  const session = boardSession;
  if (!file || !session?.editor) return;
  const canApply = !byId('apply-board').disabled;
  setBoardReady(false);
  try {
    await session.editor.load(file);
    if (isOpenBoard(session)) showBoardStatus(`Imported ${file.name}.`);
  } catch (error) {
    if (!isOpenBoard(session)) return;
    showBoardStatus(error.message);
    setBoardReady(canApply);
    byId('scene-file').disabled = false;
  }
}

async function applyBoard() {
  const session = boardSession;
  if (!session?.editor) return;
  setBoardReady(false);
  try {
    const { scene, svg } = await session.editor.exportBoard();
    const [source, src] = await Promise.all([
      addAsset(scene, 'diagrams', 'excalidraw'),
      addAsset(svg, 'diagrams', 'svg'),
    ]);
    if (!isOpenBoard(session)) return;
    dialog.close();
    replaceDiagram(session.step, { type: 'excalidraw', source, src });
    renderEditor('[data-field="diagram:alt"]');
  } catch (error) {
    if (!isOpenBoard(session)) return;
    showBoardStatus(error.message);
    setBoardReady(true);
  }
}

async function openCourse() {
  try {
    setDraft(await readApiResponse(await fetch('/api/course')));
    const firstLessonId = draft.manifest.chapters[0]?.lessons[0];
    if (firstLessonId) selection = { chapterIndex: 0, lessonId: firstLessonId, stepIndex: 0 };
    renderEditor();
    setEditorBusy(false);
  } catch (error) {
    byId('save-state').textContent = 'Could not open course';
    showError(error.message);
  }
}

studio.addEventListener('click', handleEditorClick);
studio.addEventListener('input', handleFieldInput);
studio.addEventListener('change', handleAttachment);
byId('save').addEventListener('click', saveCourse);
byId('scene-file').addEventListener('change', importBoardScene);
byId('apply-board').addEventListener('click', applyBoard);
byId('close-board').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  // The close event can arrive after the user opens another board.
  if (!dialog.open) clearBoardSession();
});
window.addEventListener('beforeunload', event => {
  if (dirty) event.preventDefault();
});

await openCourse();
