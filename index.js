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

const jwk = require('./arweave-key.json');

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

async function submitToArweave(buffer, mimetype, ipfsHash = null) {
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
  throw new Error(`Cannot get ${filename} from local directory or IPFS.`);
}

async function getMimeAndExt(filename, buffer) {
  if (verifyLocalFile(filename)) {
    const mime = MimeTypes.lookup(`upload/${filename}`);
    return { mime };
  }
  const { mime, ext } = await fromBuffer(buffer);
  return { mime, ext };
}

function handleHeader(input) {
  const header = [...input];
  if (!header.includes('filename')) { header.push('filename'); }
  if (!header.includes('ipfsHash')) { header.push('ipfsHash'); }
  if (!header.includes('arHash')) { header.push('arHash'); }
  return header;
}

async function handleData(input, { filenameIndex, ipfsHashIndex, arHashIndex }) {
  const data = [...input];
  const filename = data[filenameIndex];
  try {
    if (data[arHashIndex]) { return data; }
    const buffer = await getFileBuffer(filename, data[ipfsHashIndex]);
    const hasLocalFile = verifyLocalFile(filename);

    // check IPFS hash for local file
    if (hasLocalFile && data[ipfsHashIndex]) {
      const IPFSHash = await IPFSOnlyHash.of(buffer);
      if (data[ipfsHashIndex] !== IPFSHash) {
        data[ipfsHashIndex] = IPFSHash;
        // eslint-disable-next-line no-console
        console.log(`Update IPFS hash of ${filename}.`);
      }
    }

    // check if Arweave already has the file with the specified IPFS tags
    if (data[ipfsHashIndex]) {
      const arHash = await getArHashFromIPFSHash(data[ipfsHashIndex]);
      if (arHash) {
        data[ipfsHashIndex] = arHash;
        return data;
      }
    }

    let mime = null;
    let ext = '';
    try {
      ({ mime, ext } = await getMimeAndExt(filename, buffer));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Cannot get mime type, will ignore mime tag when uploading to Arweave.');
    }
    data[arHashIndex] = await submitToArweave(buffer, mime, data[ipfsHashIndex]);

    // save file to local directory if there is no local file
    if (!hasLocalFile) {
      const savingName = `${data[arHashIndex]}.${ext}`;
      const savingPath = `upload/${savingName}`;
      fs.writeFileSync(savingPath, buffer);
      data[filenameIndex] = savingName;
    }
    // eslint-disable-next-line no-console
    console.log(`- ${data[filenameIndex]} ${data[arHashIndex]}`);
    return data;
  } catch ({ message }) {
    // eslint-disable-next-line no-console
    console.error(message);
    return data;
  }
}

async function run() {
  const inputBuffer = fs.readFileSync(INPUT_FILE_NAME);
  const input = parseCSV(inputBuffer);

  const header = handleHeader(input[0]);
  fs.appendFileSync(OUTPUT_FILE_NAME, stringifyCSV([header]));

  const filenameIndex = header.indexOf('filename');
  const ipfsHashIndex = header.indexOf('ipfsHash');
  const arHashIndex = header.indexOf('arHash');
  /* eslint-disable no-await-in-loop */
  for (let i = 1; i < input.length; i += 1) {
    const data = await handleData(input[i], { filenameIndex, ipfsHashIndex, arHashIndex });
    fs.appendFileSync(OUTPUT_FILE_NAME, stringifyCSV([data]));
  }
  /* eslint-enable no-await-in-loop */
}

run();
