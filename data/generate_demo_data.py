#!/usr/bin/env python3
"""Generate deterministic, clearly labelled synthetic canteen operations data."""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from calendar import monthrange
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

LABEL = "Synthetic demo data"
OUTLETS = [
    {"key": "main-hall", "name": "Main Dining Hall", "timezone": "Asia/Kolkata", "daily_customers": 320},
    {"key": "library-cafe", "name": "Library Cafe", "timezone": "Asia/Kolkata", "daily_customers": 125},
]
MENU_ITEMS = [
    {"key": "steamed-rice", "name": "Steamed rice", "category": "Grains", "unit": "kg", "batch_size": 5, "demand_per_customer": 0.16, "meals": ["lunch", "dinner"]},
    {"key": "dal-tadka", "name": "Dal tadka", "category": "Curries", "unit": "litre", "batch_size": 5, "demand_per_customer": 0.12, "meals": ["lunch", "dinner"]},
    {"key": "seasonal-vegetables", "name": "Seasonal vegetables", "category": "Vegetarian", "unit": "kg", "batch_size": 2, "demand_per_customer": 0.09, "meals": ["lunch", "dinner"]},
    {"key": "idli", "name": "Idli", "category": "Breakfast", "unit": "piece", "batch_size": 20, "demand_per_customer": 0.7, "meals": ["breakfast"]},
    {"key": "masala-chai", "name": "Masala chai", "category": "Beverages", "unit": "litre", "batch_size": 2, "demand_per_customer": 0.08, "meals": ["snacks"]},
]
WEEKDAY_FACTORS = [0.58, 1.02, 0.98, 1.01, 1.07, 0.91, 0.64]


def add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, min(value.day, monthrange(year, month)[1]))


def round_up(quantity: float, batch_size: float) -> float:
    return round(math.ceil(quantity / batch_size - 1e-12) * batch_size, 3)


def build_calendar(start: date, end: date) -> list[dict[str, str]]:
    days = (end - start).days
    events: list[dict[str, str]] = []
    for offset, title in ((36, "Midterm examinations"), (108, "Final examinations")):
        monday = start + timedelta(days=offset)
        monday -= timedelta(days=monday.weekday())
        for exam_day in range(5):
            current = monday + timedelta(days=exam_day)
            if start <= current <= end:
                events.append({"date": current.isoformat(), "type": "exam", "title": title})
    vacation_start = start + timedelta(days=days // 2 - 5)
    for day_offset in range(10):
        current = vacation_start + timedelta(days=day_offset)
        if start <= current <= end:
            events.append({"date": current.isoformat(), "type": "vacation", "title": "Campus recess"})
    for month_offset in range(6):
        event_day = start + timedelta(days=min(days, 16 + month_offset * 30))
        if event_day <= end:
            events.append({"date": event_day.isoformat(), "type": "college_event", "title": "Campus event"})
        special_day = start + timedelta(days=min(days, 25 + month_offset * 30))
        if special_day <= end:
            events.append({"date": special_day.isoformat(), "type": "special_menu", "title": "Special menu"})
    for year in range(start.year, end.year + 1):
        for month, day, title in ((1, 26, "Republic Day"), (8, 15, "Independence Day"), (10, 2, "Gandhi Jayanti")):
            try:
                holiday = date(year, month, day)
            except ValueError:
                continue
            if start <= holiday <= end:
                events.append({"date": holiday.isoformat(), "type": "holiday", "title": title})
    return sorted(events, key=lambda event: (event["date"], event["title"]))


def generate(seed: int, end: date) -> dict[str, object]:
    rng = random.Random(seed)
    start = add_months(end, -6)
    events = build_calendar(start, end)
    events_by_date: dict[str, list[dict[str, str]]] = {}
    for event in events:
        events_by_date.setdefault(event["date"], []).append(event)

    logs: list[dict[str, object]] = []
    current = start
    while current <= end:
        date_key = current.isoformat()
        context = events_by_date.get(date_key, [])
        types = {event["type"] for event in context}
        customer_factor = WEEKDAY_FACTORS[current.weekday()] * rng.uniform(0.89, 1.12)
        if "holiday" in types:
            customer_factor *= 0.25
        if "exam" in types:
            customer_factor *= 0.74
        if "vacation" in types:
            customer_factor *= 0.32
        if "college_event" in types:
            customer_factor *= 1.26
        if "special_menu" in types:
            customer_factor *= 1.08

        for outlet in OUTLETS:
            customers = max(0, round(outlet["daily_customers"] * customer_factor * rng.uniform(0.94, 1.06)))
            for item in MENU_ITEMS:
                for meal in item["meals"]:
                    meal_factor = 0.82 if meal == "snacks" else 1.0
                    demand = max(item["batch_size"], customers * item["demand_per_customer"] * meal_factor)
                    demand *= rng.uniform(0.9, 1.1)
                    demand = round_up(demand, item["batch_size"])
                    sold_out = rng.random() < 0.075 and customers > 45
                    if sold_out:
                        prepared = max(item["batch_size"], (int(demand / item["batch_size"]) - 1) * item["batch_size"])
                        leftover = 0.0
                        sold_out_time = datetime.combine(current, time(hour=rng.randint(11, 19), minute=rng.choice([0, 15, 30, 45])), tzinfo=ZoneInfo(outlet["timezone"])).isoformat()
                    else:
                        prepared = round_up(demand * rng.uniform(1.04, 1.22), item["batch_size"])
                        leftover = round(max(0.0, prepared - demand), 3)
                        sold_out_time = None
                    served = max(0.0, prepared - leftover)
                    plate_waste = round(min(served, served * rng.uniform(0.012, 0.045)), 3)
                    logs.append({
                        "outlet_key": outlet["key"], "item_key": item["key"], "date": date_key,
                        "meal": meal, "prepared": prepared, "unserved_leftover": leftover,
                        "plate_waste": plate_waste, "sold_out": sold_out,
                        "sold_out_at": sold_out_time, "customer_count": customers,
                        "remarks": "Synthetic event-day sample" if context else "",
                    })
        current += timedelta(days=1)

    return {
        "metadata": {
            "label": LABEL,
            "seed": seed,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "row_count": len(logs),
            "disclaimer": "All values are generated for demonstrations and pipeline checks. They are not observed kitchen data and must not be used to claim real-world model accuracy.",
        },
        "outlets": [{key: value for key, value in outlet.items() if key != "daily_customers"} for outlet in OUTLETS],
        "menu_items": [{key: value for key, value in item.items() if key not in {"demand_per_customer", "meals"}} | {"outlet_key": outlet["key"]} for outlet in OUTLETS for item in MENU_ITEMS],
        "calendar_events": events,
        "daily_logs": logs,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create six months of clearly labelled synthetic canteen data.")
    parser.add_argument("--seed", type=int, default=20261126, help="Fixed random seed (default: 20261126).")
    parser.add_argument("--end-date", type=date.fromisoformat, default=date.today(), help="Inclusive end date as YYYY-MM-DD (default: today).")
    parser.add_argument("--output", type=Path, default=None, help="Write JSON to this path; omit to write to stdout.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    dataset = generate(args.seed, args.end_date)
    payload = json.dumps(dataset, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    else:
        sys.stdout.write(payload)


if __name__ == "__main__":
    main()
