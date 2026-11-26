import pandas as pd
import pytest
from prepare_benchmarks import aggregate_sales


def test_aggregates_sales_by_date_and_item_without_losing_demand(tmp_path):
    source = tmp_path / "sales.csv"
    output = tmp_path / "aggregated.csv"
    pd.DataFrame({"sale_date": ["2025-01-01", "2025-01-01", "2025-01-02"], "product": ["Rice", "Rice", "Dal"], "qty": [4, 3, 2]}).to_csv(source, index=False)
    assert aggregate_sales(source, output, "sale_date", "product", "qty") == 2
    frame = pd.read_csv(output)
    assert frame.loc[frame["item"] == "Rice", "sales_demand"].iloc[0] == 7


def test_rejects_unmapped_source_schema(tmp_path):
    source = tmp_path / "unknown.csv"
    pd.DataFrame({"date": ["2025-01-01"]}).to_csv(source, index=False)
    with pytest.raises(ValueError, match="Configured source columns"):
        aggregate_sales(source, tmp_path / "out.csv", "date", "item", "qty")
