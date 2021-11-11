const fs = require('fs');
const parseCSV = require('csv-parse/lib/sync');
const stringifyCSV = require('csv-stringify/lib/sync');
const IPFSOnlyHash = require('ipfs-only-hash');
const { verifyLocalFile, loadFileFromLocal, getMimeAndExt } = require('./utils/file');
const { loadFileFromIPFS } = require('./utils/ipfs');
const { getArIdFromIPFSHash, submitToArweave } = require('./utils/arweave');

const INPUT_FILE_NAME = process.argv[2] || 'list.csv';
const OUTPUT_FILE_NAME = `output-${INPUT_FILE_NAME}`;

async function getFileBuffer(filename, ipfsHash) {
  if (verifyLocalFile(filename)) {
    return loadFileFromLocal(`upload/${filename}`);
  }
  if (ipfsHash) {
    const ipfsTar = await loadFileFromIPFS(ipfsHash);
    return ipfsTar[0].buffer; // TODO support multi file
  }
  throw new Error(`Cannot get ${filename} from local directory or IPFS.`);
}

function handleHeader(input) {
  const header = [...input];
  if (!header.includes('filename')) { header.push('filename'); }
  if (!header.includes('ipfsHash')) { header.push('ipfsHash'); }
  if (!header.includes('arweaveId')) { header.push('arweaveId'); }
  return header;
}

async function handleData(input, { filenameIndex, ipfsHashIndex, arIdIndex }) {
  const data = [...input];
  data[ipfsHashIndex] = data[ipfsHashIndex] || '';
  data[arIdIndex] = data[arIdIndex] || '';
  const filename = data[filenameIndex];
  try {
    if (data[arIdIndex]) {
      // eslint-disable-next-line no-console
      console.log(`Skip file: ${filename}(${data[ipfsHashIndex]}) has been in Arweave: ${data[arIdIndex]}`);
      return data;
    }
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
      const arId = await getArIdFromIPFSHash(data[ipfsHashIndex]);
      if (arId) {
        data[arIdIndex] = arId;
        // eslint-disable-next-line no-console
        console.log(`Skip file: ${filename}(${data[ipfsHashIndex]}) has been in Arweave: ${data[arIdIndex]}`);
        return data;
      }
    }

    let mime = null;
    let ext = '';
    try {
      ({ mime, ext } = await getMimeAndExt(filename, buffer));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log(`Skip mime tag: ${filename}(${data[ipfsHashIndex]}).`);
    }
    data[arIdIndex] = await submitToArweave(buffer, mime, data[ipfsHashIndex]);

    // save file to local directory if there is no local file
    if (!hasLocalFile) {
      const fileExt = ext ? `.${ext}` : '';
      const savingName = filename || (data[arIdIndex] + fileExt);
      const savingPath = `upload/${savingName}`;
      fs.writeFileSync(savingPath, buffer);
      data[filenameIndex] = savingName;
    }
    // eslint-disable-next-line no-console
    console.log(`Uploaded: ${data[filenameIndex]} - ${data[arIdIndex]}`);
    return data;
  } catch ({ message }) {
    // eslint-disable-next-line no-console
    console.error(`Error: ${message}`);
    return data;
  }
}

async function run() {
  const inputBuffer = fs.readFileSync(INPUT_FILE_NAME);
  const input = parseCSV(inputBuffer, { relax_column_count: true });

  const header = handleHeader(input[0]);
  fs.writeFileSync(OUTPUT_FILE_NAME, stringifyCSV([header]));

  const filenameIndex = header.indexOf('filename');
  const ipfsHashIndex = header.indexOf('ipfsHash');
  const arIdIndex = header.indexOf('arweaveId');
  /* eslint-disable no-await-in-loop */
  for (let i = 1; i < input.length; i += 1) {
    const data = await handleData(input[i], { filenameIndex, ipfsHashIndex, arIdIndex });
    fs.appendFileSync(OUTPUT_FILE_NAME, stringifyCSV([data]));
  }
  /* eslint-enable no-await-in-loop */
}

run();
