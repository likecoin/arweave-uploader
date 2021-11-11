const fs = require('fs');
const { fromBuffer } = require('file-type');
const MimeTypes = require('mime-types');

function verifyLocalFile(filename) {
  return filename && fs.existsSync(`upload/${filename}`);
}

async function loadFileFromLocal(filepath) {
  return fs.readFileSync(filepath);
}

async function isPathDirectory(filepath) {
  return fs.lstatSync(filepath).isDirectory();
}

async function getMimeAndExt(filename, buffer) {
  if (verifyLocalFile(filename)) {
    const mime = MimeTypes.lookup(`upload/${filename}`);
    return { mime };
  }
  const { mime, ext } = await fromBuffer(buffer);
  return { mime, ext };
}

module.exports = {
  verifyLocalFile,
  loadFileFromLocal,
  isPathDirectory,
  getMimeAndExt,
};
