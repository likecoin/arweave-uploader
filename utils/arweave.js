const Arweave = require('arweave/node');
const stringify = require('fast-json-stable-stringify');

const { getFileIPFSHash } = require('./ipfs');

const jwk = require('../arweave-key.json');

const arweave = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });

const IPFS_KEY = 'IPFS-Add';
const IPFS_CONSTRAINT_KEY = 'standard';
const IPFS_CONSTRAINT = 'v0.1';

async function getArIdFromIPFSHash(ipfsHash) {
  const res = await arweave.arql(
    {
      op: 'and',
      expr1: {
        op: 'equals',
        expr1: IPFS_KEY,
        expr2: ipfsHash,
      },
      expr2: {
        op: 'equals',
        expr1: IPFS_CONSTRAINT_KEY,
        expr2: IPFS_CONSTRAINT,
      },
    },
  );
  return res[0] || null;
}

function generateManifest(files) {
  const isIndexExists = !!files.find((f) => f.name === 'index.html');
  const list = files;
  const filePaths = list
    .filter((p) => p.name && p.arweaveId)
    .reduce((acc, p) => {
      acc[p.name] = {
        id: p.arweaveId,
      };
      return acc;
    }, {});
  const manifest = {
    manifest: 'arweave/paths',
    version: '0.1.0',
    index: isIndexExists ? {
      path: 'index.html',
    } : undefined,
    paths: filePaths,
  };
  return manifest;
}

function generateManifestFile(files) {
  const manifest = generateManifest(files);
  return {
    name: 'manifest',
    mimetype: 'application/x.arweave-manifest+json',
    buffer: Buffer.from(stringify(manifest), 'utf-8'),
  };
}

async function submitToArweave(file, ipfsHash = null) {
  const { buffer, mimetype } = file;
  const { data: anchorId } = await arweave.api.get('/tx_anchor');
  const tx = await arweave.createTransaction({ data: buffer, last_tx: anchorId }, jwk);
  if (mimetype) {
    tx.addTag('Content-Type', mimetype);
  }
  if (ipfsHash) {
    tx.addTag(IPFS_KEY, ipfsHash);
    tx.addTag(IPFS_CONSTRAINT_KEY, IPFS_CONSTRAINT);
  }
  await arweave.transactions.sign(tx, jwk);
  await arweave.transactions.post(tx);
  return tx.id;
}

async function uploadManifestFile(filesWithId) {
  const manifest = generateManifestFile(filesWithId);
  const manifestIPFSHash = await getFileIPFSHash(manifest);
  let arweaveId = await getArIdFromIPFSHash(manifestIPFSHash);
  if (!arweaveId) {
    arweaveId = await submitToArweave(manifest, manifestIPFSHash);
  }
  manifest.arweaveId = arweaveId;
  return { manifest, ipfsHash: manifestIPFSHash, arweaveId };
}

async function uploadFileToArweave(file, ipfsHash) {
  const hash = ipfsHash || await getFileIPFSHash(file);
  const id = await getArIdFromIPFSHash(ipfsHash);
  if (id) return id;
  const res = await submitToArweave(file, hash);
  return res;
}

async function uploadFilesToArweave(files, ipfsHash = null) {
  if (files.length === 1) {
    return uploadFileToArweave(files[0], ipfsHash);
  }

  const ipfsHashes = await Promise.all(files.map((f) => getFileIPFSHash(f)));
  const arweaveIds = await Promise.all(ipfsHashes.map((h) => getArIdFromIPFSHash(h)));
  if (!arweaveIds.some((id) => !id)) {
    const filesWithId = files.map((f, i) => ({ ...f, arweaveId: arweaveIds[i] }));
    const { manifest } = await uploadManifestFile(filesWithId);
    return manifest.arweaveId;
  }

  const filesWithId = [];
  for (let i = 0; i < files.length; i += 1) {
    /* eslint-disable no-await-in-loop */
    const f = files[i];
    const hash = await getFileIPFSHash(f);
    const arweaveId = await submitToArweave(f, hash);
    filesWithId.push({ ...f, arweaveId });
    /* eslint-enable no-await-in-loop */
  }
  const { manifest } = await uploadManifestFile(filesWithId);
  return manifest.arweaveId;
}

module.exports = {
  generateManifestFile,
  getArIdFromIPFSHash,
  uploadFilesToArweave,
};
