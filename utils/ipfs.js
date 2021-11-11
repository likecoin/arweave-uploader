const { create } = require('ipfs-http-client');
const { extract } = require('it-tar');
const { pipe } = require('it-pipe');
const toBuffer = require('it-to-buffer');
const map = require('it-map');
const all = require('it-all');
const IPFSOnlyHash = require('ipfs-only-hash');

const ipfs = create({ url: 'https://ipfs.infura.io:5001/api/v0' });

async function* tarballed(source) {
  yield* pipe(
    source,
    extract(),
    // eslint-disable-next-line func-names
    async function* (src) {
      // eslint-disable-next-line no-restricted-syntax
      for await (const entry of src) {
        yield {
          ...entry,
          name: entry.header.name,
          buffer: await toBuffer(map(entry.body, (buf) => buf.slice())),
        };
      }
    },
  );
}

async function collect(source) {
  return all(source);
}

async function loadFileFromIPFS(ipfsHash) {
  try {
    const output = await pipe(
      ipfs.get(ipfsHash),
      tarballed,
      collect,
    );
    return output;
  } catch (error) {
    throw new Error(`Cannot get file from IPFS: ${ipfsHash}`);
  }
}

async function uploadFilesToIPFS(files, { onlyHash = true } = {}) {
  const directoryName = 'tmp';
  const promises = ipfs.addAll(
    files.map((f) => ({
      content: f.buffer,
      path: `/${directoryName}/${f.name}`,
    })), { onlyHash },
  );
  const results = [];
  // eslint-disable-next-line no-restricted-syntax
  for await (const result of promises) {
    results.push(result);
  }
  let entry = results.find((r) => r.path === directoryName);
  if (!entry) {
    entry = results.find(((r) => r.path.endsWith('index.html')));
  }
  if (!entry) return '';
  const contentHash = entry.cid.toString();
  return contentHash;
}

async function getFileIPFSHash(file) {
  const ipfsHash = await IPFSOnlyHash.of(file.buffer);
  return ipfsHash;
}

async function getFolderIPFSHash(files) {
  const dagHash = await uploadFilesToIPFS(files, { onlyHash: true });
  return dagHash;
}

async function getIPFSHash(files) {
  if (files.length > 1) return getFolderIPFSHash(files);
  const [file] = files;
  const ipfsHash = await getFileIPFSHash(file);
  return ipfsHash;
}

module.exports = {
  ipfs,
  loadFileFromIPFS,
  getFileIPFSHash,
  getIPFSHash,
};
