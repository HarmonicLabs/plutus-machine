# Benchmarks

`bench.mjs` measures **flat-decode + CEK evaluate** over a corpus of
flat-encoded Plutus scripts, which is what
[cardano-plutus-vm-benchmark](https://github.com/SAIB-Inc/cardano-plutus-vm-benchmark)
compares across VM implementations. That suite runs each VM's own benchmark
rather than a shared harness, so this is the entry point it calls.

```bash
# put the .flat scripts in bench/plutus_use_cases (or set BENCH_DATA)
npm run bench
```

Each script is warmed up 5 times, then run at least 50 times and for at least
5 seconds. Results go to `bench/results/plutus_use_cases.json`:

```json
{ "benchmarks": [ { "name": "auction_1-1", "mean_ns": 7964360, "median_ns": 7754708,
                    "min_ns": 7052788, "max_ns": 64126310, "stddev_ns": 2316511,
                    "iterations": 628 } ] }
```

`BENCH_DATA`, `BENCH_WARMUP`, `BENCH_MIN_ITERS`, `BENCH_MAX_ITERS` and
`BENCH_BUDGET_NS` override the defaults.
