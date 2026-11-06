# Colab benchmark runbook

Use Colab as a temporary Linux machine for the heavy database phase. Do not use it to host the storefront. Save generated results and the checkpoint before the notebook runtime ends.

## Session setup

1. Open a new Colab notebook and clone the project repository into the VM. If the repository is private, use Colab's GitHub integration or upload a ZIP; do not paste an access token into a notebook cell.
2. Install Node.js 20+, pnpm, PostgreSQL, and (optionally) Meilisearch. Keep PostgreSQL's data directory on the VM's local disk while benchmarking.
3. Run `free -h`, `df -h`, `node --version`, and `psql --version` and capture the output with the run metadata. Colab resource sizes are not guaranteed and may differ by session.
4. Follow the staged commands in the project README in a fresh database. Start at 1K and check free disk and load throughput before increasing to 100K, 1M, and 10M.
5. At the end of each stage, copy `benchmarks/results/` and `WORK_LOG.md` to durable storage. If only the process disconnects while the VM and PostgreSQL data directory are still alive, the generator can resume from the existing row count with the same seed. If Colab deletes the VM/data directory, the checkpoint preserves progress metadata but not the product rows; recreate the database and rerun the generator from the start.

## Data durability

Colab's VM can be deleted when the runtime ends. A mounted Drive is suitable for copying completed reports and checkpoints after a run; do not use it as PostgreSQL's live data directory because network-drive storage can distort the measured latency. Keep a copy of the repository or its commit hash with each report.

## Reproducibility record

Record Colab runtime type, CPU and RAM shown by the VM, disk type/free space, PostgreSQL and Meilisearch versions, seed, dataset size, warmup count, request count, concurrency, and cache procedure. Repeat each configuration if reporting a comparison; preserve every run rather than selecting the best result.
