# Data sources

No public data has been downloaded or used in this phase. No raw data files are committed.

| Source named in the project brief | Status | Use decision |
| --- | --- | --- |
| Kaggle `matthieugimbert/french-bakery-daily-sales` | Not downloaded. Kaggle page was reachable but its license metadata was not readable in this review (checked 2026-11-26). | Do not use until the dataset owner’s current license and Kaggle terms are manually reviewed and recorded. Sales only; not suitable as prepared/leftover training data. [Dataset page](https://www.kaggle.com/datasets/matthieugimbert/french-bakery-daily-sales). |
| Mendeley DOI `10.17632/xv5kp6mxv7` | Not downloaded. Version 1 page explicitly lists CC BY 4.0 (checked 2026-11-26). | Eligible for attributed sales-only benchmark use under CC BY 4.0; include attribution to Fabian Taigel and the dataset DOI in benchmark output/report. Not prepared/leftover data. [Version 1 record](https://data.mendeley.com/datasets/xv5kp6mxv7/1). |
| Kaggle `kannanaikkal/food-demand-forecasting` | Not downloaded. Kaggle page was reachable but its license metadata was not readable in this review (checked 2026-11-26). | Do not use until the dataset owner’s current license and Kaggle terms are manually reviewed and recorded. Optional weekly-order experiment only; never use for real-outlet models. [Dataset page](https://www.kaggle.com/datasets/kannanaikkal/food-demand-forecasting). |

`data/prepare_benchmarks.py` aggregates a locally downloaded CSV after the operator supplies explicit date, item and quantity column mappings. It does not download data or assume a source schema. The optional weekly flag is intended for weekly order data. These benchmark inputs contain sales/order demand only; there are no preparation and leftover labels. Benchmark artifacts stay local and raw files must not be committed. Do not report sales-only benchmark results as real-world canteen accuracy.

The fixed-seed generator in [data/generate_demo_data.py](../data/generate_demo_data.py) produces six months of deterministic canteen-style JSON with weekday patterns, exam and holiday context, campus events, vacations, special menus and sell-outs. Every fixture is labelled **Synthetic demo data**. It is for demonstration and pipeline checks only, is not observed kitchen data, and cannot be used to claim real-world model accuracy. It is not automatically imported into an organisation.
