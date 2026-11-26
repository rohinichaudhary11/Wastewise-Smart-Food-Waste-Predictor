"""Aggregate downloaded public sales files for pipeline-only experiments.

This utility deliberately requires the caller to map source columns. It does not
infer undocumented schemas and the resulting sales data is never production training.
"""

import argparse
import json
from pathlib import Path

import pandas as pd


def aggregate_sales(source: Path, output: Path, date_column: str, item_column: str, quantity_column: str, weekly: bool = False) -> int:
    frame = pd.read_csv(source)
    required = {date_column, item_column, quantity_column}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Configured source columns not found: {', '.join(sorted(missing))}")
    frame = frame[[date_column, item_column, quantity_column]].copy()
    frame[date_column] = pd.to_datetime(frame[date_column], errors="coerce")
    frame[quantity_column] = pd.to_numeric(frame[quantity_column], errors="coerce")
    frame[item_column] = frame[item_column].astype("string").str.strip()
    frame = frame.dropna(subset=[date_column, item_column, quantity_column])
    frame = frame.loc[(frame[quantity_column] >= 0) & (frame[item_column] != "")]
    if weekly:
        frame["period"] = frame[date_column].dt.to_period("W-MON").dt.start_time.dt.date
    else:
        frame["period"] = frame[date_column].dt.date
    result = frame.groupby(["period", item_column], as_index=False)[quantity_column].sum()
    result = result.rename(columns={"period": "date", item_column: "item", quantity_column: "sales_demand"})
    result.to_csv(output, index=False)
    return len(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Local CSV downloaded by the operator; raw files stay untracked")
    parser.add_argument("output", type=Path, help="Aggregated CSV destination")
    parser.add_argument("--date-column", required=True)
    parser.add_argument("--item-column", required=True)
    parser.add_argument("--quantity-column", required=True)
    parser.add_argument("--weekly", action="store_true", help="Aggregate weekly order datasets by week and meal/item")
    parser.add_argument("--license", required=True, help="Verified source dataset license; cite it in the output metadata")
    parser.add_argument("--attribution", default="", help="Source attribution, required for attribution licenses such as CC BY")
    args = parser.parse_args()
    if "cc by" in args.license.casefold() and not args.attribution.strip():
        parser.error("--attribution is required for CC BY licensed data")
    count = aggregate_sales(args.source, args.output, args.date_column, args.item_column, args.quantity_column, args.weekly)
    metadata = {"source_file": args.source.name, "license": args.license, "attribution": args.attribution.strip() or None, "aggregation": "weekly" if args.weekly else "daily", "record_type": "sales_only_benchmark", "production_training": False}
    args.output.with_suffix(args.output.suffix + ".metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"Prepared {count} sales-only benchmark rows at {args.output}. These are pipeline checks, not canteen waste records.")


if __name__ == "__main__":
    main()
