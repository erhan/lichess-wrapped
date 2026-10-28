"""Pick 1000 puzzles of mixed difficulty from the Lichess puzzle database (CC0) into public/puzzles.json.

The database rows are in random order, so the first rows are a fair sample:
  curl -s https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -dc | head -n 300000 > sample.csv
  python3 scripts/pick-puzzles.py sample.csv public/puzzles.json
"""
import csv, json, random, sys

BANDS = range(500, 2800, 100)   # 23 rating bands, 43-44 puzzles each
TOTAL = 1000

src, out = sys.argv[1:3]
by_band = {b: [] for b in BANDS}
with open(src, newline="") as f:
    for row in csv.DictReader(f):
        rating = int(row["Rating"])
        band = rating // 100 * 100
        if band not in by_band:
            continue
        if int(row["RatingDeviation"]) > 100 or int(row["Popularity"]) < 80 or int(row["NbPlays"]) < 200:
            continue
        by_band[band].append(row)

random.seed(1061)
picked = []
for i, (band, rows) in enumerate(by_band.items()):
    want = TOTAL // len(BANDS) + (i < TOTAL % len(BANDS))
    if len(rows) < want:
        sys.exit(f"band {band} has only {len(rows)} puzzles")
    picked += random.sample(rows, want)
picked.sort(key=lambda r: int(r["Rating"]))

# [id, fen, uci moves, rating, themes]
data = [[r["PuzzleId"], r["FEN"], r["Moves"], int(r["Rating"]), r["Themes"]] for r in picked]
with open(out, "w") as f:
    json.dump(data, f, separators=(",", ":"))
print(len(data), "puzzles", data[0][3], "-", data[-1][3])
