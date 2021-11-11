const fs = require('fs');
const glob = require('glob-promise');
const { fromBuffer } = require('file-type');
const MimeTypes = require('mime-types');
const { basename } = require('path');

async function isPathDirectory(filepath) {
  return fs.lstatSync(filepath).isDirectory();
}

async function listFiles(filePath) {
  return glob(`${filePath}/**/*`);
}

async function loadFileFromLocal(filepath) {
  if (isPathDirectory(filepath)) {
    const fileList = await listFiles();
    const list = fileList.map((f) => ({
      name: f.replace(filepath, ''),
      buffer: fs.readFileSync(f),
    }));
    return list;
  }
  return {
    name: basename(filepath),
    buffer: fs.readFileSync(filepath),
  };
}

function verifyLocalFile(filename) {
  return filename && fs.existsSync(`upload/${filename}`);
}

async function getMimeAndExt(filename, buffer) {
  if (verifyLocalFile(filename)) {
    const mime = MimeTypes.lookup(`upload/${filename}`);
    return { mime };
  }
  const { mime, ext } = await fromBuffer(buffer);
  return { mime, ext };
}

function saveFileToLocal(file, arId, prefix = '') {
  const { name, ext, buffer } = file;
  const fileExt = ext ? `.${ext}` : '';
  const savingName = name || (arId + fileExt);
  let uploadBase = 'upload';
  if (prefix) uploadBase += `/${prefix}`;
  const savingPath = `${uploadBase}/${savingName}`;
  fs.writeFileSync(savingPath, buffer);
  return savingName;
}

function saveToLocal(files, arId) {
  if (files.length > 1) {
    const [savingName] = files.map((f) => saveFileToLocal(f, '', arId));
    return savingName;
  }
  const savingName = saveFileToLocal(files, arId);
  return savingName;
}

module.exports = {
  verifyLocalFile,
  loadFileFromLocal,
  isPathDirectory,
  getMimeAndExt,
  saveToLocal,
};
