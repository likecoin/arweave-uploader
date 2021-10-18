import logging
import csv
from arweave.arweave_lib import Wallet, Transaction
from arweave.transaction_uploader import get_uploader

IPFS_KEY = 'IPFS-Add'

IPFS_CONSTRAINT_KEY = 'standard'
IPFS_CONSTRAINT = 'v0.1'

logger = logging.getLogger(__name__)
wallet = Wallet('jwk.json')

with open('list.csv') as csv_file:
  rows = csv.DictReader(csv_file)
  for row in rows:
    filename = row.get('filename')
    ipfs_hash = row.get('ipfs')
    if filename == None:
      raise Exception('Missing "filename" field in csv file')
    file_path = 'upload/'+filename
    with open(file_path, 'rb', buffering=0) as file_handler:
        tx = Transaction(wallet, file_handler=file_handler, file_path=file_path)
        tx.add_tag('Content-Type', 'application/data')
        if ipfs_hash != None:
          tx.add_tag(IPFS_KEY, ipfs_hash)
          tx.add_tag(IPFS_CONSTRAINT_KEY, IPFS_CONSTRAINT)
        tx.sign()

        uploader = get_uploader(tx, file_handler)

        while not uploader.is_complete:
            uploader.upload_chunk()

            logger.info('{}% complete, {}/{}'.format(
                uploader.pct_complete, uploader.uploaded_chunks, uploader.total_chunks
            ))
