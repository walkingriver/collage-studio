// @ts-check
// The .collage project file: a zip holding project.json and the original photos.
// Photos are stored without compression (JPEGs don't shrink). Pure; no DOM.

import { zipSync, unzipSync, strToU8, strFromU8 } from '../../vendor/fflate.js';
import { isProject, SCHEMA_VERSION } from '../model.js';

export const PROJECT_EXT = '.collage';
export const PROJECT_MIME = 'application/x-collage-studio';

/** @typedef {import('../model.js').Project} Project */

const EXT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/avif': 'avif' };

/**
 * @param {Project} doc
 * @param {Map<string, Uint8Array>} photoBytes  photo id → original file bytes
 * @returns {Uint8Array}
 */
export function packProject(doc, photoBytes) {
  /** @type {Record<string, any>} */
  const files = {
    'project.json': [strToU8(JSON.stringify(doc)), { level: 6 }],
  };
  for (const [id, meta] of Object.entries(doc.photos)) {
    const bytes = photoBytes.get(id);
    if (!bytes) throw new Error(`Missing photo data for ${meta.name}`);
    files[`photos/${id}.${EXT_BY_TYPE[meta.type] ?? 'bin'}`] = [bytes, { level: 0 }];
  }
  return zipSync(files);
}

/**
 * @param {Uint8Array} zipBytes
 * @returns {{doc: Project, photoBytes: Map<string, Uint8Array>}}
 */
export function unpackProject(zipBytes) {
  let files;
  try {
    files = unzipSync(zipBytes);
  } catch {
    throw new Error('This file is not a Collage Studio project.');
  }
  const json = files['project.json'];
  if (!json) throw new Error('This file is not a Collage Studio project.');
  const doc = JSON.parse(strFromU8(json));
  if (!isProject(doc)) throw new Error('This project file is damaged.');
  if (doc.schemaVersion > SCHEMA_VERSION) throw new Error('This project was made with a newer version of Collage Studio. Please update the app.');
  const photoBytes = new Map();
  for (const [name, bytes] of Object.entries(files)) {
    const m = /^photos\/([^/.]+)\.[a-z0-9]+$/.exec(name);
    if (m) photoBytes.set(m[1], bytes);
  }
  for (const id of Object.keys(doc.photos)) {
    if (!photoBytes.has(id)) throw new Error('This project file is missing some photos.');
  }
  return { doc, photoBytes };
}
