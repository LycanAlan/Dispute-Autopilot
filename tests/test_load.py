# tests/test_load.py
import pandas as pd
from dispute_autopilot.ingest.load import downcast


def test_downcast_shrinks_memory_without_changing_values():
    df = pd.DataFrame({"a": [1.0, 2.0, 3.0], "b": [1, 2, 3]})
    before = df.memory_usage(deep=True).sum()
    out = downcast(df)
    assert out.memory_usage(deep=True).sum() < before
    assert out["a"].tolist() == [1.0, 2.0, 3.0]
    assert out["b"].tolist() == [1, 2, 3]
