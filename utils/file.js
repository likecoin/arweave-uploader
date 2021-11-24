const fs = require('fs');
const glob = require('glob-promise');
const { fromBuffer } = require('file-type');
const MimeTypes = require('mime-types');
const { basename, dirname } = require('path');

async function isPathDirectory(filepath) {
  return fs.lstatSync(filepath).isDirectory();
}

async function listFiles(filePath) {
  return glob(`${filePath}/**/*`);
}

async function loadFileFromLocal(filepath) {
  const isDir = await isPathDirectory(filepath);
  if (isDir) {
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
  let mime;
  if (verifyLocalFile(filename)) {
    mime = MimeTypes.lookup(`upload/${filename}`);
    if (mime) return { mime };
  }
  if (buffer) {
    let ext;
    try {
      ({ mime, ext } = await fromBuffer(buffer));
    } catch (err) {
      // no op
    }
    if (mime) {
      return { mime, ext };
    }
  }
  // by string
  if (filename) mime = MimeTypes.lookup(filename);
  return mime ? { mime } : {};
}

function saveFileToLocal(file, arId, prefix = '') {
  const { name, ext, buffer } = file;
  const fileExt = ext ? `.${ext}` : '';
  const savingName = name || (arId + fileExt);
  let uploadBase = 'upload';
  if (prefix) {
    uploadBase += `/${prefix}`;
  }
  const savingPath = `${uploadBase}/${savingName}`;
  const dirName = dirname(savingPath);
  if (dirName) {
    if (!fs.existsSync(dirName)) {
      try {
        fs.mkdirSync(dirName, { recursive: true });
      } catch (err) {
        console.error(err);
      }
    }
  }
  fs.writeFileSync(savingPath, buffer);
  return savingName;
}

function saveToLocal(files, arId) {
  if (files.length > 1) {
    // Use parent arId as file prefix, leave id empty to use original filename
    files.map((f) => saveFileToLocal(f, '', arId));
    return arId;
  }
  const [file] = files;
  const savingName = saveFileToLocal(file, arId);
  return savingName;
}

module.exports = {
  verifyLocalFile,
  loadFileFromLocal,
  isPathDirectory,
  getMimeAndExt,
  saveToLocal,
};
