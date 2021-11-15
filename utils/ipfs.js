const { create } = require('ipfs-http-client');
const { extract } = require('it-tar');
const { pipe } = require('it-pipe');
const toBuffer = require('it-to-buffer');
const axios = require('axios');
const map = require('it-map');
const all = require('it-all');
const IPFSOnlyHash = require('ipfs-only-hash');
const { HttpsAgent } = require('agentkeepalive');

const IPFS_GATEWAY_LIST = [
  'https://ipfs.io/ipfs/',
  'https://infura-ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
];

const IPFS_TIMEOUT = 61000; // 1min

const ipfs = create({
  url: 'https://ipfs.infura.io:5001/api/v0',
  timeout: IPFS_TIMEOUT,
  agent: new HttpsAgent({
    timeout: IPFS_TIMEOUT,
  }),
});

async function triggerIPFSGet(ipfsHash) {
  // hacky function to try to speed up ipfs retrieval
  IPFS_GATEWAY_LIST.map(async (g) => {
    try { await axios.get(`${g}${ipfsHash}`, { timeout: IPFS_TIMEOUT }); } catch (_) { /* no op */ }
  });
}

async function* tarballed(source) {
  yield* pipe(
    source,
    extract(),
    // eslint-disable-next-line func-names
    async function* (src) {
      // eslint-disable-next-line no-restricted-syntax
      for await (const entry of src) {
        const { name } = entry.header;
        console.log(`IPFS file: ${name} found`);
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
    console.log(`Querying ${ipfsHash} from IPFS node...`);
    triggerIPFSGet(ipfsHash);
    const output = await pipe(
      ipfs.get(ipfsHash),
      tarballed,
      collect,
    );
    return output;
  } catch (err) {
    console.error(err);
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
