const fs = require('fs');
const parseCSV = require('csv-parse/lib/sync');
const stringifyCSV = require('csv-stringify/lib/sync');
const Arweave = require('arweave/node');
const IPFSOnlyHash = require('ipfs-only-hash');
const { create } = require('ipfs-http-client');
const all = require('it-all');
const { concat } = require('uint8arrays/concat');
const { fromBuffer } = require('file-type');
const MimeTypes = require('mime-types');

const jwk = require('./jwk.json');

const IPFS_KEY = 'IPFS-Add';
const IPFS_CONSTRAINT_KEY = 'standard';
const IPFS_CONSTRAINT = 'v0.1';
const INPUT_FILE_NAME = process.argv[2] || 'list.csv';
const OUTPUT_FILE_NAME = `output-${INPUT_FILE_NAME}`;

const ipfs = create({ url: 'https://ipfs.infura.io:5001/api/v0' });
const arweave = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });

async function getArHashFromIPFSHash(ipfsHash) {
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

async function createTx(buffer, mimetype, ipfsHash = null) {
  const { data: anchorId } = await arweave.api.get('/tx_anchor');
  const tx = await arweave.createTransaction({ data: buffer, last_tx: anchorId }, jwk);
  tx.addTag('Content-Type', mimetype);
  if (ipfsHash) {
    tx.addTag(IPFS_KEY, ipfsHash);
    tx.addTag(IPFS_CONSTRAINT_KEY, IPFS_CONSTRAINT);
  }
  return tx;
}

async function signAndPostTx(tx) {
  await arweave.transactions.sign(tx, jwk);
  await arweave.transactions.post(tx);
}

function verifyLocalFile(filename) {
  return filename && fs.existsSync(`upload/${filename}`);
}

async function loadFileFromLocal(filepath) {
  return fs.readFileSync(filepath);
}

async function loadFileFromIPFS(ipfsHash) {
  try {
    return concat(await all(ipfs.cat(ipfsHash)));
  } catch (error) {
    throw new Error(`Cannot get file from IPFS: ${ipfsHash}`);
  }
}

async function getFileBuffer(filename, ipfsHash) {
  if (verifyLocalFile(filename)) {
    return loadFileFromLocal(`upload/${filename}`);
  }
  if (ipfsHash) {
    return loadFileFromIPFS(ipfsHash);
  }
  throw new Error(`Cannot get ${filename}`);
}

async function getMimeAndExt(filename, buffer) {
  if (verifyLocalFile(filename)) {
    const mime = MimeTypes.lookup(`upload/${filename}`);
    return { mime };
  }
  const { mime, ext } = await fromBuffer(buffer);
  return { mime, ext };
}

async function run() {
  const inputBuffer = fs.readFileSync(INPUT_FILE_NAME);
  const input = parseCSV(inputBuffer);

  const header = [...input[0]];
  if (!header.includes('filename')) { throw new Error('filename field not found'); }
  if (!header.includes('ipfsHash')) { header.push('ipfsHash'); }
  if (!header.includes('arHash')) { header.push('arHash'); }
  const filenameIndex = header.indexOf('filename');
  const ipfsHashIndex = header.indexOf('ipfsHash');
  const arHashIndex = header.indexOf('arHash');
  fs.writeFileSync(OUTPUT_FILE_NAME, stringifyCSV([header]));

  /* eslint-disable no-await-in-loop */
  for (let i = 1; i < input.length; i += 1) {
    const data = [...input[i]];
    const filename = data[filenameIndex];
    try {
      if (data[arHashIndex]) { throw new Error(); } // silently skip
      const buffer = await getFileBuffer(filename, data[ipfsHashIndex]);
      const hasLocalFile = verifyLocalFile(filename);
      if (hasLocalFile) {
        const calculatedHash = await IPFSOnlyHash.of(buffer);
        if (data[ipfsHashIndex] !== calculatedHash) {
          data[ipfsHashIndex] = calculatedHash;
        }
      }

    if (data[ipfsHashIndex]) {
      const arHash = await getArHashFromIPFSHash(data[ipfsHashIndex]);
      if (arHash) {
        data[ipfsHashIndex] = arHash;
        return data;
      }
    }
      const { mime, ext } = await getMimeAndExt(filename, buffer);
      const tx = await createTx(buffer, mime, data[ipfsHashIndex]);
      await signAndPostTx(tx);
      const { id: arHash } = tx;
      data[arHashIndex] = arHash;

      if (!hasLocalFile) {
        const savingName = `${arHash}.${ext}`;
        const savingPath = `upload/${savingName}`;
        fs.writeFileSync(savingPath, buffer);
        data[filenameIndex] = savingName;
      }
      // eslint-disable-next-line no-console
      console.log(`- ${data[filenameIndex]} ${data[arHashIndex]}`);
    } catch ({ message }) {
      // eslint-disable-next-line no-console
      if (message) { console.error(message); }
    } finally {
      fs.appendFileSync(OUTPUT_FILE_NAME, stringifyCSV([data]));
    }
  }
  /* eslint-enable no-await-in-loop */
}

run();
