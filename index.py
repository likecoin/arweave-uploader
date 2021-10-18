import csv
import logging
import mimetypes
import os
from arweave.arweave_lib import Wallet, Transaction
from arweave.transaction_uploader import get_uploader

IPFS_KEY = 'IPFS-Add'

IPFS_CONSTRAINT_KEY = 'standard'
IPFS_CONSTRAINT = 'v0.1'

logger = logging.getLogger(__name__)
wallet = Wallet('jwk.json')
input_file_name = os.getenv('INPUT_FILE', 'list.csv')
if not os.path.isfile(input_file_name):
    raise Exception('Input file not found: ' + input_file_name)

output_file_name = os.getenv('OUTPUT_FILE', 'output-' + input_file_name)

with open(output_file_name, 'w') as output_handler:
    with open(input_file_name) as input_handler:
        dr = csv.DictReader(input_handler)
        output_fieldnames = dr.fieldnames if 'arHash' in dr.fieldnames else dr.fieldnames + ['arHash']
        dw = csv.DictWriter(output_handler, output_fieldnames)
        dw.writeheader()
        for row in dr:
            should_upload = True;
            file_name = row.get('filename')
            ipfs_hash = row.get('ipfs')
            arweave_hash = row.get('arHash')
            if file_name == None:
                logger.error('Filename should not be empty')
                should_upload = False
            if arweave_hash:
                logger.info('{} - {}'.format(file_name, arweave_hash))
                should_upload = False
            file_path = 'upload/' + file_name
            if not os.path.isfile(file_path):
                logger.error('Upload file not found: ' + file_path)
                should_upload = False
            if should_upload:
                mimetype = mimetypes.guess_type(file_name)[0]
                with open(file_path, 'rb', buffering=0) as file_handler:
                    tx = Transaction(wallet,
                                    file_handler=file_handler,
                                    file_path=file_path)
                    tx.add_tag('Content-Type', mimetype)
                    if ipfs_hash:
                        tx.add_tag(IPFS_KEY, ipfs_hash)
                        tx.add_tag(IPFS_CONSTRAINT_KEY, IPFS_CONSTRAINT)
                    tx.sign()

                    uploader = get_uploader(tx, file_handler)

                    while not uploader.is_complete:
                        uploader.upload_chunk()

                        logger.info('{}% complete, {}/{}'.format(
                            uploader.pct_complete, uploader.uploaded_chunks,
                            uploader.total_chunks))
                    row['arHash'] = tx.id
            dw.writerow(row)
