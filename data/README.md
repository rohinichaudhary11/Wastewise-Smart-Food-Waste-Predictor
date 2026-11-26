# Data directory

`generate_demo_data.py` creates a reproducible six-month JSON fixture with two outlets, menu items, weekday demand patterns, holiday/exam/event/vacation context and censored sell-outs. Output is labelled **Synthetic demo data** and is suitable only for demonstrations or pipeline checks, never claims about real-world model accuracy.

Run `python data/generate_demo_data.py --output data/synthetic_demo.json` to write the fixture, or pass `--seed` and `--end-date YYYY-MM-DD` to reproduce a specific date window. The generated JSON is not imported into a production organisation automatically. Public benchmark data remains out of the repository until each source licence and its permitted use are documented in [docs/DATA.md](../docs/DATA.md).
