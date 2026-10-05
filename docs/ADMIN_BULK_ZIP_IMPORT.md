# Admin bulk ZIP import

The GitHub Pages Admin Upload Studio supports a bulk ZIP queue for large catalog imports.

- Each ZIP is treated as one book.
- Missing author defaults to **Chuong**.
- Missing cover does not block import; a cover can be added manually later.
- Bulk status is selected before import and defaults to **Hoàn thành**.
- The importer recognizes chapter files such as `chuong_0001.txt` and headers such as `Tên truyện - Chương 1: Tên chương`.
- The repeated header line is removed from stored chapter body content.
- ZIP files are scanned with two workers and imported one book at a time to avoid loading thousands of full books into memory.
- SHA-256 is stored in `admin_import_logs`; a completed ZIP with the same hash is skipped on later runs.
- Duplicate title + credited author is also checked before book creation.
- A broken ZIP does not stop the remaining queue.
- Existing single-book import remains available in the same Admin Studio.
